import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import AppBar from "./components/AppBar";
import { Browse } from "./screens/Browse";
import { Settings, type AppSettings } from "./screens/Settings";

type Screen = "browse" | "settings";

function App() {
  const [screen, setScreen] = useState<Screen>("browse");
  const [boot, setBoot] = useState<AppSettings | "error">();
  const [update, setUpdate] = useState<Update | null>(null);

  useEffect(() => {
    invoke<AppSettings>("get_settings")
      .then(setBoot)
      .catch(() => setBoot("error"));
  }, []);

  useEffect(() => {
    if (boot === "error" || !boot?.firstRunCompleted || !boot.autoUpdateCheck) return;
    check()
      .then((found) => found && setUpdate(found))
      .catch(() => {});
  }, [boot]);

  if (boot === "error") {
    return (
      <main>
        <h1>Spiral could not start</h1>
        <p>Settings would not load. Close the window and open it again.</p>
      </main>
    );
  }
  if (!boot) return <div className="app" aria-busy="true" />;

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
