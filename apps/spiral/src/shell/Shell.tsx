import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { mark } from "../bench";
import { readBoot, type ModuleId, type ModuleState } from "../boot";
import { MODULES } from "../modules/registry";
import { ActivateRoute } from "./license/ActivateRoute";
import { useLicense } from "./license/useLicense";
import type { LicenseView } from "./license/types";
import { ModuleHost, useModuleBundle } from "./ModuleHost";
import { Picker } from "./Picker";
import { SettingsPane } from "./settings/SettingsPane";
import { generalView, type GeneralSettings } from "./settings/api";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";
import "./picker.css";

type Route = { kind: "picker" } | { kind: "module"; id: ModuleId } | { kind: "settings" };

export default function Shell() {
  const boot = useMemo(() => readBoot(window.__SPIRAL_BOOT__), []);
  const [route, setRoute] = useState<Route>(() =>
    boot.start.kind === "picker" ? { kind: "picker" } : { kind: "module", id: boot.start.id },
  );
  const [enabled, setEnabled] = useState<ModuleId[]>(() =>
    boot.modules.filter((module) => module.enabled).map((module) => module.id),
  );
  const [active, setActive] = useState<ModuleId>(() => initialActive(boot));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Checking the license.");
  const [settings, setSettings] = useState<GeneralSettings | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [license, setLicense] = useLicense();
  const setStatusLine = useCallback((line: string) => setStatus(line), []);

  useEffect(() => {
    mark("first_paint");
  }, []);

  useEffect(() => {
    void generalView()
      .then(setSettings)
      .catch(() => setSettingsError(true));
  }, []);

  useEffect(() => {
    if (license.kind !== "licensed" || !settings?.autoUpdateCheck) return;
    void check()
      .then((found) => {
        if (found) setUpdate(found);
      })
      .catch(() => undefined);
  }, [license.kind, settings]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (route.kind === "picker") return;
      if (!event.metaKey || event.shiftKey || event.altKey || event.ctrlKey) return;
      if (event.key === ",") {
        event.preventDefault();
        setRoute((current) =>
          current.kind === "settings" ? { kind: "module", id: active } : { kind: "settings" },
        );
        return;
      }
      if (enabled.length < 2) return;
      const id = event.key === "1" ? "wallpaper" : event.key === "2" ? "resume" : null;
      if (!id || !enabled.includes(id) || !isAvailable(boot.modules, id)) return;
      event.preventDefault();
      setActive(id);
      setRoute({ kind: "module", id });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, boot.modules, enabled, route.kind]);

  async function choose(ids: ModuleId[]) {
    if (busy || ids.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await invoke("modules_set", { modules: ids });
      const id = ids.includes("wallpaper") ? "wallpaper" : "resume";
      setEnabled(ids);
      setActive(id);
      setRoute({ kind: "module", id });
    } catch {
      setBusy(false);
      setError("Spiral could not save this choice. Try again.");
    }
  }

  if (route.kind === "picker" && boot.start.kind === "picker") {
    return (
      <Picker
        wallpaper={findModule(boot.modules, "wallpaper")}
        resume={findModule(boot.modules, "resume")}
        preselect={boot.start.preselect}
        painted
        busy={busy}
        error={error}
        onContinue={(ids) => {
          void choose(ids);
        }}
      />
    );
  }

  if (license.kind === "needsActivation" || license.kind === "locked") {
    return <ActivateRoute view={license} platform={boot.platform} onView={setLicense} />;
  }

  const moduleId = route.kind === "module" && license.kind === "licensed" ? route.id : null;
  return (
    <Frame
      boot={boot}
      route={route}
      active={active}
      enabled={enabled}
      sidebarOpen={sidebarOpen}
      status={license.kind === "checking" ? "Checking the license." : status}
      update={update}
      license={license}
      settings={settings}
      settingsError={settingsError}
      moduleId={moduleId}
      onSidebar={() => setSidebarOpen((open) => !open)}
      onSettings={() =>
        setRoute((current) =>
          current.kind === "settings" ? { kind: "module", id: active } : { kind: "settings" },
        )
      }
      onSelect={(id) => {
        setActive(id);
        setRoute({ kind: "module", id });
      }}
      onTools={(next, nextActive) => {
        void invoke("modules_set", { modules: next })
          .then(() => {
            setEnabled(next);
            setActive(nextActive);
            setRoute((current) =>
              current.kind === "module" ? { kind: "module", id: nextActive } : current,
            );
          })
          .catch(() => setError("Spiral could not save this choice. Try again."));
      }}
      onSettingsChange={setSettings}
      onUpdateFound={setUpdate}
      setStatus={setStatusLine}
      onChooseWallpaper={() => {
        void choose(["wallpaper"]);
      }}
      saveError={error}
    />
  );
}

interface FrameProps {
  boot: ReturnType<typeof readBoot>;
  route: Route;
  active: ModuleId;
  enabled: ModuleId[];
  sidebarOpen: boolean;
  status: string;
  update: Update | null;
  license: LicenseView;
  settings: GeneralSettings | null;
  settingsError: boolean;
  moduleId: ModuleId | null;
  onSidebar: () => void;
  onSettings: () => void;
  onSelect: (id: ModuleId) => void;
  onTools: (next: ModuleId[], active: ModuleId) => void;
  onSettingsChange: (next: GeneralSettings) => void;
  onUpdateFound: (update: Update) => void;
  setStatus: (line: string) => void;
  onChooseWallpaper: () => void;
  saveError: string | null;
}

function Frame(props: FrameProps) {
  const bundle = useModuleBundle(props.moduleId);
  const showSide = props.enabled.length > 1;
  const title = props.route.kind === "settings" ? "Settings" : MODULES[props.active].title;
  const licenseLine = licenseFoot(props.license);
  const chrome = (toolbar: ReactNode, body: ReactNode) => (
    <div
      className="frame"
      data-sidebar={showSide && props.sidebarOpen ? "on" : "off"}
      data-platform={props.boot.platform}
    >
      <Toolbar
        title={title}
        platform={props.boot.platform}
        showSidebarToggle={showSide}
        sidebarOpen={props.sidebarOpen}
        settingsOn={props.route.kind === "settings"}
        onSidebar={props.onSidebar}
        onSettings={props.onSettings}
      >
        {toolbar}
      </Toolbar>
      {showSide && props.sidebarOpen ? (
        <Sidebar
          modules={props.boot.modules}
          enabled={props.enabled}
          current={props.route.kind === "module" ? props.route.id : null}
          licenseLine={licenseLine}
          onSelect={props.onSelect}
        />
      ) : null}
      {body}
      <StatusBar
        line={props.status}
        update={props.update ? `Spiral ${props.update.version} is ready.` : null}
      />
    </div>
  );

  if (props.moduleId && bundle) {
    const Root = bundle.default;
    return (
      <ModuleHost bundle={bundle}>
        {chrome(
          <bundle.Toolbar />,
          <div className="content">
            {props.saveError ? (
              <p className="notice notice--error" role="alert">
                {props.saveError}
              </p>
            ) : null}
            <Root setStatus={props.setStatus} onChooseWallpaper={props.onChooseWallpaper} />
          </div>,
        )}
      </ModuleHost>
    );
  }

  const body = (
    <div className="content">
      {props.saveError ? (
        <p className="notice notice--error" role="alert">
          {props.saveError}
        </p>
      ) : null}
      {props.route.kind === "settings" ? (
        props.settings ? (
          <SettingsPane
            settings={props.settings}
            modules={props.boot.modules}
            enabled={props.enabled}
            active={props.active}
            license={props.license}
            knownUpdate={props.update}
            onSettings={props.onSettingsChange}
            onTools={props.onTools}
            onUpdateFound={props.onUpdateFound}
          />
        ) : (
          props.settingsError ? (
            <p className="notice notice--error" role="alert">
              Settings would not load. Close the window and open it again.
            </p>
          ) : (
            <p className="notice">Loading settings.</p>
          )
        )
      ) : (
        <div aria-busy="true" />
      )}
    </div>
  );
  return chrome(null, body);
}

function initialActive(boot: ReturnType<typeof readBoot>): ModuleId {
  if (boot.start.kind === "module") return boot.start.id;
  if (boot.start.preselect.includes("wallpaper")) return "wallpaper";
  return boot.start.preselect[0] ?? "wallpaper";
}

function findModule(modules: ModuleState[], id: ModuleId): ModuleState {
  const found = modules.find((module) => module.id === id);
  if (!found) {
    throw new Error("Spiral could not read its start state. A tool is missing.");
  }
  return found;
}

function isAvailable(modules: ModuleState[], id: ModuleId): boolean {
  return modules.find((module) => module.id === id)?.available ?? false;
}

function licenseFoot(view: LicenseView): string {
  if (view.kind === "licensed" && view.grace) return "Licensed. Offline.";
  if (view.kind === "licensed") return "Licensed";
  if (view.kind === "checking") return "Checking the license.";
  return "Not activated";
}
