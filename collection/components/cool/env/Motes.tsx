"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type ActState, bendX, bendY, wrap } from "../journey";

/**
 * Airborne dust.
 *
 * Real rooms have it and it is most of what makes a light shaft visible, so it
 * turns up wherever there is a lamp or a window: the underpass, the way out,
 * and the gallery, where it drifts across to sit inside the beams.
 *
 * It sits out the street — there is rain there already, and doubling up just
 * makes the air look dirty — and the open road, where there is nothing close
 * enough to catch light.
 */

const LOOP = 300;

export default function Motes({ state, count }: { state: ActState; count: number }) {
  const points = useRef<THREE.Points>(null);

  const { geo, pos, seeds } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      seeds[i * 3] = Math.random();
      seeds[i * 3 + 1] = Math.random() * Math.PI * 2;
      seeds[i * 3 + 2] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geo, pos, seeds };
  }, [count]);

  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.045,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      geo.dispose();
      mat.dispose();
    };
  }, [geo, mat]);

  useFrame(() => {
    const { offset, t, key, w } = state;
    const bore = Math.min(1, w[0] + w[4]);
    const room = w[3];
    const presence = bore + room * 0.9;
    mat.opacity = Math.max(0, presence * 0.42);
    mat.color.copy(key);
    if (mat.opacity < 0.005) return;

    // In the bore it hangs in the lamp light and streams past with the tube.
    // In the room the world has stopped, so it only drifts — and it drifts to
    // the right, into the shafts, because that is the only lit air in there.
    const drift = offset * 2.3 * bore;
    const spread = 3.2 * bore + 7 * room;
    const bias = room * 4.4;
    for (let i = 0; i < count; i++) {
      const s0 = seeds[i * 3];
      const s1 = seeds[i * 3 + 1];
      const s2 = seeds[i * 3 + 2];
      const z = wrap(s0 * LOOP + drift, LOOP) * (bore + room * 0.16);
      const wz = z + offset;
      pos[i * 3] = bendX(wz) * bore + bias + Math.sin(s1 + t * 0.32) * spread;
      pos[i * 3 + 1] =
        bendY(wz) * bore + Math.cos(s1 * 1.7 + t * 0.24) * spread * (0.5 + s2) + room * 2;
      pos[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
  });

  return <points ref={points} geometry={geo} material={mat} frustumCulled={false} />;
}
