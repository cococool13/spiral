import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import AppBar from "./components/AppBar";
import { Activate } from "./screens/Activate";
import { Browse } from "./screens/Browse";
import { FirstRun } from "./screens/FirstRun";
import { Settings } from "./screens/Settings";
import { getSettings, setSettings, type AppSettings } from "./settings/api";
import { checkForUpdate, type Update } from "./updates";

type Screen = "browse" | "settings";
type LicenseBoot = "loading" | "locked" | "ok" | "error";

function App() {
  const [screen, setScreen] = useState<Screen>("browse");
  const [boot, setBoot] = useState<AppSettings | "error">();
  const [license, setLicense] = useState<LicenseBoot>("loading");
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);

  useEffect(() => {
    getSettings()
      .then(setBoot)
      .catch(() => setBoot("error"));
  }, []);

  useEffect(() => {
    if (boot === "error" || !boot) return;
    invoke("license_ensure")
      .then(() => setLicense("ok"))
      .catch((e) => {
        setLicenseError(typeof e === "string" ? e : null);
        setLicense("locked");
      });
  }, [boot]);

  // The one automatic network request Spiral makes, and only when the
  // Settings toggle says so: a version check against GitHub on open.
  useEffect(() => {
    if (boot === "error" || !boot?.firstRunCompleted || !boot.autoUpdateCheck) return;
    if (license !== "ok") return;
    checkForUpdate()
      .then((found) => found && setUpdate(found))
      .catch(() => {}); // offline is fine — Settings has a manual check
  }, [boot, license]);

  if (boot === "error") {
    return (
      <main>
        <h1>Spiral Wallpaper could not start</h1>
        <p>Settings would not load. Close the window and open it again.</p>
      </main>
    );
  }
  if (!boot || license === "loading") return <div className="app" aria-busy="true" />;

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

  if (!boot.firstRunCompleted) {
    return (
      <div className="app">
        <FirstRun
          onDone={() => {
            const next = { ...boot, firstRunCompleted: true };
            setBoot(next);
            setSettings(next).catch(() => {});
          }}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <AppBar
        app="Wallpaper"
        current={screen}
        items={[
          { id: "browse", label: "Browse", onSelect: () => setScreen("browse") },
          {
            id: "settings",
            label: "Settings",
            dot: Boolean(update),
            onSelect: () => setScreen("settings"),
          },
        ]}
      />

      {/* Browse stays mounted so results and tile states survive navigation. */}
      <div className={screen === "browse" ? "screen" : "screen screen--hidden"}>
        <Browse />
      </div>
      {screen === "settings" && <Settings knownUpdate={update} onUpdateFound={setUpdate} />}
    </div>
  );
}

export default App;
