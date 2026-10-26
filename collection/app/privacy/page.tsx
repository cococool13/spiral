import type { Metadata } from "next";
import Footer from "@/components/Footer";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Privacy, Spiral",
  description:
    "Spiral does not make an account and does not upload your files. Anonymous, privacy-safe usage stats only: no personal data or content, IP discarded, and you can turn it off in Settings.",
  alternates: { canonical: "/privacy/" },
  openGraph: { url: "/privacy/" },
};

export default function PrivacyPage() {
  return (
    <>
      <PageHeader />
      <main id="content" className="page">
        <div className="page-in">
          <h1>Privacy</h1>
          <p className="lede">
            Spiral does not make an account, and it does not run after you close the
            window. Anonymous, privacy-safe usage stats only: no personal data or content,
            IP discarded, and you can turn it off in Settings. Nothing leaves your
            computer for processing unless you choose that path yourself. Where Spiral
            talks to the internet, it names the host and talks to nothing else.
          </p>

          <section>
            <h2>Wallpaper</h2>
            <p>
              Reaches Wallhaven&apos;s public SFW API when you search or apply. On launch
              it calls license_ensure against the spiral-license worker. On open it may
              ask GitHub once whether a newer build exists. Settings names that check, and
              you can turn it off. It validates an image before writing or applying it,
              and keeps thumbnails on disk behind a cap you can see in Settings. Closing
              the window quits.
            </p>
          </section>

          <section>
            <h2>Resume</h2>
            <p>
              The free pass never opens a connection. A model runs only if you add your
              own API key or download one to disk, and the app names which engine did the
              work. Remote keys talk to the host you chose: Anthropic, OpenAI, or a custom
              base URL you set. Offline models are fetched from Hugging Face when you
              press Download. Titles, employers, dates, schools and numbers are extracted
              before a model sees anything and checked afterwards. A fact that moves is
              discarded.
            </p>
          </section>

          <section>
            <h2>License check</h2>
            <p>
              Spiral checks your license key against its server at{" "}
              <code>licensing.cohencool.workers.dev</code> when you activate and then
              about once a week. The key is signed, so launches between checks happen
              offline. The request sends your license key, a hash of a machine identifier,
              and the product name. Nothing else. If the server is unreachable, Spiral
              keeps working for up to 30 days after the last good check.
            </p>
          </section>

          <section>
            <h2>Usage stats</h2>
            <p>
              When Share anonymous usage stats is on, the app sends anonymous events to
              PostHog in the US. There is no account. The events carry no personal data
              and no content. PostHog discards IP addresses. Turn it off in Settings.
            </p>
          </section>

          <section>
            <h2>This site</h2>
            <p>
              spiralcc.tech is a static site. Fonts and images are served from the same
              host. Checkout runs on Stripe&apos;s hosted page; payment details go to
              Stripe and Link, never to Spiral&apos;s servers. The site loads no
              analytics.
            </p>
          </section>

          <p className="ask">
            Questions:{" "}
            <a href="mailto:cohenbcoolidge@gmail.com">cohenbcoolidge@gmail.com</a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
