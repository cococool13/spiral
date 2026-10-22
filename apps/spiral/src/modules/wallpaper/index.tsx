import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { mark } from "../../bench";
import { readBoot } from "../../boot";
import type { ModuleProps } from "../types";
import { Browse } from "./Browse";
import { errorCopy } from "./errors";

export { Frame } from "./state";
export { Toolbar } from "./Toolbar";

export default function ModuleRoot({ setStatus }: ModuleProps) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const platform = readBoot(window.__SPIRAL_BOOT__).platform;

  useEffect(() => {
    setStatus("wallhaven.cc · SFW only");
  }, [setStatus]);

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
  return <Browse platform={platform} />;
}
