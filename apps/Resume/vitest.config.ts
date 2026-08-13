import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Only this app's own tests. `pnpm build-sidecar` clones llama.cpp into
    // src-tauri/target/, and without this the suite discovers two hundred test
    // files belonging to a C++ project and fails on all of them — the frontend
    // suite breaking as a side effect of building the offline engine.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
