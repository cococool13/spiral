import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import MotionProvider from "@/components/MotionProvider";
import Nav from "@/components/Nav";
import Reveal from "@/components/Reveal";
import TaglineReveal from "@/components/resume/TaglineReveal";
import ScrollProgress from "@/components/ScrollProgress";
import type { AppPage } from "@/lib/appPages";

/** Shared by every app page. The pages themselves are the content in
 *  `lib/appPages.ts` plus, where an app has something worth showing, whatever
 *  is passed as `afterHero` — Resume's scroll sequence is the first of those. */
export default function AppPageLayout({
  page,
  afterHero,
  proof,
}: {
  page: AppPage;
  afterHero?: ReactNode;
  /** A section that only makes sense for one app, rendered before the FAQ. */
  proof?: ReactNode;
}) {
  return (
    <MotionProvider>
      <Nav />
      <ScrollProgress />
      <main>
        <section className="mx-auto max-w-6xl px-6 pt-40 pb-24 sm:pt-48">
          <Reveal>
            <p className="type-eyebrow text-paper">{page.eyebrow}</p>
            <h1 className="type-display mt-6 max-w-[680px] text-5xl text-paper sm:text-7xl">
              {page.headline.map((line, i) => (
                <span key={line} className="block">
                  {line}
                  {i < page.headline.length - 1 ? null : null}
                </span>
              ))}
            </h1>
            <p className="mt-8 max-w-[680px] text-lg text-gray">{page.sub}</p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href={page.cta.href}
                className="glass-pill inline-flex items-center rounded-full px-3 py-2 text-base font-semibold text-black transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.02] active:scale-[0.98]"
              >
                {page.cta.label}
              </a>
              <a
                href={page.secondary.href}
                className="text-base text-gray underline-offset-4 transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-paper hover:underline"
              >
                {page.secondary.label}
              </a>
            </div>
            <p className="mt-6 text-sm text-gray">{page.proofLine}</p>
          </Reveal>
        </section>

        {afterHero}

        <TaglineReveal lines={page.tagline} />

        <section className="mx-auto max-w-6xl px-6 py-32 sm:py-40">
          <Reveal>
            <p className="type-eyebrow text-paper">What you get</p>
            <h2 className="type-display mt-4 max-w-2xl text-4xl text-paper sm:text-5xl">
              {page.benefitsHeading}
            </h2>
          </Reveal>
          <ul className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-2">
            {page.benefits.map((benefit, i) => (
              <Reveal key={benefit.title} delay={i * 0.05}>
                <li>
                  <h3 className="type-heading text-xl text-paper">{benefit.title}</h3>
                  <p className="mt-3 text-gray">{benefit.body}</p>
                </li>
              </Reveal>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-32 sm:py-40">
          <Reveal>
            <p className="type-eyebrow text-paper">How it works</p>
            <h2 className="type-display mt-4 max-w-2xl text-4xl text-paper sm:text-5xl">
              {page.stepsHeading}
            </h2>
          </Reveal>
          <ol className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-3">
            {page.steps.map((step, i) => (
              <Reveal key={step.n} delay={i * 0.05}>
                <li>
                  <p className="font-mono text-sm text-red">{step.n}</p>
                  <h3 className="type-heading mt-4 text-xl text-paper">{step.title}</h3>
                  <p className="mt-3 text-gray">{step.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        {page.facts && page.factsHeading ? (
          <section className="mx-auto max-w-6xl px-6 py-32 sm:py-40">
            <Reveal>
              <p className="type-eyebrow text-paper">The numbers</p>
              <h2 className="type-display mt-4 max-w-2xl text-4xl text-paper sm:text-5xl">
                {page.factsHeading}
              </h2>
              {page.factsNote ? (
                <p className="mt-6 max-w-xl text-gray">{page.factsNote}</p>
              ) : null}
            </Reveal>
            <dl className="mt-16 grid grid-cols-1 gap-px border border-gray/25 sm:grid-cols-2">
              {page.facts.map((fact, i) => (
                <Reveal key={fact.label} delay={i * 0.04}>
                  <div className="h-full p-8">
                    <dt className="type-eyebrow text-gray">{fact.label}</dt>
                    <dd className="type-heading mt-4 text-2xl text-paper">
                      {fact.value}
                    </dd>
                  </div>
                </Reveal>
              ))}
            </dl>
          </section>
        ) : null}

        {proof}

        <section id="faq" className="mx-auto max-w-3xl px-6 py-32 sm:py-40">
          <Reveal>
            <p className="type-eyebrow text-paper">Questions</p>
            <h2 className="type-display mt-4 text-4xl text-paper sm:text-5xl">
              The things people ask.
            </h2>
          </Reveal>
          <dl className="mt-16">
            {page.faq.map((item, i) => (
              <Reveal key={item.q} delay={i * 0.03}>
                <div className="border-b border-gray/25 py-8">
                  <dt className="type-heading text-lg text-paper">{item.q}</dt>
                  <dd className="mt-3 text-gray">{item.a}</dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-32 sm:py-40">
          <Reveal>
            <h2 className="type-display max-w-[680px] text-4xl text-paper sm:text-6xl">
              {page.closing.headline.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h2>
            <p className="mt-8 max-w-xl text-gray">{page.closing.body}</p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href={page.cta.href}
                className="glass-pill inline-flex items-center rounded-full px-3 py-2 text-base font-semibold text-black transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.02] active:scale-[0.98]"
              >
                {page.cta.label}
              </a>
              <a
                href={page.secondary.href}
                className="text-base text-gray underline-offset-4 transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-paper hover:underline"
              >
                {page.secondary.label}
              </a>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
    </MotionProvider>
  );
}
