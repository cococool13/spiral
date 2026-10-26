import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { stageFull } from "./api";
import { sizeLabel } from "./library";
import type { ApplyPhase } from "./state";
import { renditionFor, thumbSrc, type ThumbPlatform } from "./thumbs";
import type { GalleryItem } from "./types";

const HOVER_STAGE_MS = 250;

interface TileProps {
  item: GalleryItem;
  index: number;
  total: number;
  tabbable: boolean;
  platform: ThumbPlatform;
  phase: ApplyPhase | null;
  onDesktop: boolean;
  onApply: (item: GalleryItem) => void;
  onFocus: (index: number) => void;
  onStage: (item: GalleryItem) => void;
  onDecoded: (index: number) => void;
}

export function Tile({
  item,
  index,
  total,
  tabbable,
  platform,
  phase,
  onDesktop,
  onApply,
  onFocus,
  onStage,
  onDecoded,
}: TileProps) {
  const frame = useRef<HTMLElement>(null);
  const hover = useRef<number | undefined>(undefined);
  const [rendition, setRendition] = useState(renditionFor(0));

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const long = Math.max(el.clientWidth, el.clientHeight) * window.devicePixelRatio;
    setRendition(renditionFor(long));
  }, []);

  useEffect(() => () => window.clearTimeout(hover.current), []);

  function onEnter() {
    window.clearTimeout(hover.current);
    hover.current = window.setTimeout(() => {
      onStage(item);
      void stageFull(item.id);
    }, HOVER_STAGE_MS);
  }

  function onLoad(event: SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    const pending = typeof img.decode === "function" ? img.decode() : Promise.resolve();
    void pending.then(() => onDecoded(index)).catch(() => undefined);
  }

  const state = phase?.phase ?? (onDesktop ? "applied" : "idle");
  const name =
    state === "error"
      ? `Try again, ${sizeLabel(item.resolution)}, ${index + 1} of ${total}`
      : `Set as wallpaper, ${sizeLabel(item.resolution)}, ${index + 1} of ${total}`;

  return (
    <figure
      className="tile"
      ref={frame}
      onMouseEnter={onEnter}
      onMouseLeave={() => window.clearTimeout(hover.current)}
      data-state={state}
    >
      <button
        type="button"
        className="tile__hit"
        data-index={index}
        onClick={() => onApply(item)}
        onFocus={() => onFocus(index)}
        aria-disabled={state === "applying" || undefined}
        aria-keyshortcuts="Enter Space"
        tabIndex={tabbable ? 0 : -1}
        aria-label={name}
      >
        <img
          src={thumbSrc(item.id, rendition, platform)}
          alt=""
          decoding="async"
          loading={index < 12 ? "eager" : "lazy"}
          onLoad={onLoad}
        />
        {state === "applying" ? <span className="tile__progress" aria-hidden="true" /> : null}
        {state === "applied" ? <span className="tile__badge">On desktop</span> : null}
      </button>
      <figcaption className={state === "error" ? "tile__line tile__line--error" : "tile__line"}>
        {state === "applied"
          ? "On this Space"
          : state === "applying"
            ? "Downloading from wallhaven.cc"
            : state === "error"
              ? phase?.error
              : sizeLabel(item.resolution)}
      </figcaption>
    </figure>
  );
}
