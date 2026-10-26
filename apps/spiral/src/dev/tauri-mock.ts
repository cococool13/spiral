/**
 * Dev-only Tauri IPC mock — lets the UI run in a plain browser for visual QA
 * (`pnpm dev`, no Tauri shell). Loaded from main.tsx only when
 * `import.meta.env.DEV` is true and no real Tauri runtime is present.
 * Never bundled into the app: the conditional import is dead-code-eliminated
 * in production builds.
 */

import { assertCommandArgs } from "./command-args";
import { ACCENT_HEX, LOOKS, pageArt, plateThumb, type PageDoc } from "./plate-art";

// Real photographs for the grid so visual QA sees the room the way it ships.
const ART = Object.values(
  import.meta.glob<string>("./art/*.jpg", { eager: true, query: "?url", import: "default" }),
);
function artThumb(id: string): string {
  let n = 0;
  for (const char of id) n = (n * 31 + char.charCodeAt(0)) >>> 0;
  return ART.length > 0 ? (ART[n % ART.length] ?? plateThumb(id)) : plateThumb(id);
}
(window as unknown as { __SPIRAL_THUMB__?: (id: string) => string }).__SPIRAL_THUMB__ = artThumb;

// ?caps=on lights up the parked screens that need native work, tagged Preview.
// ?start=wallpaper|resume skips the first-run picker.
const query = new URLSearchParams(window.location.search);
if (query.get("caps") === "on") {
  window.__SPIRAL_CAPS__ = {
    liveWallpaper: true,
    applyPerDisplay: true,
    pauseRules: true,
    restoreOriginal: true,
  };
}
const startAt = query.get("start");

window.__SPIRAL_BOOT__ = {
  version: "2.0.0",
  platform: "macos",
  modules: [
    { id: "wallpaper", enabled: true, available: true, unavailableReason: null },
    { id: "resume", enabled: true, available: true, unavailableReason: null },
  ],
  start:
    startAt === "wallpaper" || startAt === "resume"
      ? { kind: "module", id: startAt }
      : { kind: "picker", preselect: ["wallpaper", "resume"] },
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

const SIZES = ["3840x2160", "5120x2880", "2560x1440", "6016x3384", "3440x1440", "3840x2400", "1920x1080"];

const MOCK_SOURCES = [
  { id: "wallhaven", prefix: "w", name: "Wallhaven", group: "wallhaven", hosts: ["wallhaven.cc"], licence: "Wallhaven SFW." },
  { id: "nasa", prefix: "n", name: "NASA", group: "space", hosts: ["images-api.nasa.gov"], licence: "NASA images, generally not copyrighted." },
  { id: "esa", prefix: "e", name: "ESA/Webb and ESA/Hubble", group: "space", hosts: ["esawebb.org", "esahubble.org"], licence: "CC BY 4.0, credit required." },
  { id: "commons", prefix: "c", name: "Wikimedia Commons", group: "commons", hosts: ["commons.wikimedia.org"], licence: "Featured pictures under free licences." },
  { id: "aic", prefix: "a", name: "Art Institute of Chicago", group: "museums", hosts: ["api.artic.edu"], licence: "CC0." },
  { id: "cleveland", prefix: "m", name: "Cleveland Museum of Art", group: "museums", hosts: ["openaccess-api.clevelandart.org"], licence: "CC0." },
  { id: "bing", prefix: "b", name: "Bing daily", group: "bing", hosts: ["www.bing.com"], licence: "Personal use." },
  { id: "smithsonian", prefix: "s", name: "Smithsonian Open Access", group: "museums", hosts: ["api.si.edu"], licence: "CC0.", optionalKey: true },
  { id: "rijks", prefix: "r", name: "Rijksmuseum", group: "museums", hosts: ["data.rijksmuseum.nl"], licence: "Public domain." },
].map((source) => ({ optionalKey: false, keyed: false, ...source }));

const GROUPS: Record<string, string[]> = {
  all: ["wallhaven", "nasa", "esa", "commons", "aic", "cleveland", "bing"],
  space: ["nasa", "esa"],
  museums: ["aic", "cleveland", "rijks", "smithsonian"],
};

function searchPage(pageNum: number, source = "wallhaven") {
  const members = GROUPS[source] ?? [source];
  return {
    items: Array.from({ length: 24 }, (_, i) => {
      const from = MOCK_SOURCES.find((entry) => entry.id === members[i % members.length]) ?? MOCK_SOURCES[0];
      const id = `${from.prefix}-p${pageNum}i${i}`;
      return from.id === "wallhaven"
        ? { id, resolution: SIZES[(i + pageNum) % SIZES.length] ?? "3840x2160" }
        : {
            id,
            resolution: SIZES[(i + pageNum) % SIZES.length] ?? "3840x2160",
            title: `Study ${i + 1}`,
            credit: { line: `Mock artist, Study ${i + 1}`, licence: from.licence, page: `${from.hosts[0]}/item/${i}` },
          };
    }),
    page: pageNum,
    lastPage: members.length > 1 || source === "wallhaven" ? 5 : 2,
    unavailable: source === "museums" ? ["smithsonian"] : [],
  };
}

function sourceArg(args: Record<string, unknown>): string {
  const params = args.params;
  if (typeof params === "object" && params !== null && "source" in params) {
    const source = (params as { source?: unknown }).source;
    if (typeof source === "string") return source;
  }
  return "wallhaven";
}

const mockRequests: Record<string, unknown>[] = [];

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
      phone: "",
      location: "Oakland, CA",
      links: ["maya.okafor.dev"],
    },
    headline: "Operations lead",
    summary: "Runs clinic operations for a three-site health group. Eight years in scheduling and logistics.",
    experience: [
      {
        id: "exp-1",
        title: "Operations lead",
        organization: "Halden Health",
        location: "Oakland",
        start: { raw: "2022", year: 2022, month: 3, present: false },
        end: { raw: "Present", year: null, month: null, present: true },
        bullets: [
          { id: "exp-1-b1", text: "Cut clinic wait time from 40 minutes to 18." },
          { id: "exp-1-b2", text: "Moved three sites onto one booking system in four months." },
          { id: "exp-1-b3", text: "Hired and trained a front-desk team of nine." },
        ],
      },
      {
        id: "exp-2",
        title: "Logistics coordinator",
        organization: "Ferro Logistics",
        location: "Oakland",
        start: { raw: "2019", year: 2019, month: 6, present: false },
        end: { raw: "2022", year: 2022, month: 2, present: false },
        bullets: [
          { id: "exp-2-b1", text: "Scheduled 120 outbound loads a week." },
          { id: "exp-2-b2", text: "Cut late deliveries from 9% to 3% with a daily carrier check." },
        ],
      },
    ],
    education: [
      {
        id: "edu-1",
        institution: "Laney College",
        credential: "A.S. Business",
        location: "Oakland",
        start: { raw: "Fall term", year: null, month: null, present: false },
        end: { raw: "2018", year: 2018, month: null, present: false },
        notes: [],
      },
    ],
    projects: [],
    leadership: [],
    awards: [],
    interests: [],
    skills: [
      { label: "Tools", items: ["Excel", "SQL", "Epic Cadence", "Airtable"] },
      { label: "Languages", items: ["English", "Yoruba"] },
    ],
  };
}

interface MockDate {
  raw?: string;
  year?: number | null;
  present?: boolean;
}

/** Mirrors the real check closely enough to show flags and clear them on fix. */
function mockFindings(doc: unknown) {
  const findings: { type: string; raw?: string; field?: string }[] = [];
  const value = doc as {
    contact?: Record<string, unknown>;
    experience?: { start?: MockDate; end?: MockDate }[];
    education?: { start?: MockDate; end?: MockDate }[];
  };
  for (const field of ["name", "email", "phone"]) {
    const text = value.contact?.[field];
    if (typeof text !== "string" || text.trim() === "") findings.push({ type: "missingContact", field });
  }
  for (const entry of [...(value.experience ?? []), ...(value.education ?? [])]) {
    for (const date of [entry.start, entry.end]) {
      if (date?.raw && !date.present && !date.year && !/\d{4}/.test(date.raw)) {
        findings.push({ type: "unparsedDate", raw: date.raw });
      }
    }
  }
  return findings;
}

const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
  module_activate: () => undefined,
  resume: (args) => {
    const call = args.call as {
      type?: string;
      text?: string;
      doc?: PageDoc;
      look?: string;
      accent?: string;
    } | undefined;
    if (!call) return null;
    if (call.type === "load_document") return { stored: null };
    if (call.type === "parse_text") return sampleResume(pastedName(call.text ?? ""));
    if (call.type === "import_file") return sampleResume("Maya Okafor");
    if (call.type === "preview") return { pages: [pageArt(call.doc ?? {}, call.look ?? "", call.accent ?? "")] };
    if (call.type === "check") return { findings: mockFindings(call.doc) };
    if (call.type === "list_accents") {
      return ACCENT_HEX.map(([id, hex]) => ({ id, hex }));
    }
    if (call.type === "thumbnails") {
      return {
        thumbs: Object.entries(LOOKS).map(([id, look]) => ({
          id,
          name: look.name,
          file: pageArt(call.doc ?? {}, id, call.accent ?? ""),
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
          pages: [pageArt(call.doc ?? {}, call.look ?? "", call.accent ?? "")],
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
    const source = sourceArg(args);
    for (const id of GROUPS[source] ?? [source]) {
      const host = MOCK_SOURCES.find((entry) => entry.id === id)?.hosts[0];
      mockRequests.unshift({ v: 1, at: new Date().toISOString(), actor: "app", kind: "network", action: "search", source: id, host, result: "ok", code: null });
    }
    return searchPage(pageArg(args), source);
  },
  sources_list: () => MOCK_SOURCES,
  displays_list: () => [{ name: "Built-in Retina Display", width: 3024, height: 1964, scale: 2, isMain: true }],
  source_credit: () => ({ line: "ESA/Webb, NASA & CSA", licence: "CC BY 4.0 · ESA/Webb", page: "esawebb.org/images/mock/" }),
  activity_list: () => mockRequests.slice(0, 200),
  activity_clear: () => {
    mockRequests.length = 0;
  },
  source_key_set: () => undefined,
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
