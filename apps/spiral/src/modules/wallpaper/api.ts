import { invoke } from "@tauri-apps/api/core";
import {
  parseApplied,
  parseGalleryItem,
  parseHistory,
  parseRestored,
  parseSearchPage,
  parseSearchParams,
  type Applied,
  type GalleryItem,
  type HistoryView,
  type Restored,
  type SearchPage,
  type SearchParams,
} from "./types";

export function cachedPage(): Promise<SearchPage | null> {
  return invoke("wallpaper_cached_page").then((value) => (value == null ? null : parseSearchPage(value)));
}

export function search(params: SearchParams): Promise<SearchPage> {
  return invoke("wallpaper_search", { params: parseSearchParams(params) }).then(parseSearchPage);
}

export function prefetchPage(params: SearchParams): Promise<void> {
  return invoke("wallpaper_prefetch_page", { params: parseSearchParams(params) });
}

export function stageFull(id: string): Promise<void> {
  return invoke("wallpaper_stage_full", { id });
}

export function apply(id: string): Promise<Applied> {
  return invoke("wallpaper_apply", { id }).then(parseApplied);
}

/** The recent row, kept by Rust across launches with what it needs to set an item again. */
export function recent(): Promise<GalleryItem[]> {
  return invoke("wallpaper_recent").then((value) => (Array.isArray(value) ? value.map(parseGalleryItem) : []));
}

export function history(): Promise<HistoryView> {
  return invoke("wallpaper_history").then(parseHistory);
}

/** Puts back the desktop from before the last apply. */
export function undo(): Promise<Restored> {
  return invoke("wallpaper_undo").then(parseRestored);
}

/** Puts back the wallpaper the person had before Spiral changed it. */
export function restoreOriginal(): Promise<Restored> {
  return invoke("wallpaper_restore_original").then(parseRestored);
}
