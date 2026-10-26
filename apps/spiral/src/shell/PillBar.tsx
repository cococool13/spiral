import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ModuleId, ModuleState } from "../boot";
import { MODULES } from "../modules/registry";
import { PillIcon } from "../ui/Glass";
import { PillGearGlyph } from "../ui/glyphs";

interface PillBarProps {
  modules: ModuleState[];
  enabled: ModuleId[];
  current: ModuleId | null;
  settingsOn: boolean;
  tools: ReactNode;
  dome: ReactNode;
  update: string | null;
  onSelect: (id: ModuleId) => void;
  onSettings: () => void;
}

interface Slide {
  x: number;
  w: number;
}

/**
 * The whole control system: one deep-red glass pill with recessed icon buttons
 * and a raised capsule per tool, plus the round dome for the main action.
 * The capsule slides to the chosen tool on a spring.
 */
export function PillBar({
  modules,
  enabled,
  current,
  settingsOn,
  tools,
  dome,
  update,
  onSelect,
  onSettings,
}: PillBarProps) {
  const tabs = useRef<Partial<Record<ModuleId, HTMLButtonElement | null>>>({});
  const [slide, setSlide] = useState<Slide | null>(null);
  const [settled, setSettled] = useState(false);

  useLayoutEffect(() => {
    function measure() {
      const tab = current ? tabs.current[current] : null;
      setSlide(tab ? { x: tab.offsetLeft, w: tab.offsetWidth } : null);
    }
    measure();
    // The first position is placed, not animated; later moves spring.
    const frame = requestAnimationFrame(() => setSettled(true));
    document.fonts?.ready.then(measure).catch(() => undefined);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [current, enabled]);

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, id: ModuleId) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const open = enabled.filter((item) => isAvailable(modules, item));
    const index = open.indexOf(id);
    const next = open[(index + (event.key === "ArrowRight" ? 1 : -1) + open.length) % open.length];
    if (!next || next === id) return;
    event.preventDefault();
    onSelect(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="pillbar">
      <nav className="pill" aria-label="Spiral">
        {tools}
        <PillIcon
          label="Settings"
          aria-pressed={settingsOn}
          aria-keyshortcuts="Meta+,"
          onClick={onSettings}
        >
          <PillGearGlyph />
        </PillIcon>
        <div className="pill__tabs" role="tablist" aria-label="Tools">
          <span
            className="pill__capsule"
            data-settled={settled || undefined}
            hidden={!slide}
            style={slide ? { transform: `translateX(${slide.x}px)`, width: slide.w } : undefined}
            aria-hidden="true"
          />
          {enabled.map((id, index) => {
            const def = MODULES[id];
            const unavailable = !isAvailable(modules, id);
            const on = current === id;
            return (
              <button
                key={id}
                ref={(node) => {
                  tabs.current[id] = node;
                }}
                type="button"
                role="tab"
                className="pill__tab"
                aria-selected={on}
                tabIndex={on || (current === null && index === 0) ? 0 : -1}
                aria-keyshortcuts={`Meta+${index + 1}`}
                disabled={unavailable}
                onClick={() => onSelect(id)}
                onKeyDown={(event) => onTabKey(event, id)}
              >
                <def.Glyph />
                {def.title}
              </button>
            );
          })}
        </div>
      </nav>
      {dome}
      {update ? (
        <button type="button" className="pillbar__update" onClick={onSettings}>
          {update}
        </button>
      ) : null}
    </div>
  );
}

function isAvailable(modules: ModuleState[], id: ModuleId): boolean {
  return modules.find((module) => module.id === id)?.available ?? false;
}
