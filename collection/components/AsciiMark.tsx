"use client";

import { useEffect, useRef } from "react";
import { MARK_PATHS } from "./Mark";

const COLS = 84;
const ROWS = 48;
const CW = 5;
const CH = 9;
const RAMP = "@#S08Xx+=-;:,.";

/**
 * The Spiral mark, rasterised into text characters from its own paths.
 * One instance on the site. Rotates slowly; a still frame under reduced motion.
 */
export default function AsciiMark() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const off = document.createElement("canvas");
    off.width = COLS;
    off.height = ROWS;
    const o = off.getContext("2d", { willReadFrequently: true });
    if (!o) return;
    const paths = MARK_PATHS.map((d) => new Path2D(d));
    const ink = getComputedStyle(cv).color;
    const asp = CH / CW;

    const frame = (angle: number, tm: number) => {
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, COLS, ROWS);
      o.setTransform(1, 0, 0, 1 / asp, 0, 0);
      o.translate(COLS / 2, (ROWS * asp) / 2);
      o.rotate(angle);
      const k = (COLS * 0.93) / 668;
      o.scale(k, k);
      o.translate(-513, -437);
      o.fillStyle = "white";
      o.filter = "blur(.7px)";
      for (const p of paths) o.fill(p);
      o.filter = "none";
      const data = o.getImageData(0, 0, COLS, ROWS).data;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.font = `700 ${CH - 1}px ui-monospace, Menlo, monospace`;
      ctx.textBaseline = "top";
      ctx.fillStyle = ink;
      for (let y = 0; y < ROWS; y++) {
        let line = "";
        for (let x = 0; x < COLS; x++) {
          let c = data[(y * COLS + x) * 4 + 3] / 255;
          c *= 0.9 + 0.1 * Math.sin(y * 0.55 - tm * 0.002 + x * 0.12);
          line +=
            c < 0.07
              ? " "
              : RAMP[
                  Math.min(
                    RAMP.length - 1,
                    Math.round((1 - Math.min(1, c)) * (RAMP.length - 1)),
                  )
                ];
        }
        ctx.fillText(line, 0, y * CH);
      }
    };

    frame(-0.5, 0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let visible = false;
    let raf = 0;
    let last = 0;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    });
    // 12 fps: slow on purpose, and cheap.
    function loop(ts: number) {
      raf = visible ? requestAnimationFrame(loop) : 0;
      if (ts - last < 83) return;
      last = ts;
      frame(-0.5 + ts * 0.00022, ts);
    }
    io.observe(cv);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="ascii"
      width={420}
      height={432}
      role="img"
      aria-label="The Spiral mark drawn in text characters"
    />
  );
}
