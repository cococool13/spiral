import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Privacy — Spiral",
  description:
    "Spiral apps do not make accounts, do not collect telemetry, and do not upload your files. This page states what each app actually reaches.",
};

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main id="content" className="mx-auto max-w-2xl px-6 pt-36 pb-24 sm:pt-44">
        <h1 className="type-display text-4xl text-paper sm:text-5xl">Privacy</h1>
        <p className="mt-8 text-lg text-gray">
          No Spiral app makes an account, sends analytics, or runs after you close the
          window. Nothing leaves your computer for processing unless you choose that path
          yourself. Where an app talks to the internet, it names the host and talks to
          nothing else.
        </p>

        <section className="mt-16 border-t border-gray/25 pt-10">
          <h2 className="type-heading text-xl text-paper">Wallpaper</h2>
          <p className="mt-3 text-gray">
            Reaches Wallhaven&apos;s public SFW API when you search or apply. On open it
            may ask GitHub once whether a newer build exists — named in Settings, and
            switchable off. It validates an image before writing or applying it, and keeps
            thumbnails on disk behind a cap you can see in Settings. Closing the window
            quits.
          </p>
        </section>

        <section className="mt-10 border-t border-gray/25 pt-10">
          <h2 className="type-heading text-xl text-paper">Slim</h2>
          <p className="mt-3 text-gray">
            Writes browser enterprise policy files on this machine and shows each change
            first. It does not phone home. On Windows and Linux it runs from the scripts
            in the repository — there is no shipped Windows installer.
          </p>
        </section>

        <section className="mt-10 border-t border-gray/25 pt-10">
          <h2 className="type-heading text-xl text-paper">Clean</h2>
          <p className="mt-3 text-gray">
            Never leaves the machine. Removals go to Trash. Nothing is scanned off-device.
            There is no update check and no updater in the builds that exist today.
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
            Shipped desktop apps validate your Whop license key on launch through
            Spiral&apos;s validator at{" "}
            <span className="text-paper">spiral-license.cohencool.workers.dev</span>. That
            server calls Whop&apos;s API with a company key so the apps never ship one.
            The request sends your license key, a machine identifier, and which app you
            opened — nothing else. If the validator is unreachable, apps allow up to 72
            hours offline before asking again.
          </p>
        </section>

        <section className="mt-10 border-t border-gray/25 pt-10">
          <h2 className="type-heading text-xl text-paper">This site</h2>
          <p className="mt-3 text-gray">
            spiralcc.tech is a static site. It sets no cookies and loads no analytics.
            Fonts and images are served from the same host.
          </p>
        </section>

        <p className="mt-16 text-gray">
          Questions:{" "}
          <a
            href="mailto:cohencool@icloud.com"
            className="text-paper underline decoration-paper/20 underline-offset-4 hover:decoration-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
          >
            cohencool@icloud.com
          </a>
        </p>
      </main>
      <Footer />
    </>
  );
}
