"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One large statement whose words come up to full strength one at a time, in
 * reading order, as the section crosses the viewport.
 *
 * Driven by a single `IntersectionObserver` per word rather than a scroll
 * listener: a listener fires on every frame of every scroll and forces layout
 * each time, which is what makes this pattern janky on a phone.
 */
export default function TaglineReveal({ lines }: { lines: string[] }) {
  const words = lines.flatMap((line, i) =>
    line.split(" ").map((word) => ({ word, line: i })),
  );
  const [lit, setLit] = useState<number>(-1);
  const marks = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      setLit(words.length);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const at = marks.current.indexOf(entry.target as HTMLSpanElement);
          // Only ever move forward, so scrolling back up does not unlight
          // words the reader has already read.
          setLit((current) => (at > current ? at : current));
        }
      },
      // A band across the middle of the screen: a word lights as it reaches
      // the line a reader's eye is actually on.
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (const mark of marks.current) {
      if (mark) observer.observe(mark);
    }
    return () => observer.disconnect();
  }, [words.length]);

  return (
    <section className="mx-auto max-w-[680px] px-6 py-24 sm:py-32">
      <p className="type-heading text-4xl sm:text-5xl">
        {lines.map((line, lineIndex) => {
          const before = lines
            .slice(0, lineIndex)
            .reduce((n, l) => n + l.split(" ").length, 0);
          return (
            <span key={line} className="block">
              {line.split(" ").map((word, wordIndex) => {
                const at = before + wordIndex;
                return (
                  <span
                    // Words repeat inside a line, so position in the sentence
                    // is the only identity they have — and the sentence is a
                    // constant.
                    // biome-ignore lint/suspicious/noArrayIndexKey: position is the identity
                    key={`${line}-${wordIndex}`}
                    ref={(node) => {
                      marks.current[at] = node;
                    }}
                    className="transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{
                      // The unlit state was rgba(...,0.32), which composites to
                      // 1.6:1 against the page — unreadable, and these are the
                      // only words in the section. Mixed from the token instead,
                      // and set at the level that clears 3:1 for large text, so
                      // a word you have not reached yet is still a word.
                      color:
                        at <= lit
                          ? "var(--spiral-paper)"
                          : "color-mix(in oklab, var(--spiral-gray) 70%, transparent)",
                    }}
                  >
                    {word}{" "}
                  </span>
                );
              })}
            </span>
          );
        })}
      </p>
    </section>
  );
}
