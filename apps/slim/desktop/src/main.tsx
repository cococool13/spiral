import React from "react";
import ReactDOM from "react-dom/client";

import "@fontsource-variable/archivo";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/700.css";
import "./styles/tokens.css";
import "./styles/app.css";

import { App } from "./App";

const root = document.getElementById("root");
if (root === null) throw new Error("Spiral Slim could not find its root element.");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
