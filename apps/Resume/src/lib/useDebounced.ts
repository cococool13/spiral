import { useEffect, useState } from "react";

/** A value that settles rather than tracking every keystroke.
 *
 *  Both things watching the document — the autosave and the wording review —
 *  used to fire once per character typed. A 40-character summary meant 40 disk
 *  writes and 40 full-document round trips through IPC, each of which
 *  re-tightens every bullet. Neither is useful mid-word. */
export function useDebounced<T>(value: T, ms = 400): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return settled;
}
