"use client";

import { useEffect, useRef } from "react";

/**
 * SPIRAL in embossed red glass, cropped by the left and bottom edges.
 * An SVG specular light sits over it and eases toward the pointer.
 */
export default function GlassWordmark() {
  const svg = useRef<SVGSVGElement>(null);
  const light = useRef<SVGFEPointLightElement>(null);

  useEffect(() => {
    const el = svg.current;
    const lt = light.current;
    if (!el || !lt) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover)").matches) return;

    const at = { x: 260, y: -80 };
    const to = { ...at };
    let raf = 0;
    let visible = false;

    const tick = () => {
      at.x += (to.x - at.x) * 0.12;
      at.y += (to.y - at.y) * 0.12;
      lt.setAttribute("x", at.x.toFixed(1));
      lt.setAttribute("y", at.y.toFixed(1));
      raf =
        Math.abs(to.x - at.x) + Math.abs(to.y - at.y) > 0.5
          ? requestAnimationFrame(tick)
          : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (!visible) return;
      const m = el.getScreenCTM();
      if (!m) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      to.x = p.x;
      to.y = p.y;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(el);
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      io.disconnect();
      document.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <svg ref={svg} className="wm" viewBox="0 0 1000 300" aria-hidden="true">
      <defs>
        <linearGradient id="wm-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--glass-400)" }} />
          <stop offset=".42" style={{ stopColor: "var(--glass-500)" }} />
          <stop offset="1" style={{ stopColor: "var(--glass-700)" }} />
        </linearGradient>
        <filter
          id="wm-glass"
          x="-4%"
          y="-8%"
          width="108%"
          height="124%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceAlpha" stdDeviation="7" result="b" />
          <feSpecularLighting
            in="b"
            surfaceScale="7"
            specularConstant="1.25"
            specularExponent="26"
            style={{ lightingColor: "var(--site-paper)" }}
            result="sp"
          >
            <fePointLight ref={light} x="260" y="-80" z="200" />
          </feSpecularLighting>
          <feComposite in="sp" in2="SourceAlpha" operator="in" result="spIn" />
          <feOffset in="SourceAlpha" dy="9" result="o" />
          <feGaussianBlur in="o" stdDeviation="12" result="ob" />
          <feFlood style={{ floodColor: "var(--glass-950)", floodOpacity: 0.6 }} />
          <feComposite in2="ob" operator="in" result="sh" />
          <feOffset in="SourceAlpha" dy="-5" result="io" />
          <feComposite in="SourceAlpha" in2="io" operator="out" result="rim" />
          <feFlood style={{ floodColor: "var(--site-mute)", floodOpacity: 0.35 }} />
          <feComposite in2="rim" operator="in" result="rimc" />
          <feComposite
            in="SourceGraphic"
            in2="spIn"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3=".9"
            k4="0"
            result="lit"
          />
          <feMerge>
            <feMergeNode in="sh" />
            <feMergeNode in="lit" />
            <feMergeNode in="rimc" />
          </feMerge>
        </filter>
      </defs>
      <text
        x="-4"
        y="286"
        fontSize="318"
        textLength="1008"
        lengthAdjust="spacing"
        fill="url(#wm-fill)"
        filter="url(#wm-glass)"
      >
        SPIRAL
      </text>
    </svg>
  );
}
