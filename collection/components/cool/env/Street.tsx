"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { readToken } from "@/lib/coolTokens";
import { AA_GLSL, type ActState, FOG_GLSL, NOISE_GLSL, wrap } from "../journey";

/**
 * Act 2: out of the underpass and onto a wet street.
 *
 * Everything here is a thing you could photograph — kerbs, lane markings,
 * lamp posts with the head cantilevered over the carriageway, blocks of
 * building with about a third of the windows still lit, and rain. The road is
 * wet, so each lamp smears a long vertical reflection back toward the camera;
 * that smear does more for the sense of place than any amount of glow.
 *
 * The same travel value drives it as drives the underpass, so the forward
 * motion carries straight through the wipe. Only the room changes.
 */

const LOOP = 480;
const ROAD_Y = -2;
const LAMPS = 14;
const BLOCKS = 26;
const RAIN = 700;

const ROAD_FRAG = /* glsl */ `
  precision highp float;
  uniform float uOffset;
  uniform float uTime;
  uniform float uReveal;
  uniform vec3 uKey;
  uniform vec3 uAsphalt;
  uniform vec3 uPaint;
  uniform float uLampZ[4];
  uniform float uLampX[4];
  varying vec2 vXZ;
  varying float vDepth;
  ${FOG_GLSL}
  ${NOISE_GLSL}
  ${AA_GLSL}

  void main() {
    float z = vXZ.y + uOffset;
    float x = vXZ.x;
    float aa = detailFade(vec2(x, z));

    float grain = noise(vec2(x * 5.0, z * 5.0)) * 0.5 + noise(vec2(x * 19.0, z * 19.0)) * 0.5;
    vec3 col = uAsphalt * (0.7 + grain * 0.6 * aa);

    // standing water: broad slicks that catch light far more than dry tarmac
    float wet = smoothstep(0.35, 0.85, noise(vec2(x * 0.35, z * 0.2)));

    // lane markings: dashed lane dividers, solid edge lines at the kerbs
    float dash = step(0.4, fract(z / 9.0));
    float lane = (1.0 - smoothstep(0.10, 0.18, abs(abs(x) - 2.4))) * dash;
    float edge = 1.0 - smoothstep(0.08, 0.15, abs(abs(x) - 6.5));
    col = mix(col, uPaint * 0.75, clamp(lane + edge, 0.0, 1.0) * 0.8);

    // the reflections. Each lamp lays a long streak down the wet road toward
    // the viewer, breaking up as the surface roughens.
    for (int i = 0; i < 4; i++) {
      float dx = abs(x - uLampX[i]);
      float dz = z - uLampZ[i];
      float across = 1.0 - smoothstep(0.0, 2.2, dx);
      float along = exp(-abs(dz) * 0.035) * step(0.0, -dz + 60.0);
      float ripple = 0.55 + 0.45 * sin(dz * 1.7 + uTime * 2.2 + x);
      col += uKey * across * along * ripple * (0.12 + wet * 0.55);
      // the pool of light directly under the head
      float pool = exp(-(dx * dx * 0.03 + dz * dz * 0.004));
      col += uKey * pool * 0.35;
    }

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

/** Windows are a grid in **metres**, not in the box's normalised local space.
 *  Local space would give a ten-metre block and a twenty-metre block the same
 *  number of columns, so the wide one gets windows twice the size — which is
 *  exactly how an earlier pass ended up looking like a stack of orange tiles
 *  rather than a building. The instance scale comes out of the matrix columns. */
const BLOCK_VERT = /* glsl */ `
  varying vec3 vMetres;
  varying vec3 vSeed;
  varying float vDepth;
  varying vec3 vNormalW;
  void main() {
    vec3 scale = vec3(
      length(instanceMatrix[0].xyz),
      length(instanceMatrix[1].xyz),
      length(instanceMatrix[2].xyz)
    );
    vMetres = position * scale;
    vSeed = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    vNormalW = normalize(mat3(instanceMatrix) * normal);
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BLOCK_FRAG = /* glsl */ `
  precision highp float;
  uniform float uReveal;
  uniform float uTime;
  uniform vec3 uFacade;
  uniform vec3 uWindow;
  varying vec3 vMetres;
  varying vec3 vSeed;
  varying float vDepth;
  varying vec3 vNormalW;
  ${FOG_GLSL}
  ${NOISE_GLSL}
  ${AA_GLSL}

  void main() {
    vec3 col = uFacade * (0.7 + noise(vMetres.xy * 0.7) * 0.6);

    // Only the vertical faces get windows; roofs and soffits stay blank.
    float side = 1.0 - abs(vNormalW.y);
    // 3.4m storeys, 2.6m bays. Same on every block, whatever its footprint.
    vec2 cell = vec2((vMetres.x + vMetres.z) / 2.6, vMetres.y / 3.4);
    vec2 grid = floor(cell);
    vec2 f = fract(cell);

    float pane = step(0.24, f.x) * step(f.x, 0.76) * step(0.28, f.y) * step(f.y, 0.74);
    pane *= detailFade(cell);
    // roughly a third of them still on at this hour
    float lit = step(0.68, hash(grid + vSeed.xz * 0.37));
    // one in twenty is a strip light with a flicker in it
    float flick = 1.0 - 0.3 * step(0.95, hash(grid + 3.1)) * (0.5 + 0.5 * sin(uTime * 5.0 + grid.x));

    col += uWindow * pane * lit * side * 0.85 * flick;
    col = applyFog(col, vDepth);
    gl_FragColor = vec4(mix(uFogColor, col, uReveal), 1.0);
  }
`;

export default function Street({ state }: { state: ActState }) {
  const group = useRef<THREE.Group>(null);
  const posts = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const blocks = useRef<THREE.InstancedMesh>(null);
  const rain = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const asphalt = useMemo(() => new THREE.Color(readToken("--cool-asphalt")), []);
  const paint = useMemo(() => new THREE.Color(readToken("--spiral-concrete")), []);
  const concrete = useMemo(() => new THREE.Color(readToken("--spiral-steel")), []);
  const tungsten = useMemo(() => new THREE.Color(readToken("--cool-tungsten")), []);

  const roadGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(800, 800, 1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  const roadMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLANE_VERT,
        fragmentShader: ROAD_FRAG,
        uniforms: {
          uOffset: { value: 0 },
          uTime: { value: 0 },
          uReveal: { value: 0 },
          uKey: { value: new THREE.Color() },
          uAsphalt: { value: asphalt },
          uPaint: { value: paint },
          uLampZ: { value: [0, 0, 0, 0] },
          uLampX: { value: [0, 0, 0, 0] },
          uFogColor: { value: new THREE.Color() },
          uFogDensity: { value: 0.011 },
        },
      }),
    [asphalt, paint],
  );

  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  const kerbMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: concrete,
        roughness: 0.95,
        transparent: true,
      }),
    [concrete],
  );

  const postMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(readToken("--spiral-black")),
        roughness: 0.7,
        metalness: 0.4,
        transparent: true,
      }),
    [],
  );

  const headMat = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, fog: false }),
    [],
  );

  const blockMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BLOCK_VERT,
        fragmentShader: BLOCK_FRAG,
        uniforms: {
          uReveal: { value: 0 },
          uTime: { value: 0 },
          uFacade: { value: new THREE.Color() },
          uWindow: { value: tungsten },
          uFogColor: { value: new THREE.Color() },
          uFogDensity: { value: 0.011 },
        },
      }),
    [tungsten],
  );

  const rainGeo = useMemo(() => new THREE.BoxGeometry(0.014, 1, 0.014), []);
  const rainMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  const lamps = useMemo(
    () =>
      Array.from({ length: LAMPS }, (_, i) => ({
        side: i % 2 === 0 ? -1 : 1,
        z0: (i * LOOP) / LAMPS,
      })),
    [],
  );

  const blockLayout = useMemo(
    () =>
      Array.from({ length: BLOCKS }, (_, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const r = ((i * 9301 + 49297) % 233280) / 233280;
        const r2 = ((i * 4231 + 7919) % 65521) / 65521;
        return {
          x: side * (24 + r2 * 16),
          h: 14 + r * 34,
          w: 12 + r2 * 16,
          d: 14 + r * 20,
          z0: (Math.floor(i / 2) * LOOP) / (BLOCKS / 2) + r * 10,
        };
      }),
    [],
  );

  const rainSeeds = useMemo(
    () =>
      Array.from({ length: RAIN }, (_, i) => ({
        x: (((i * 7919) % 10007) / 10007 - 0.5) * 44,
        y: ((i * 4241) % 7919) / 7919,
        z: ((i * 2711) % 6007) / 6007,
        len: 0.6 + (((i * 331) % 97) / 97) * 1.4,
      })),
    [],
  );

  useEffect(() => {
    const owned = [
      roadGeo,
      roadMat,
      boxGeo,
      kerbMat,
      postMat,
      headMat,
      blockMat,
      rainGeo,
      rainMat,
    ];
    return () => {
      for (const o of owned) o.dispose();
    };
  }, [roadGeo, roadMat, boxGeo, kerbMat, postMat, headMat, blockMat, rainGeo, rainMat]);

  useFrame(() => {
    const w = state.w[1];
    if (group.current) group.current.visible = w > 0.004;
    if (w <= 0.004) return;

    const { offset, t, key, fog } = state;

    const u = roadMat.uniforms;
    u.uOffset.value = offset;
    u.uTime.value = t;
    u.uReveal.value = w;
    (u.uKey.value as THREE.Color).copy(key);
    (u.uFogColor.value as THREE.Color).copy(fog);

    blockMat.uniforms.uReveal.value = w;
    blockMat.uniforms.uTime.value = t;
    (blockMat.uniforms.uFacade.value as THREE.Color).copy(concrete).multiplyScalar(0.17);
    (blockMat.uniforms.uFogColor.value as THREE.Color).copy(fog);

    kerbMat.opacity = w;
    postMat.opacity = w;
    headMat.opacity = w;
    headMat.color.copy(key).multiplyScalar(1.6);
    rainMat.opacity = w * 0.3;
    rainMat.color.copy(key).lerp(paint, 0.6);

    // Lamps. The four nearest feed the road shader's reflection streaks; the
    // shader has no idea where they are otherwise.
    const nearZ = u.uLampZ.value as number[];
    const nearX = u.uLampX.value as number[];
    let n = 0;
    if (posts.current && heads.current) {
      for (let i = 0; i < LAMPS; i++) {
        const l = lamps[i];
        const z = wrap(l.z0 + offset, LOOP);
        // post
        dummy.position.set(l.side * 8.6, ROAD_Y + 4.5, z);
        dummy.scale.set(0.24, 9, 0.24);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        posts.current.setMatrixAt(i, dummy.matrix);
        // head, cantilevered out over the carriageway
        dummy.position.set(l.side * 6.4, ROAD_Y + 8.8, z);
        dummy.scale.set(1.5, 0.22, 0.5);
        dummy.updateMatrix();
        heads.current.setMatrixAt(i, dummy.matrix);

        if (n < 4 && z > -90) {
          nearZ[n] = z + offset;
          nearX[n] = l.side * 6.4;
          n++;
        }
      }
      posts.current.instanceMatrix.needsUpdate = true;
      heads.current.instanceMatrix.needsUpdate = true;
    }
    for (let i = n; i < 4; i++) {
      nearZ[i] = 9999;
      nearX[i] = 0;
    }

    if (blocks.current) {
      for (let i = 0; i < BLOCKS; i++) {
        const b = blockLayout[i];
        const z = wrap(b.z0 + offset, LOOP);
        dummy.position.set(b.x, ROAD_Y + b.h / 2, z);
        dummy.scale.set(b.w, b.h, b.d);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        blocks.current.setMatrixAt(i, dummy.matrix);
      }
      blocks.current.instanceMatrix.needsUpdate = true;
    }

    if (rain.current) {
      for (let i = 0; i < RAIN; i++) {
        const s = rainSeeds[i];
        // Rain falls in the camera's own box and wraps; it has nothing to do
        // with the travel value, which is why it keeps falling when you stop.
        const y = ((s.y * 30 - t * 26) % 30) + 30;
        const z = wrap(s.z * 120 + offset * 1.4, 120);
        dummy.position.set(s.x, ROAD_Y + (y % 30), z);
        dummy.scale.set(1, s.len * 1.5, 1);
        dummy.rotation.set(0, 0, 0.06);
        dummy.updateMatrix();
        rain.current.setMatrixAt(i, dummy.matrix);
      }
      rain.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={roadGeo} material={roadMat} position={[0, ROAD_Y, -220]} />
      <mesh
        geometry={boxGeo}
        material={kerbMat}
        position={[-7.4, ROAD_Y + 0.16, -220]}
        scale={[1.8, 0.32, 800]}
      />
      <mesh
        geometry={boxGeo}
        material={kerbMat}
        position={[7.4, ROAD_Y + 0.16, -220]}
        scale={[1.8, 0.32, 800]}
      />
      <instancedMesh ref={posts} args={[boxGeo, postMat, LAMPS]} frustumCulled={false} />
      <instancedMesh ref={heads} args={[boxGeo, headMat, LAMPS]} frustumCulled={false} />
      <instancedMesh
        ref={blocks}
        args={[boxGeo, blockMat, BLOCKS]}
        frustumCulled={false}
      />
      <instancedMesh ref={rain} args={[rainGeo, rainMat, RAIN]} frustumCulled={false} />
    </group>
  );
}
