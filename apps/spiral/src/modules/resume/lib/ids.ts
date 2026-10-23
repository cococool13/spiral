// The id shapes Rust mints: `exp-0` for an entry, `exp-0-b-0` for a bullet
// (`model.rs::entry_id` / `bullet_id`). Written once here rather than re-spelled
// in every editor — a bullet id is how a model rewrite finds its way home, so
// the two sides drifting means a rewrite lands on the wrong bullet.

/** The next free index after `prefix`, from the ids already in use. A count is
 *  not an identity once anything can be removed: deleting the first of
 *  [exp-0, exp-1] and adding one produced a second "exp-1". */
function nextIndex(prefix: string, ids: string[]): number {
  const used = ids
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n));
  return used.length === 0 ? 0 : Math.max(...used) + 1;
}

export function nextEntryId(section: string, ids: string[]): string {
  return `${section}-${nextIndex(`${section}-`, ids)}`;
}

export function nextBulletId(entryId: string, ids: string[]): string {
  const prefix = `${entryId}-b-`;
  return `${prefix}${nextIndex(prefix, ids)}`;
}
