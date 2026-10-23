import { useState } from "react";
import type { ModuleId, ModuleState } from "../../boot";
import { GeneralGlyph, LicenseGlyph, ToolsGlyph, UpdatesGlyph } from "../../ui/glyphs";
import type { LicenseView } from "../license/types";
import { General } from "./General";
import { License } from "./License";
import { Tools } from "./Tools";
import { Updates } from "./Updates";
import type { GeneralSettings } from "./api";
import type { Update } from "@tauri-apps/plugin-updater";

type Tab = "general" | "tools" | "license" | "updates";

const TABS: { id: Tab; label: string; Glyph: typeof GeneralGlyph }[] = [
  { id: "general", label: "General", Glyph: GeneralGlyph },
  { id: "tools", label: "Tools", Glyph: ToolsGlyph },
  { id: "license", label: "License", Glyph: LicenseGlyph },
  { id: "updates", label: "Updates", Glyph: UpdatesGlyph },
];

interface SettingsPaneProps {
  settings: GeneralSettings;
  modules: ModuleState[];
  enabled: ModuleId[];
  active: ModuleId;
  license: LicenseView;
  knownUpdate: Update | null;
  onSettings: (next: GeneralSettings) => void;
  onTools: (next: ModuleId[], active: ModuleId) => void;
  onUpdateFound: (update: Update) => void;
  onLicense: (view: LicenseView) => void;
}

export function SettingsPane(props: SettingsPaneProps) {
  const [tab, setTab] = useState<Tab>("general");
  return (
    <div className="settings">
      <div className="set-tabs" role="tablist" aria-label="Settings">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="set-tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            <item.Glyph />
            {item.label}
          </button>
        ))}
      </div>
      {tab === "general" ? (
        <General settings={props.settings} onSettings={props.onSettings} />
      ) : null}
      {tab === "tools" ? (
        <Tools
          modules={props.modules}
          enabled={props.enabled}
          active={props.active}
          onChange={props.onTools}
        />
      ) : null}
      {tab === "license" ? <License view={props.license} onView={props.onLicense} /> : null}
      {tab === "updates" ? (
        <Updates
          settings={props.settings}
          knownUpdate={props.knownUpdate}
          onSettings={props.onSettings}
          onUpdateFound={props.onUpdateFound}
        />
      ) : null}
    </div>
  );
}
