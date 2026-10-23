import type { Metadata } from "next";
import Footer from "@/components/Footer";
import GlassPillCTA from "@/components/GlassPillCTA";
import Nav from "@/components/Nav";
import { apps } from "@/lib/apps";

export const metadata: Metadata = {
  title: "You are in. Spiral",
  robots: { index: false, follow: false },
  description: "Download Spiral. Paste your license key on the Activate screen.",
  alternates: { canonical: "/thanks/" },
  openGraph: { url: "/thanks/" },
};

const product = apps[0];

export default function ThanksPage() {
  return (
    <>
      <Nav />
      <main id="content" className="information-page setup-page shell">
        <h1 className="type-display text-4xl text-paper sm:text-5xl">You are in.</h1>
        <p className="mt-8 text-lg text-gray">
          One $15 key covers Spiral. Open the app and paste the key from your purchase
          email on Activate. The key stays in the keychain.
        </p>

        <ol className="mt-10 list-decimal space-y-3 pl-5 text-gray">
          <li>Download the build for this machine.</li>
          <li>
            Mac: drag the app to Applications, then open it from there. Windows: More
            info, then Run anyway. The installer is not code-signed yet.
          </li>
          <li>
            On Activate, paste the license key from your purchase email. It starts with
            LIC1. A key from an earlier purchase still works when it starts with mem_.
          </li>
        </ol>

        <p className="mt-8 text-gray">
          The files below are Spiral Wallpaper 1.0.4, the build that is published. Resume
          0.1.2 stays at its release tag.
        </p>

        <ul className="setup-downloads">
          <li className="border-t border-gray/25 pt-4">
            <p className="text-paper">{product.name}</p>
            <p className="mt-1 text-sm text-gray">{product.tagline}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <GlassPillCTA app={product} />
            </div>
          </li>
        </ul>

        <p className="mt-12 text-gray">
          Stuck? Email{" "}
          <a
            href="mailto:cohenbcoolidge@gmail.com"
            className="text-paper underline decoration-paper/20 underline-offset-4 hover:decoration-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
          >
            cohenbcoolidge@gmail.com
          </a>{" "}
          from the receipt.
        </p>
      </main>
      <Footer />
    </>
  );
}
