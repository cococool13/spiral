import resumePlate from "../../assets/picker/resume.webp";
import wallpaperPlate from "../../assets/picker/wallpaper.webp";
import type { ModuleId, ModuleState } from "../../boot";
import { Toggle } from "../../ui/Toggle";
import { activeAfter, nextModuleSet } from "./moduleSet";

interface ToolsProps {
  modules: ModuleState[];
  enabled: ModuleId[];
  active: ModuleId;
  onChange: (next: ModuleId[], active: ModuleId) => void;
}

const COPY: Record<ModuleId, string> = {
  wallpaper: "Reaches wallhaven.cc when you search or apply.",
  resume: "Opens no connection unless you add a model.",
};

export function Tools({ modules, enabled, active, onChange }: ToolsProps) {
  const available = {
    wallpaper: modules.find((item) => item.id === "wallpaper")?.available ?? true,
    resume: modules.find((item) => item.id === "resume")?.available ?? false,
  };

  function toggle(id: ModuleId, on: boolean) {
    const next = nextModuleSet(enabled, available, id, on);
    if (!next) return;
    onChange(next, activeAfter(active, next));
  }

  return (
    <div className="set">
      {modules.map((module) => {
        const on = enabled.includes(module.id) && module.available;
        const blocked = nextModuleSet(enabled, available, module.id, !on) === null;
        const reason = !module.available
          ? (module.unavailableReason ?? "Resume needs macOS 13.")
          : blocked
            ? "Keep one tool on."
            : null;
        const reasonId = reason ? `${module.id}-reason` : undefined;
        return (
          <section className="set-row" key={module.id}>
            <img
              className="set-thumb"
              src={module.id === "wallpaper" ? wallpaperPlate : resumePlate}
              alt=""
              width={72}
              height={44}
            />
            <div className="set-row__copy">
              <h2>{module.id === "wallpaper" ? "Wallpaper" : "Resume"}</h2>
              <p className="notice">{COPY[module.id]}</p>
              {reason ? (
                <p className="notice" id={reasonId}>
                  {reason}
                </p>
              ) : null}
            </div>
            <Toggle
              checked={on}
              disabled={!module.available || (on && blocked)}
              label={module.id === "wallpaper" ? "Wallpaper" : "Resume"}
              describedBy={reasonId}
              onChange={(next) => toggle(module.id, next)}
            />
          </section>
        );
      })}
    </div>
  );
}
