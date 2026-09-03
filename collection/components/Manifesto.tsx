import ParallaxPlate from "./ParallaxPlate";
import Reveal from "./Reveal";

/**
 * The corridor, full-bleed, dissolving into void — never a hard cut between
 * photograph and canvas. Then the statement as a letter: one centred column,
 * the width of a page, with the fine print under it in the mono voice.
 */
export default function Manifesto() {
  return (
    <ParallaxPlate className="letter">
      <div className="letter-photo-wrap">
        {/* biome-ignore lint/performance/noImgElement: static export; one lazy still */}
        <img
          src="/brand/hero/hero-exit.webp"
          alt="A dark corridor with daylight at the far door."
          width={2400}
          height={1350}
          loading="lazy"
          decoding="async"
          className="letter-photo"
        />
        <div aria-hidden="true" className="letter-dissolve" />
      </div>

      <div className="letter-body">
        <Reveal as="p" className="letter-copy">
          Every one of these could have a subscription and a process that never stops.
        </Reveal>
        <Reveal as="p" step={2} className="type-display letter-close">
          None of them do.
        </Reveal>
        <Reveal as="p" step={3} className="letter-fine">
          One $9.99 license. Source you can read. No telemetry. Photograph by Arvin Yuan.
        </Reveal>
      </div>
    </ParallaxPlate>
  );
}
