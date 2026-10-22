import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { mark } from "../../bench";
import { readBoot } from "../../boot";
import { Browse } from "./Browse";
import { errorCopy } from "./errors";

export default function ModuleRoot() {
  const boot = useMemo(() => readBoot(window.__SPIRAL_BOOT__), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void invoke("module_activate", { id: "wallpaper" })
      .then(() => {
        if (!live) return;
        mark("module_ready:wallpaper");
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(errorCopy(err));
      });
    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return (
      <main className="browse">
        <h1 className="visually-hidden">Browse wallpapers</h1>
        <p role="alert">{error}</p>
      </main>
    );
  }
  if (!ready) return <main className="browse" aria-busy="true" />;
  return <Browse platform={boot.platform} />;
}
