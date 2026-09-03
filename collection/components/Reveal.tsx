"use client";

import {
  type CSSProperties,
  type ElementType,
  type ReactNode,
  useEffect,
  useRef,
} from "react";

/**
 * Arrival, once. The element rises 16px and fades in the first time it enters
 * the viewport, then never moves again. Pure transform + opacity, driven by one
 * class; the curve and stagger live in globals.css (`.reveal`).
 *
 * The hidden start state is gated on `html.js` (set inline in layout.tsx), so
 * the static export with scripts blocked shows everything at rest.
 */
interface Props {
  as?: ElementType;
  className?: string;
  /** Stagger rung — multiplied by 60ms. */
  step?: number;
  children: ReactNode;
}

export default function Reveal({
  as: Tag = "div",
  className,
  step = 0,
  children,
}: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.add("is-in");
        io.disconnect();
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style = { "--reveal-step": step } as CSSProperties;
  return (
    <Tag ref={ref} className={`reveal${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </Tag>
  );
}
