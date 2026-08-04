import { formatBytes } from "../lib/format";
import type { CleanReport } from "../screens/Clean";

export default function ResultReport({
  report,
  onDone,
}: {
  report: CleanReport;
  onDone: () => void;
}) {
  return (
    <section role="status">
      <h2>Reclaimed {formatBytes(report.measured_bytes)}</h2>
      <p>
        {report.removed} items removed
        {report.excluded > 0 && `, ${report.excluded} skipped by your exclusions`}
        {report.partially_removed > 0 &&
          `, ${report.partially_removed} partly removed`}
        .
      </p>
      {report.snapshot_note && <p role="note">{report.snapshot_note}</p>}
      {report.failed.length > 0 && (
        <>
          <h3>{report.failed.length} could not be removed</h3>
          <ul>
            {report.failed.map((f) => (
              <li key={f.path}>
                <span className="size">{f.path}</span> — {f.reason}
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" onClick={onDone}>Scan again</button>
    </section>
  );
}
