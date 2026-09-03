"use client";

import { type ElementType, useEffect, useRef, useState } from "react";

/**
 * Mono-register decode. The label arrives as instrument readout: every glyph
 * flickers through digits and rules, then locks in left to right. Runs once,
 * when the element first enters the viewport (or on mount with `immediate`).
 *
 * The real text is always in the DOM for assistive tech and for the no-JS
 * export; only the visible copy scrambles. Reduced motion renders the text.
 */

// Thin marks, mostly. Digits are rare so the readout murmurs rather than counts.
const GLYPHS = "···–—/\\|:.·· 0123456789";
const DURATION = 1400;
const LOCK_SPAN = 0.7; // fraction of the duration over which glyphs lock, left to right
const REROLL = 0.28; // chance per frame that an unlocked glyph changes — slower flicker

interface Props {
  text: string;
  as?: ElementType;
  className?: string;
  /** Start on mount instead of on first intersection. */
  immediate?: boolean;
  /** Milliseconds before the decode starts. */
  delay?: number;
}

export default function Scramble({
  text,
  as: Tag = "span",
  className,
  immediate = false,
  delay = 0,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(text);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let timer = 0;
    let io: IntersectionObserver | null = null;

    const run = () => {
      const start = performance.now();
      const chars = Array.from(text);
      const roll = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
      const noise = chars.map((c) => (c === " " ? c : roll()));
      const tick = (now: number) => {
        // Eased clock: the last glyphs settle slowly.
        const lin = Math.min(1, (now - start) / DURATION);
        const t = 1 - (1 - lin) ** 2;
        let out = "";
        for (let i = 0; i < chars.length; i += 1) {
          const c = chars[i];
          if (c === " ") {
            out += c;
            continue;
          }
          const lockAt =
            (i / Math.max(1, chars.length - 1)) * LOCK_SPAN + (1 - LOCK_SPAN);
          if (t >= lockAt) {
            out += c;
          } else {
            if (Math.random() < REROLL) noise[i] = roll();
            out += noise[i];
          }
        }
        setShown(out);
        if (lin < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const arm = () => {
      timer = window.setTimeout(run, delay);
    };

    if (immediate) {
      arm();
    } else {
      io = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          io?.disconnect();
          arm();
        },
        { threshold: 0.4 },
      );
      io.observe(el);
    }

    return () => {
      io?.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [text, immediate, delay]);

  return (
    <Tag ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{shown}</span>
    </Tag>
  );
}
