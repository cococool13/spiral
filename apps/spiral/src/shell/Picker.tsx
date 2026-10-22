import { useEffect, useRef, useState } from "react";
import mark from "../assets/brand/mark-red.svg";
import { mark as benchMark } from "../bench";
import type { ModuleId, ModuleState } from "../boot";
import "./picker.css";

const ORDER: ModuleId[] = ["wallpaper", "resume"];

interface PickerProps {
  wallpaper: ModuleState;
  resume: ModuleState;
  preselect: ModuleId[];
  painted: boolean;
  busy: boolean;
  error: string | null;
  onContinue: (ids: ModuleId[]) => void;
}

export function Picker({
  wallpaper,
  resume,
  preselect,
  painted,
  busy,
  error,
  onContinue,
}: PickerProps) {
  const modules = { wallpaper, resume };
  const [on, setOn] = useState<Record<ModuleId, boolean>>(() => ({
    wallpaper: preselect.includes("wallpaper"),
    resume: resume.available && preselect.includes("resume"),
  }));
  const [travel, setTravel] = useState<ModuleId | null>(null);
  const plateRefs = useRef<Array<HTMLElement | null>>([]);
  const continueRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const onRef = useRef(on);
  onRef.current = on;

  const selected = ORDER.filter((id) => on[id]);

  function commit() {
    if (busy || selected.length === 0) return;
    onContinue(selected);
  }

  function toggle(id: ModuleId) {
    const module = modules[id];
    if (!module.available) return;
    const turningOn = !on[id];
    if (turningOn && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTravel(id);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTravel(null));
      });
    }
    setOn({ ...on, [id]: turningOn });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const current = ORDER.filter((id) => onRef.current[id]);
      if (busy || current.length === 0) return;
      event.preventDefault();
      onContinue(current);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onContinue]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (!painted) return;
    const go = continueRef.current;
    const plates = plateRefs.current;
    if (!go || plates.length < 2 || plates.some((plate) => plate == null)) return;
    const focusable = (el: HTMLElement) => el.tabIndex >= 0 && !el.hasAttribute("disabled");
    if (!focusable(go) || !plates.every((plate) => plate != null && focusable(plate))) return;
    benchMark("picker_ready");
  }, [painted]);

  return (
    <main className="picker">
      <div className="picker__head">
        <img className="picker__mark" src={mark} alt="Spiral" width={352} height={566} />
        <h1>Which tools do you want?</h1>
      </div>
      <div className="picker__plates">
        {ORDER.map((id, index) => (
          <Plate
            key={id}
            id={id}
            module={modules[id]}
            on={on[id]}
            travel={travel === id}
            plateRef={(el) => {
              plateRefs.current[index] = el;
            }}
            onToggle={() => toggle(id)}
          />
        ))}
      </div>
      <div className="picker__foot">
        <button
          ref={continueRef}
          type="button"
          className="picker__go"
          disabled={selected.length === 0 || busy}
          onClick={commit}
        >
          Continue
        </button>
        <p className="picker__later">Change this later in Settings.</p>
        {error ? (
          <p ref={errorRef} className="picker__error" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}

interface PlateProps {
  id: ModuleId;
  module: ModuleState;
  on: boolean;
  travel: boolean;
  plateRef: (el: HTMLElement | null) => void;
  onToggle: () => void;
}

function Plate({ id, module, on, travel, plateRef, onToggle }: PlateProps) {
  const name = id === "wallpaper" ? "Wallpaper" : "Resume";
  const line = !module.available
    ? (module.unavailableReason ?? "Resume needs macOS 13.")
    : id === "wallpaper"
      ? "Wallhaven, SFW only. Click to apply."
      : "PDF or Word out. No fact changes.";
  const art = id === "wallpaper" ? <WallpaperArt /> : <ResumeArt />;
  const body = (
    <>
      <span className="picker__plate">
        <span className="picker__art">{art}</span>
        {on ? (
          <span className="picker__marks" data-travel={travel ? "from" : undefined} aria-hidden="true">
            <span className="mk tl" />
            <span className="mk tr" />
            <span className="mk bl" />
            <span className="mk br" />
          </span>
        ) : null}
      </span>
      <span className="picker__name-row">
        <span className="picker__box" aria-hidden="true" />
        <span className="picker__name">{name}</span>
      </span>
      <span className="picker__line">{line}</span>
    </>
  );

  return (
    <button
      ref={plateRef}
      type="button"
      className="picker__choice"
      role="checkbox"
      aria-checked={module.available ? on : false}
      aria-disabled={module.available ? undefined : true}
      onClick={onToggle}
    >
      {body}
    </button>
  );
}

function WallpaperArt() {
  return (
    <span className="art-wall" aria-hidden="true">
      <span className="art-wall__ridge" />
      <span className="art-wall__field" />
    </span>
  );
}

function ResumeArt() {
  return (
    <span className="art-page" aria-hidden="true">
      <span className="art-page__name">Sample</span>
      <span className="art-page__label">Experience</span>
      <span className="art-page__rule" />
      <span className="art-page__row" />
      <span className="art-page__row art-page__row--short" />
      <span className="art-page__label">Education</span>
      <span className="art-page__rule" />
      <span className="art-page__row art-page__row--short" />
    </span>
  );
}
