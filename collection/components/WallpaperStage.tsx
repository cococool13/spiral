"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createSpiralShader, type RGB, type SpiralShader } from "@/lib/spiralShader";
import Mark from "./Mark";

const STILLS = [
  {
    id: "tower",
    label: "Tower, painted",
    alt: "A painted stone tower on a red cliff above the sea.",
  },
  {
    id: "galaxy",
    label: "Spiral galaxy",
    alt: "A spiral galaxy, its arms full of blue stars.",
  },
  { id: "dunes", label: "Dunes", alt: "Red desert dunes in low evening light." },
  {
    id: "lake",
    label: "Lake, painted",
    alt: "An impressionist lake with lilies and a footbridge.",
  },
  {
    id: "coast",
    label: "Coast from above",
    alt: "Turquoise water breaking on dark rocks, seen from above.",
  },
  {
    id: "alley",
    label: "Alley in the rain",
    alt: "A wet alley at night lit by red lanterns.",
  },
] as const;

/** Shader colours are product content, not brand UI: each is a dark, mid and light. */
const COLOURS: { id: string; label: string; swatch: string; c: [RGB, RGB, RGB] }[] = [
  {
    id: "red",
    label: "Red",
    swatch: "var(--glass-500)",
    c: [
      [0.36, 0.03, 0.05],
      [0.78, 0.13, 0.17],
      [1, 0.62, 0.55],
    ],
  },
  {
    id: "cobalt",
    label: "Cobalt",
    swatch: "rgb(47 86 198)",
    c: [
      [0.03, 0.07, 0.26],
      [0.18, 0.34, 0.8],
      [0.6, 0.8, 1],
    ],
  },
  {
    id: "ink",
    label: "Ink",
    swatch: "rgb(107 101 96)",
    c: [
      [0.05, 0.04, 0.04],
      [0.38, 0.35, 0.33],
      [0.95, 0.9, 0.85],
    ],
  },
];

const PAUSE = [
  { id: "battery", label: "Battery", state: "on battery" },
  { id: "full", label: "Full-screen app", state: "full-screen app" },
  { id: "lpm", label: "Low Power Mode", state: "Low Power Mode" },
  { id: "lock", label: "Locked screen", state: "screen locked" },
] as const;

type Reason = (typeof PAUSE)[number]["id"];

export default function WallpaperStage({ active }: { active: boolean }) {
  const [still, setStill] = useState(0);
  const [live, setLive] = useState(false);
  const [quit, setQuit] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [colour, setColour] = useState(0);
  const [speed, setSpeed] = useState(100);
  const [menu, setMenu] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const menuWrap = useRef<HTMLDivElement>(null);
  const shader = useRef<SpiralShader | null>(null);

  const running = live && !quit;
  const playing = running && !reason && active && onScreen;

  useEffect(() => {
    const el = screen.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), {
      threshold: 0.05,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The shader exists only once someone asks for live, and is torn down on unmount.
  useEffect(() => {
    if (!running || shader.current || !canvas.current) return;
    shader.current = createSpiralShader(canvas.current, {
      c1: COLOURS[0].c[0],
      c2: COLOURS[0].c[1],
      c3: COLOURS[0].c[2],
      speed: 1,
    });
  }, [running]);
  useEffect(() => () => shader.current?.dispose(), []);

  useEffect(() => {
    const s = shader.current;
    if (!s) return;
    const [c1, c2, c3] = COLOURS[colour].c;
    Object.assign(s.params, { c1, c2, c3, speed: speed / 100 });
    s.draw();
  }, [colour, speed]);

  useEffect(() => {
    const s = shader.current;
    if (!s) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (playing && !still) {
      s.start();
    } else {
      s.stop();
      s.draw();
    }
    const onVis = () => (document.hidden || !playing || still ? s.stop() : s.start());
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [playing]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof PointerEvent && menuWrap.current?.contains(e.target as Node))
        return;
      setMenu(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [menu]);

  const pausedFor = PAUSE.find((p) => p.id === reason);
  const stateText = !running
    ? `Set on Display 1: ${STILLS[still].label}`
    : pausedFor
      ? `Paused: ${pausedFor.state}`
      : "Live wallpaper running";

  return (
    <div className="panel-grid">
      <div>
        <div className="screen" ref={screen}>
          {STILLS.map((s, i) => (
            <picture key={s.id}>
              <source srcSet={`/stills/${s.id}.avif`} type="image/avif" />
              <img
                src={`/stills/${s.id}.webp`}
                alt={i === still && !running ? s.alt : ""}
                width={960}
                height={540}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                style={{ opacity: i === still && !running ? 1 : 0 }}
              />
            </picture>
          ))}
          <canvas
            ref={canvas}
            hidden={!running}
            aria-label="Live Spiral wallpaper preview, drawn in this browser"
            role="img"
          />
          <div className="mbar">
            <div className="mbar-l">
              <b>Spiral</b>
              <span>File</span>
              <span>Edit</span>
              <span>View</span>
              <span>Window</span>
            </div>
            <div className="mbar-r" ref={menuWrap}>
              {running ? (
                <button
                  type="button"
                  className="mitem"
                  aria-label="Live wallpaper menu"
                  aria-haspopup="menu"
                  aria-expanded={menu}
                  onClick={() => setMenu((v) => !v)}
                >
                  <Mark />
                </button>
              ) : null}
              <span>Sun 23:07</span>
              {menu ? (
                <div className="menu" role="menu">
                  <p>{pausedFor ? "Live wallpaper paused" : "Live wallpaper running"}</p>
                  <hr />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setReason(reason ? null : "full");
                      setMenu(false);
                    }}
                  >
                    {reason ? "Resume" : "Pause"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setQuit(true);
                      setReason(null);
                      setMenu(false);
                    }}
                  >
                    Quit live wallpaper
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <p
            className={pausedFor ? "chip-state is-paused" : "chip-state"}
            aria-live="polite"
          >
            <i aria-hidden="true" />
            {stateText}
          </p>
          <span className="chip-tag">{running ? "2.1 preview" : "Sample still"}</span>
        </div>

        <div className="ctl">
          <fieldset className="ctl-group" aria-label="Wallpaper type">
            <button
              type="button"
              className="chip"
              aria-pressed={!running}
              onClick={() => setLive(false)}
            >
              Stills
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={running}
              onClick={() => {
                setLive(true);
                setQuit(false);
              }}
            >
              Live<small>coming in 2.1</small>
            </button>
          </fieldset>

          {running ? (
            <>
              <fieldset className="ctl-group" aria-label="Colour">
                <span className="lab" aria-hidden="true">
                  Colour
                </span>
                {COLOURS.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    className="sw"
                    aria-label={c.label}
                    aria-pressed={colour === i}
                    style={{ background: c.swatch }}
                    onClick={() => setColour(i)}
                  />
                ))}
              </fieldset>
              <label className="ctl-group">
                <span className="lab">Speed</span>
                <input
                  className="range"
                  type="range"
                  min={0}
                  max={200}
                  value={speed}
                  style={{ "--p": `${speed / 2}%` } as CSSProperties}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                />
              </label>
              <fieldset className="ctl-group" aria-label="Pauses on">
                <span className="lab" aria-hidden="true">
                  Pauses on
                </span>
                {PAUSE.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="chip"
                    aria-pressed={reason === p.id}
                    onClick={() => setReason(reason === p.id ? null : p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </fieldset>
            </>
          ) : null}
        </div>
      </div>

      <ul className="ledger">
        <li>Click a wallpaper. It downloads, gets checked, and is set.</li>
        <li>Stills from Wallhaven, sized to your display.</li>
        <li>Close the window and Spiral quits. Nothing keeps running.</li>
        <li className="soon">
          <b className="soon-tag">Coming in 2.1</b>
          Live wallpapers that pause on battery, in full-screen apps, in Low Power Mode
          and on a locked screen. A menu bar item shows only while one runs.
        </li>
        <li className="soon">
          <b className="soon-tag">Coming in 2.1</b>
          More sources: NASA and space telescopes, museum open access, Bing daily, Spiral
          Generative, your own files, and the Apple Aerials already on your Mac.
        </li>
      </ul>

      <ul className="strip" aria-label="Sample stills">
        {STILLS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              aria-pressed={!running && still === i}
              onClick={() => {
                setStill(i);
                setLive(false);
              }}
            >
              <picture>
                <source srcSet={`/stills/${s.id}.avif`} type="image/avif" />
                <img
                  src={`/stills/${s.id}.webp`}
                  alt=""
                  width={960}
                  height={540}
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <span className="strip-cap">{s.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
