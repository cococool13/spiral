import { formatBytes } from "../lib/format";
import type { AppSummary } from "../screens/Uninstall";

export default function AppRow({
  app,
  busy,
  onInspect,
}: {
  app: AppSummary;
  busy: boolean;
  onInspect: (app: AppSummary) => void;
}) {
  return (
    <li>
      <span>{app.name}</span>
      <span className="size">{formatBytes(app.bytes)}</span>
      {app.running && <span className="badge badge-warn">Running</span>}
      {app.handoff && <span className="badge badge-handoff">Needs handoff</span>}
      <button type="button" disabled={busy} onClick={() => onInspect(app)}>
        Review
      </button>
    </li>
  );
}
