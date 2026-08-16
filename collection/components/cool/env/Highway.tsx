"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { readToken } from "@/lib/coolTokens";
import { AA_GLSL, type ActState, FOG_GLSL, NOISE_GLSL, wrap } from "../journey";

/**
 * Act 3: the city ends and the road opens out, some time before sunrise.
 *
 * One two-lane carriageway, a gravel verge, scrub either side, a line of
 * telegraph poles on the right, and a ridge on the horizon. The sun is doing
 * the work here and it belongs to `Sky`; this file only builds the ground for
 * it to fall on.
 *
 * The ridge is a single transparent plane with a noise silhouette rather than
 * geometry. At 380 units out nobody can tell, and it costs one draw call.
 */

const LOOP = 420;
const GROUND_Y = -2;
const POLES = 16;

const GROUND_FRAG = /* glsl */ `
  precision highp float;
  uniform float uOffset;
  uniform float uReveal;
  uniform float uDaylight;
  uniform vec3 uKey;
  uniform vec3 uAsphalt;
  uniform vec3 uPaint;
  uniform vec3 uMoss;
  uniform vec3 uSkyLow;
  varying vec2 vXZ;
  varying float vDepth;
  ${FOG_GLSL}
  ${NOISE_GLSL}
  ${AA_GLSL}

  void main() {
    float z = vXZ.y + uOffset;
    float x = vXZ.x;
    float ax = abs(x);
    float aa = detailFade(vec2(x, z));

    // scrub either side of the road, coarse and clumpy
    float scrub = noise(vec2(x * 0.6, z * 0.6)) * 0.6 + noise(vec2(x * 2.4, z * 2.4)) * 0.4;
    vec3 col = uMoss * (0.3 + scrub * 0.5 * aa);

    // gravel verge, then the carriageway
    float verge = 1.0 - smoothstep(5.0, 7.2, ax);
    float road = 1.0 - smoothstep(4.6, 5.0, ax);
    float grain = noise(vec2(x * 6.0, z * 6.0)) * 0.5 + noise(vec2(x * 21.0, z * 21.0)) * 0.5;
    col = mix(col, uMoss * (0.3 + grain * 0.45 * aa), verge);
    col = mix(col, uAsphalt * (0.8 + grain * 0.5 * aa), road);

    // dashed centre line and solid edge lines
    float dash = step(0.42, fract(z / 10.0));
    float centre = (1.0 - smoothstep(0.10, 0.17, ax)) * dash;
    float edge = 1.0 - smoothstep(0.08, 0.15, abs(ax - 4.2));
    col = mix(col, uPaint * 0.8, clamp(centre + edge, 0.0, 1.0) * road * 0.85);

    // Everything is lit by the sky at this hour, not by lamps. Ambient rises
    // with the sun and the road stays a touch shinier than the scrub.
    // Lit by the sky, not by lamps — but the blue hour is not pitch dark, and
    // at a 0.25 floor the carriageway vanished entirely.
    // Sky ambient, applied as light on an albedo rather than added flat.
    // Added flat it washes tarmac and scrub to the same value and the verge
    // disappears; multiplied, each surface keeps its own darkness.
    col *= vec3(0.4 + uDaylight * 1.0) + uSkyLow * 1.6;
    col += uKey * road * uDaylight * 0.1;

    col = applyFog(col, vDepth);
    gl_FragColor = vec4(mix(uFogColor, col, uReveal), 1.0);
  }
`;

const PLANE_VERT = /* glsl */ `
  varying vec2 vXZ;
  varying float vDepth;
  void main() {
    // World position, not local. PlaneGeometry has its rotation baked in, so
    // after rotateX(-90) a ground plane's along-the-room axis lives in
    // position.z and position.y is zero for every vertex. Reading .y here fed
    // the shader one constant row and smeared it to the horizon — which is
    // where all the radial streaking came from.
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vXZ = vec2(wp.x, wp.z);
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const RIDGE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIDGE_FRAG = /* glsl */ `
  precision highp float;
  uniform float uReveal;
  uniform vec3 uColor;
  varying vec2 vUv;
  ${NOISE_GLSL}

  void main() {
    float x = vUv.x * 26.0;
    // three octaves, so the skyline gets peaks and saddles instead of even
    // bumps. The plane is centred on the camera's own eye level, which is
    // where the horizon is at this distance, so 0.5 is sea level and the
    // silhouette is everything below the ridge line.
    float h = noise(vec2(x, 0.5)) * 0.6
            + noise(vec2(x * 2.7, 7.3)) * 0.26
            + noise(vec2(x * 6.3, 2.1)) * 0.14;
    h = h * 0.3 + 0.03;
    if (vUv.y > 0.5 + h) discard;
    gl_FragColor = vec4(uColor, uReveal);
  }
`;

export default function Highway({ state }: { state: ActState }) {
  const group = useRef<THREE.Group>(null);
  const poles = useRef<THREE.InstancedMesh>(null);
  const arms = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const asphalt = useMemo(() => new THREE.Color(readToken("--cool-asphalt")), []);
  const paint = useMemo(() => new THREE.Color(readToken("--spiral-concrete")), []);
  const moss = useMemo(() => new THREE.Color(readToken("--cool-moss")), []);

  const groundGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(900, 900, 1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  const groundMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLANE_VERT,
        fragmentShader: GROUND_FRAG,
        uniforms: {
          uOffset: { value: 0 },
          uReveal: { value: 0 },
          uDaylight: { value: 0 },
          uKey: { value: new THREE.Color() },
          uAsphalt: { value: asphalt },
          uPaint: { value: paint },
          uMoss: { value: moss },
          uSkyLow: { value: new THREE.Color() },
          uFogColor: { value: new THREE.Color() },
          uFogDensity: { value: 0.0055 },
        },
      }),
    [asphalt, paint, moss],
  );

  const ridgeGeo = useMemo(() => new THREE.PlaneGeometry(2600, 130, 1, 1), []);
  const ridgeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: RIDGE_VERT,
        fragmentShader: RIDGE_FRAG,
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: {
          uReveal: { value: 0 },
          uColor: { value: new THREE.Color() },
        },
      }),
    [],
  );

  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const poleMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(readToken("--spiral-black")),
        roughness: 0.95,
        transparent: true,
      }),
    [],
  );

  useEffect(() => {
    const owned = [groundGeo, groundMat, ridgeGeo, ridgeMat, boxGeo, poleMat];
    return () => {
      for (const o of owned) o.dispose();
    };
  }, [groundGeo, groundMat, ridgeGeo, ridgeMat, boxGeo, poleMat]);

  useFrame(() => {
    const w = state.w[2];
    if (group.current) group.current.visible = w > 0.004;
    if (w <= 0.004) return;

    const { offset, key, fog, daylight } = state;

    const u = groundMat.uniforms;
    u.uOffset.value = offset;
    u.uReveal.value = w;
    u.uDaylight.value = daylight;
    (u.uKey.value as THREE.Color).copy(key);
    (u.uFogColor.value as THREE.Color).copy(fog);
    (u.uSkyLow.value as THREE.Color).copy(state.skyLow);

    ridgeMat.uniforms.uReveal.value = w;
    // The ridge is a silhouette: it is the sky, darkened, never its own colour.
    (ridgeMat.uniforms.uColor.value as THREE.Color)
      .copy(state.skyLow)
      .multiplyScalar(0.22);

    poleMat.opacity = w;
    if (poles.current && arms.current) {
      for (let i = 0; i < POLES; i++) {
        const z = wrap((i * LOOP) / POLES, LOOP) + wrap(offset, LOOP);
        const zz = z < -LOOP ? z + LOOP : z;
        dummy.rotation.set(0, 0, 0);
        dummy.position.set(16.5, GROUND_Y + 4.3, zz);
        dummy.scale.set(0.28, 8.6, 0.28);
        dummy.updateMatrix();
        poles.current.setMatrixAt(i, dummy.matrix);
        dummy.position.set(16.5, GROUND_Y + 7.8, zz);
        dummy.scale.set(2.6, 0.16, 0.16);
        dummy.updateMatrix();
        arms.current.setMatrixAt(i, dummy.matrix);
      }
      poles.current.instanceMatrix.needsUpdate = true;
      arms.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={groundGeo} material={groundMat} position={[0, GROUND_Y, -260]} />
      <mesh geometry={ridgeGeo} material={ridgeMat} position={[0, 0, -700]} />
      <instancedMesh ref={poles} args={[boxGeo, poleMat, POLES]} frustumCulled={false} />
      <instancedMesh ref={arms} args={[boxGeo, poleMat, POLES]} frustumCulled={false} />
    </group>
  );
}
