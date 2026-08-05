import { formatBytes } from "../lib/format";
import type { InspectItem } from "../screens/Uninstall";

/// A single associated-file row inside the mandatory uninstall review.
/// `checked` means "kept" (removed on confirm); unchecking marks it
/// deselected. Verified and Likely carry their own badge class so the two
/// evidence levels — and their different fate, permanent delete vs Trash —
/// stay visually distinguishable at a glance, not just in the label text.
export default function ItemRow({
  item,
  checked,
  disabled,
  onToggle,
}: {
  item: InspectItem;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const badgeClass = item.evidence === "Verified" ? "badge-verified" : "badge-likely";
  return (
    <li>
      <label className="check">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
        <span className="size">{item.path}</span>
      </label>
      <span className={`badge ${badgeClass}`}>{item.evidence}</span>
      <span className="size">{formatBytes(item.bytes)}</span>
    </li>
  );
}
