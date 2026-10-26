import { useEffect, useRef } from "react";
import { capabilities } from "../../capabilities";
import { PIN_PROMISE, usePin } from "../../lib/pin";
import { PillCloseGlyph } from "../../ui/glyphs";
import { sizeLabel, wallhavenPage } from "./library";
import { useWallpaper } from "./state";
import { thumbSrc, type ThumbPlatform } from "./thumbs";
import type { GalleryItem } from "./types";

interface QuickLookProps {
  items: GalleryItem[];
  platform: ThumbPlatform;
  onStep: (index: number) => void;
}

/** Space opens a wallpaper full-bleed. Return sets it, arrows browse, Esc or
 *  Space closes and puts focus back on the tile. On the wallpaper that is on
 *  this Space, P pins it to every Space (Spiral Live) or unpins it. */
export function QuickLook({ items, platform, onStep }: QuickLookProps) {
  const { quickLook, setQuickLook, apply, phase, current, log } = useWallpaper();
  const closeRef = useRef<HTMLButtonElement>(null);
  const pinRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const index = items.findIndex((item) => item.id === quickLook);
  const item = index >= 0 ? items[index] : null;
  const open = item !== null;
  const pin = usePin(capabilities().pinAllSpaces && open);

  // Focus moves only when the look opens and closes, not on every step.
  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const back = returnTo;
    return () => {
      const tile = document.querySelector<HTMLElement>('.tile__hit[tabindex="0"]');
      (tile ?? back.current)?.focus();
    };
  }, [open]);

  if (!item) return null;

  function step(delta: number) {
    const next = (index + delta + items.length) % items.length;
    setQuickLook(items[next]?.id ?? null);
    onStep(next);
  }

  const applying = phase?.id === item.id && phase.phase === "applying";
  const onThisSpace = current?.id === item.id;
  const canPin = onThisSpace && pin.state?.available === true;
  const pinned = canPin && pin.state?.pinned === true;
  const failed = phase?.id === item.id && phase.phase === "error" ? phase.error : canPin ? pin.error : null;

  async function togglePin() {
    if (!item || !canPin || pin.busy) return;
    const next = !pinned;
    const done = await pin.setPinned(next);
    if (!done) return;
    log(
      next
        ? `Pinned ${wallhavenPage(item.id)} to all Spaces. Spiral Live is running and shows a pin in the menu bar.`
        : "Unpinned. Spiral Live stopped; other Spaces keep the wallpaper they show now.",
    );
  }

  return (
    <div
      className="look"
      role="dialog"
      aria-modal="true"
      aria-label={`Quick look, ${sizeLabel(item.resolution)}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          setQuickLook(null);
        } else if (event.key === "Enter") {
          event.preventDefault();
          void apply(item);
        } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          step(event.key === "ArrowRight" ? 1 : -1);
        } else if ((event.key === "p" || event.key === "P") && canPin) {
          event.preventDefault();
          void togglePin();
        } else if (event.key === "Tab") {
          event.preventDefault();
          const stops = [closeRef.current, pinRef.current].filter((el): el is HTMLButtonElement => el !== null);
          const at = stops.indexOf(document.activeElement as HTMLButtonElement);
          stops[(at + (event.shiftKey ? stops.length - 1 : 1)) % stops.length]?.focus();
        }
      }}
    >
      <img className="look__art" src={thumbSrc(item.id, "lg", platform)} alt="" />
      <div className="look__top">
        <p className="look__title">{sizeLabel(item.resolution)}</p>
        <p className="look__meta">
          {wallhavenPage(item.id)}
          {pinned ? " · On all Spaces" : onThisSpace ? " · On this Space" : ""}
        </p>
        {canPin ? (
          <button
            ref={pinRef}
            type="button"
            className={pinned ? "look__pin look__pin--on" : "look__pin"}
            aria-pressed={pinned}
            aria-describedby="look-pin-promise"
            disabled={pin.busy}
            onClick={() => void togglePin()}
          >
            {pin.busy ? (pinned ? "Unpinning…" : "Starting Spiral Live…") : pinned ? "Pinned to all Spaces · Unpin" : "Pin to all Spaces"}
          </button>
        ) : null}
        {canPin ? (
          <p className="look__meta" id="look-pin-promise">
            {PIN_PROMISE}
          </p>
        ) : null}
      </div>
      <div className="look__bottom">
        {failed ? (
          <p className="look__error" role="alert">
            {failed}
          </p>
        ) : (
          <p className="keys" id="look-keys">
            <span>
              <kbd>Return</kbd>
              {applying ? "Downloading…" : "Set"}
            </span>
            <span>
              <kbd>←</kbd>
              <kbd>→</kbd>
              Browse
            </span>
            {canPin ? (
              <span>
                <kbd>P</kbd>
                {pinned ? "Unpin" : "Pin to all Spaces"}
              </span>
            ) : null}
            <span>
              <kbd>Esc</kbd>
              Close
            </span>
          </p>
        )}
      </div>
      <button
        ref={closeRef}
        type="button"
        className="look__close"
        aria-label="Close quick look"
        aria-describedby="look-keys"
        onClick={() => setQuickLook(null)}
      >
        <PillCloseGlyph />
      </button>
    </div>
  );
}
