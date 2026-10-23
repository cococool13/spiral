export interface GalleryItem {
  id: string;
  resolution: string;
}

export interface SearchPage {
  items: GalleryItem[];
  page: number;
  lastPage: number;
}

export type Categories = "111" | "100" | "010" | "001";
export type Sorting = "toplist" | "relevance";

export interface SearchParams {
  query: string;
  categories: Categories;
  sorting: Sorting;
  page: number;
}

export interface Applied {
  displays: number;
  spaces: "current";
}

const WALL_ID = /^w-[A-Za-z0-9]+$/;
const RESOLUTION = /^\d+x\d+$/;
const CATEGORIES = new Set<Categories>(["111", "100", "010", "001"]);

export function parseGalleryItem(value: unknown): GalleryItem {
  if (!isRecord(value) || typeof value.id !== "string" || !WALL_ID.test(value.id)) {
    throw new Error("Spiral could not read a wallpaper.");
  }
  if (typeof value.resolution !== "string" || !RESOLUTION.test(value.resolution)) {
    throw new Error("Spiral could not read a wallpaper.");
  }
  return { id: value.id, resolution: value.resolution };
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
  };
}

export function parseSearchParams(value: SearchParams): SearchParams {
  if (!CATEGORIES.has(value.categories) || (value.sorting !== "toplist" && value.sorting !== "relevance")) {
    throw new Error("Spiral could not read that search.");
  }
  if (!Number.isInteger(value.page) || value.page < 1) {
    throw new Error("Spiral could not read that search.");
  }
  return {
    query: value.query.trim(),
    categories: value.categories,
    sorting: value.sorting,
    page: value.page,
  };
}

export function parseApplied(value: unknown): Applied {
  if (!isRecord(value) || typeof value.displays !== "number" || value.spaces !== "current") {
    throw new Error("Spiral could not set that wallpaper.");
  }
  return { displays: value.displays, spaces: "current" };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
