import { useEffect, useState } from "react";

/** A value that settles rather than tracking every keystroke.
 *
 *  Both things watching the document — the autosave and the wording review —
 *  are whole-document operations: one writes the file, the other re-tightens
 *  every bullet over IPC. Neither is useful mid-word. */
export function useDebounced<T>(value: T, ms = 400): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return settled;
}
