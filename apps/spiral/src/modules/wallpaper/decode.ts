export function recordTileDecode(
  seen: ReadonlySet<number>,
  index: number,
): { seen: Set<number>; useful: boolean } {
  if (!Number.isInteger(index) || index < 0 || seen.has(index)) {
    return { seen: new Set(seen), useful: false };
  }
  const next = new Set(seen);
  next.add(index);
  return { seen: next, useful: next.size === 12 };
}
