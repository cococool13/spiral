import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import GlassPillCTA from "@/components/GlassPillCTA";
import MotionProvider from "@/components/MotionProvider";
import Nav from "@/components/Nav";
import Reveal from "@/components/Reveal";
import TaglineReveal from "@/components/resume/TaglineReveal";
import ScrollProgress from "@/components/ScrollProgress";
import type { AppPage } from "@/lib/appPages";
import { apps } from "@/lib/apps";

/** The page's one pair of actions. It appears in the hero and again at the
 *  close; it is a component so the two can never drift apart.
 *
 *  Where the app has real downloads the primary action comes from the
 *  catalogue, not from `page.cta`. Hand-typed, Slim's said "Download for
 *  macOS" and pointed at `spiral/releases` — Slim ships from `Spiral-Slim`, so
 *  that page had no Slim DMG on it. A page CTA also never OS-routed and could
 *  not respect `noWindowsBinary`. `page.cta` still carries the apps that have
 *  nothing to download yet. */
function Actions({ page }: { page: AppPage }) {
  const app = apps.find((a) => a.slug === page.slug);
  return (
    <div className="mt-10 flex flex-wrap items-center gap-4">
      {/* `.glass-pill` is unlayered CSS, so it beats every Tailwind utility in
          `@layer utilities`. Adding size, colour or transition utilities here
          does nothing — this element previously carried ten of them, all
          silently dead. Change the pill in globals.css instead. */}
      {app?.downloads ? (
        <GlassPillCTA app={app} />
      ) : (
        <a href={page.cta.href} className="glass-pill">
          {page.cta.label}
        </a>
      )}
      <a
        href={page.secondary.href}
        className="inline-flex min-h-11 items-center text-base text-gray underline-offset-4 transition-colors hover:text-paper hover:underline"
      >
        {page.secondary.label}
      </a>
    </div>
  );
}

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
            {/* No eyebrow. The nav already names the app you are reading, and
                the headline is a whole sentence. */}
            <h1 className="type-display max-w-[680px] text-5xl text-paper sm:text-7xl">
              {page.headline.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h1>
            <p className="mt-8 max-w-[680px] text-lg text-gray">{page.sub}</p>
            <Actions page={page} />
            <p className="mt-6 text-sm text-gray">{page.proofLine}</p>
          </Reveal>
        </section>

        {afterHero}

        <TaglineReveal lines={page.tagline} />

        <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <Reveal>
            <h2 className="type-display max-w-2xl text-4xl text-paper sm:text-5xl">
              {page.benefitsHeading}
            </h2>
          </Reveal>
          <ul className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-2">
            {page.benefits.map((benefit, i) => (
              <Reveal key={benefit.title} step={i}>
                <li>
                  <h3 className="type-heading text-xl text-paper">{benefit.title}</h3>
                  <p className="mt-3 text-gray">{benefit.body}</p>
                </li>
              </Reveal>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <Reveal>
            <h2 className="type-display max-w-2xl text-4xl text-paper sm:text-5xl">
              {page.stepsHeading}
            </h2>
          </Reveal>
          <ol className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-3">
            {page.steps.map((item, i) => (
              <Reveal key={item.n} step={i}>
                <li>
                  <p className="font-mono text-sm text-red">{item.n}</p>
                  <h3 className="type-heading mt-4 text-xl text-paper">{item.title}</h3>
                  <p className="mt-3 text-gray">{item.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        {page.facts && page.factsHeading ? (
          <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
            <Reveal>
              <h2 className="type-display max-w-2xl text-4xl text-paper sm:text-5xl">
                {page.factsHeading}
              </h2>
              {page.factsNote ? (
                <p className="mt-6 max-w-xl text-gray">{page.factsNote}</p>
              ) : null}
            </Reveal>
            <dl className="mt-16 grid grid-cols-1 gap-px border border-gray/25 sm:grid-cols-2">
              {page.facts.map((fact, i) => (
                <Reveal key={fact.label} step={i}>
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

        <section id="faq" className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
          <Reveal>
            <h2 className="type-display text-4xl text-paper sm:text-5xl">
              The things people ask.
            </h2>
          </Reveal>
          <dl className="mt-16">
            {page.faq.map((item, i) => (
              <Reveal key={item.q} step={i}>
                <div className="border-b border-gray/25 py-8">
                  <dt className="type-heading text-lg text-paper">{item.q}</dt>
                  <dd className="mt-3 text-gray">{item.a}</dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <Reveal>
            <h2 className="type-display max-w-[680px] text-4xl text-paper sm:text-6xl">
              {page.closing.headline.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h2>
            <p className="mt-8 max-w-xl text-gray">{page.closing.body}</p>
            <Actions page={page} />
          </Reveal>
        </section>
      </main>
      <Footer />
    </MotionProvider>
  );
}
