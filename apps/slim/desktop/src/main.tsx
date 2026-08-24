import React from "react";
import ReactDOM from "react-dom/client";

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
