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
  return (
    <section role="dialog" aria-modal="true" aria-label="Confirm clean">
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
      <button type="button" onClick={onConfirm}>Delete permanently</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </section>
  );
}
