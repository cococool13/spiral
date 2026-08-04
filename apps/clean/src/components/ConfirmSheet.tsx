import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { formatBytes } from "../lib/format";

const FOCUSABLE = 'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function ConfirmSheet({
  labels,
  bytes,
  onConfirm,
  onCancel,
}: {
  labels: string[];
  bytes: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Cancel is the safe default focus target for a destructive confirmation —
  // the one action that undoes the pause is the one you land on.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key !== "Tab" || !sheetRef.current) return;
    const focusable = sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    // Trap Tab within the sheet: wrap at either end instead of letting focus
    // escape to the categories and Clean button underneath.
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <section
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm clean"
      onKeyDown={onKeyDown}
    >
      <h2>Delete {formatBytes(bytes)} permanently?</h2>
      <p>
        These files are removed outright, not moved to the Trash. They rebuild
        themselves the next time an app needs them.
      </p>
      <ul>
        {labels.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <button type="button" onClick={onConfirm} disabled={labels.length === 0}>
        Delete permanently
      </button>
      <button type="button" ref={cancelRef} onClick={onCancel}>
        Cancel
      </button>
    </section>
  );
}
