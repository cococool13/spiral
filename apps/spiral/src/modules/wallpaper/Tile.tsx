import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { apply, stageFull } from "./api";
import { errorCopy } from "./errors";
import { renditionFor, thumbSrc, type ThumbPlatform } from "./thumbs";
import type { GalleryItem } from "./types";

type TileState = "idle" | "applying" | "applied" | "error";

const HOVER_STAGE_MS = 250;

const LABEL: Record<TileState, string> = {
  idle: "Apply wallpaper",
  applying: "Downloading…",
  applied: "Apply wallpaper",
  error: "Try again",
};

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

  async function onApply() {
    if (state === "applying") return;
    setState("applying");
    setError(undefined);
    try {
      await apply(item.id);
      setState("applied");
    } catch (err: unknown) {
      setError(errorCopy(err));
      setState("error");
    }
  }

  return (
    <figure className="tile" ref={frame} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <img
        src={thumbSrc(item.id, rendition, platform)}
        alt=""
        decoding="async"
        loading={index < 12 ? "eager" : "lazy"}
        onLoad={onLoad}
      />
      <figcaption className="tile__res">{item.resolution}</figcaption>
      <div
        className={
          state === "idle"
            ? "tile__overlay"
            : state === "error"
              ? "tile__overlay tile__overlay--visible tile__overlay--error"
              : "tile__overlay tile__overlay--visible"
        }
      >
        {state === "applied" && <span className="tile__status">On this Space</span>}
        {state === "error" && <p className="tile__error">{error}</p>}
        <button
          className={
            state === "idle" || state === "applied"
              ? "btn-glass btn-glass--primary"
              : "btn-glass btn-glass--secondary"
          }
          onClick={onApply}
          aria-disabled={state === "applying"}
          tabIndex={tabbable ? 0 : -1}
          aria-label={`${LABEL[state]}, ${item.resolution}, ${index + 1} of ${total}`}
        >
          {LABEL[state]}
        </button>
      </div>
      <span className="visually-hidden" role="status">
        {state === "applying"
          ? `Downloading the ${item.resolution} wallpaper.`
          : state === "applied"
            ? `On this Space. ${item.resolution}.`
            : state === "error"
              ? error
              : ""}
      </span>
    </figure>
  );
}
