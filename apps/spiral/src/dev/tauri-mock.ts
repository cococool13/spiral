/**
 * Dev-only Tauri IPC mock — lets the UI run in a plain browser for visual QA
 * (`pnpm dev`, no Tauri shell). Loaded from main.tsx only when
 * `import.meta.env.DEV` is true and no real Tauri runtime is present.
 * Never bundled into the app: the conditional import is dead-code-eliminated
 * in production builds.
 */

window.__SPIRAL_BOOT__ = {
  version: "2.0.0",
  platform: "macos",
  modules: [
    { id: "wallpaper", enabled: true, available: true, unavailableReason: null },
    { id: "resume", enabled: true, available: true, unavailableReason: null },
  ],
  start: { kind: "picker", preselect: ["wallpaper", "resume"] },
  bench: false,
};

interface MockGeneral {
  launchAtLogin: boolean;
  autoUpdateCheck: boolean;
  fitMode: "fill" | "fit" | "center";
}

const general: MockGeneral = {
  launchAtLogin: false,
  autoUpdateCheck: true,
  fitMode: "fill",
};

const mockUpdate = () =>
  (window as unknown as Record<string, unknown>).__SPIRAL_MOCK_UPDATE__
    ? { rid: 1, available: true, currentVersion: "1.0.0", version: "1.1.0" }
    : null;

function searchPage(pageNum: number) {
  return {
    items: Array.from({ length: 24 }, (_, i) => ({
      id: `w-p${pageNum}i${i}`,
      resolution: i % 3 === 0 ? "3840x2160" : "2560x1440",
    })),
    page: pageNum,
    lastPage: 5,
  };
}

function pageArg(args: Record<string, unknown>): number {
  const params = args.params;
  if (typeof params === "object" && params !== null && "page" in params) {
    const page = (params as { page?: unknown }).page;
    if (typeof page === "number") return page;
  }
  return 1;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
  module_activate: () => undefined,
  modules_set: () => undefined,
  bench_mark: () => undefined,
  license_view: () => ({ kind: "licensed", grace: false }),
  license_use_legacy: () => ({ kind: "licensed", grace: false }),
  license_activate: () => undefined,
  license_request_code: () => undefined,
  license_activate_email: () => undefined,
  license_clear: () => undefined,
  provider_view: () => ({ kind: "absent" }),
  provider_set: () => ({ kind: "present" }),
  provider_clear: () => ({ kind: "absent" }),
  general_view: () => ({ ...general }),
  general_update: (args) => {
    const next = args.settings;
    if (typeof next === "object" && next !== null) {
      const patch = next as Partial<MockGeneral>;
      if (typeof patch.launchAtLogin === "boolean") general.launchAtLogin = patch.launchAtLogin;
      if (typeof patch.autoUpdateCheck === "boolean") general.autoUpdateCheck = patch.autoUpdateCheck;
      if (patch.fitMode === "fill" || patch.fitMode === "fit" || patch.fitMode === "center") {
        general.fitMode = patch.fitMode;
      }
    }
    return { ...general };
  },
  wallpaper_cached_page: () => null,
  wallpaper_search: async (args) => {
    await delay(450);
    return searchPage(pageArg(args));
  },
  wallpaper_prefetch_page: () => undefined,
  wallpaper_stage_full: () => undefined,
  wallpaper_apply: async () => {
    await delay(1400);
    return { displays: 1, spaces: "current" };
  },
  thumb_cache_size: () => 37_400_000,
  clear_thumb_cache: () => undefined,
  "plugin:app|version": () => "1.0.0",
  "plugin:updater|check": async () => {
    await delay(600);
    return mockUpdate();
  },
  "plugin:updater|download_and_install": async () => {
    await delay(1800);
  },
  "plugin:process|restart": () => {
    window.location.reload();
  },
};

(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    const handler = handlers[cmd];
    if (!handler) throw `bad_response:no mock for ${cmd}`;
    return handler(args ?? {});
  },
  transformCallback: () => 0,
  convertFileSrc: (path: string) => path,
};

console.info("[spiral] Tauri mock active. Browser visual-QA mode.");

export {};
