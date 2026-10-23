import { CHECKOUT_URL } from "@/lib/checkout";
import HeroShowcase from "./HeroShowcase";

export default function Hero() {
  return (
    <section id="top" className="catalogue-hero shell">
      <div className="hero-heading">
        <h1>
          One app.
          <br />
          One license.
        </h1>
        <p className="hero-description">
          Wallpaper and Resume. One $15 key. Close the window and Spiral quits.
        </p>
        <div className="hero-actions">
          <a href={CHECKOUT_URL} className="glass-pill" rel="noopener noreferrer">
            Buy, $15 <span aria-hidden="true">↗</span>
          </a>
          <a href="#apps" className="text-link">
            Open the parts list <span aria-hidden="true">↓</span>
          </a>
        </div>
        <p className="hero-fine">One payment. No subscription. Mac and Windows.</p>
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
