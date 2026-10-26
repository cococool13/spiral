import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { mark } from "../../bench";
import { readBoot } from "../../boot";
import { capabilities } from "../../capabilities";
import { pinResume, pinState } from "../../lib/pin";
import type { ModuleProps } from "../types";
import { Browse } from "./Browse";
import { errorCopy } from "./errors";
import { useWallpaper } from "./state";
import "./wallpaper.css";

export { Frame } from "./state";
export { Dome, Tools } from "./Chrome";

export default function ModuleRoot({ setStatus }: ModuleProps) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { log } = useWallpaper();
  const platform = readBoot(window.__SPIRAL_BOOT__).platform;

  useEffect(() => {
    setStatus("Wallpaper. Searches go to wallhaven.cc, SFW only.");
  }, [setStatus]);

  useEffect(() => {
    let live = true;
    void invoke("module_activate", { id: "wallpaper" })
      .then(() => {
        if (!live) return;
        mark("module_ready:wallpaper");
        log("Opened Wallpaper.");
        setReady(true);
        // The pin is on but Spiral Live was quit from its menu or did not
        // start at login: bring it back, and say so.
        if (capabilities().pinAllSpaces) {
          void pinState()
            .then((pin) => (pin.pinned && !pin.running ? pinResume() : null))
            .then((resumed) => {
              if (live && resumed?.running) {
                log("Started Spiral Live again to keep your pinned wallpaper on every Space. It shows in the menu bar.");
              }
            })
            .catch(() => undefined);
        }
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(errorCopy(err));
      });
    return () => {
      live = false;
    };
  }, [log]);

  if (error) {
    return (
      <main className="browse">
        <h1 className="visually-hidden">Wallpaper</h1>
        <p className="browse__empty" role="alert">
          {error}
        </p>
      </main>
    );
  }
  if (!ready) return <main className="browse" aria-busy="true" />;
  return <Browse platform={platform} />;
}
