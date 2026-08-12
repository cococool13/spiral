import type { ReactNode } from "react";
import Reveal from "@/components/Reveal";

/**
 * The moment straight after the hero, where a page stops asserting and shows
 * something.
 *
 * Resume earns this with twelve real renders of a resume. The other three apps
 * have no picture worth faking, so each shows the truest artifact it actually
 * has: Slim the policy names it writes, Wallpaper what it costs to run, Clean
 * the rule that decides what it may destroy. Same shape, same weight, different
 * evidence.
 */
export default function HeroProof({
  eyebrow,
  heading,
  note,
  children,
}: {
  eyebrow: string;
  heading: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-24 sm:pb-32">
      <Reveal>
        <p className="type-eyebrow text-paper">{eyebrow}</p>
        <h2 className="type-display mt-4 max-w-2xl text-3xl text-paper sm:text-4xl">
          {heading}
        </h2>
        {note ? <p className="mt-4 max-w-xl text-gray">{note}</p> : null}
      </Reveal>
      <Reveal delay={0.05}>
        <div className="mt-12">{children}</div>
      </Reveal>
    </section>
  );
}
