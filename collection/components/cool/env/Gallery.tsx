"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { readToken } from "@/lib/coolTokens";
import { AA_GLSL, type ActState, FOG_GLSL, NOISE_GLSL } from "../journey";

/**
 * Act 4: the ride stops. A long room with tall windows down one side.
 *
 * The only act that ignores the travel value — nothing streams past, the sun
 * just moves a little. Coming out of the open road, the stillness is the point.
 *
 * The windows are on the right and the light lands on the right-hand half of
 * the floor, which leaves the left side in shade. That is where the tagline
 * sits, so the composition is lopsided on purpose.
 *
 * Every shaft shares one direction, so all six are a single instanced mesh
 * with one quaternion and six positions.
 */

const FLOOR_Y = -2.6;
const WALL_X = 13;
const BACK_Z = -52;
const CEIL_Y = 9;
const SHAFTS = 6;
const FIRST_Z = -8;
const PITCH = 7;

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

const FLOOR_FRAG = /* glsl */ `
  precision highp float;
  uniform float uReveal;
  uniform float uTime;
  uniform vec3 uKey;
  uniform vec3 uConcrete;
  varying vec2 vXZ;
  varying float vDepth;
  ${FOG_GLSL}
  ${NOISE_GLSL}
  ${AA_GLSL}

  void main() {
    float x = vXZ.x;
    float z = vXZ.y;

    // poured floor: fine aggregate, a slow trowel swirl, saw-cut joints at 4m
    float aa = detailFade(vec2(x, z));
    float n = noise(vec2(x * 1.1, z * 1.1)) * 0.6 + noise(vec2(x * 7.0, z * 7.0)) * 0.4;
    vec3 col = uConcrete * (0.17 + n * 0.13 * aa);
    float joint = smoothstep(0.94, 1.0, abs(fract(x / 4.0) - 0.5) * 2.0) * aa;
    col = mix(col, uConcrete * 0.1, joint * 0.5);

    // where each shaft lands. Periodic because the windows are evenly spaced.
    float pz = abs(fract((z - ${FIRST_Z}.0) / ${PITCH}.0 + 0.5) - 0.5) * ${PITCH}.0;
    float pool = smoothstep(1.9, 0.0, pz) * smoothstep(2.9, 0.0, abs(x - 4.6));
    col += uKey * pool * 1.15;

    // the sheen a polished floor throws back up the room from those pools
    float sheen = smoothstep(2.6, 0.0, pz) * smoothstep(9.0, 0.0, abs(x - 3.0));
    col += uKey * sheen * 0.1 * (0.85 + 0.15 * sin(uTime * 0.4));

    col = applyFog(col, vDepth);
    gl_FragColor = vec4(mix(uFogColor, col, uReveal), 1.0);
  }
`;

/** The window wall. Openings are painted straight onto the plane: at this
 *  distance a cut-out would cost geometry and read identically. */
const WALL_FRAG = /* glsl */ `
  precision highp float;
  uniform float uReveal;
  uniform vec3 uSky;
  uniform vec3 uConcrete;
  uniform float uWindows;
  varying vec2 vXZ;
  varying float vDepth;
  ${FOG_GLSL}
  ${NOISE_GLSL}
  ${AA_GLSL}

  void main() {
    float z = vXZ.x;
    float y = vXZ.y;
    vec3 col = uConcrete
      * (0.18 + noise(vec2(z * 2.6, y * 2.6)) * 0.07 * detailFade(vec2(z, y)));

    if (uWindows > 0.5) {
      float wz = abs(fract((z - ${FIRST_Z}.0) / ${PITCH}.0 + 0.5) - 0.5) * ${PITCH}.0;
      float opening = (1.0 - smoothstep(1.3, 1.5, wz))
                    * step(1.2, y) * step(y, 7.8);
      // glazing bar across the middle of each light
      float bar = 1.0 - smoothstep(0.05, 0.12, abs(y - 4.5));
      col = mix(col, uSky * 1.5, opening * (1.0 - bar * 0.8));
      // the reveal each opening lights up around itself
      col += uSky * (1.0 - smoothstep(1.4, 3.2, wz)) * 0.06;
    }

    col = applyFog(col, vDepth);
    gl_FragColor = vec4(mix(uFogColor, col, uReveal), 1.0);
  }
`;

/** Walls read world z along their length and world y up. Same reason the
 *  ground planes do: the geometry rotation is baked, so local axes lie. */
const WALL_VERT = /* glsl */ `
  varying vec2 vXZ;
  varying float vDepth;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vXZ = vec2(wp.z, wp.y);
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHAFT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const SHAFT_FRAG = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    // soft across the beam, fading out as it reaches the floor
    float across = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 1.6);
    float along = pow(vUv.y, 1.3);
    gl_FragColor = vec4(uColor, across * along * uOpacity);
  }
`;

/** Floor, ceiling and the three walls are the same material with a different
 *  fragment shader. Defined out here so it is a stable reference — inside the
 *  component it would be a new function every render and every `useMemo` that
 *  called it would be lying about its dependencies. */
function surface(frag: string, concrete: THREE.Color, vert = PLANE_VERT) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.DoubleSide,
    uniforms: {
      uReveal: { value: 0 },
      uTime: { value: 0 },
      uKey: { value: new THREE.Color() },
      uSky: { value: new THREE.Color() },
      uConcrete: { value: concrete },
      uWindows: { value: 0 },
      uFogColor: { value: new THREE.Color() },
      uFogDensity: { value: 0.009 },
    },
  });
}

export default function Gallery({ state }: { state: ActState }) {
  const group = useRef<THREE.Group>(null);
  const shafts = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const concrete = useMemo(() => new THREE.Color(readToken("--spiral-concrete")), []);

  const floorGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(70, 120, 1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const ceilGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(70, 120, 1, 1);
    g.rotateX(Math.PI / 2);
    return g;
  }, []);
  const wallGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(120, 24, 1, 1);
    g.rotateY(-Math.PI / 2);
    return g;
  }, []);
  const backGeo = useMemo(() => new THREE.PlaneGeometry(30, 24, 1, 1), []);

  const floorMat = useMemo(() => surface(FLOOR_FRAG, concrete), [concrete]);
  const ceilMat = useMemo(() => surface(FLOOR_FRAG, concrete), [concrete]);
  const rightMat = useMemo(() => surface(WALL_FRAG, concrete, WALL_VERT), [concrete]);
  const leftMat = useMemo(() => surface(WALL_FRAG, concrete, WALL_VERT), [concrete]);
  const backMat = useMemo(() => surface(WALL_FRAG, concrete, WALL_VERT), [concrete]);

  const shaftGeo = useMemo(() => new THREE.PlaneGeometry(3.1, 1, 1, 1), []);
  const shaftMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SHAFT_VERT,
        fragmentShader: SHAFT_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
        uniforms: {
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color() },
        },
      }),
    [],
  );

  /** One direction for every beam, so the whole set is one instanced mesh. */
  const shaftPose = useMemo(() => {
    const dir = new THREE.Vector3(-0.74, -0.66, -0.12).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const length = (4.5 - FLOOR_Y) / -dir.y;
    return { dir, q, length };
  }, []);

  useEffect(() => {
    const owned = [
      floorGeo,
      ceilGeo,
      wallGeo,
      backGeo,
      floorMat,
      ceilMat,
      rightMat,
      leftMat,
      backMat,
      shaftGeo,
      shaftMat,
    ];
    return () => {
      for (const o of owned) o.dispose();
    };
  }, [
    floorGeo,
    ceilGeo,
    wallGeo,
    backGeo,
    floorMat,
    ceilMat,
    rightMat,
    leftMat,
    backMat,
    shaftGeo,
    shaftMat,
  ]);

  useFrame(() => {
    const w = state.w[3];
    if (group.current) group.current.visible = w > 0.004;
    if (w <= 0.004) return;

    const { t, key, fog, skyTop, skyLow, daylight } = state;
    // Morning light through glass is close to neutral. Reading the sunrise
    // ramp here made the whole room orange, which is an hour too early.
    const lit = skyTop
      .clone()
      .lerp(key, 0.25)
      .multiplyScalar(0.5 + daylight * 0.8);

    for (const m of [floorMat, ceilMat, rightMat, leftMat, backMat]) {
      m.uniforms.uReveal.value = w;
      m.uniforms.uTime.value = t;
      (m.uniforms.uKey.value as THREE.Color).copy(lit);
      (m.uniforms.uSky.value as THREE.Color).copy(skyLow).lerp(skyTop, 0.6);
      (m.uniforms.uFogColor.value as THREE.Color).copy(fog);
    }
    // Only the right-hand wall is glazed. The other three are blank concrete,
    // which is what keeps the left side of the frame dark enough to read text.
    rightMat.uniforms.uWindows.value = 1;
    // No light lands on the ceiling in this room, so it gets no pools.
    (ceilMat.uniforms.uKey.value as THREE.Color).setRGB(0, 0, 0);

    shaftMat.uniforms.uOpacity.value = w * (0.1 + daylight * 0.3);
    (shaftMat.uniforms.uColor.value as THREE.Color).copy(lit);

    if (shafts.current) {
      const { q, length } = shaftPose;
      // The sun creeps across while you stand still. It is the only thing
      // moving in this act, and it is deliberately almost too slow to notice.
      const creep = Math.sin(t * 0.06) * 0.5;
      for (let i = 0; i < SHAFTS; i++) {
        const z = FIRST_Z - i * PITCH;
        dummy.position.set(
          WALL_X - 0.4 + shaftPose.dir.x * (length / 2),
          4.5 + shaftPose.dir.y * (length / 2),
          z + shaftPose.dir.z * (length / 2) + creep,
        );
        dummy.quaternion.copy(q);
        dummy.scale.set(1, length, 1);
        dummy.updateMatrix();
        shafts.current.setMatrixAt(i, dummy.matrix);
      }
      shafts.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={floorGeo} material={floorMat} position={[0, FLOOR_Y, -26]} />
      <mesh geometry={ceilGeo} material={ceilMat} position={[0, CEIL_Y, -26]} />
      <mesh geometry={wallGeo} material={rightMat} position={[WALL_X, CEIL_Y / 2, -26]} />
      <mesh geometry={wallGeo} material={leftMat} position={[-WALL_X, CEIL_Y / 2, -26]} />
      <mesh geometry={backGeo} material={backMat} position={[0, CEIL_Y / 2, BACK_Z]} />
      <instancedMesh
        ref={shafts}
        args={[shaftGeo, shaftMat, SHAFTS]}
        frustumCulled={false}
      />
    </group>
  );
}
