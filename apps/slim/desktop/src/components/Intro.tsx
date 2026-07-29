import { useEffect, useState } from "react";

import { IntroMark } from "./IntroMark";

/** How long the mark holds centre before it lifts and the name arrives. */
const SETTLE_MS = 1950;

/**
 * The launch screen: the mark assembles, lifts, and the app names itself.
 * Nothing else — no tagline, no pitch. The brand argument is the website's
 * job; this screen only has to say what you opened.
 *
 * The phase change is a timer, never an animation callback, and the title and
 * `Next` are *mounted* at that point rather than faded in. `Next` is the only
 * way into the app: a transition from opacity 0 freezes at 0 when the frame
 * loop stalls, which leaves this screen black with no exit — measured, not
 * theorised. A freshly mounted element is visible with no frames at all.
 * DESIGN.md's reveal rule, applied to a control instead of to content.
 *
 * The mark keeps its opacity fade because it is decoration; if it ever fails
 * to run, the screen still names itself and still goes forward.
 */
export function Intro({ onStart }: { readonly onStart: () => void }) {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setSettled(true);
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="intro" data-settled={settled}>
      <div className="intro__scene" aria-hidden="true">
        <div className="intro__lattice" />
        <div className="intro__practical" />
        <svg className="intro__grain">
          <filter id="intro-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="2" seed="3" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#intro-grain)" />
        </svg>
        <div className="intro__scrim" />
      </div>

      <div className="intro__stage">
        <IntroMark size={148} />
        {/* Height is reserved whether or not the title is mounted, so the
            lift is one move and never a reflow. */}
        <div className="intro__name">
          {settled ? <h1 className="intro__title">Spiral Slim</h1> : null}
        </div>
      </div>

      {settled ? (
        <button type="button" className="intro__next" onClick={onStart}>
          Next
          <span aria-hidden="true" className="intro__arrow">
            &rarr;
          </span>
        </button>
      ) : null}
    </div>
  );
}
