import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/app.css";

// `app.css` declares `@font-face` over the woff2 files synced from
// /brand/fonts (see scripts/sync-brand.mjs), registering "Archivo" and
// "IBM Plex Mono" so `--spiral-font-display` / `--spiral-font-mono` from
// tokens.css actually resolve, the way apps/wallpaper does it in
// src/styles/base.css.

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
