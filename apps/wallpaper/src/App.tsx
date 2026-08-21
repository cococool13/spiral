import { useEffect, useState } from "react";
import AppBar from "./components/AppBar";
import { Browse } from "./screens/Browse";
import { FirstRun } from "./screens/FirstRun";
import { Settings } from "./screens/Settings";
import { getSettings, setSettings, type AppSettings } from "./settings/api";
import { checkForUpdate, type Update } from "./updates";

type Screen = "browse" | "settings";

function App() {
  const [screen, setScreen] = useState<Screen>("browse");
  const [boot, setBoot] = useState<AppSettings | "error">();
  const [update, setUpdate] = useState<Update | null>(null);

  useEffect(() => {
    getSettings()
      .then(setBoot)
      .catch(() => setBoot("error"));
  }, []);

  // The one automatic network request Spiral makes, and only when the
  // Settings toggle says so: a version check against GitHub on open.
  useEffect(() => {
    if (boot === "error" || !boot?.firstRunCompleted || !boot.autoUpdateCheck) return;
    checkForUpdate()
      .then((found) => found && setUpdate(found))
      .catch(() => {}); // offline is fine — Settings has a manual check
  }, [boot]);

  if (boot === "error") {
    return (
      <main>
        <h1>Spiral Wallpaper could not start</h1>
        <p>Settings would not load. Close the window and open it again.</p>
      </main>
    );
  }
  if (!boot) return <div className="app" aria-busy="true" />;

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
