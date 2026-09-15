import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import ProductVisual from "@/components/ProductVisual";
import type { AppPage } from "@/lib/appPages";
import AppActions from "./AppActions";

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
      <main id="content" className="app-detail">
        <section className="app-hero shell">
          <div>
            <a href="/#apps" className="meta-id app-back">
              ← Collection / {page.slug}
            </a>
            <h1>
              {page.headline.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h1>
            <p className="app-intro">{page.sub}</p>
            <AppActions page={page} />
            <p className="app-proof-line">{page.proofLine}</p>
          </div>
          <ProductVisual slug={page.slug} priority />
        </section>

        {afterHero}

        <section className="app-tagline shell">
          <p className="type-heading max-w-2xl text-2xl text-paper sm:text-3xl">
            {page.tagline.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
        </section>

        <section className="app-section shell">
          <h2 className="type-display max-w-2xl text-4xl text-paper sm:text-5xl">
            {page.benefitsHeading}
          </h2>
          <ul className="app-section-body">
            {page.benefits.map((benefit) => (
              <li key={benefit.title} className="border-t border-gray/25 py-8">
                <h3 className="type-heading text-xl text-paper">{benefit.title}</h3>
                <p className="mt-3 max-w-xl text-gray">{benefit.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="app-section shell">
          <h2 className="type-display max-w-2xl text-4xl text-paper sm:text-5xl">
            {page.stepsHeading}
          </h2>
          <ol className="app-section-body">
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
          <section className="app-section app-section--wide shell">
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

        <section id="faq" className="app-section shell">
          <h2 className="type-display text-4xl text-paper sm:text-5xl">
            The things people ask.
          </h2>
          <div className="app-section-body">
            {page.faq.map((item, i) => (
              <details
                key={item.q}
                className="group border-b border-gray/25 py-6"
                open={i === 0}
              >
                <summary className="type-heading cursor-pointer list-none text-lg text-paper outline-none marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red [&::-webkit-details-marker]:hidden">
                  <span className="flex items-baseline justify-between gap-6">
                    {item.q}
                    <span
                      aria-hidden="true"
                      className="shrink-0 font-mono text-sm text-gray transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 max-w-xl text-gray">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="app-section app-section--wide shell">
          <h2 className="type-display max-w-[680px] text-4xl text-paper sm:text-6xl">
            {page.closing.headline.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h2>
          <p className="mt-8 max-w-xl text-gray">{page.closing.body}</p>
          <AppActions page={page} />
        </section>
      </main>
      <Footer />
    </>
  );
}
