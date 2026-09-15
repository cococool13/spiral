import { WHOP_CHECKOUT_URL } from "@/lib/whop";
import HeroShowcase from "./HeroShowcase";

export default function Hero() {
  return (
    <section id="top" className="catalogue-hero shell">
      <div className="hero-heading">
        <h1>
          Four tools.
          <br />
          One license.
        </h1>
        <p className="hero-description">
          Wallpaper, Slim, Resume, and Clean. Small desktop software that states what it
          does, then quits when you close the window.
        </p>
        <div className="hero-actions">
          <a href={WHOP_CHECKOUT_URL} className="glass-pill" rel="noopener noreferrer">
            Buy — $9.99 <span aria-hidden="true">↗</span>
          </a>
          <a href="#apps" className="text-link">
            Open the parts list <span aria-hidden="true">↓</span>
          </a>
        </div>
        <p className="hero-fine">
          One payment. No subscription. Mac + Windows where available.
        </p>
      </div>
      <HeroShowcase />
      <div className="hero-baseline">
        <span>spiralcc.tech</span>
        <span>Cohen Coolidge</span>
        <a href="#apps">
          Collection index <span aria-hidden="true">↓</span>
        </a>
      </div>
    </section>
  );
}
