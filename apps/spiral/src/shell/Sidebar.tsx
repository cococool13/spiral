import mark from "../assets/brand/mark-red.svg";
import type { ModuleId, ModuleState } from "../boot";
import { MODULES } from "../modules/registry";

interface SidebarProps {
  modules: ModuleState[];
  enabled: ModuleId[];
  current: ModuleId | null;
  licenseLine: string;
  onSelect: (id: ModuleId) => void;
}

export function Sidebar({ modules, enabled, current, licenseLine, onSelect }: SidebarProps) {
  return (
    <nav className="side" aria-label="Tools">
      <div className="side__brand">
        <img src={mark} alt="" width={20} height={32} />
        <span>Spiral</span>
      </div>
      {enabled.map((id, index) => {
        const module = modules.find((item) => item.id === id);
        const def = MODULES[id];
        const Glyph = def.Glyph;
        const unavailable = module ? !module.available : false;
        return (
          <button
            key={id}
            type="button"
            className={current === id ? "side__item side__item--on" : "side__item"}
            aria-current={current === id ? "page" : undefined}
            aria-keyshortcuts={index === 0 ? "Meta+1" : "Meta+2"}
            aria-disabled={unavailable || undefined}
            disabled={unavailable}
            onClick={() => onSelect(id)}
          >
            <Glyph />
            {def.title}
          </button>
        );
      })}
      <p className="side__foot">{licenseLine}</p>
    </nav>
  );
}
