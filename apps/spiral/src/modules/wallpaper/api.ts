import { invoke } from "@tauri-apps/api/core";
import {
  parseApplied,
  parseSearchPage,
  parseSearchParams,
  type Applied,
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
