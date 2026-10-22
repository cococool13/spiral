import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { ReturnGlyph } from "../../ui/glyphs";
import { apply, stageFull } from "./api";
import { errorCopy } from "./errors";
import { renditionFor, thumbSrc, type ThumbPlatform } from "./thumbs";
import type { GalleryItem } from "./types";

type TileState = "idle" | "applying" | "applied" | "error";

const HOVER_STAGE_MS = 250;

interface TileProps {
  item: GalleryItem;
  index: number;
  total: number;
  tabbable: boolean;
  platform: ThumbPlatform;
  onDecoded: (index: number) => void;
}

export function Tile({ item, index, total, tabbable, platform, onDecoded }: TileProps) {
  const frame = useRef<HTMLElement>(null);
  const hover = useRef<number | undefined>(undefined);
  const [rendition, setRendition] = useState(renditionFor(0));
  const [state, setState] = useState<TileState>("idle");
  const [error, setError] = useState<string>();
  const [travel, setTravel] = useState(false);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const long = Math.max(el.clientWidth, el.clientHeight) * window.devicePixelRatio;
    setRendition(renditionFor(long));
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(hover.current);
  }, []);

  function onEnter() {
    window.clearTimeout(hover.current);
    hover.current = window.setTimeout(() => {
      void stageFull(item.id);
    }, HOVER_STAGE_MS);
  }

  function onLeave() {
    window.clearTimeout(hover.current);
  }

  function onLoad(event: SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    const pending = typeof img.decode === "function" ? img.decode() : Promise.resolve();
    void pending.then(() => onDecoded(index));
  }

  function showMarks() {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setTravel(false);
      return;
    }
    setTravel(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTravel(false));
    });
  }

  async function onApply() {
    if (state === "applying") return;
    setState("applying");
    setError(undefined);
    try {
      await apply(item.id);
      setState("applied");
      showMarks();
    } catch (err: unknown) {
      setError(errorCopy(err));
      setState("error");
    }
  }

  const name =
    state === "error"
      ? `Try again, ${item.resolution}, ${index + 1} of ${total}`
      : `Set as wallpaper, ${item.resolution}, ${index + 1} of ${total}`;

  return (
    <figure className="tile" ref={frame} onMouseEnter={onEnter} onMouseLeave={onLeave} data-state={state}>
      <button
        type="button"
        className="tile__hit"
        onClick={() => void onApply()}
        aria-disabled={state === "applying"}
        tabIndex={tabbable ? 0 : -1}
        aria-label={name}
      >
        <span className="tile__frame">
          <img
            src={thumbSrc(item.id, rendition, platform)}
            alt=""
            decoding="async"
            loading={index < 12 ? "eager" : "lazy"}
            onLoad={onLoad}
          />
          {state === "applied" ? (
            <span className="plate__marks" data-travel={travel ? "from" : undefined} aria-hidden="true">
              <span className="mk tl" />
              <span className="mk tr" />
              <span className="mk bl" />
              <span className="mk br" />
            </span>
          ) : null}
          {state === "applying" ? <span className="tile__progress" /> : null}
          <span className="tile__bar">
            {state === "error" ? "Try again" : "Set as wallpaper"}
            <ReturnGlyph />
          </span>
        </span>
      </button>
      <figcaption className={state === "applied" ? "tile__line tile__line--hot" : "tile__line"}>
        {state === "applied"
          ? "On this Space"
          : state === "applying"
            ? "Downloading · wallhaven.cc"
            : state === "error"
              ? error
              : `${item.id} · ${plateResolution(item.resolution)}`}
      </figcaption>
    </figure>
  );
}

function plateResolution(resolution: string): string {
  const [width, height] = resolution.split("x");
  if (!width || !height) return resolution;
  return `${width} × ${height}`;
}
