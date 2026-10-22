import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import AppBar from "./components/AppBar";
import ModuleRoot from "./modules/wallpaper";
import { generalView, type GeneralSettings } from "./shell/settings/api";
import { Settings } from "./screens/Settings";

type Screen = "browse" | "settings";

function App() {
  const [screen, setScreen] = useState<Screen>("browse");
  const [boot, setBoot] = useState<GeneralSettings | "error">();
  const [update, setUpdate] = useState<Update | null>(null);

  useEffect(() => {
    generalView()
      .then(setBoot)
      .catch(() => setBoot("error"));
  }, []);

  useEffect(() => {
    if (boot === "error" || !boot?.autoUpdateCheck) return;
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

      <div className={screen === "browse" ? "screen" : "screen screen--hidden"}>
        <ModuleRoot />
      </div>
      {screen === "settings" && <Settings knownUpdate={update} onUpdateFound={setUpdate} />}
    </div>
  );
}

export default App;
