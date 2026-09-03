"use client";

import { useEffect, useRef } from "react";

/**
 * A field of thin filaments rising through the frame, lit by a soft band that
 * runs along the direction of travel. Every filament reads its distance from a
 * focus point and uses that one number four ways: it grows, brightens, washes
 * from the base colour toward the accent, and speeds up. Nothing else changes
 * across the frame, which is why the band reads as attention rather than as a
 * gradient laid over the top.
 *
 * One WebGL draw call per frame: the gradient ramp is a vertex attribute and the
 * colour is resolved in the fragment shader, so nothing allocates in the loop.
 * Ported from ThreeUI's Defense Lines (Originkit build), with the Framer-only
 * parts removed: the element sizes itself from its own box, not from an
 * injected width/height, and the 1200×800 floor is gone.
 *
 * What this surface adds on top of the port, because the website's budgets in
 * collection/README.md require it:
 *
 *  - `prefers-reduced-motion: reduce` draws exactly one frame. The texture stays;
 *    the movement does not.
 *  - The loop stops while the canvas is off-screen or the tab is hidden.
 *  - Colours arrive as props from the synced brand tokens. No hex lives here.
 *  - The field is seeded, so the same props draw the same frame.
 */

const MAX_DPR = 2;
const MAX_DENSITY = 400;
// The field's bounding box is up to ~2.1x the screen at 45deg on a 3:2 frame, and
// Density means lines ON SCREEN, so the drawn count can exceed the dial.
const MAX_LINES = 900;
const VERTS_PER_LINE = 12; // two quads: the gradient has three stops
const STRIDE = 5; // x, y, ramp, proximity, opacity

const LEN_MIN = 20;
const LEN_SPREAD = 80;
const LEN_GAIN = 4;
const SPEED_MIN = 0.2;
const SPEED_SPREAD = 0.8;
const SPEED_GAIN = 0.5;
const OPACITY_MIN = 0.05;
const OPACITY_SPREAD = 0.2;
const OPACITY_GAIN = 2;
const BASE_RATE = 1.5 * 60; // the source stepped 1.5px per frame at an assumed 60fps
const PROX_Y_FLOOR = 0.4; // distance along travel only ever scales between this and 1
const END_TINT = 220 / 255; // the outer stop is a darker base than the middle one

const VERT_SRC = `
precision highp float;
attribute vec2 a_pos;
attribute vec3 a_ramp;
uniform vec2 uRes;
varying float vRamp;
varying float vProx;
varying float vOpacity;
void main(){
  vRamp = a_ramp.x;
  vProx = a_ramp.y;
  vOpacity = a_ramp.z;
  vec2 clip = vec2(a_pos.x / uRes.x * 2.0 - 1.0, 1.0 - a_pos.y / uRes.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;
uniform vec3 uBase, uAccent, uEnd;
uniform float uOpacity;
varying float vRamp;
varying float vProx;
varying float vOpacity;
void main(){
  vec3 mid = mix(uBase, uAccent, vProx);
  vec3 col = mix(uEnd, mid, vRamp);
  float a = vOpacity * vRamp * uOpacity;
  gl_FragColor = vec4(col * a, a);
}
`;

type RGB = [number, number, number];

function compile(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** `#rgb` / `#rrggbb` → 0..1 channels. Anything else falls back to white. */
function parseHex(input: string): RGB {
  let hex = input.trim().replace(/^#/, "");
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  if (hex.length < 6) return [1, 1, 1];
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [1, 1, 1];
  return [r / 255, g / 255, b / 255];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Seeded, so the same props give the same frame.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Live {
  base: RGB;
  accent: RGB;
  count: number;
  speed: number;
  direction: number;
  length: number;
  lineWidth: number;
  falloff: number;
  opacity: number;
  focusX: number;
  focusY: number;
}

export interface DefenseLinesProps {
  /** Filament colour away from the focus. A hex string from the brand tokens. */
  baseColor: string;
  /** Colour the filaments wash toward at the focus. */
  accentColor: string;
  /** Lines on screen, 8–400. */
  density?: number;
  /** 0–100. 50 is the shipped rate. */
  speed?: number;
  /** Degrees. 0 rises; 90 travels right. Rotates the whole field. */
  direction?: number;
  /** Percent of the shipped filament length. */
  length?: number;
  /** Device-independent pixels; below one device pixel the alpha is scaled instead. */
  lineWidth?: number;
  /** Percent. How far the lit band reaches toward the frame edge. */
  falloff?: number;
  /** Percent. Whole-layer opacity. */
  opacity?: number;
  /** Focus point as fractions of the frame, 0–1. */
  focus?: { x: number; y: number };
  /**
   * Let a fine pointer pull the focus. The band eases toward the cursor while
   * it is over the canvas and drifts back to `focus` when it leaves. Touch
   * and reduced motion never move it.
   */
  interactive?: boolean;
  /**
   * Idle breath, 0–1. With no pointer the focus wanders a little around
   * `focus` on two slow, unrelated periods, so the band is never quite still.
   * 0 pins it. Reduced motion pins it.
   */
  drift?: number;
  className?: string;
}

export default function DefenseLines({
  baseColor,
  accentColor,
  density = 100,
  speed = 50,
  direction = 0,
  length = 100,
  lineWidth = 1,
  falloff = 100,
  opacity = 50,
  focus,
  interactive = false,
  drift = 0,
  className,
}: DefenseLinesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const driftRef = useRef(drift);
  driftRef.current = clamp(drift, 0, 1);

  // Every live input is read from a ref inside the loop. Putting any of them in
  // the effect deps would rebuild the GL context on every prop tweak.
  const live = useRef<Live>({
    base: [1, 1, 1],
    accent: [1, 1, 1],
    count: 100,
    speed: 1,
    direction: 0,
    length: 1,
    lineWidth: 1,
    falloff: 1,
    opacity: 0.5,
    focusX: 0.5,
    focusY: 0.5,
  });
  live.current = {
    base: parseHex(baseColor),
    accent: parseHex(accentColor),
    count: Math.round(clamp(density, 8, MAX_DENSITY)),
    speed: clamp(speed, 0, 100) / 50,
    direction: clamp(direction, 0, 360),
    length: clamp(length, 10, 400) / 100,
    lineWidth: clamp(lineWidth, 1, 20),
    falloff: clamp(falloff, 20, 300) / 100,
    opacity: clamp(opacity, 0, 100) / 100,
    focusX: clamp(focus?.x ?? 0.5, 0, 1),
    focusY: clamp(focus?.y ?? 0.5, 0, 1),
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, depth: false });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL API, not a React hook
    gl.useProgram(prog);

    const rand = mulberry32(0x5eed17);

    // Per-line state for MAX_LINES, allocated once. Positions are normalized to
    // the field's own axes (na along travel, nb across it, both in [-1, 1]) so a
    // direction change or a resize re-maps them instead of re-seeding.
    const na = new Float32Array(MAX_LINES);
    const nb = new Float32Array(MAX_LINES);
    const baseLen = new Float32Array(MAX_LINES);
    const baseSpeed = new Float32Array(MAX_LINES);
    const baseOpacity = new Float32Array(MAX_LINES);
    for (let i = 0; i < MAX_LINES; i += 1) {
      na[i] = rand() * 2 - 1;
      nb[i] = rand() * 2 - 1;
      baseLen[i] = rand() * LEN_SPREAD + LEN_MIN;
      baseSpeed[i] = rand() * SPEED_SPREAD + SPEED_MIN;
      baseOpacity[i] = rand() * OPACITY_SPREAD + OPACITY_MIN;
    }

    const data = new Float32Array(MAX_LINES * VERTS_PER_LINE * STRIDE);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);

    const aPos = gl.getAttribLocation(prog, "a_pos");
    const aRamp = gl.getAttribLocation(prog, "a_ramp");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, STRIDE * 4, 0);
    gl.enableVertexAttribArray(aRamp);
    gl.vertexAttribPointer(aRamp, 3, gl.FLOAT, false, STRIDE * 4, 2 * 4);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uOpacity = gl.getUniformLocation(prog, "uOpacity");
    const uBase = gl.getUniformLocation(prog, "uBase");
    const uAccent = gl.getUniformLocation(prog, "uAccent");
    const uEnd = gl.getUniformLocation(prog, "uEnd");

    // The focus the band is currently at, as frame fractions. With a pointer
    // over the canvas it chases the cursor; otherwise it drifts home to the
    // prop. Eased per second so frame rate does not change the feel.
    let fx = live.current.focusX;
    let fy = live.current.focusY;
    let pointer: { x: number; y: number } | null = null;
    let clock = 0;

    const draw = (dt: number) => {
      clock += dt;
      const v = live.current;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const cw = canvas.clientWidth || 1;
      const ch = canvas.clientHeight || 1;
      const bw = Math.max(1, Math.round(cw * dpr));
      const bh = Math.max(1, Math.round(ch * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      gl.viewport(0, 0, bw, bh);

      // Two incommensurate periods (11s and 17s) so the wander never repeats
      // on a beat you can count.
      const d = driftRef.current;
      const wx = Math.sin(clock * ((2 * Math.PI) / 11)) * 0.07 * d;
      const wy = Math.sin(clock * ((2 * Math.PI) / 17) + 1.3) * 0.09 * d;
      const tx = pointer ? pointer.x : v.focusX + wx;
      const ty = pointer ? pointer.y : v.focusY + wy;
      // Slow follow: about a second to close most of the gap.
      const k = 1 - Math.exp(-dt * 2.2);
      fx += (tx - fx) * k;
      fy += (ty - fy) * k;

      const cx = bw * 0.5;
      const cy = bh * 0.5;
      const focusX = bw * fx;
      const focusY = bh * fy;

      // a is the travel axis (0deg = up), b is across it.
      const ang = (v.direction * Math.PI) / 180;
      const ax = Math.sin(ang);
      const ay = -Math.cos(ang);
      const bx = -ay;
      const by = ax;

      // Half-extent of the screen rect along each axis.
      const ha = (bw * Math.abs(ax) + bh * Math.abs(ay)) * 0.5;
      const hb = (bw * Math.abs(bx) + bh * Math.abs(by)) * 0.5;

      // Falloff reaches toward the frame EDGE along each axis, not the rect's
      // circumscribed extent, so the band does not swell at oblique angles.
      const reach = (dx: number, dy: number) =>
        Math.min(
          Math.abs(dx) > 1e-6 ? bw / (2 * Math.abs(dx)) : Number.POSITIVE_INFINITY,
          Math.abs(dy) > 1e-6 ? bh / (2 * Math.abs(dy)) : Number.POSITIVE_INFINITY,
        );
      const refAlong = Math.max(1, reach(ax, ay) * v.falloff);
      const refAcross = Math.max(1, reach(bx, by) * v.falloff);

      const fa = (focusX - cx) * ax + (focusY - cy) * ay;
      const fb = (focusX - cx) * bx + (focusY - cy) * by;

      const lenScale = v.length * dpr;
      const speedScale = v.speed * dpr;

      // Below one device pixel the quad cannot be rasterized, so it is widened
      // and its alpha scaled back by exactly how much.
      const wantW = v.lineWidth * dpr * 0.5;
      const halfW = Math.max(0.5, wantW);
      const widthAlpha = wantW / halfW;

      // Lines spread over the field's bounding box, which is bigger than the
      // screen off-axis; the drawn count carries the area ratio so Density keeps
      // meaning lines-on-screen.
      const areaRatio = (4 * ha * hb) / (bw * bh);
      const count = Math.min(MAX_LINES, Math.max(1, Math.round(v.count * areaRatio)));

      const ox = bx * halfW;
      const oy = by * halfW;

      let o = 0;
      for (let i = 0; i < count; i += 1) {
        const la = na[i] * ha;
        const lb = nb[i] * hb;
        const proxX = Math.max(0, 1 - Math.abs(lb - fb) / refAcross);
        const proxY = Math.max(0, 1 - Math.abs(la - fa) / refAlong);
        // Lopsided on purpose: distance ACROSS travel can zero a filament,
        // distance ALONG it only scales it. That is what makes a band, not a spot.
        const prox = proxX * (PROX_Y_FLOOR + proxY * (1 - PROX_Y_FLOOR));

        const len = baseLen[i] * lenScale * (1 + prox * LEN_GAIN);
        const op = Math.min(1, baseOpacity[i] + prox * OPACITY_GAIN) * widthAlpha;

        const hx = cx + ax * la + bx * lb;
        const hy = cy + ay * la + by * lb;

        const put = (xx: number, yy: number, rr: number) => {
          data[o] = xx;
          data[o + 1] = yy;
          data[o + 2] = rr;
          data[o + 3] = prox;
          data[o + 4] = op;
          o += STRIDE;
        };
        // Two quads split at the midpoint: three gradient stops cannot live on
        // one quad's two ends.
        const quad = (da: number, ra: number, db: number, rb: number) => {
          const p0x = hx - ax * da;
          const p0y = hy - ay * da;
          const p1x = hx - ax * db;
          const p1y = hy - ay * db;
          put(p0x - ox, p0y - oy, ra);
          put(p0x + ox, p0y + oy, ra);
          put(p1x + ox, p1y + oy, rb);
          put(p0x - ox, p0y - oy, ra);
          put(p1x + ox, p1y + oy, rb);
          put(p1x - ox, p1y - oy, rb);
        };
        quad(0, 0, len * 0.5, 1);
        quad(len * 0.5, 1, len, 0);

        na[i] +=
          (baseSpeed[i] * BASE_RATE * (1 + prox * SPEED_GAIN) * speedScale * dt) / ha;
        if (na[i] * ha - len > ha) {
          na[i] = -1;
          nb[i] = rand() * 2 - 1;
        }
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        data.subarray(0, count * VERTS_PER_LINE * STRIDE),
      );

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.uniform2f(uRes, bw, bh);
      gl.uniform1f(uOpacity, v.opacity);
      gl.uniform3f(uBase, v.base[0], v.base[1], v.base[2]);
      gl.uniform3f(uAccent, v.accent[0], v.accent[1], v.accent[2]);
      gl.uniform3f(
        uEnd,
        v.base[0] * END_TINT,
        v.base[1] * END_TINT,
        v.base[2] * END_TINT,
      );

      gl.drawArrays(gl.TRIANGLES, 0, count * VERTS_PER_LINE);
    };

    // Reduced motion draws a single frame with the field already spread out.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = 0;
    let onScreen = true;

    const tick = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      draw(dt);
      if (!reduced.matches && onScreen && !document.hidden)
        raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      if (reduced.matches) start();
    });
    ro.observe(canvas);
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (onScreen) start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", start);

    // Pointer follow. Listening on the document rather than the canvas, because
    // the copy layer sits over the field and would otherwise swallow the moves.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const onMove = (e: PointerEvent) => {
      if (!interactiveRef.current || !fine.matches || reduced.matches) return;
      const r = canvas.getBoundingClientRect();
      const inside =
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;
      pointer = inside
        ? { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
        : null;
    };
    const onLeave = () => {
      pointer = null;
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    start();

    // Never loseContext(): getContext returns the same context per canvas, so
    // StrictMode's mount -> cleanup -> mount would reuse a force-lost one.
    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      reduced.removeEventListener("change", start);
    };
  }, []);

  return (
    <div aria-hidden="true" className={className}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
}
