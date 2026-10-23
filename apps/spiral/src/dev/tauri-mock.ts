/**
 * Dev-only Tauri IPC mock — lets the UI run in a plain browser for visual QA
 * (`pnpm dev`, no Tauri shell). Loaded from main.tsx only when
 * `import.meta.env.DEV` is true and no real Tauri runtime is present.
 * Never bundled into the app: the conditional import is dead-code-eliminated
 * in production builds.
 */

import { assertCommandArgs } from "./command-args";
import { pageArt, plateThumb } from "./plate-art";

(window as unknown as { __SPIRAL_THUMB__?: (id: string) => string }).__SPIRAL_THUMB__ = plateThumb;

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
  analyticsOptOut: boolean;
}

const general: MockGeneral = {
  launchAtLogin: false,
  autoUpdateCheck: true,
  fitMode: "fill",
  analyticsOptOut: false,
};

let licensed = true;

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

function pastedName(text: string): string {
  const line = text
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  if (!line || line.length > 80) return "Maya Okafor";
  return line;
}

function sampleResume(name: string) {
  return {
    contact: {
      name,
      email: "maya.okafor@fastmail.com",
      phone: "415 555 0148",
      location: "Oakland, CA",
      links: ["maya.okafor.dev"],
    },
    headline: "Operations lead",
    summary: "",
    experience: [
      {
        id: "exp-1",
        title: "Operations lead",
        organization: "Halden Health",
        location: "Oakland",
        start: { raw: "2022", year: 2022, month: 3, present: false },
        end: { raw: "Present", year: null, month: null, present: true },
        bullets: [{ id: "exp-1-b1", text: "Cut clinic wait time from 40 minutes to 18." }],
      },
      {
        id: "exp-2",
        title: "Logistics coordinator",
        organization: "Ferro Logistics",
        location: "Oakland",
        start: { raw: "2019", year: 2019, month: 6, present: false },
        end: { raw: "2022", year: 2022, month: 2, present: false },
        bullets: [{ id: "exp-2-b1", text: "Scheduled 120 outbound loads a week." }],
      },
    ],
    education: [
      {
        id: "edu-1",
        institution: "Laney College",
        credential: "A.S. Business",
        location: "Oakland",
        start: { raw: "2016", year: 2016, month: null, present: false },
        end: { raw: "2018", year: 2018, month: null, present: false },
        notes: [],
      },
    ],
    projects: [],
    leadership: [],
    awards: [],
    interests: [],
    skills: [{ label: "Tools", items: ["Excel", "SQL"] }],
  };
}

const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
  module_activate: () => undefined,
  resume: (args) => {
    const call = args.call as {
      type?: string;
      text?: string;
      doc?: { contact?: { name?: string } };
    } | undefined;
    if (!call) return null;
    if (call.type === "load_document") return { stored: null };
    if (call.type === "parse_text") return sampleResume(pastedName(call.text ?? ""));
    if (call.type === "import_file") return sampleResume("Maya Okafor");
    if (call.type === "preview") {
      const doc = call.doc as { contact?: { name?: string } } | undefined;
      const name = doc?.contact?.name?.trim() || "Resume";
      return { pages: [pageArt(name)] };
    }
    if (call.type === "check") return { findings: [] };
    if (call.type === "list_accents") {
      return [
        { id: "ink", hex: "var(--ink)" },
        { id: "slate", hex: "var(--ink-2)" },
        { id: "red", hex: "var(--red)" },
      ];
    }
    if (call.type === "thumbnails") {
      return {
        thumbs: ["column", "ledger", "sheet", "rule"].map((id) => ({
          id,
          name: id.charAt(0).toUpperCase() + id.slice(1),
          file: pageArt(id.charAt(0).toUpperCase() + id.slice(1)),
          error: "",
        })),
      };
    }
    if (call.type === "build") {
      const events = args.events as { onmessage?: (event: { type: string; done: number; total: number }) => void };
      return (async () => {
        events.onmessage?.({ type: "progress", done: 1, total: 3 });
        await delay(400);
        events.onmessage?.({ type: "progress", done: 2, total: 3 });
        await delay(800);
        return {
          pages: [pageArt("Maya Okafor")],
          file: "",
          suggestedName: "Maya-Okafor.pdf",
          engine: "Built offline, no network used",
          notes: [],
        };
      })();
    }
    if (call.type === "save_built") return null;
    if (call.type === "review_wording") return [];
    if (call.type === "engine_info") {
      return {
        provider: "local",
        model: "",
        baseUrl: "",
        hasKey: false,
        host: "",
        keyUrl: "",
        needsSetup: false,
      };
    }
    if (call.type === "offline_models") return { available: false, models: [] };
    if (call.type === "save_document" || call.type === "save_engine" || call.type === "delete_stored_data") {
      return { saved: true };
    }
    if (call.type === "storage_info") return { path: "", exists: false };
    return { saved: true };
  },
  modules_set: () => undefined,
  bench_mark: () => undefined,
  license_view: () =>
    licensed
      ? { kind: "licensed", grace: false, key: "LIC1…4f2a", device: "This computer · a1b2c3d4" }
      : { kind: "needsActivation", offer: null },
  license_use_legacy: () => {
    licensed = true;
    return { kind: "licensed", grace: false, key: "LIC1…4f2a", device: "This computer · a1b2c3d4" };
  },
  license_activate: () => {
    licensed = true;
  },
  license_request_code: () => undefined,
  license_activate_email: () => {
    licensed = true;
  },
  license_clear: () => {
    licensed = false;
  },
  provider_view: () => ({ kind: "absent" }),
  provider_set: () => ({ kind: "present" }),
  provider_clear: () => ({ kind: "absent" }),
  rename_offer: () => ({ visible: false, otherCopy: null }),
  rename_decline: () => undefined,
  rename_apply: () => undefined,
  bundle_trash: () => undefined,
  "plugin:opener|open_url": () => undefined,
  general_view: () => ({ ...general }),
  general_update: (args) => {
    const next = args.settings;
    if (typeof next === "object" && next !== null) {
      const patch = next as Partial<MockGeneral>;
      if (typeof patch.launchAtLogin === "boolean") general.launchAtLogin = patch.launchAtLogin;
      if (typeof patch.autoUpdateCheck === "boolean") general.autoUpdateCheck = patch.autoUpdateCheck;
      if (typeof patch.analyticsOptOut === "boolean") general.analyticsOptOut = patch.analyticsOptOut;
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
    const payload = args ?? {};
    assertCommandArgs(cmd, payload);
    return handler(payload);
  },
  transformCallback: () => 0,
  convertFileSrc: (path: string) => path,
};

console.info("[spiral] Tauri mock active. Browser visual-QA mode.");

export {};
