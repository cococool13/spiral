import { useMemo, useState } from "react";
import { capabilities, previewing } from "../../../capabilities";
import { PillCloseGlyph } from "../../../ui/glyphs";
import { useWallpaper } from "../state";
import { LIVE_PALETTES, LiveShader, livePoster, swatch, type LivePalette } from "./LiveShader";

/**
 * Screens whose native half does not ship yet. Each renders only when its
 * capability is on. In the browser mock they render with a Preview tag and
 * write "nothing was set" to Activity, so they can be reviewed without being
 * mistaken for working features.
 */

const NOT_WIRED = "Preview only. This needs native support, so nothing changed.";

function PreviewTag() {
  return previewing() ? <span className="parked-tag">Preview</span> : null;
}

const SOURCES = ["Wallhaven", "Spiral Generative", "Apple Aerials", "NASA", "Museum open access", "Your files"];

export function SourceChips() {
  const { log } = useWallpaper();
  const [source, setSource] = useState("Wallhaven");
  if (!capabilities().extraSources) return null;
  return (
    <div className="chips" role="group" aria-label="Source">
      {SOURCES.map((name) => (
        <button
          key={name}
          type="button"
          className="chip"
          aria-pressed={source === name}
          onClick={() => {
            setSource(name);
            if (name !== "Wallhaven") log(`${name}: ${NOT_WIRED}`);
          }}
        >
          {name}
        </button>
      ))}
      <PreviewTag />
    </div>
  );
}

const COLOURS: { id: string; label: string; fill: string }[] = [
  { id: "red", label: "Red", fill: "var(--glass-500)" },
  { id: "warm", label: "Warm", fill: "rgb(217 135 58)" },
  { id: "green", label: "Green", fill: "rgb(95 176 142)" },
  { id: "blue", label: "Blue", fill: "rgb(95 127 192)" },
  { id: "dark", label: "Dark", fill: "var(--room-panel-2)" },
];

export function ColourSwatches() {
  const { log } = useWallpaper();
  const [colour, setColour] = useState<string | null>(null);
  if (!capabilities().colorSearch) return null;
  return (
    <div className="swatches" role="group" aria-label="Colour">
      {COLOURS.map((item) => (
        <button
          key={item.id}
          type="button"
          className="swatch"
          aria-label={item.label}
          aria-pressed={colour === item.id}
          style={{ background: item.fill }}
          onClick={() => {
            setColour(colour === item.id ? null : item.id);
            log(`Colour ${item.label}: ${NOT_WIRED}`);
          }}
        />
      ))}
    </div>
  );
}

type Target = "all" | "this" | "each";

export function ApplyTo() {
  const { log } = useWallpaper();
  const [target, setTarget] = useState<Target>("all");
  if (!capabilities().applyPerDisplay) return null;
  const options: { id: Target; label: string }[] = [
    { id: "all", label: "All displays" },
    { id: "this", label: "This display" },
    { id: "each", label: "Each display" },
  ];
  return (
    <div className="seg seg--dock" role="radiogroup" aria-label="Apply to">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          className={target === option.id ? "seg__opt seg__opt--on" : "seg__opt"}
          aria-checked={target === option.id}
          onClick={() => {
            setTarget(option.id);
            log(`Apply to ${option.label.toLowerCase()}: ${NOT_WIRED}`);
          }}
        >
          {option.label}
        </button>
      ))}
      <PreviewTag />
    </div>
  );
}

interface LiveGalleryProps {
  onClose: () => void;
}

/** Spiral's generative wallpapers: tiles, then a tunable full-bleed look. */
export function LiveGallery({ onClose }: LiveGalleryProps) {
  const { log } = useWallpaper();
  const posters = useMemo(() => LIVE_PALETTES.map((palette, i) => livePoster(palette, 30 + i * 17)), []);
  const [open, setOpen] = useState<LivePalette | null>(null);
  const [speed, setSpeed] = useState(1);
  if (!capabilities().liveWallpaper) return null;

  return (
    <section className="live" aria-label="Live wallpapers">
      <div className="live__head">
        <h2 className="live__title">Live</h2>
        <PreviewTag />
        <button type="button" className="link" onClick={onClose}>
          Back to stills
        </button>
      </div>
      <div className="grid">
        {LIVE_PALETTES.map((palette, index) => (
          <figure className="tile" key={palette.id}>
            <button
              type="button"
              className="tile__hit"
              aria-label={`Spiral, ${palette.name}. Open to tune.`}
              onClick={() => setOpen(palette)}
            >
              {posters[index] ? <img src={posters[index]} alt="" /> : null}
              <span className="tile__badge tile__badge--live">Live</span>
            </button>
            <figcaption className="tile__line">Spiral · {palette.name}</figcaption>
          </figure>
        ))}
      </div>
      {open ? (
        <div
          className="look"
          role="dialog"
          aria-modal="true"
          aria-label={`Spiral, ${open.name}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(null);
            }
          }}
        >
          <LiveShader className="look__art" palette={open} speed={speed} />
          <div className="look__top">
            <p className="look__title">Spiral · {open.name}</p>
            <p className="look__meta">Drawn on this Mac. No download.</p>
          </div>
          <div className="look__bottom">
            <div className="swatches" role="radiogroup" aria-label="Palette">
              {LIVE_PALETTES.map((palette) => (
                <button
                  key={palette.id}
                  type="button"
                  role="radio"
                  className="swatch"
                  aria-label={palette.name}
                  aria-checked={palette.id === open.id}
                  style={{ background: swatch(palette) }}
                  onClick={() => setOpen(palette)}
                />
              ))}
            </div>
            <label className="look__speed">
              Speed
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              />
            </label>
            <button type="button" className="btn btn--primary" onClick={() => log(`Live ${open.name}: ${NOT_WIRED}`)}>
              Set as live wallpaper
            </button>
          </div>
          <button
            type="button"
            className="look__close"
            aria-label="Close"
            autoFocus
            onClick={() => setOpen(null)}
          >
            <PillCloseGlyph />
          </button>
        </div>
      ) : null}
    </section>
  );
}
