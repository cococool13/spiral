import * as THREE from "three";
import { readRamp, readToken } from "@/lib/coolTokens";

/**
 * The ride, as data.
 *
 * Five real places, in one continuous night that turns into a morning: a road
 * underpass, a wet city street, an open highway at the blue hour, a room with
 * tall windows, and the tunnel mouth on the way out. The underpass bookends it.
 *
 * Acts overlap by a few percent of scroll so one place dissolves into the next
 * instead of cutting, and every environment reads its own weight out of
 * `ActState.w` rather than testing the raw progress value itself.
 *
 * One shared mutable `ActState` is written once per frame by `Stage` and read
 * by every environment. Nothing here goes through React state: at 60fps that
 * would re-render the whole tree every frame for values only the GPU cares
 * about.
 */

export const TRAVEL = 1000;
export const TUNNEL_SPACING = 6;
export const TUNNEL_RIBS = 50;
export const TUNNEL_LOOP = TUNNEL_SPACING * TUNNEL_RIBS;
export const TUNNEL_RADIUS = 5.6;
export const LIGHTS = 4;

/** from → to in scroll progress. Neighbours overlap; that overlap is the wipe. */
const SPANS: [number, number][] = [
  [0, 0.26],
  [0.24, 0.44],
  [0.42, 0.6],
  [0.58, 0.8],
  [0.78, 1.01],
];

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Wrap into [-span, 0) — the trick that makes a finite set of props endless. */
export function wrap(v: number, span: number) {
  return (((v % span) + span) % span) - span;
}

/** The underpass curves, the way a real one does. Shell, ribs, lights and
 *  camera all read this so the bore stays one continuous tube. */
export function bendX(z: number) {
  return Math.sin(z * 0.014) * 2.6;
}
export function bendY(z: number) {
  return Math.cos(z * 0.011) * 1.1;
}

export interface ActState {
  /** damped scroll progress, 0 to 1 */
  p: number;
  /** seconds since mount */
  t: number;
  /** distance the world has travelled past the camera */
  offset: number;
  /** 0 at midnight, 1 in open morning light. Drives exposure everywhere. */
  daylight: number;
  /** per-act weight, 0 to 1, summing to roughly 1 through every crossfade */
  w: number[];
  /** the colour of the key light right now */
  key: THREE.Color;
  /** what the distance dissolves into. Must match the sky or nothing reads. */
  fog: THREE.Color;
  skyTop: THREE.Color;
  skyLow: THREE.Color;
  lightPos: THREE.Vector3[];
  lightColor: THREE.Color[];
}

export function createActState(): ActState {
  return {
    p: 0,
    t: 0,
    offset: 0,
    daylight: 0,
    w: SPANS.map(() => 0),
    key: new THREE.Color(),
    fog: new THREE.Color(),
    skyTop: new THREE.Color(),
    skyLow: new THREE.Color(),
    lightPos: Array.from({ length: LIGHTS }, () => new THREE.Vector3()),
    lightColor: Array.from({ length: LIGHTS }, () => new THREE.Color()),
  };
}

/**
 * An act's weight at progress `p`. The first act must be fully on at p = 0 and
 * the last fully on at p = 1, so the open and close edges are not faded.
 */
export function actWeight(p: number, i: number, fade = 0.03) {
  const [from, to] = SPANS[i];
  const rise = from <= 0 ? 1 : smoothstep(from - fade, from + fade, p);
  const fall = to >= 1 ? 0 : smoothstep(to - fade, to + fade, p);
  return rise * (1 - fall);
}

export function writeWeights(state: ActState) {
  for (let i = 0; i < SPANS.length; i++) state.w[i] = actWeight(state.p, i);
}

export type Ramp = { at: number; c: THREE.Color }[];

export function makeRamp(): Ramp {
  return readRamp().map((s) => ({ at: s.at, c: new THREE.Color(s.hex) }));
}

export function sampleRamp(ramp: Ramp, p: number, out: THREE.Color) {
  const t = Math.min(0.9999, Math.max(0, p));
  for (let i = 1; i < ramp.length; i++) {
    if (t <= ramp[i].at) {
      const span = ramp[i].at - ramp[i - 1].at;
      const k = span === 0 ? 0 : (t - ramp[i - 1].at) / span;
      out.copy(ramp[i - 1].c).lerp(ramp[i].c, k);
      return out;
    }
  }
  return out.copy(ramp[ramp.length - 1].c);
}

/** The sky, sampled twice: zenith and the band just above the horizon. Sky and
 *  fog are computed in one place because the moment they disagree, the horizon
 *  turns into a visible seam and the whole thing stops looking like outdoors. */
export function sampleSky(p: number, top: THREE.Color, low: THREE.Color) {
  const night = new THREE.Color(readToken("--cool-void"));
  const dusk = new THREE.Color(readToken("--cool-dusk"));
  const horizon = new THREE.Color(readToken("--cool-horizon"));
  const day = new THREE.Color(readToken("--cool-daylight"));

  const toDusk = smoothstep(0.3, 0.5, p);
  const toDay = smoothstep(0.58, 0.82, p);

  top
    .copy(night)
    .lerp(dusk, toDusk)
    .lerp(day, toDay * 0.85);
  low
    .copy(night)
    .lerp(dusk, toDusk * 0.7)
    .lerp(horizon, smoothstep(0.42, 0.62, p) * (1 - toDay * 0.6))
    .lerp(day, toDay * 0.8);
}

/** Manual exponential-squared fog, matched to the scene fog three applies to
 *  lit materials. Every custom shader in `env/` pastes this in. */
export const FOG_GLSL = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  vec3 applyFog(vec3 col, float depth) {
    float f = exp(-pow(depth * uFogDensity, 2.0));
    return mix(uFogColor, col, clamp(f, 0.0, 1.0));
  }
`;

/**
 * Screen-space detail attenuation.
 *
 * Every surface here is procedural, so there is no mip chain and nothing stops
 * a saw-cut joint or a grain of aggregate from being finer than a pixel. At a
 * grazing angle — which is most of a floor seen from standing height — that
 * aliases into radial streaks fanning out of the vanishing point.
 *
 * `fwidth` gives the rate the coordinate changes per pixel, so this fades
 * detail out exactly where it stops being resolvable. Core in WebGL2, which is
 * what three requests.
 */
export const AA_GLSL = /* glsl */ `
  float detailFade(vec2 p) {
    return 1.0 / (1.0 + (fwidth(p.x) + fwidth(p.y)) * 2.2);
  }
`;

export const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
`;
