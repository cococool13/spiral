import { WALL_ID, type GalleryItem } from "./types";

/** Pure helpers behind the grid: fit, recent and surprise. No React, no IPC. */

export interface DisplayPixels {
  width: number;
  height: number;
}

/** The pixels of the screen this window is on. The native default gallery
 *  already asks Wallhaven for images at least as large as the largest display;
 *  this covers searches and categories, which it does not. */
export function displayPixels(): DisplayPixels {
  const ratio = window.devicePixelRatio || 1;
  return {
    width: Math.round(window.screen.width * ratio),
    height: Math.round(window.screen.height * ratio),
  };
}

export function fitsDisplay(resolution: string, display: DisplayPixels): boolean {
  const [width, height] = resolution.split("x").map(Number);
  if (!width || !height) return false;
  return width >= display.width && height >= display.height;
}

export function sizeLabel(resolution: string): string {
  const [width, height] = resolution.split("x");
  return width && height ? `${width} × ${height}` : resolution;
}

/** Where the wallpaper lives on Wallhaven, as a person would type it. Spiral's
 *  own ids carry a `w-` prefix that means nothing outside the app. */
export function wallhavenPage(id: string): string {
  return `wallhaven.cc/w/${id.replace(/^w-/, "")}`;
}

/** How the activity log and quick look name an item: its page for Wallhaven
 *  and for sources that give one, else its title. */
export function itemPage(item: GalleryItem): string {
  if (item.id.startsWith("w-")) return wallhavenPage(item.id);
  return item.credit?.page ?? item.title ?? item.credit?.line ?? "this picture";
}

export const RECENT_LIMIT = 12;
const RECENT_KEY = "spiral.wallpaper.recent";

export function addRecent(list: GalleryItem[], item: GalleryItem): GalleryItem[] {
  return [item, ...list.filter((entry) => entry.id !== item.id)].slice(0, RECENT_LIMIT);
}

export function readRecent(storage: Pick<Storage, "getItem"> | null = safeStorage()): GalleryItem[] {
  try {
    const raw = storage?.getItem(RECENT_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (entry): entry is GalleryItem =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as GalleryItem).id === "string" &&
          WALL_ID.test((entry as GalleryItem).id) &&
          typeof (entry as GalleryItem).resolution === "string",
      )
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function writeRecent(list: GalleryItem[], storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Recent is a convenience. A full or blocked store only loses the row.
  }
}

/** `[` steps back to an older wallpaper, `]` forward to a newer one. */
export function stepRecent(list: GalleryItem[], currentId: string | null, key: "[" | "]"): GalleryItem | null {
  if (list.length === 0) return null;
  const index = currentId ? list.findIndex((entry) => entry.id === currentId) : -1;
  if (index < 0) return key === "[" ? (list[1] ?? list[0]) : list[0];
  const next = key === "[" ? index + 1 : index - 1;
  return list[(next + list.length) % list.length] ?? null;
}

export function pickSurprise(
  items: GalleryItem[],
  currentId: string | null,
  random: () => number = Math.random,
): GalleryItem | null {
  const pool = items.filter((item) => item.id !== currentId);
  if (pool.length === 0) return items[0] ?? null;
  return pool[Math.floor(random() * pool.length)] ?? null;
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
