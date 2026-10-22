import type { ModuleId } from "../../boot";

const ORDER: ModuleId[] = ["wallpaper", "resume"];

export function nextModuleSet(
  enabled: readonly ModuleId[],
  available: Readonly<Record<ModuleId, boolean>>,
  id: ModuleId,
  on: boolean,
): ModuleId[] | null {
  if (!available[id]) return null;
  const chosen = new Set(enabled);
  if (on) chosen.add(id);
  else chosen.delete(id);
  const next = ORDER.filter((item) => chosen.has(item));
  if (!next.some((item) => available[item])) return null;
  return next;
}

export function activeAfter(active: ModuleId, next: readonly ModuleId[]): ModuleId {
  if (next.includes(active)) return active;
  return next.includes("wallpaper") ? "wallpaper" : next[0];
}
