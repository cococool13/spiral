import type { ReactNode } from "react";

/**
 * Scroll-triggered reveal: rises in as it enters the viewport.
 *
 * Pure CSS, on a view timeline — no JavaScript, and not a client component.
 * That is the README's stated first preference, and it fixes the thing the
 * framer version got wrong: `initial={{ opacity: 0 }}` was rendered into the
 * static HTML, so roughly twenty blocks per app page — everything below the
 * hero — shipped invisible and only appeared once the framer chunk had parsed.
 * A page whose body depends on script running is a page that can arrive empty.
 *
 * Here the visible state is the default and the animation is the enhancement,
 * so the content is there whatever happens. Browsers without view timelines
 * simply show it.
 *
 * `step` staggers a list. There is no time delay on a scroll-driven animation,
 * so the stagger is a scroll offset instead: each item starts its rise a little
 * further into the section's entry.
 */
export default function Reveal({
  children,
  step = 0,
  className = "",
}: {
  children: ReactNode;
  /** Position in a staggered group. 0 for a lone element. */
  step?: number;
  className?: string;
}) {
  return (
    <div
      className={`reveal ${className}`}
      style={step ? ({ "--reveal-step": step } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
