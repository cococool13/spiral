"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import Exit from "./env/Exit";
import Gallery from "./env/Gallery";
import Highway from "./env/Highway";
import Motes from "./env/Motes";
import Sky from "./env/Sky";
import Street from "./env/Street";
import Underpass from "./env/Underpass";
import {
  bendX,
  bendY,
  createActState,
  LIGHTS,
  makeRamp,
  sampleRamp,
  sampleSky,
  smoothstep,
  TRAVEL,
  TUNNEL_LOOP,
  wrap,
  writeWeights,
} from "./journey";

/**
 * The one place that reads scroll.
 *
 * Runs at frame priority -1, which puts it ahead of every environment's own
 * `useFrame` while still leaving R3F's automatic render in charge. It writes
 * the shared `ActState`; the five environments only read it. That ordering is
 * the whole contract — get it backwards and each act renders one frame stale.
 *
 * The camera stays at the origin for the whole ride. Environments move
 * themselves past it, so changing places costs a weighted blend of a few
 * numbers rather than flying a camera between five distant sets.
 *
 * Fog colour is taken from the sky's horizon band every frame, never from a
 * fixed value. Outdoors, the distance dissolving into anything other than the
 * sky is the single fastest way to stop looking like a photograph.
 */

const FOG_DENSITY = [0.013, 0.011, 0.0055, 0.009, 0.013];

export default function Stage({
  progress,
  quality,
}: {
  progress: RefObject<number>;
  quality: number;
}) {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  const state = useMemo(createActState, []);
  const ramp = useMemo(makeRamp, []);
  const smoothed = useRef(0);
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const hemi = useRef<THREE.HemisphereLight>(null);

  useEffect(() => {
    const fog = new THREE.FogExp2(0x06070a, FOG_DENSITY[0]);
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useFrame((s, delta) => {
    const t = s.clock.elapsedTime;
    // Critically damped follow. Raw trackpad scroll is jittery enough to read
    // as a stutter at this speed.
    const k = 1 - Math.exp(-6 * Math.min(delta, 0.05));
    smoothed.current += ((progress.current ?? 0) - smoothed.current) * k;
    const p = smoothed.current;

    state.p = p;
    state.t = t;
    state.offset = p * TRAVEL;
    state.daylight = smoothstep(0.42, 0.72, p);
    writeWeights(state);

    sampleRamp(ramp, p, state.key);
    sampleSky(p, state.skyTop, state.skyLow);

    const w = state.w;
    const bore = Math.min(1, w[0] + w[4]);
    const total = Math.max(0.001, w[0] + w[1] + w[2] + w[3] + w[4]);
    const { offset } = state;

    // Inside the bore the distance goes to unlit dark; outside it goes to the
    // horizon. Blending between the two on the act weight is what makes the
    // moment you leave the underpass land.
    state.fog.copy(state.skyLow).multiplyScalar(1 - bore * 0.85);
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      let density = 0;
      for (let i = 0; i < 5; i++) density += w[i] * FOG_DENSITY[i];
      fog.density = density / total;
      fog.color.copy(state.fog);
    }
    scene.background = state.fog;

    // Lights snap to whichever act owns the frame rather than lerping. A lerp
    // cannot keep up with fixtures streaming past, and the crossfades are short
    // enough to hide the jump.
    for (let i = 0; i < LIGHTS; i++) {
      const pos = state.lightPos[i];
      state.lightColor[i].copy(state.key);
      if (bore > 0.5) {
        // one per ceiling fixture, hung just under the soffit
        const z = wrap(i * (TUNNEL_LOOP / LIGHTS) + offset, TUNNEL_LOOP);
        pos.set(bendX(z + offset), bendY(z + offset) + 3.2, z);
      } else if (w[1] > 0.5) {
        // lamp heads over the carriageway
        const z = wrap(i * 34 + offset, 136);
        pos.set(i % 2 === 0 ? -6.4 : 6.4, 6.8, z);
      } else if (w[3] > 0.5) {
        // the room is lit by its windows, so the lights sit in the openings
        pos.set(12, 4.5, -8 - i * 12);
      } else {
        // the open road has no lamps at all
        pos.set(0, 60, -120);
      }
      const light = lights.current[i];
      if (light) {
        light.position.copy(pos);
        light.color.copy(state.lightColor[i]);
        light.intensity = bore > 0.5 ? 90 : w[1] > 0.5 ? 140 : w[3] > 0.5 ? 120 : 0;
      }
    }

    // Sky light. Almost nothing at night, real fill by morning.
    if (hemi.current) {
      hemi.current.intensity = 0.12 + state.daylight * 1.5;
      hemi.current.color.copy(state.skyTop);
      hemi.current.groundColor.copy(state.fog);
    }

    // Camera: a weighted blend of what each act wants. During a crossfade the
    // two framings average, which is what makes the wipe feel driven rather
    // than cut.
    const cam = camera as THREE.PerspectiveCamera;
    const calm = w[3] / total;
    const sway = 1 - calm * 0.75;
    cam.position.set(
      (bore * bendX(offset)) / total + Math.sin(t * 0.31) * 0.16 * sway,
      (bore * bendY(offset)) / total + Math.cos(t * 0.24) * 0.1 * sway,
      0,
    );
    const ahead = -24;
    cam.rotation.z = Math.sin(t * 0.17) * 0.02 * sway;
    cam.rotation.y =
      (bore * (bendX(offset + ahead) - bendX(offset)) * 0.012) / total + calm * 0.06;
    cam.rotation.x =
      (-(bore * (bendY(offset + ahead) - bendY(offset))) * 0.012) / total - calm * 0.03;

    // A real lens does not change focal length while you drive. It opens a
    // little in the room only because standing still in a wide space reads
    // wrong through a long lens.
    const fov = 66 + calm * 6;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }, -1);

  return (
    <>
      <hemisphereLight ref={hemi} intensity={0.2} />
      <ambientLight intensity={0.12} />
      {[0, 1, 2, 3].map((i) => (
        <pointLight
          key={i}
          ref={(el) => {
            lights.current[i] = el;
          }}
          distance={70}
          decay={1.8}
        />
      ))}

      <Sky state={state} />
      <Underpass state={state} />
      <Street state={state} />
      <Highway state={state} />
      <Gallery state={state} />
      <Motes state={state} count={Math.round(1100 * quality)} />
      <Exit state={state} />
    </>
  );
}
