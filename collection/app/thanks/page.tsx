import type { Metadata } from "next";
import Footer from "@/components/Footer";
import GlassPillCTA from "@/components/GlassPillCTA";
import PageHeader from "@/components/PageHeader";
import { apps } from "@/lib/apps";
import { RESEND_URL } from "@/lib/checkout";

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
      <PageHeader />
      <main id="content" className="page">
        <div className="page-in">
          <h1>You are in.</h1>
          <p className="lede">
            One $15 key covers Spiral. Open the app and paste the key from your purchase
            email on Activate. The key stays in the keychain.
          </p>

          <section>
            <h2>Download</h2>
            <div>
              <p>
                {product.name} Wallpaper {product.version}, the build that is published.
                Resume 0.1.2 stays at its release tag.
              </p>
              <p style={{ marginTop: 20 }}>
                <GlassPillCTA app={product} />
              </p>
            </div>
          </section>

          <section>
            <h2>Install</h2>
            <ol>
              <li>Download the build for this machine.</li>
              <li>
                Mac: drag the app to Applications, then open it from there. Windows: More
                info, then Run anyway. The installer is not code-signed yet.
              </li>
              <li>
                On Activate, paste the license key from your purchase email. It starts
                with LIC1. A key from an earlier purchase still works when it starts with
                mem_.
              </li>
            </ol>
          </section>

          <section>
            <h2>Lost the key?</h2>
            <p>
              <a href={RESEND_URL} rel="noopener noreferrer">
                Send it again
              </a>{" "}
              to the email you paid with. Stuck? Email{" "}
              <a href="mailto:cohenbcoolidge@gmail.com">cohenbcoolidge@gmail.com</a> from
              the receipt.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
