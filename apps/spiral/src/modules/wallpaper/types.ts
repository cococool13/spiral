export interface Credit {
  /** Who made it and what it is, as the source words it. */
  line: string;
  licence: string;
  /** The item's own page, without a scheme. Shown as text, never followed. */
  page?: string;
}

export interface GalleryItem {
  id: string;
  resolution: string;
  title?: string;
  credit?: Credit;
}

export interface SearchPage {
  items: GalleryItem[];
  page: number;
  lastPage: number;
  /** Sources behind the filter that did not answer this time. */
  unavailable: string[];
}

export type Categories = "111" | "100" | "010" | "001";
export type Sorting = "toplist" | "relevance";
export type SourceFilter =
  | "all"
  | "wallhaven"
  | "space"
  | "museums"
  | "commons"
  | "bing"
  | "nasa"
  | "esa"
  | "aic"
  | "cleveland"
  | "smithsonian"
  | "rijks";

export interface SearchParams {
  query: string;
  categories: Categories;
  sorting: Sorting;
  page: number;
  source: SourceFilter;
  /** One Wallhaven palette colour, six hex digits without `#`. Wallhaven only. */
  colors?: string;
  /** Ask sources for pictures at least as large as the largest display. */
  fit: boolean;
}

export interface Applied {
  displays: number;
  spaces: "current";
}

export interface SourceInfo {
  id: string;
  prefix: string;
  name: string;
  group: string;
  licence: string;
  hosts: string[];
  optionalKey: boolean;
  keyed: boolean;
}

export interface Display {
  name: string;
  width: number;
  height: number;
  scale: number;
  isMain: boolean;
}

/** One line of `activity.jsonl`, written natively for each request. */
export interface NativeActivity {
  at: string;
  kind: string;
  action: string;
  source?: string;
  host?: string;
  item?: string;
  result: string;
  code?: string | null;
  credit?: string;
}

export const WALL_ID = /^[wnecambsr]-[A-Za-z0-9_-]{1,96}$/;
const RESOLUTION = /^\d+x\d+$/;
const CATEGORIES = new Set<Categories>(["111", "100", "010", "001"]);
const FILTERS = new Set<SourceFilter>([
  "all",
  "wallhaven",
  "space",
  "museums",
  "commons",
  "bing",
  "nasa",
  "esa",
  "aic",
  "cleveland",
  "smithsonian",
  "rijks",
]);
const COLOUR = /^[0-9a-f]{6}$/;

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : undefined;
}

export function parseCredit(value: unknown): Credit | undefined {
  if (!isRecord(value)) return undefined;
  const line = text(value.line, 300);
  const licence = text(value.licence, 120);
  if (!line || !licence) return undefined;
  const page = text(value.page, 200);
  return page && !page.includes("://") ? { line, licence, page } : { line, licence };
}

export function parseGalleryItem(value: unknown): GalleryItem {
  if (!isRecord(value) || typeof value.id !== "string" || !WALL_ID.test(value.id)) {
    throw new Error("Spiral could not read a wallpaper.");
  }
  if (typeof value.resolution !== "string" || !RESOLUTION.test(value.resolution)) {
    throw new Error("Spiral could not read a wallpaper.");
  }
  const item: GalleryItem = { id: value.id, resolution: value.resolution };
  const title = text(value.title, 160);
  if (title) item.title = title;
  const credit = parseCredit(value.credit);
  if (credit) item.credit = credit;
  return item;
}

export function parseSearchPage(value: unknown): SearchPage {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("Spiral could not read the wallpaper page.");
  }
  if (typeof value.page !== "number" || typeof value.lastPage !== "number") {
    throw new Error("Spiral could not read the wallpaper page.");
  }
  return {
    items: value.items.map(parseGalleryItem),
    page: value.page,
    lastPage: value.lastPage,
    unavailable: Array.isArray(value.unavailable)
      ? value.unavailable.filter((id): id is string => typeof id === "string")
      : [],
  };
}

export function parseSearchParams(value: SearchParams): SearchParams {
  if (!CATEGORIES.has(value.categories) || (value.sorting !== "toplist" && value.sorting !== "relevance")) {
    throw new Error("Spiral could not read that search.");
  }
  if (!Number.isInteger(value.page) || value.page < 1 || !FILTERS.has(value.source)) {
    throw new Error("Spiral could not read that search.");
  }
  const params: SearchParams = {
    query: value.query.trim(),
    categories: value.categories,
    sorting: value.sorting,
    page: value.page,
    source: value.source,
    fit: value.fit === true,
  };
  if (value.colors !== undefined) {
    if (value.source !== "wallhaven" || !COLOUR.test(value.colors)) {
      throw new Error("Spiral could not read that search.");
    }
    params.colors = value.colors;
  }
  return params;
}

export function parseApplied(value: unknown): Applied {
  if (!isRecord(value) || typeof value.displays !== "number" || value.spaces !== "current") {
    throw new Error("Spiral could not set that wallpaper.");
  }
  return { displays: value.displays, spaces: "current" };
}

/** What an undo or a restore put back. */
export interface Restored {
  displays: number;
  /** File names that were gone, so those screens were left as they were. */
  missing: string[];
  /** The Spiral wallpaper now showing, or null for the person's own picture. */
  current: string | null;
}

export interface HistoryView {
  /** False where Spiral cannot read the desktop. The controls stay hidden. */
  supported: boolean;
  undo: number;
  original: { name: string; exists: boolean } | null;
}

export function parseRestored(value: unknown): Restored {
  if (!isRecord(value) || typeof value.displays !== "number" || !Array.isArray(value.missing)) {
    throw new Error("Spiral could not read what it put back.");
  }
  const current = typeof value.current === "string" && WALL_ID.test(value.current) ? value.current : null;
  return {
    displays: value.displays,
    missing: value.missing.filter((name): name is string => typeof name === "string"),
    current,
  };
}

export function parseHistory(value: unknown): HistoryView {
  if (!isRecord(value) || typeof value.supported !== "boolean" || typeof value.undo !== "number") {
    throw new Error("Spiral could not read the wallpaper history.");
  }
  const raw = value.original;
  const original =
    isRecord(raw) && typeof raw.name === "string" && typeof raw.exists === "boolean"
      ? { name: raw.name, exists: raw.exists }
      : null;
  return { supported: value.supported, undo: value.undo, original };
}

export function parseSources(value: unknown): SourceInfo[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") return [];
    return [
      {
        id: entry.id,
        prefix: typeof entry.prefix === "string" ? entry.prefix : "",
        name: entry.name,
        group: typeof entry.group === "string" ? entry.group : entry.id,
        licence: typeof entry.licence === "string" ? entry.licence : "",
        hosts: Array.isArray(entry.hosts) ? entry.hosts.filter((host): host is string => typeof host === "string") : [],
        optionalKey: entry.optionalKey === true,
        keyed: entry.keyed === true,
      },
    ];
  });
}

export function parseDisplays(value: unknown): Display[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.width !== "number" || typeof entry.height !== "number") return [];
    if (entry.width <= 0 || entry.height <= 0) return [];
    return [
      {
        name: typeof entry.name === "string" ? entry.name : "Display",
        width: entry.width,
        height: entry.height,
        scale: typeof entry.scale === "number" ? entry.scale : 1,
        isMain: entry.isMain === true,
      },
    ];
  });
}

export function parseActivity(value: unknown): NativeActivity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.at !== "string" || typeof entry.action !== "string") return [];
    return [
      {
        at: entry.at,
        kind: typeof entry.kind === "string" ? entry.kind : "network",
        action: entry.action,
        source: text(entry.source, 40),
        host: text(entry.host, 120),
        item: text(entry.item, 120),
        result: typeof entry.result === "string" ? entry.result : "ok",
        code: text(entry.code, 60) ?? null,
        credit: text(entry.credit, 400),
      },
    ];
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
