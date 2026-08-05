import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import AppRow from "../components/AppRow";
import ItemRow from "../components/ItemRow";
import { formatBytes } from "../lib/format";

// Field-for-field against `commands.rs`'s serde output — verified by reading
// `AppSummary`, `InspectItem`, `InspectResult` and `Evidence` there directly.
// `Evidence` is a plain unit-variant enum with no serde rename, so it
// serializes as its Rust variant name: "Verified" | "Likely".
export type Evidence = "Verified" | "Likely";

export interface AppSummary {
  name: string;
  bundle_id: string;
  bytes: number;
  handoff: string | null;
  running: boolean;
}

export interface InspectItem {
  path: string;
  bytes: number;
  evidence: Evidence;
}

export interface InspectResult {
  bundle_id: string;
  name: string;
  items: InspectItem[];
  handoff: string | null;
  running: boolean;
}

export interface FailedItem {
  path: string;
  reason: string;
}

export interface UninstallReport {
  removed: number;
  partially_removed: FailedItem[];
  excluded: number;
  failed: FailedItem[];
}

type Phase = "listing" | "inspecting" | "reviewing" | "running" | "done";

// The only two shapes `handoff_label` (commands.rs) ever produces: a literal
// `brew uninstall --cask <token>` command, or a prose sentence pointing at
// System Settings. `handoff` is a flat `String` on the wire, so this screen
// cannot structurally tell which one it has — it sniffs the one prefix the
// Rust side actually emits and always will for these two `Handoff` variants.
// This is a deliberate, documented trade-off rather than an oversight: see
// the task report for why a structured type was not requested instead.
function isHandoffCommand(handoff: string): boolean {
  return handoff.startsWith("brew ");
}

export default function Uninstall() {
  const [phase, setPhase] = useState<Phase>("listing");
  const [listLoading, setListLoading] = useState(true);
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [inspected, setInspected] = useState<InspectResult | null>(null);
  const [deselected, setDeselected] = useState<Set<number>>(new Set());
  const [report, setReport] = useState<UninstallReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which action a retry re-attempts. "list" and "inspect" errors replace the
  // whole screen (nothing else to show yet); a "run" error stays inside the
  // still-open review dialog, because the review the user already made is
  // still exactly right and should not be thrown away.
  const [errorOrigin, setErrorOrigin] = useState<"list" | "inspect" | "run" | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const list = useCallback(() => {
    setPhase("listing");
    setListLoading(true);
    setError(null);
    setErrorOrigin(null);
    invoke<AppSummary[]>("uninstall_list")
      .then((found) => {
        setApps(found);
        setListLoading(false);
      })
      .catch((e) => {
        setListLoading(false);
        setError(
          `Could not list installed applications: ${e}. Check Full Disk Access in System Settings, then try again.`,
        );
        setErrorOrigin("list");
      });
  }, []);

  useEffect(list, [list]);

  const inspect = (app: AppSummary) => {
    setPhase("inspecting");
    setError(null);
    setErrorOrigin(null);
    invoke<InspectResult>("uninstall_inspect", { bundleId: app.bundle_id })
      .then((result) => {
        setInspected(result);
        setDeselected(new Set());
        setPhase("reviewing");
      })
      .catch((e) => {
        setError(`Could not inspect ${app.name}: ${e}. Reopen the list and try again.`);
        setErrorOrigin("inspect");
        setPhase("listing");
      });
  };

  // Re-inspect the same app, in place, so a user who just quit it can prove
  // that to this screen without losing the review they were looking at.
  const recheck = () => {
    if (!inspected) return;
    invoke<InspectResult>("uninstall_inspect", { bundleId: inspected.bundle_id })
      .then((result) => {
        setInspected(result);
        setDeselected(new Set());
      })
      .catch((e) => {
        setError(`Could not recheck ${inspected.name}: ${e}. Reopen the list and try again.`);
        setErrorOrigin("inspect");
        setPhase("listing");
      });
  };

  const showDialog = inspected !== null && (phase === "reviewing" || phase === "running" || phase === "done");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (showDialog && !dialog.open) dialog.showModal();
    if (!showDialog && dialog.open) dialog.close();
  }, [showDialog]);

  const closeReview = () => {
    setInspected(null);
    setReport(null);
    setError(null);
    setErrorOrigin(null);
    setPhase("listing");
  };

  const toggle = (index: number) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const run = () => {
    if (!inspected) return;
    setPhase("running");
    setError(null);
    setErrorOrigin(null);
    invoke<UninstallReport>("uninstall_execute", {
      bundleId: inspected.bundle_id,
      deselected: [...deselected],
      displayed: inspected.items.map((item) => item.path),
    })
      .then((r) => {
        setReport(r);
        setPhase("done");
      })
      .catch((e) => {
        setError(`${e}`);
        setErrorOrigin("run");
        setPhase("reviewing");
      });
  };

  const finishDone = () => {
    closeReview();
    list();
  };

  // Full-page error: only reachable when there is nothing else on screen
  // worth preserving (the app list failed, or an inspect never opened the
  // review dialog in the first place).
  if (error && errorOrigin !== "run") {
    return (
      <section>
        <h1>Uninstall</h1>
        <p role="alert">{error}</p>
        <button type="button" onClick={list}>Try again</button>
      </section>
    );
  }

  const kept = inspected ? inspected.items.filter((_, i) => !deselected.has(i)) : [];
  const keptBytes = kept.reduce((sum, item) => sum + item.bytes, 0);
  const running = inspected?.running ?? false;
  const busy = phase === "inspecting" || phase === "running";

  return (
    <section>
      <h1>Uninstall</h1>
      {listLoading ? (
        <p>Looking for installed applications…</p>
      ) : apps.length === 0 ? (
        <p>No applications found under /Applications or your own ~/Applications.</p>
      ) : (
        <ul>
          {apps.map((app) => (
            <AppRow key={app.bundle_id} app={app} busy={busy} onInspect={inspect} />
          ))}
        </ul>
      )}
      {phase === "inspecting" && <p aria-live="polite">Looking at what belongs to this app…</p>}

      {inspected && (
        <dialog
          ref={dialogRef}
          aria-label={`Uninstall ${inspected.name}`}
          onCancel={(e) => {
            // Escape fires this natively, independent of any button's
            // disabled state. Mid-removal it must not drop the result the
            // in-flight call is about to deliver; on the result screen it
            // should behave like clicking Done, not like a bare dismiss.
            if (phase === "running") {
              e.preventDefault();
              return;
            }
            if (phase === "done") {
              finishDone();
              return;
            }
            closeReview();
          }}
        >
          {phase === "done" && report ? (
            <section role="status">
              <h2>
                {report.removed} item{report.removed === 1 ? "" : "s"} removed
              </h2>
              <p>
                {report.excluded > 0 && `${report.excluded} skipped by your exclusions. `}
                {report.partially_removed.length > 0 &&
                  `${report.partially_removed.length} only partly removed. `}
                {report.failed.length > 0 && `${report.failed.length} could not be removed.`}
              </p>
              {report.partially_removed.length > 0 && (
                <>
                  <h3>{report.partially_removed.length} only partly removed</h3>
                  <ul>
                    {report.partially_removed.map((f) => (
                      <li key={f.path}>
                        <span className="size">{f.path}</span> — {f.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
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
              <button type="button" autoFocus onClick={finishDone}>Done</button>
            </section>
          ) : (
            <>
              <h2>{inspected.name}</h2>

              {running && (
                <p role="alert">
                  {inspected.name} is currently running. Quit it, then recheck before continuing —
                  removing its files while it runs can fail partway or be undone the next time it
                  writes them.
                </p>
              )}
              {running && (
                <button type="button" onClick={recheck} disabled={phase === "running"}>
                  Recheck
                </button>
              )}

              {inspected.handoff ? (
                isHandoffCommand(inspected.handoff) ? (
                  <>
                    <p>
                      Spiral Clean cannot remove this app by deleting files. Run this command
                      yourself:
                    </p>
                    <pre>
                      <code>{inspected.handoff}</code>
                    </pre>
                  </>
                ) : (
                  <p>{inspected.handoff}</p>
                )
              ) : (
                <>
                  <p>
                    <strong>Verified</strong> items are removed permanently.{" "}
                    <strong>Likely</strong> items go to the Trash and can be recovered.
                  </p>
                  {inspected.items.length === 0 ? (
                    <p>No files elsewhere on this Mac were found to belong to this app.</p>
                  ) : (
                    <ul>
                      {inspected.items.map((item, index) => (
                        <ItemRow
                          key={item.path}
                          item={item}
                          checked={!deselected.has(index)}
                          disabled={phase === "running"}
                          onToggle={() => toggle(index)}
                        />
                      ))}
                    </ul>
                  )}
                  <p>
                    <strong className="size">{formatBytes(keptBytes)}</strong> selected — an
                    estimate.
                  </p>
                  {error && errorOrigin === "run" && <p role="alert">{error}</p>}
                  {phase === "running" ? (
                    <p aria-live="polite">Uninstalling…</p>
                  ) : (
                    <button
                      type="button"
                      onClick={run}
                      disabled={running || kept.length === 0}
                    >
                      Uninstall
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                autoFocus={!running}
                disabled={phase === "running"}
                onClick={closeReview}
              >
                Cancel
              </button>
            </>
          )}
        </dialog>
      )}
    </section>
  );
}
