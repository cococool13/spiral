import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";

// No font import here yet, and `@fontsource-variable/archivo` /
// `@fontsource/ibm-plex-mono` have been removed from package.json rather than
// wired up. They were declared and never imported, which read as "fonts are
// handled" when nothing was: no stylesheet in this app applies
// `--spiral-font-display` at all, so the shell renders in the webview default
// either way. Importing them would not have changed that — fontsource
// registers the variable family as "Archivo Variable", while brand/tokens.css
// (the source of truth, which this app may not edit) says "Archivo".
//
// Making the token resolve needs an `@font-face` over the woff2 in
// /brand/fonts, the way apps/wallpaper does it in src/styles/base.css. That is
// the visual system, and it lands with it in M3 — along with the dependency,
// or the synced font files, whichever that milestone picks.

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
