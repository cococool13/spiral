import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { begin, noteToolChosen, setAnalyticsRoute, type AnalyticsRoute } from "./analytics/client";
import { mark } from "../bench";
import { readBoot, type ModuleId, type ModuleState } from "../boot";
import { ActivateRoute } from "./license/ActivateRoute";
import { useLicense } from "./license/useLicense";
import type { LicenseView } from "./license/types";
import { ModuleHost, useModuleBundle } from "./ModuleHost";
import { Picker } from "./Picker";
import { SettingsPane } from "./settings/SettingsPane";
import { generalView, type GeneralSettings } from "./settings/api";
import { PillBar } from "./PillBar";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Checking the license.");
  const [settings, setSettings] = useState<GeneralSettings | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [license, setLicense] = useLicense();
  const setStatusLine = useCallback((line: string) => setStatus(line), []);

  const screen = analyticsRoute(route, license.kind, boot.start.kind === "picker");
  const screenRef = useRef(screen);
  screenRef.current = screen;

  useEffect(() => {
    mark("first_paint");
  }, []);

  useEffect(() => {
    setAnalyticsRoute(screen);
  }, [screen]);

  useEffect(() => {
    let live = true;
    void generalView()
      .then((next) => {
        if (!live) return;
        setSettings(next);
        void begin({
          optedOut: next.analyticsOptOut,
          platform: boot.platform,
          fallbackVersion: boot.version,
          route: screenRef.current,
        });
      })
      .catch(() => {
        if (!live) return;
        setSettingsError(true);
        void begin({
          optedOut: true,
          platform: boot.platform,
          fallbackVersion: boot.version,
          route: screenRef.current,
        });
      });
    return () => {
      live = false;
    };
  }, [boot.platform, boot.start.kind, boot.version]);

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
      if (route.kind === "picker" || event.defaultPrevented) return;
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
      for (const id of ids) noteToolChosen(id);
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

  if (license.kind === "needsActivation" || license.kind === "locked" || license.kind === "retry") {
    return <ActivateRoute view={license} platform={boot.platform} onView={setLicense} />;
  }

  const moduleId = route.kind === "module" && license.kind === "licensed" ? route.id : null;
  return (
    <Frame
      boot={boot}
      route={route}
      active={active}
      enabled={enabled}
      status={license.kind === "checking" ? "Checking the license." : status}
      update={update}
      license={license}
      settings={settings}
      settingsError={settingsError}
      moduleId={moduleId}
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
        const added = next.filter((id) => !enabled.includes(id));
        void invoke("modules_set", { modules: next })
          .then(() => {
            for (const id of added) noteToolChosen(id);
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
      onLicense={setLicense}
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
  status: string;
  update: Update | null;
  license: LicenseView;
  settings: GeneralSettings | null;
  settingsError: boolean;
  moduleId: ModuleId | null;
  onSettings: () => void;
  onSelect: (id: ModuleId) => void;
  onTools: (next: ModuleId[], active: ModuleId) => void;
  onSettingsChange: (next: GeneralSettings) => void;
  onUpdateFound: (update: Update) => void;
  onLicense: (view: LicenseView) => void;
  setStatus: (line: string) => void;
  onChooseWallpaper: () => void;
  saveError: string | null;
}

function Frame(props: FrameProps) {
  const bundle = useModuleBundle(props.moduleId);
  const inSettings = props.route.kind === "settings";
  const chrome = (tools: ReactNode, dome: ReactNode, body: ReactNode) => (
    <div className="window" data-platform={props.boot.platform}>
      <div className="window__drag" data-tauri-drag-region aria-hidden="true" />
      <PillBar
        modules={props.boot.modules}
        enabled={props.enabled}
        current={inSettings ? null : props.active}
        settingsOn={inSettings}
        tools={tools}
        dome={dome}
        update={props.update ? `Spiral ${props.update.version} is ready` : null}
        onSelect={props.onSelect}
        onSettings={props.onSettings}
      />
      {props.saveError ? (
        <p className="notice notice--error window__alert" role="alert">
          {props.saveError}
        </p>
      ) : null}
      {body}
      <p className="visually-hidden" role="status">
        {props.status}
      </p>
    </div>
  );

  if (props.moduleId && bundle) {
    const Root = bundle.default;
    return (
      <ModuleHost bundle={bundle}>
        {chrome(
          <bundle.Tools />,
          <bundle.Dome />,
          <div className="room">
            <Root setStatus={props.setStatus} onChooseWallpaper={props.onChooseWallpaper} />
          </div>,
        )}
      </ModuleHost>
    );
  }

  const body = (
    <div className="room room--sheet">
      {inSettings ? (
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
            onLicense={props.onLicense}
          />
        ) : props.settingsError ? (
          <p className="notice notice--error" role="alert">
            Settings would not load. Close the window and open it again.
          </p>
        ) : (
          <p className="notice">Loading settings.</p>
        )
      ) : (
        <div aria-busy="true" />
      )}
    </div>
  );
  return chrome(null, null, body);
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

function analyticsRoute(
  route: Route,
  licenseKind: LicenseView["kind"],
  pickerFirst: boolean,
): AnalyticsRoute {
  if (route.kind === "picker" && pickerFirst) return "picker";
  if (licenseKind === "needsActivation" || licenseKind === "locked" || licenseKind === "retry") return "activate";
  if (route.kind === "settings") return "settings";
  if (route.kind === "module") return route.id;
  return "picker";
}
