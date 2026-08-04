import { useEffect, useRef } from "react";
import { formatBytes } from "../lib/format";

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
  const dialogRef = useRef<HTMLDialogElement>(null);

  // showModal() is what gives this real modality — focus containment,
  // Escape-to-close, an inert background, and a ::backdrop — all from the
  // platform, not hand-rolled. The dialog only ever mounts while the confirm
  // phase is active, so opening it on mount and closing it on unmount tracks
  // that lifecycle exactly.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={dialogRef} aria-label="Confirm clean" onCancel={onCancel}>
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
      {/* Cancel is the safe default focus target for a destructive
          confirmation — autofocus lands here, not on the destructive button. */}
      <button type="button" autoFocus onClick={onCancel}>
        Cancel
      </button>
    </dialog>
  );
}
