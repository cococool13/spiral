import { apps } from "@/lib/apps";
import { CHECKOUT_URL, RESEND_URL } from "@/lib/checkout";
import DownloadMenu from "./DownloadMenu";

const product = apps[0];

/** What Spiral names on screen. Each line is a real call or rule from docs/PRODUCT.md. */
const LOG = [
  ["09:41", "Checked your license with Spiral’s server"],
  ["09:41", "Asked GitHub once for a newer build"],
  ["09:42", "Downloaded a wallpaper from Wallhaven"],
  ["10:03", "Sent an anonymous usage count. Turn this off in Settings"],
] as const;

export default function PriceBand() {
  return (
    <section className="paper" id="price" aria-labelledby="price-title">
      <div className="paper-grid">
        <h2 className="price" id="price-title">
          $15
          <small>once. One license covers Wallpaper and Resume.</small>
        </h2>
        <div id="privacy">
          <ul className="nos">
            <li>No account</li>
            <li>No subscription</li>
            <li>No watermark</li>
            <li>Nothing runs after you close it</li>
          </ul>
          <div className="log">
            <h3>Everything Spiral sends</h3>
            <ol>
              {LOG.map(([t, line]) => (
                <li key={line}>
                  <time>{t}</time>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="actions">
            <a className="glass-btn" href={CHECKOUT_URL} rel="noopener noreferrer">
              Buy Spiral, $15
            </a>
            <DownloadMenu variant="purchase" />
          </div>
          <p className="note">
            On Mac, today’s download is Spiral {product.version}, notarized by Apple, with
            Wallpaper and Resume on the same key. On Windows it is still Spiral Wallpaper
            1.0.4 for now.{" "}
            <a href={RESEND_URL} rel="noopener noreferrer">
              Lost your key?
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
