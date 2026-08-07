"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type ActState, bendX, bendY, smoothstep } from "../journey";

/**
 * The end of the ride: the mouth of the underpass.
 *
 * A single quad, cut to the bore's cross-section and riding the bore's own
 * centreline so it never clips the walls. It starts ninety metres out and
 * arrives; by the time it is two metres away it is larger than the frame and
 * the page is simply daylight.
 *
 * It replaces an earlier "aperture" that bloomed out of nothing in mid-air.
 * A hole in a wall you have been travelling toward for a minute is the same
 * beat and costs the same quad, but it is somewhere you could actually stand.
 */
export default function Exit({ state }: { state: ActState }) {
  const mouth = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);

  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
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
      mat.dispose();
      glowMat.dispose();
    };
  }, [mat, glowMat]);

  useFrame(() => {
    const m = smoothstep(0.83, 0.995, state.p);
    const on = m > 0.002 && state.w[4] > 0.004;
    if (mouth.current) mouth.current.visible = on;
    if (glow.current) glow.current.visible = on;
    if (!on) return;

    // Ease in from far away, then close the last stretch fast — the way the
    // end of a tunnel actually arrives.
    const z = -90 + m * m * 88.5;
    const bx = bendX(z + state.offset);
    const by = bendY(z + state.offset);

    if (mouth.current) {
      mouth.current.position.set(bx, by, z);
      mat.color.copy(state.skyLow).lerp(state.skyTop, 0.35);
      mat.opacity = 1;
    }
    if (glow.current) {
      glow.current.position.set(bx, by, z - 0.4);
      const s = 1 + m * 0.8;
      glow.current.scale.set(s, s, 1);
      glowMat.color.copy(state.skyLow);
      glowMat.opacity = 0.25 + m * 0.4;
    }
  });

  return (
    <>
      <mesh ref={glow} material={glowMat} visible={false}>
        <planeGeometry args={[10.4, 10.4]} />
      </mesh>
      <mesh ref={mouth} material={mat} visible={false}>
        <planeGeometry args={[7.92, 7.92]} />
      </mesh>
    </>
  );
}
