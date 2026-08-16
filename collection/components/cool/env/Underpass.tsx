"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { readToken } from "@/lib/coolTokens";
import {
  AA_GLSL,
  type ActState,
  bendX,
  bendY,
  FOG_GLSL,
  LIGHTS,
  NOISE_GLSL,
  TUNNEL_LOOP,
  TUNNEL_RADIUS,
  TUNNEL_RIBS,
  TUNNEL_SPACING,
  wrap,
} from "../journey";

/**
 * Acts 1 and 5: a road underpass.
 *
 * The bore is one long square tube, and the fragment shader treats its four
 * faces as four different materials — asphalt with lane markings underfoot,
 * board-formed concrete either side with a painted safety band and road grime
 * washing down it, and a ceiling carrying recessed sodium fixtures every twelve
 * metres.
 *
 * Nothing here glows except the fixtures. That restraint is the difference
 * between a tunnel and a spaceship: in a real underpass, light comes from
 * lamps, and every other surface is only ever borrowing it.
 *
 * The camera never travels. The tube slides past and wraps, so the run is
 * endless for the cost of 50 ring beams. The bore is bent in the vertex shader,
 * which is why it needs 240 height segments: with fewer, only the far rings
 * displace and the camera ends up outside the tube.
 */

const FIXTURE_SPACING = 12;

const VERT = /* glsl */ `
  uniform float uOffset;
  varying vec3 vPos;
  varying float vDepth;
  void main() {
    vPos = position;
    vec3 p = position;
    float wz = p.z + uOffset;
    p.x += sin(wz * 0.014) * 2.6;
    p.y += cos(wz * 0.011) * 1.1;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uOffset;
  uniform float uReveal;
  uniform float uMouth;
  uniform vec3 uKey;
  uniform vec3 uConcrete;
  uniform vec3 uAsphalt;
  uniform vec3 uPaint;
  uniform vec3 uDaylight;
  uniform vec3 uLightPos[${LIGHTS}];
  uniform vec3 uLightColor[${LIGHTS}];
  varying vec3 vPos;
  varying float vDepth;
  ${FOG_GLSL}
  ${NOISE_GLSL}
  ${AA_GLSL}

  void main() {
    float wz = vPos.z + uOffset;
    float aa = detailFade(vec2(vPos.x + vPos.y, wz));
    float ax = abs(vPos.x);
    float ay = abs(vPos.y);

    // Which of the four faces this fragment belongs to. A square tube, so the
    // larger of |x| and |y| decides it.
    float isCeil = step(ax, vPos.y);
    float isRoad = step(ax, -vPos.y);
    float isWall = 1.0 - isCeil - isRoad;

    // ---- road -------------------------------------------------------------
    float grain = noise(vec2(vPos.x * 6.0, wz * 6.0)) * 0.5
                + noise(vec2(vPos.x * 22.0, wz * 22.0)) * 0.5;
    vec3 road = uAsphalt * (0.75 + grain * 0.55 * aa);
    // centre line, dashed 3 on 5 off; solid edge lines near the kerbs
    float dash = step(0.375, fract(wz / 8.0));
    float centre = (1.0 - smoothstep(0.10, 0.17, ax)) * dash;
    float edge = 1.0 - smoothstep(0.07, 0.13, abs(ax - 3.1));
    road = mix(road, uPaint, clamp(centre + edge, 0.0, 1.0) * 0.85);

    // ---- walls ------------------------------------------------------------
    float wn = noise(vec2(wz * 1.6, vPos.y * 3.0));
    vec3 wall = uConcrete * (0.5 + wn * 0.4 * aa);
    // board-formed panel joins every 3m, and the vertical construction joint
    float join = smoothstep(0.93, 1.0, abs(fract(wz / 3.0) - 0.5) * 2.0) * aa;
    wall = mix(wall, uConcrete * 0.35, join * 0.7);
    // road grime: darkens the lower wall, heaviest right above the kerb
    wall *= mix(0.42, 1.0, smoothstep(-3.9, 0.6, vPos.y));
    // painted safety band at shoulder height, scuffed by the same noise. Kept
    // dull on purpose: paint reflects, it does not emit, and at full strength
    // it read as a light strip rather than a stripe of paint.
    float band = (1.0 - smoothstep(0.0, 0.3, abs(vPos.y + 1.35)));
    wall = mix(wall, uPaint * (0.16 + wn * 0.1), band * 0.35);
    // kerb line where the wall meets the road
    wall = mix(wall, uConcrete * 0.9, 1.0 - smoothstep(0.0, 0.3, abs(vPos.y + 3.55)));

    // ---- ceiling ----------------------------------------------------------
    vec3 ceil = uConcrete * (0.26 + noise(vec2(vPos.x * 2.0, wz * 2.0)) * 0.16);

    vec3 col = road * isRoad + wall * isWall + ceil * isCeil;

    // ---- the fixtures, the only emissive thing in here ---------------------
    float fz = abs(fract(wz / ${FIXTURE_SPACING}.0) - 0.5) * ${FIXTURE_SPACING}.0;
    float lamp = (1.0 - smoothstep(0.7, 1.5, fz)) * (1.0 - smoothstep(1.1, 1.7, ax));
    col += uKey * lamp * isCeil * 3.2;
    // the pool each fixture throws down the walls and across the road
    float spill = (1.0 - smoothstep(1.2, 7.0, fz));
    col += uKey * spill * (isWall * 0.16 + isRoad * 0.13) * (1.0 - smoothstep(0.0, 3.4, ay) * 0.4);

    // travelling wash from the real point lights, so ribs and walls agree
    for (int i = 0; i < ${LIGHTS}; i++) {
      float d = (vPos.z - uLightPos[i].z) * 0.14;
      col += uLightColor[i] * (1.0 / (1.0 + d * d)) * 0.1;
    }

    // near the exit, daylight starts washing back up the bore. Gently: at half
    // strength it bleached the sodium out of the whole tube.
    col += uDaylight * uMouth * 0.2 * smoothstep(45.0, 0.0, vDepth);

    col = applyFog(col, vDepth);
    // The act fade: the underpass dissolves into its own fog rather than cutting.
    gl_FragColor = vec4(mix(uFogColor, col, uReveal), 1.0);
  }
`;

export default function Underpass({ state }: { state: ActState }) {
  const group = useRef<THREE.Group>(null);
  const ribs = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const concrete = useMemo(() => new THREE.Color(readToken("--spiral-steel")), []);
  const asphalt = useMemo(() => new THREE.Color(readToken("--cool-asphalt")), []);
  const paint = useMemo(() => new THREE.Color(readToken("--spiral-concrete")), []);
  const daylight = useMemo(() => new THREE.Color(readToken("--cool-daylight")), []);

  const shellGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(TUNNEL_RADIUS, TUNNEL_RADIUS, 560, 4, 240, true);
    g.rotateX(Math.PI / 2);
    g.rotateZ(Math.PI / 4);
    return g;
  }, []);

  /** A structural ring beam, not a light ring. Square section, sits proud of
   *  the bore by a few centimetres the way a cast rib does. */
  const ribGeo = useMemo(() => {
    const g = new THREE.TorusGeometry(TUNNEL_RADIUS - 0.28, 0.22, 4, 4);
    g.rotateZ(Math.PI / 4);
    return g;
  }, []);

  const shellMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        uniforms: {
          uOffset: { value: 0 },
          uReveal: { value: 1 },
          uMouth: { value: 0 },
          uKey: { value: new THREE.Color() },
          uConcrete: { value: concrete },
          uAsphalt: { value: asphalt },
          uPaint: { value: paint },
          uDaylight: { value: daylight },
          uFogColor: { value: new THREE.Color() },
          uFogDensity: { value: 0.013 },
          uLightPos: { value: Array.from({ length: LIGHTS }, () => new THREE.Vector3()) },
          uLightColor: { value: Array.from({ length: LIGHTS }, () => new THREE.Color()) },
        },
      }),
    [concrete, asphalt, paint, daylight],
  );

  const ribMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: concrete,
        roughness: 0.96,
        metalness: 0,
        emissive: new THREE.Color(),
        transparent: true,
      }),
    [concrete],
  );

  useEffect(() => {
    const owned = [shellGeo, ribGeo, shellMat, ribMat];
    return () => {
      for (const o of owned) o.dispose();
    };
  }, [shellGeo, ribGeo, shellMat, ribMat]);

  useFrame(() => {
    const w = Math.min(1, state.w[0] + state.w[4]);
    if (group.current) group.current.visible = w > 0.004;
    if (w <= 0.004) return;

    const { offset } = state;
    const u = shellMat.uniforms;
    u.uOffset.value = offset;
    u.uReveal.value = w;
    u.uMouth.value = state.w[4] * state.daylight;
    (u.uKey.value as THREE.Color).copy(state.key);
    (u.uFogColor.value as THREE.Color).copy(state.fog);
    for (let i = 0; i < LIGHTS; i++) {
      (u.uLightPos.value[i] as THREE.Vector3).copy(state.lightPos[i]);
      (u.uLightColor.value[i] as THREE.Color).copy(state.lightColor[i]);
    }

    ribMat.opacity = w;
    // The beams sit directly under the fixtures, so they catch sodium. Four
    // travelling point lights cannot reach all fifty, and unlit they read as
    // black bars stamped across the bore.
    ribMat.emissive.copy(state.key).multiplyScalar(0.05);
    if (ribs.current) {
      for (let i = 0; i < TUNNEL_RIBS; i++) {
        const z = wrap(i * TUNNEL_SPACING + offset, TUNNEL_LOOP);
        const wz = z + offset;
        dummy.position.set(bendX(wz), bendY(wz), z);
        dummy.updateMatrix();
        ribs.current.setMatrixAt(i, dummy.matrix);
      }
      ribs.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={group}>
      <mesh geometry={shellGeo} material={shellMat} />
      <instancedMesh
        ref={ribs}
        args={[ribGeo, ribMat, TUNNEL_RIBS]}
        frustumCulled={false}
      />
    </group>
  );
}
