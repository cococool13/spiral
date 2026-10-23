import { CHECKOUT_URL } from "@/lib/checkout";
import DownloadMenu from "./DownloadMenu";
import Mark from "./Mark";

export default function Manifesto() {
  return (
    <section id="license" className="license-section shell">
      <div className="license-title">
        <h2>
          One key.
          <br />
          Spiral.
        </h2>
        <Mark size={96} className="license-mark" />
      </div>
      <div className="license-detail">
        <p className="license-price">
          $15 <span>once</span>
        </p>
        <p>
          Wallpaper and Resume.
          <br />
          One license key.
        </p>
        <ol className="license-steps">
          <li>
            <span>01</span>Buy securely through Stripe.
          </li>
          <li>
            <span>02</span>Download the published build.
          </li>
          <li>
            <span>03</span>Paste your key on the Activate screen.
          </li>
        </ol>
        <div className="license-actions">
          <a href={CHECKOUT_URL} className="glass-pill" rel="noopener noreferrer">
            Buy Spiral <span aria-hidden="true">↗</span>
          </a>
          <DownloadMenu variant="purchase" />
        </div>
        <a href="/thanks/" className="text-link">
          Already bought it? Start here <span aria-hidden="true">↗</span>
        </a>
        <p className="license-note">
          The download is Spiral Wallpaper 1.0.4. Resume 0.1.2 stays at its release tag.
        </p>
      </div>
    </section>
  );
}
