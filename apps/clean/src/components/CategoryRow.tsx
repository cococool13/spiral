import { useState } from "react";
import { formatBytes } from "../lib/format";
import type { CategoryResult } from "../screens/Clean";

export default function CategoryRow({
  result,
  checked,
  onToggle,
}: {
  result: CategoryResult;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // `clean_scan` truncates `paths` to a preview cap at the command boundary,
  // so `paths.length` can never exceed it — `items` is the true file count,
  // and the gap between the two is what the preview list left out.
  const hiddenCount = result.items - result.paths.length;
  return (
    <li>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={() => onToggle(result.id)} />
        {result.label}
      </label>
      <span className="size">{formatBytes(result.bytes)}</span>
      <span>{result.items} items</span>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide files" : "Show files"}
      </button>
      {open && (
        <ul>
          {result.paths.map((p) => (
            <li key={p} className="size">{p}</li>
          ))}
          {hiddenCount > 0 && <li>and {hiddenCount} more</li>}
        </ul>
      )}
    </li>
  );
}
