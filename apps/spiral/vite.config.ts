import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = dirname(fileURLToPath(import.meta.url));

function spiralChunkGraph() {
  return {
    name: "spiral-chunk-graph",
    generateBundle() {
      const entry = [...this.getModuleIds()].find((id) => id.replaceAll("\\", "/").endsWith("/src/main.tsx"));
      const staticIds = [];
      const seen = new Set();
      const visit = (id) => {
        if (!id || seen.has(id)) return;
        seen.add(id);
        staticIds.push(id);
        const info = this.getModuleInfo(id);
        for (const next of info?.importedIds ?? []) visit(next);
      };
      if (entry) visit(entry);
      const out = join(appRoot, "dist/.vite");
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, "static-modules.json"), JSON.stringify({ staticIds }));
    },
  };
}

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), spiralChunkGraph()],

  build: {
    assetsInlineLimit: 0,
    manifest: true,
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter((dep) => !dep.includes("modules"));
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
