"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ActState } from "../journey";

/**
 * The sky, and the single biggest reason the page reads as a place rather than
 * as space.
 *
 * A gradient from the horizon band up to the zenith, plus a low sun that only
 * exists once the ride reaches the blue hour. It is always mounted — inside the
 * underpass the bore hides it completely, so gating it would save one draw call
 * and buy a pop the moment the walls fall away.
 *
 * Its horizon colour is the same value the scene fog uses. The moment those two
 * disagree the horizon becomes a hard seam and the illusion is over.
 */

const VERT = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uTop;
  uniform vec3 uLow;
  uniform float uSun;
  uniform vec3 uSunColor;
  varying vec3 vPos;

  void main() {
    vec3 d = normalize(vPos);
    // Bias the ramp low: real skies hold their horizon colour a long way up.
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uLow, uTop, pow(h, 0.55));

    // The sun sits just above the horizon, slightly off the centre line, and
    // is mostly haze rather than a disc.
    vec3 sunDir = normalize(vec3(0.18, 0.045, -1.0));
    float a = max(0.0, dot(d, sunDir));
    col += uSunColor * pow(a, 220.0) * uSun * 1.6;
    col += uSunColor * pow(a, 6.0) * uSun * 0.35;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function Sky({ state }: { state: ActState }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color() },
          uLow: { value: new THREE.Color() },
          uSun: { value: 0 },
          uSunColor: { value: new THREE.Color() },
        },
      }),
    [],
  );

  const geo = useMemo(() => new THREE.SphereGeometry(420, 24, 16), []);
  const mesh = useRef<THREE.Mesh>(null);

  useEffect(() => {
    return () => {
      geo.dispose();
      mat.dispose();
    };
  }, [geo, mat]);

  useFrame(() => {
    const u = mat.uniforms;
    (u.uTop.value as THREE.Color).copy(state.skyTop);
    (u.uLow.value as THREE.Color).copy(state.skyLow);
    // The sun rises through act 3 and is well up by the time the room arrives.
    u.uSun.value = Math.min(1, Math.max(0, (state.p - 0.44) / 0.22));
    (u.uSunColor.value as THREE.Color).copy(state.key);
  });

  return (
    <mesh
      ref={mesh}
      geometry={geo}
      material={mat}
      renderOrder={-1}
      frustumCulled={false}
    />
  );
}
