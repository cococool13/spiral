import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import WallpaperApp from "../App";
import { mark } from "../bench";
import { readBoot, type ModuleId, type ModuleState } from "../boot";
import { ActivateRoute } from "./license/ActivateRoute";
import { licenseView } from "./license/api";
import type { LicenseView } from "./license/types";
import { Picker } from "./Picker";
import "./picker.css";

type Route = "picker" | "wallpaper" | "resume";

export default function Shell() {
  const boot = useMemo(() => readBoot(window.__SPIRAL_BOOT__), []);
  const [painted, setPainted] = useState(false);
  const [route, setRoute] = useState<Route>(() => initialRoute(boot.start));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [license, setLicense] = useState<LicenseView>({ kind: "checking" });
  const busyRef = useRef(false);

  useEffect(() => {
    mark("first_paint");
    setPainted(true);
    void licenseView()
      .then(setLicense)
      .catch(() =>
        setLicense({
          kind: "locked",
          message: "Spiral could not check the license. Close the window and open it again.",
        }),
      );
  }, []);

  async function choose(ids: ModuleId[]) {
    if (busyRef.current || ids.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await invoke("modules_set", { modules: ids });
      setRoute(ids.includes("wallpaper") ? "wallpaper" : "resume");
    } catch {
      busyRef.current = false;
      setBusy(false);
      setError("Spiral could not save this choice. Try again.");
    }
  }

  if (route === "picker" && boot.start.kind === "picker") {
    const wallpaper = findModule(boot.modules, "wallpaper");
    const resume = findModule(boot.modules, "resume");
    return (
      <Picker
        wallpaper={wallpaper}
        resume={resume}
        preselect={boot.start.preselect}
        painted={painted}
        busy={busy}
        error={error}
        onContinue={(ids) => {
          void choose(ids);
        }}
      />
    );
  }

  if (license.kind === "checking") {
    return <main className="app" aria-busy="true" />;
  }

  if (license.kind === "needsActivation" || license.kind === "locked") {
    return (
      <ActivateRoute view={license} platform={boot.platform} onView={setLicense} />
    );
  }

  if (route === "resume") {
    return (
      <main className="picker">
        <div className="picker__head">
          <h1>Resume</h1>
        </div>
        <p className="picker__line">Resume is not in this build.</p>
        <div className="picker__foot">
          <button
            type="button"
            className="picker__go"
            disabled={busy}
            onClick={() => {
              void choose(["wallpaper"]);
            }}
          >
            Use Wallpaper
          </button>
          {error ? (
            <p className="picker__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  return <WallpaperApp />;
}

function initialRoute(start: ReturnType<typeof readBoot>["start"]): Route {
  if (start.kind === "picker") return "picker";
  return start.id === "resume" ? "resume" : "wallpaper";
}

function findModule(modules: ModuleState[], id: ModuleId): ModuleState {
  const found = modules.find((module) => module.id === id);
  if (!found) {
    throw new Error("Spiral could not read its start state. A tool is missing.");
  }
  return found;
}
