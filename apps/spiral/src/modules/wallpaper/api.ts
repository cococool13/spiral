import { invoke } from "@tauri-apps/api/core";
import {
  parseActivity,
  parseApplied,
  parseCredit,
  parseDisplays,
  parseSearchPage,
  parseSearchParams,
  parseSources,
  type Applied,
  type Credit,
  type Display,
  type NativeActivity,
  type SearchPage,
  type SearchParams,
  type SourceInfo,
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

export function sourcesList(): Promise<SourceInfo[]> {
  return invoke("sources_list").then(parseSources);
}

/** Reads this computer's screens. No network. */
export function displaysList(): Promise<Display[]> {
  return invoke("displays_list").then(parseDisplays);
}

/** ESA's credit lives on the image's own page: one cached request. */
export function sourceCredit(id: string): Promise<Credit | undefined> {
  return invoke("source_credit", { id }).then(parseCredit);
}

export function activityList(limit = 200): Promise<NativeActivity[]> {
  return invoke("activity_list", { limit }).then(parseActivity);
}

export function activityClear(): Promise<void> {
  return invoke("activity_clear");
}

/** A person's own key for a source that offers one; `null` removes it. */
export function sourceKeySet(source: string, key: string | null): Promise<void> {
  return invoke("source_key_set", { source, key });
}
