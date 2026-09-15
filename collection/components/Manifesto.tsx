import { WHOP_CHECKOUT_URL } from "@/lib/whop";
import DownloadMenu from "./DownloadMenu";
import Mark from "./Mark";

export default function Manifesto() {
  return (
    <section id="license" className="license-section shell">
      <div className="license-title">
        <h2>
          One key.
          <br />
          The collection.
        </h2>
        <Mark size={96} className="license-mark" />
      </div>
      <div className="license-detail">
        <p className="license-price">
          $9.99 <span>once</span>
        </p>
        <p>
          Wallpaper, Slim, and Resume.
          <br />
          One license key for the collection.
        </p>
        <ol className="license-steps">
          <li>
            <span>01</span>Buy securely through Whop.
          </li>
          <li>
            <span>02</span>Download the apps you want.
          </li>
          <li>
            <span>03</span>Paste your key on the Activate screen.
          </li>
        </ol>
        <div className="license-actions">
          <a href={WHOP_CHECKOUT_URL} className="glass-pill" rel="noopener noreferrer">
            Buy the collection <span aria-hidden="true">↗</span>
          </a>
          <DownloadMenu variant="purchase" />
        </div>
        <a href="/thanks/" className="text-link">
          Already bought it? Start here <span aria-hidden="true">↗</span>
        </a>
        <p className="license-note">
          Clean is in development and has no download yet. Check each app page for
          platform availability.
        </p>
      </div>
    </section>
  );
}
