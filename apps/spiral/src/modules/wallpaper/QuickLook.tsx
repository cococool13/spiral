import { useEffect, useRef, useState } from "react";
import { PillCloseGlyph } from "../../ui/glyphs";
import { sourceCredit } from "./api";
import { sizeLabel, wallhavenPage } from "./library";
import { useWallpaper } from "./state";
import { thumbSrc, type ThumbPlatform } from "./thumbs";
import type { Credit, GalleryItem } from "./types";

interface QuickLookProps {
  items: GalleryItem[];
  platform: ThumbPlatform;
  onStep: (index: number) => void;
}

/** Space opens a wallpaper full-bleed. Return sets it, arrows browse, Esc or
 *  Space closes and puts focus back on the tile. */
export function QuickLook({ items, platform, onStep }: QuickLookProps) {
  const { quickLook, setQuickLook, apply, phase, current } = useWallpaper();
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const index = items.findIndex((item) => item.id === quickLook);
  const item = index >= 0 ? items[index] : null;
  const open = item !== null;
  const [sharp, setSharp] = useState<string | null>(null);
  const [fetched, setFetched] = useState<{ id: string; credit: Credit } | null>(null);
  const itemId = item?.id ?? null;
  const known = item?.credit;
  const credit = fetched && fetched.id === itemId ? fetched.credit : known;

  // ESA names its credit only on the image's page; ask once per item. Other
  // sources already sent it, so this answers from memory.
  useEffect(() => {
    if (!itemId || known || itemId.startsWith("w-")) return;
    let live = true;
    void sourceCredit(itemId)
      .then((found) => {
        if (live && found) setFetched({ id: itemId, credit: found });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [itemId, known]);

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
  const failed = phase?.id === item.id && phase.phase === "error" ? phase.error : null;

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
        } else if (event.key === "Tab") {
          event.preventDefault();
          closeRef.current?.focus();
        }
      }}
    >
      <img className="look__art" src={thumbSrc(item.id, "sm", platform)} alt="" />
      <img
        key={item.id}
        className="look__art look__art--sharp"
        src={thumbSrc(item.id, "lg", platform)}
        alt=""
        data-loaded={sharp === item.id}
        onLoad={() => setSharp(item.id)}
      />
      <div className="look__top">
        <p className="look__title">{item.title ?? sizeLabel(item.resolution)}</p>
        <p className="look__meta">
          {item.title ? `${sizeLabel(item.resolution)} · ` : ""}
          {item.id.startsWith("w-") ? wallhavenPage(item.id) : (credit?.page ?? "")}
          {current?.id === item.id ? " · On this Space" : ""}
        </p>
        {credit ? (
          <p className="look__credit">
            {credit.line} <span className="look__licence">{credit.licence}</span>
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
