import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Sidebar, { type Destination } from "./components/Sidebar";
import FirstRun from "./screens/FirstRun";
import Clean from "./screens/Clean";
import Storage from "./screens/Storage";
import Optimize from "./screens/Optimize";
import Uninstall from "./screens/Uninstall";
import History from "./screens/History";
import Settings from "./screens/Settings";

const SCREENS: Record<Destination, () => JSX.Element> = {
  clean: Clean,
  storage: Storage,
  optimize: Optimize,
  uninstall: Uninstall,
  history: History,
  settings: Settings,
};

export default function App() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [active, setActive] = useState<Destination>("clean");

  const check = useCallback(() => {
    invoke<boolean>("fda_status").then(setGranted);
  }, []);

  useEffect(check, [check]);

  if (granted === null) return <main aria-busy="true" />;
  if (!granted) return <FirstRun onRecheck={check} />;

  const Screen = SCREENS[active];
  return (
    <div>
      <Sidebar active={active} onSelect={setActive} />
      <main>
        <Screen />
      </main>
    </div>
  );
}
