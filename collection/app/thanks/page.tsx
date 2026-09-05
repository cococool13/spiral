import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import { apps } from "@/lib/apps";

export const metadata: Metadata = {
  title: "You're in — Spiral",
  robots: { index: false, follow: false },
  description:
    "Download Wallpaper, Slim, and Resume. Paste your Whop license key on the Activate screen.",
};

const live = apps.filter((a) => a.status === "live" && a.downloads);

export default function ThanksPage() {
  return (
    <>
      <Nav />
      <main id="content" className="mx-auto max-w-2xl px-6 pt-36 pb-24 sm:pt-44">
        <h1 className="type-display text-4xl text-paper sm:text-5xl">You are in.</h1>
        <p className="mt-8 text-lg text-gray">
          One $9.99 license unlocks the shipping apps. Open each app, paste the key from
          your Whop receipt on Activate, then it stays in the keychain. Clean is not a
          download yet; the same key will cover it when it ships.
        </p>

        <ol className="mt-10 list-decimal space-y-3 pl-5 text-gray">
          <li>
            Download the Mac disk image (or the Windows installer where one exists).
          </li>
          <li>
            Mac: drag the app to Applications, then open it from there. Windows: More info
            → Run anyway — the file is not code-signed yet.
          </li>
          <li>
            On Activate, paste the membership ID from the receipt. It usually starts with
            mem_.
          </li>
        </ol>

        <ul className="mt-12 space-y-4">
          {live.map((app) => (
            <li key={app.slug} className="border-t border-gray/25 pt-4">
              <p className="text-paper">{app.name}</p>
              <p className="mt-1 text-sm text-gray">{app.tagline}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {app.downloads ? (
                  <>
                    <a href={app.downloads.mac.url} className="glass-pill">
                      {app.downloads.mac.label}
                    </a>
                    {app.noWindowsBinary ? null : (
                      <a
                        href={app.downloads.windows.url}
                        className="glass-pill glass-pill--secondary"
                      >
                        {app.downloads.windows.label}
                      </a>
                    )}
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-12 text-gray">
          Stuck? Email{" "}
          <a
            href="mailto:cohencool@icloud.com"
            className="text-paper underline decoration-paper/20 underline-offset-4 hover:decoration-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
          >
            cohencool@icloud.com
          </a>{" "}
          from the receipt.
        </p>
      </main>
      <Footer />
    </>
  );
}
