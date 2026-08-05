import { useState } from "react";
import { formatBytes } from "../lib/format";
import type { LeftoverItem } from "../screens/Uninstall";

/// A single leftover row in the Leftovers section: one bundle id, however
/// many paths it owns. `checked` means "kept" (removed on confirm);
/// unchecking marks it deselected — the same convention `ItemRow` uses for
/// the app-review sheet. The paths themselves stay hidden behind a
/// disclosure, mirroring `CategoryRow`'s "Show files" toggle on the Clean
/// screen, since a leftover with several locations can otherwise crowd the
/// row.
export default function LeftoverRow({
  item,
  checked,
  disabled,
  onToggle,
}: {
  item: LeftoverItem;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <label className="check">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
        <span className="size">{item.bundle_id}</span>
      </label>
      <span>
        {item.paths.length} path{item.paths.length === 1 ? "" : "s"}
      </span>
      <span className="size">{formatBytes(item.bytes)}</span>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide paths" : "Show paths"}
      </button>
      {open && (
        <ul>
          {item.paths.map((p) => (
            <li key={p} className="size">{p}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
