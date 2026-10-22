import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { mark } from "../../bench";
import type { ModuleProps } from "../types";

export function Frame({ children }: { children: ReactNode }) {
  return children;
}

export function Toolbar() {
  return null;
}

export default function ModuleRoot({ setStatus, onChooseWallpaper }: ModuleProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus("No connection used");
  }, [setStatus]);

  useEffect(() => {
    let live = true;
    void invoke("module_activate", { id: "resume" })
      .then(() => {
        if (!live) return;
        mark("module_ready:resume");
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(typeof err === "string" ? err : "Resume could not open. Try again.");
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <main className="stage stage--start">
      <h1>Resume</h1>
      <p className="notice">{error ?? "Resume is not in this build."}</p>
      <button type="button" className="btn btn--primary btn--lg" onClick={onChooseWallpaper}>
        Use Wallpaper
      </button>
    </main>
  );
}
