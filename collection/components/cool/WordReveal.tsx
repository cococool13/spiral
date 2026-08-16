"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Word by word reveal.
 *
 * Each word gets its own IntersectionObserver entry against a band one pixel
 * tall across the middle of the viewport, so words light up as they cross that
 * line rather than the whole block flipping at once. No scroll listener, so
 * nothing here can thrash layout.
 *
 * Under reduced motion every word is simply on.
 */
export default function WordReveal({
  lines,
  className = "",
}: {
  lines: string[];
  className?: string;
}) {
  const host = useRef<HTMLParagraphElement>(null);
  const [lit, setLit] = useState<Set<number>>(new Set());
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced || !host.current) return;
    const words = host.current.querySelectorAll<HTMLElement>("[data-word]");
    const io = new IntersectionObserver(
      (entries) => {
        setLit((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const i = Number(e.target.getAttribute("data-word"));
            if (!Number.isNaN(i)) next.add(i);
          }
          return next.size === prev.size ? prev : next;
        });
      },
      { rootMargin: "-50% 0px -49% 0px", threshold: 0 },
    );
    for (const w of words) io.observe(w);
    return () => io.disconnect();
  }, [reduced]);

  let index = 0;
  return (
    <p ref={host} className={`cool-reveal ${className}`}>
      {lines.map((line) => (
        <span key={line} className="block">
          {line.split(" ").map((word) => {
            const i = index++;
            return (
              <span
                key={`${line}-${i}`}
                data-word={i}
                data-lit={reduced || lit.has(i) ? "true" : "false"}
                className="cool-word"
              >
                {word}{" "}
              </span>
            );
          })}
        </span>
      ))}
    </p>
  );
}
