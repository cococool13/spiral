import type { CSSProperties } from "react";
import tokens from "@/lib/brand-tokens.json";
import DefenseLines from "./DefenseLines";
import DownloadMenu from "./DownloadMenu";
import Scramble from "./Scramble";

/** Entrance: one curve, staggered by a rung. `.rise` lives in globals.css. */
const rise = (step: number) => ({ "--rise-step": step }) as CSSProperties;

/**
 * The observatory. A full-viewport frame drawn in light — one paper hairline,
 * four corner marks — with the filament field running behind a headline that
 * fills the frame at a single weight. Nothing is bold; it is only large.
 * Inside the frame there are exactly four things: one readout, the headline,
 * one action, the way down.
 *
 * The field is the site's one continuous surface: helix-red filaments rising
 * through void and washing to paper along a band that follows a fine pointer
 * and breathes when left alone. The one word the collection exists to refuse
 * is set in helix, as a warning is.
 *
 * The headline is the LCP element. Its lines are in the HTML and rise with a
 * CSS animation that runs whether or not script does.
 */
export default function Hero() {
  return (
    <section id="top" className="obs">
      <DefenseLines
        baseColor={tokens.color.helix}
        accentColor={tokens.color.paper}
        density={150}
        speed={28}
        direction={0}
        length={180}
        falloff={260}
        opacity={52}
        focus={{ x: 0.68, y: 0.42 }}
        interactive
        drift={1}
        className="obs-field"
      />
      <div aria-hidden="true" className="obs-floor" />

      <div className="obs-frame" aria-hidden="true">
        <i className="obs-dot obs-dot--tl" />
        <i className="obs-dot obs-dot--tr" />
        <i className="obs-dot obs-dot--bl" />
        <i className="obs-dot obs-dot--br" />
      </div>

      <div className="obs-inner">
        <Scramble
          as="p"
          text="Spiral Collection — four desktop apps for Mac and Windows"
          immediate
          delay={240}
          className="obs-readout"
        />

        <h1 className="type-display obs-title">
          <span className="obs-line rise" style={rise(0)}>
            No account.
          </span>
          <span className="obs-line rise" style={rise(1)}>
            No bloat.
          </span>
          <span className="obs-line rise" style={rise(2)}>
            No <span className="obs-warn">tracking.</span>
          </span>
        </h1>

        <div className="obs-foot">
          <div className="rise obs-actions" style={rise(3)}>
            <DownloadMenu variant="hero" />
          </div>
          <a href="#apps" className="obs-scroll rise" style={rise(4)}>
            <span aria-hidden="true">↓</span>
            <span className="sr-only">Scroll to the apps</span>
          </a>
        </div>
      </div>
    </section>
  );
}
