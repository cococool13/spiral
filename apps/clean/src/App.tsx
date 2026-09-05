import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import AppBar from "./components/AppBar";
import { Activate } from "./screens/Activate";
import FirstRun from "./screens/FirstRun";
import Clean from "./screens/Clean";
import Storage from "./screens/Storage";
import Optimize from "./screens/Optimize";
import Uninstall from "./screens/Uninstall";
import History from "./screens/History";
import Settings from "./screens/Settings";

type Destination =
  | "clean"
  | "storage"
  | "optimize"
  | "uninstall"
  | "history"
  | "settings";

/** The order a person meets them: what the app does, then what it remembers. */
const DESTINATIONS: [Destination, string][] = [
  ["clean", "Clean"],
  ["storage", "Storage"],
  ["optimize", "Optimize"],
  ["uninstall", "Uninstall"],
  ["history", "History"],
  ["settings", "Settings"],
];

const SCREENS: Record<Destination, () => JSX.Element> = {
  clean: Clean,
  storage: Storage,
  optimize: Optimize,
  uninstall: Uninstall,
  history: History,
  settings: Settings,
};

type LicenseBoot = "loading" | "locked" | "ok";

export default function App() {
  const [license, setLicense] = useState<LicenseBoot>("loading");
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [active, setActive] = useState<Destination>("clean");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke("license_ensure")
      .then(() => setLicense("ok"))
      .catch((e) => {
        setLicenseError(typeof e === "string" ? e : null);
        setLicense("locked");
      });
  }, []);

  const check = useCallback(() => {
    setError(null);
    invoke<boolean>("fda_status")
      .then(setGranted)
      .catch((e) =>
        setError(
          `Could not check Full Disk Access status: ${e}. Try again, or open System Settings and grant access manually.`,
        ),
      );
  }, []);

  useEffect(() => {
    if (license !== "ok") return;
    check();
  }, [license, check]);

  if (license === "loading") return <main aria-busy="true" />;

  if (license === "locked") {
    return (
      <div className="app">
        <Activate
          onDone={() => {
            setLicenseError(null);
            setLicense("ok");
          }}
        />
        {licenseError && (
          <p className="activate__error" style={{ textAlign: "center", padding: "0 24px" }}>
            {licenseError}
          </p>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <main>
        <h1>Spiral Clean could not start</h1>
        <p>{error}</p>
        <button type="button" onClick={check}>
          Try again
        </button>
      </main>
    );
  }

  if (granted === null) return <main aria-busy="true" />;
  if (!granted) return <FirstRun onRecheck={check} />;

  const Screen = SCREENS[active];
  return (
    <div className="app">
      <AppBar
        app="Clean"
        current={active}
        items={DESTINATIONS.map(([id, label]) => ({
          id,
          label,
          onSelect: () => setActive(id),
        }))}
      />
      <main>
        <Screen />
      </main>
    </div>
  );
}
