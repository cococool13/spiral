import React from "react";
import ReactDOM from "react-dom/client";
import Shell from "./shell/Shell";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

// Browser visual-QA mode: mock the Tauri IPC when running `pnpm dev` outside
// the Tauri shell. Stripped from production builds (DEV guard).
if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
  await import("./dev/tauri-mock");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>,
);
