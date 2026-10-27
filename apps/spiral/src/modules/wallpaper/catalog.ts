import type { SourceFilter, SourceInfo } from "./types";

/** Pure helpers for the source filter: chips, colours, and the sentence said
 *  before a source's first request. No React, no IPC. */

export interface FilterChip {
  id: SourceFilter;
  label: string;
  /** Source ids behind the chip, the same lists as the native `SourceFilter`. */
  members: string[];
}

export const FILTERS: FilterChip[] = [
  { id: "all", label: "All", members: ["wallhaven", "nasa", "esa", "commons", "aic", "cleveland", "bing"] },
  { id: "wallhaven", label: "Wallhaven", members: ["wallhaven"] },
  { id: "space", label: "Space", members: ["nasa", "esa"] },
  { id: "museums", label: "Museums", members: ["aic", "cleveland", "rijks", "smithsonian"] },
  { id: "commons", label: "Commons", members: ["commons"] },
  { id: "bing", label: "Bing daily", members: ["bing"] },
];

export function filterChip(id: SourceFilter): FilterChip {
  return FILTERS.find((chip) => chip.id === id) ?? FILTERS[1];
}

/** Wallhaven's own colour filter values (six hex digits, no `#`), with the
 *  names a screen reader says. */
export const PALETTE: { hex: string; name: string }[] = [
  { hex: "660000", name: "Dark red" },
  { hex: "990000", name: "Red brown" },
  { hex: "cc0000", name: "Red" },
  { hex: "cc3333", name: "Brick" },
  { hex: "ea4c88", name: "Pink" },
  { hex: "993399", name: "Purple" },
  { hex: "663399", name: "Violet" },
  { hex: "333399", name: "Indigo" },
  { hex: "0066cc", name: "Blue" },
  { hex: "0099cc", name: "Sky blue" },
  { hex: "66cccc", name: "Teal" },
  { hex: "77cc33", name: "Lime" },
  { hex: "669900", name: "Green" },
  { hex: "336600", name: "Forest" },
  { hex: "666600", name: "Olive" },
  { hex: "999900", name: "Mustard" },
  { hex: "cccc33", name: "Yellow green" },
  { hex: "ffff00", name: "Yellow" },
  { hex: "ffcc33", name: "Gold" },
  { hex: "ff9900", name: "Orange" },
  { hex: "ff6600", name: "Deep orange" },
  { hex: "cc6633", name: "Rust" },
  { hex: "996633", name: "Brown" },
  { hex: "663300", name: "Dark brown" },
  { hex: "000000", name: "Black" },
  { hex: "999999", name: "Grey" },
  { hex: "cccccc", name: "Light grey" },
  { hex: "ffffff", name: "White" },
  { hex: "424153", name: "Slate" },
];

/** CSS for a palette value. The value is Wallhaven's filter, not a brand
 *  colour, so it is drawn exactly. */
export function swatchFill(hex: string): string {
  const n = Number.parseInt(hex, 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255})`;
}

const INTRODUCED_KEY = "spiral.wallpaper.sources-introduced";

/** Wallhaven is introduced by the footer line from the first launch. */
export function readIntroduced(storage: Pick<Storage, "getItem"> | null = safeStorage()): Set<string> {
  const known = new Set(["wallhaven"]);
  try {
    const raw = storage?.getItem(INTRODUCED_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(value)) for (const id of value) if (typeof id === "string") known.add(id);
  } catch {
    // A blocked store only means the sentence shows again.
  }
  return known;
}

export function writeIntroduced(known: Set<string>, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(INTRODUCED_KEY, JSON.stringify([...known]));
  } catch {
    // As above.
  }
}

/** Sources behind the chip that have not been asked anything yet. */
export function needsIntro(chip: FilterChip, known: Set<string>): string[] {
  return chip.members.filter((id) => !known.has(id));
}

/** The plain sentence said before the first request: who is asked, what they
 *  see, and what comes back. */
export function introSentence(ids: string[], infos: SourceInfo[]): string {
  const named = ids.map((id) => infos.find((info) => info.id === id)).filter((info): info is SourceInfo => !!info);
  if (named.length === 0) return "Spiral will ask this source for pictures.";
  const hosts = named.flatMap((info) => info.hosts.slice(0, 1));
  const names = list(named.map((info) => info.name));
  return `Spiral will ask ${names} for pictures (${hosts.join(", ")}). They see your IP address and your search words, nothing else. Answers are kept on this computer for a day.`;
}

const NAMES: Record<string, string> = {
  wallhaven: "Wallhaven",
  nasa: "NASA",
  esa: "ESA/Webb and ESA/Hubble",
  commons: "Wikimedia Commons",
  aic: "Art Institute of Chicago",
  cleveland: "Cleveland Museum of Art",
  bing: "Bing daily",
  smithsonian: "Smithsonian Open Access",
  rijks: "Rijksmuseum",
};

export function sourceName(id: string, infos: SourceInfo[]): string {
  return infos.find((info) => info.id === id)?.name ?? NAMES[id] ?? id;
}

/** Who to name in an error: the one source, or the chip's label. */
export function errorSource(chip: FilterChip, infos: SourceInfo[]): string {
  return chip.members.length === 1 ? sourceName(chip.members[0], infos) : `the ${chip.label} sources`;
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
