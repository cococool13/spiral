import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

/**
 * A full-window carousel: one card in focus at a time, slid between.
 *
 * Built on CSS scroll-snap rather than a transform track, deliberately. A
 * translated track hides off-screen cards without moving the scroll position,
 * so tabbing to a control inside one focuses something invisible. Scroll-snap
 * keeps focus and scroll in agreement, which means trackpad swipe, the edge
 * controls, keyboard and screen readers all drive the same mechanism.
 *
 * `onFocusChange` fires when a card settles. Single-choice decks use it to
 * make sliding the selection; multi-choice decks ignore it.
 */
export function Deck({
  children,
  label,
  onFocusChange,
}: {
  readonly children: readonly ReactNode[];
  readonly label: string;
  readonly onFocusChange?: (index: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = children.length;

  /**
   * Keep the index in step with a swipe.
   *
   * A scroll listener rather than an IntersectionObserver: measured, IO does
   * not fire when the frame loop is stalled, which left the index pinned at 0
   * and made the controls unable to reach past the second card. Scroll events
   * fire regardless, and the controls set the index directly anyway, so this
   * only has to catch trackpad swipes.
   */
  useEffect(() => {
    const track = trackRef.current;
    if (track === null) return;
    let timer = 0;
    const sync = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const slot = track.querySelector<HTMLElement>(".deck__slot");
        if (slot === null || slot.clientWidth === 0) return;
        const index = Math.round(track.scrollLeft / slot.clientWidth);
        setActive(Math.max(0, Math.min(index, count - 1)));
      }, 120);
    };
    track.addEventListener("scroll", sync, { passive: true });
    return () => {
      window.clearTimeout(timer);
      track.removeEventListener("scroll", sync);
    };
  }, [count]);

  useEffect(() => {
    onFocusChange?.(active);
    // Only when the settled card changes; the callback identity is unstable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /**
   * Move to a card, and guarantee arrival.
   *
   * A smooth scroll is an animated scroll, so it does not complete when the
   * frame loop is stalled: measured landing at scrollLeft 0 while an instant
   * scroll to the same slot landed correctly. Since these controls are the
   * only way across, a silently-failed scroll would strand the person on one
   * card. Smooth is attempted, then asserted and hard-set if it did not land.
   */
  const goTo = useCallback((index: number) => {
    const track = trackRef.current;
    if (track === null) return;
    const slots = track.querySelectorAll<HTMLElement>(".deck__slot");
    const clamped = Math.max(0, Math.min(index, slots.length - 1));
    const slot = slots[clamped];
    if (slot === undefined) return;

    setActive(clamped);
    const target = slot.offsetLeft - (track.clientWidth - slot.clientWidth) / 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: target, behavior: reduce ? "auto" : "smooth" });

    if (reduce) return;
    window.setTimeout(() => {
      if (Math.abs(track.scrollLeft - target) > 4) track.scrollLeft = target;
    }, 500);
  }, []);

  /**
   * Arrow keys move the deck. The track is the listener rather than the
   * window, so typing inside the custom card's checkboxes is unaffected and
   * two decks could never fight over the same key.
   */
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(active + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(active - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        goTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goTo(count - 1);
      }
    },
    [active, count, goTo],
  );

  const single = count <= 1;

  return (
    <div className="deck">
      <div
        className="deck__track"
        ref={trackRef}
        tabIndex={single ? -1 : 0}
        role="group"
        aria-label={`${label}. Use the left and right arrow keys to move.`}
        onKeyDown={onKeyDown}
      >
        {children.map((child, index) => (
          <div
            // Deck children are a fixed, ordered list per stage.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className="deck__slot"
            data-active={index === active}
          >
            {child}
          </div>
        ))}
      </div>

      {single ? null : (
        <>
          <button
            type="button"
            className="deck__edge"
            data-side="prev"
            onClick={() => goTo(active - 1)}
            disabled={active === 0}
            aria-label="Previous"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            className="deck__edge"
            data-side="next"
            onClick={() => goTo(active + 1)}
            disabled={active === count - 1}
            aria-label="Next"
          >
            <span aria-hidden="true">›</span>
          </button>

          <div className="deck__dots">
            {children.map((_, index) => (
              <button
                // Fixed, ordered list.
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                type="button"
                className="deck__dot"
                data-active={index === active}
                onClick={() => goTo(index)}
                aria-label={`Go to ${index + 1} of ${count}`}
                aria-current={index === active ? "true" : undefined}
              />
            ))}
          </div>
          <p className="visually-hidden" aria-live="polite">
            {active + 1} of {count}
          </p>
        </>
      )}
    </div>
  );
}
