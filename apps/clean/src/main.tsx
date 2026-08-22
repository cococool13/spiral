import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/app.css";

// `app.css` declares `@font-face` over the woff2 files synced from
// /brand/fonts (see scripts/sync-brand.mjs), registering "Host Grotesk"
// so `--spiral-font-display` / `--spiral-font-sans` from tokens.css resolve.

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
