"use client";

import { type ReactNode, useEffect, useRef } from "react";

/**
 * Sets --plate-p on its section: 0 when the section's top reaches the bottom
 * of the viewport, 1 when its bottom leaves the top. The CSS decides what
 * moves (the photograph drifts; the type stays put). Reduced motion pins 0.5.
 */
export default function ParallaxPlate({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.setProperty("--plate-p", "0.5");
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const span = window.innerHeight + r.height;
      const p =
        span <= 0 ? 0.5 : Math.min(1, Math.max(0, (window.innerHeight - r.top) / span));
      el.style.setProperty("--plate-p", p.toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={ref} className={className}>
      {children}
    </section>
  );
}
