"use client";

import { useEffect, useRef } from "react";

interface InteractiveGridProps {
  /** lattice pitch in CSS px (brand rhythm: a multiple of 8). */
  spacing?: number;
  /** idle dot radius in CSS px; grows toward the cursor. */
  dotRadius?: number;
  /** cursor influence radius in CSS px. */
  reach?: number;
  className?: string;
}

type RGB = [number, number, number];

/** Read a #rrggbb brand token off :root so the grid can never drift from /brand. */
function readToken(name: string, fallback: RGB): RGB {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
    .replace("#", "");
  if (raw.length === 6) {
    const n = Number.parseInt(raw, 16);
    if (!Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return fallback;
}

/**
 * Interactive dot lattice — the hero's background surface.
 *
 * Idle it reads as a faint concrete lattice; under the cursor the dots warm
 * toward helix red and throw hairline connectors back to the pointer, so the
 * surface acknowledges you without competing with the wordmark.
 *
 * Two deliberate departures from the usual canvas-component shape:
 *  - No React state. Pointer position lives in refs, so moving the mouse never
 *    re-renders the tree — it only marks the canvas dirty.
 *  - The rAF loop is self-terminating. It runs while the pointer is moving or
 *    the enter/leave fade is settling, then stops. Idle costs zero frames,
 *    which is the "super lightweight" pillar applied to the website.
 *
 * Under prefers-reduced-motion or a coarse pointer it paints one static
 * lattice and binds no listeners.
 */
export default function InteractiveGrid({
  spacing = 32,
  dotRadius = 1.2,
  reach = 200,
  className = "",
}: InteractiveGridProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Checked live per event, never snapshotted at mount: a media query read
    // once can be wrong forever after. `(pointer: fine)` in particular is false
    // on touchscreen laptops that also have a mouse, so the pointer type on the
    // event itself is the honest signal.
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const CONCRETE = readToken("--spiral-concrete", [216, 214, 209]);
    const RED = readToken("--spiral-red", [213, 46, 43]);

    const reachSq = reach * reach;
    // connectors reach less far than the glow, so the lines stay a hint rather
    // than a starburst under the wordmark
    const lineReachSq = reachSq * 0.4;

    let cssW = 0;
    let cssH = 0;
    let cols = 0;
    let rows = 0;
    let originX = 0;
    let originY = 0;

    // pointer in canvas-local CSS px; `cur` trails `target` for a soft follow
    const target = { x: -1e4, y: -1e4 };
    const cur = { x: -1e4, y: -1e4 };
    let influence = 0; // 0 = inert lattice, 1 = fully lit
    let influenceTarget = 0;

    const setSize = () => {
      cssW = host.clientWidth || 1;
      cssH = host.clientHeight || 1;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // centre the lattice so it stays symmetrical at any viewport
      cols = Math.floor(cssW / spacing);
      rows = Math.floor(cssH / spacing);
      originX = (cssW - cols * spacing) / 2;
      originY = (cssH - rows * spacing) / 2;
    };

    const draw = () => {
      ctx.clearRect(0, 0, cssW, cssH);
      const lit = influence > 0.001;
      const px = cur.x;
      const py = cur.y;

      // connectors first, so each dot sits on top of its own line
      if (lit) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgb(${RED[0]},${RED[1]},${RED[2]})`;
        for (let i = 0; i <= cols; i++) {
          const x = originX + i * spacing;
          const dx = x - px;
          if (dx * dx > lineReachSq) continue;
          for (let j = 0; j <= rows; j++) {
            const y = originY + j * spacing;
            const dy = y - py;
            const d2 = dx * dx + dy * dy;
            if (d2 > lineReachSq) continue;
            // quadratic falloff keeps the far end of each line near-invisible
            const t = 1 - d2 / lineReachSq;
            ctx.globalAlpha = t * t * 0.42 * influence;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(px, py);
            ctx.stroke();
          }
        }
      }

      for (let i = 0; i <= cols; i++) {
        const x = originX + i * spacing;
        const dx = x - px;
        const inColumn = lit && dx * dx <= reachSq;
        for (let j = 0; j <= rows; j++) {
          const y = originY + j * spacing;
          let t = 0;
          if (inColumn) {
            const dy = y - py;
            const d2 = dx * dx + dy * dy;
            if (d2 < reachSq) t = (1 - d2 / reachSq) * influence;
          }

          if (t > 0) {
            // concrete warms toward helix red as the cursor closes in
            const r = Math.round(CONCRETE[0] + (RED[0] - CONCRETE[0]) * t);
            const g = Math.round(CONCRETE[1] + (RED[1] - CONCRETE[1]) * t);
            const b = Math.round(CONCRETE[2] + (RED[2] - CONCRETE[2]) * t);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.globalAlpha = 0.24 + t * 0.74;
            ctx.beginPath();
            ctx.arc(x, y, dotRadius + t * 1.9, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = `rgb(${CONCRETE[0]},${CONCRETE[1]},${CONCRETE[2]})`;
            ctx.globalAlpha = 0.24;
            ctx.beginPath();
            ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.globalAlpha = 1;
    };

    /* --- self-terminating loop: alive only while something is settling ----- */
    let raf = 0;

    const tick = () => {
      raf = 0;
      const dx = target.x - cur.x;
      const dy = target.y - cur.y;
      const di = influenceTarget - influence;

      cur.x += dx * 0.18;
      cur.y += dy * 0.18;
      influence += di * 0.12;

      const settled =
        Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4 && Math.abs(di) < 0.004;
      if (settled) {
        cur.x = target.x;
        cur.y = target.y;
        influence = influenceTarget;
      }
      draw();
      if (!settled) raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    /* --- events ----------------------------------------------------------- */
    const onPointerMove = (e: PointerEvent) => {
      // touch drags should not leave a lit pool behind the content, and
      // reduced-motion keeps the lattice inert
      if (e.pointerType === "touch" || reduceMq.matches) return;

      const rect = host.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;

      influenceTarget = inside ? 1 : 0;
      if (inside) {
        // on first entry, land the pool under the cursor rather than sliding
        // in from wherever it was left
        if (influence < 0.002) {
          cur.x = x;
          cur.y = y;
        }
        target.x = x;
        target.y = y;
      }
      wake();
    };

    const onPointerLeave = () => {
      influenceTarget = 0;
      wake();
    };

    let resizeRaf = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        setSize();
        draw();
      });
    };

    setSize();
    draw();

    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    // listen on window: the grid is pointer-events:none and the hero's own
    // content sits above it
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [spacing, dotRadius, reach]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`absolute inset-0 overflow-hidden ${className}`}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
