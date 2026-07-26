import type { ReactNode } from "react";

/**
 * One section of the single page. Stages mount as they unlock, so the page
 * unfolds downward as choices are made rather than swapping screens.
 *
 * The entrance lives in CSS with no fill mode: the resting style is the
 * visible one, and the animation only adds movement. A reveal that fades in
 * from zero with `both` leaves the section invisible whenever animations do
 * not run, which is the one failure this app cannot afford.
 *
 * Spring physics stay on the cards, where a stalled animation only means the
 * card does not move, never that content disappears.
 */
export function Stage({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="stage">
      <div className="stage__head">
        <h2 className="stage__title">{title}</h2>
        {hint === undefined ? null : <p className="stage__hint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
