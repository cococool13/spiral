import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Privacy — Spiral",
  description:
    "Spiral does not make an account and does not upload your files. Anonymous, privacy-safe usage stats only: no personal data or content, IP discarded, and you can turn it off in Settings.",
  alternates: { canonical: "/privacy/" },
  openGraph: { url: "/privacy/" },
};

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main id="content" className="information-page shell">
        <h1 className="type-display text-4xl text-paper sm:text-5xl">Privacy</h1>
        <p className="mt-8 text-lg text-gray">
          Spiral does not make an account, and it does not run after you close the window.
          Anonymous, privacy-safe usage stats only: no personal data or content, IP
          discarded, and you can turn it off in Settings. Nothing leaves your computer for
          processing unless you choose that path yourself. Where Spiral talks to the
          internet, it names the host and talks to nothing else.
        </p>

        <section className="mt-16 border-t border-gray/25 pt-10">
          <h2 className="type-heading text-xl text-paper">Wallpaper</h2>
          <p className="mt-3 text-gray">
            Reaches Wallhaven&apos;s public SFW API when you search or apply. On launch it
            calls license_ensure against the spiral-license worker. On open it may ask
            GitHub once whether a newer build exists — named in Settings, and switchable
            off. It validates an image before writing or applying it, and keeps thumbnails
            on disk behind a cap you can see in Settings. Closing the window quits.
          </p>
        </section>

        <section className="mt-10 border-t border-gray/25 pt-10">
          <h2 className="type-heading text-xl text-paper">Resume</h2>
          <p className="mt-3 text-gray">
            The free pass never opens a connection. A model runs only if you add your own
            API key or download one to disk, and the app names which engine did the work.
            Remote keys talk to the host you chose — Anthropic, OpenAI, or a custom base
            URL you set. Offline models are fetched from Hugging Face when you press
            Download. Titles, employers, dates, schools and numbers are extracted before a
            model sees anything and checked afterwards. A fact that moves is discarded.
          </p>
        </section>

        <section className="mt-10 border-t border-gray/25 pt-10">
          <h2 className="type-heading text-xl text-paper">License check</h2>
          <p className="mt-3 text-gray">
            Spiral checks your license key against its server at{" "}
            <span className="text-paper">licensing.cohencool.workers.dev</span> when you
            activate and then about once a week. The key is signed, so launches between
            checks happen offline. The request sends your license key, a hash of a machine
            identifier, and the product name — nothing else. If the server is unreachable,
            Spiral keeps working for up to 30 days after the last good check.
          </p>
        </section>

        <section className="mt-10 border-t border-gray/25 pt-10">
          <h2 className="type-heading text-xl text-paper">Usage stats</h2>
          <p className="mt-3 text-gray">
            When Share anonymous usage stats is on, the app sends anonymous events to
            PostHog in the US. There is no account. The events carry no personal data and
            no content. PostHog discards IP addresses. Turn it off in Settings.
          </p>
        </section>

        <section className="mt-10 border-t border-gray/25 pt-10">
          <h2 className="type-heading text-xl text-paper">This site</h2>
          <p className="mt-3 text-gray">
            spiralcc.tech is a static site. Fonts and images are served from the same
            host. Checkout runs on Stripe&apos;s hosted page; payment details go to Stripe
            and Link, never to Spiral&apos;s servers. The site loads no analytics.
          </p>
        </section>

        <p className="mt-16 text-gray">
          Questions:{" "}
          <a
            href="mailto:cohenbcoolidge@gmail.com"
            className="text-paper underline decoration-paper/20 underline-offset-4 hover:decoration-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
          >
            cohenbcoolidge@gmail.com
          </a>
        </p>
      </main>
      <Footer />
    </>
  );
}
