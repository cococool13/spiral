import { otherWork } from "@/lib/otherWork";
import Reveal from "./Reveal";

/**
 * Inverted section — light concrete on dark page — so it reads as outside
 * the Spiral product line.
 */
export default function OtherWork() {
  return (
    <section id="other-work" className="bg-paper text-ink">
      <div className="mx-auto max-w-6xl px-6 py-32 sm:py-40">
        <Reveal>
          <p className="type-eyebrow text-ink">Other Work</p>
          <h2 className="type-display mt-4 text-4xl text-ink sm:text-5xl">
            Outside the Collection
          </h2>
        </Reveal>
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {otherWork.map((p, i) => {
            const inner = (
              <>
                <h3 className="type-heading text-lg">{p.name}</h3>
                <p className="mt-2 text-sm text-steel">{p.description}</p>
                {p.href && (
                  <span className="mt-4 inline-block font-mono text-xs font-medium text-oxblood underline-offset-4 group-hover:underline">
                    Visit →
                  </span>
                )}
              </>
            );
            const cardClass =
              "block rounded-[2px] border border-conc3 bg-white/40 p-8 transition-transform duration-150";
            return (
              <Reveal key={p.name} delay={i * 0.05}>
                {p.href ? (
                  <a
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${cardClass} group hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]`}
                  >
                    {inner}
                  </a>
                ) : (
                  <div className={cardClass}>{inner}</div>
                )}
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
