import { useEffect, useState } from "react";
import { errorCopy } from "../sources";
import type { Wallpaper, WallpaperSource } from "../sources/types";

type TileState = "idle" | "applying" | "applied" | "error";

interface WallpaperTileProps {
  wallpaper: Wallpaper;
  source: WallpaperSource;
  /** Roving tabindex: the grid keeps exactly one tile in the tab order. */
  tabbable: boolean;
  /** 1-based position, so each button has a name of its own. */
  position: number;
  total: number;
}

/** What the one persistent button says in each state. */
const LABEL: Record<TileState, string> = {
  idle: "Apply wallpaper",
  applying: "Downloading…",
  applied: "Apply wallpaper",
  error: "Try again",
};

export function WallpaperTile({
  wallpaper,
  source,
  tabbable,
  position,
  total,
}: WallpaperTileProps) {
  const [thumbSrc, setThumbSrc] = useState<string>();
  const [state, setState] = useState<TileState>("idle");
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    source
      .getThumb(wallpaper)
      .then((src) => live && setThumbSrc(src))
      .catch(() => {}); // a missing thumbnail keeps its concrete placeholder
    return () => {
      live = false;
    };
  }, [wallpaper.id]);

  async function apply() {
    if (state === "applying") return; // aria-disabled, so the click still lands
    setState("applying");
    setError(undefined);
    try {
      await source.apply(wallpaper);
      setState("applied");
    } catch (e: unknown) {
      setError(errorCopy(e));
      setState("error");
    }
  }

  return (
    <figure className="tile">
      {/* alt="": the preview is the wallpaper itself and no text can describe
          it. The button below carries the name, and it names the resolution so
          the tiles are distinguishable from one another. */}
      {thumbSrc && <img src={thumbSrc} alt="" loading="lazy" />}
      <figcaption className="tile__res">{wallpaper.resolution}</figcaption>

      {/* The overlay is always mounted and the button inside it never
          unmounts. Swapping the focused control out for a status element
          dropped focus to <body>, which threw keyboard users to the top of a
          24-tile grid every time they applied a wallpaper. */}
      <div
        className={
          state === "idle"
            ? "tile__overlay"
            : state === "error"
              ? "tile__overlay tile__overlay--visible tile__overlay--error"
              : "tile__overlay tile__overlay--visible"
        }
      >
        {state === "applied" && <span className="tile__status">Applied</span>}
        {state === "error" && <p className="tile__error">{error}</p>}

        {/* aria-disabled rather than disabled: disabling the button the user
            just pressed removes it from the focus order, and the browser drops
            focus to <body>. That is what threw keyboard users to the top of a
            24-tile grid on every apply. The handler blocks the repeat instead. */}
        <button
          className={
            state === "idle" || state === "applied"
              ? "btn-glass btn-glass--primary"
              : "btn-glass btn-glass--secondary"
          }
          onClick={apply}
          aria-disabled={state === "applying"}
          tabIndex={tabbable ? 0 : -1}
          aria-label={`${LABEL[state]}, ${wallpaper.resolution}, ${position} of ${total}`}
        >
          {LABEL[state]}
        </button>
      </div>

      {/* Applying and its outcome are otherwise silent for screen readers. */}
      <span className="visually-hidden" role="status">
        {state === "applying"
          ? `Downloading the ${wallpaper.resolution} wallpaper.`
          : state === "applied"
            ? `Applied the ${wallpaper.resolution} wallpaper.`
            : state === "error"
              ? error
              : ""}
      </span>
    </figure>
  );
}
