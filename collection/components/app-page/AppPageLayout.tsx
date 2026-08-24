import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import GlassPillCTA from "@/components/GlassPillCTA";
import Nav from "@/components/Nav";
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
      <a href={page.secondary.href} className="glass-pill glass-pill--secondary">
        {page.secondary.label}
      </a>
    </div>
  );
}

/** Shared by every app page. The pages themselves are the content in
 *  `lib/appPages.ts` plus, where an app has something worth showing, whatever
 *  is passed as `afterHero`. */
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
    <>
      <Nav />
      <main id="content">
        <section className="mx-auto max-w-6xl px-6 pt-36 pb-16 sm:pt-44 sm:pb-20">
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
        </section>

        {afterHero}

        <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
          <p className="type-heading max-w-2xl text-2xl text-paper sm:text-3xl">
            {page.tagline.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
          <h2 className="type-display max-w-2xl text-4xl text-paper sm:text-5xl">
            {page.benefitsHeading}
          </h2>
          <ul className="mt-12">
            {page.benefits.map((benefit) => (
              <li key={benefit.title} className="border-t border-gray/25 py-8">
                <h3 className="type-heading text-xl text-paper">{benefit.title}</h3>
                <p className="mt-3 max-w-xl text-gray">{benefit.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
          <h2 className="type-display max-w-2xl text-4xl text-paper sm:text-5xl">
            {page.stepsHeading}
          </h2>
          <ol className="mt-12">
            {page.steps.map((item) => (
              <li
                key={item.n}
                className="grid grid-cols-[3rem_1fr] gap-6 border-t border-gray/25 py-8"
              >
                <p className="font-mono text-sm text-gray">{item.n}</p>
                <div>
                  <h3 className="type-heading text-xl text-paper">{item.title}</h3>
                  <p className="mt-3 max-w-xl text-gray">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {page.facts && page.factsHeading ? (
          <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
            <h2 className="type-display max-w-2xl text-4xl text-paper sm:text-5xl">
              {page.factsHeading}
            </h2>
            {page.factsNote ? (
              <p className="mt-6 max-w-xl text-gray">{page.factsNote}</p>
            ) : null}
            <dl className="mt-16 grid grid-cols-1 gap-px border border-gray/25 sm:grid-cols-2">
              {page.facts.map((fact) => (
                <div key={fact.label} className="h-full p-8">
                  <dt className="type-eyebrow text-gray">{fact.label}</dt>
                  <dd className="type-heading mt-4 text-2xl text-paper">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {proof}

        <section id="faq" className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
          <h2 className="type-display text-4xl text-paper sm:text-5xl">
            The things people ask.
          </h2>
          <dl className="mt-16">
            {page.faq.map((item) => (
              <div key={item.q} className="border-b border-gray/25 py-8">
                <dt className="type-heading text-lg text-paper">{item.q}</dt>
                <dd className="mt-3 max-w-xl text-gray">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <h2 className="type-display max-w-[680px] text-4xl text-paper sm:text-6xl">
            {page.closing.headline.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h2>
          <p className="mt-8 max-w-xl text-gray">{page.closing.body}</p>
          <Actions page={page} />
        </section>
      </main>
      <Footer />
    </>
  );
}
