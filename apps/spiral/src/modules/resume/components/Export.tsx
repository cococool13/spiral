import { useState } from "react";
import { noteResumeExported } from "../../../shell/analytics/client";
import { buildDocument, saveBuiltDocument } from "../api";
import type { BuildResult, Draft, ExportFormat } from "../lib/types";

type Phase =
  | { kind: "idle" }
  | { kind: "working"; line: string; percent: number }
  | { kind: "done"; saved: string[]; engine: string; notes: string[] }
  | { kind: "error"; message: string };

const NAMES: Record<ExportFormat, string> = { pdf: "PDF", docx: "Word file" };

/** One Export. Builds the PDF, asks where to save it, then the Word file.
 *  Cancelling a save stops there and says what was saved. */
export function useExport(draft: Draft) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function run() {
    if (phase.kind === "working") return;
    const saved: string[] = [];
    let last: BuildResult | null = null;
    const notes = new Set<string>();
    try {
      for (const format of ["pdf", "docx"] as const) {
        setPhase({ kind: "working", line: `Typesetting the ${NAMES[format]} on this Mac`, percent: 0 });
        const built = await buildDocument({ ...draft, format }, (progress) =>
          setPhase({
            kind: "working",
            line: `Typesetting the ${NAMES[format]} on this Mac`,
            percent: progress.percent,
          }),
        );
        last = built;
        for (const note of built.notes) notes.add(note);
        setPhase({ kind: "working", line: `Choose where to save the ${NAMES[format]}`, percent: 100 });
        const path = await saveBuiltDocument(built.suggestedName);
        if (!path) break;
        saved.push(path);
      }
      if (saved.length > 0) noteResumeExported();
      setPhase({ kind: "done", saved, engine: last?.engine ?? "", notes: [...notes] });
    } catch (err: unknown) {
      setPhase({
        kind: "error",
        message: `${err instanceof Error ? err.message : String(err)} Nothing else was saved. Try Export again.`,
      });
    }
  }

  return { phase, run, dismiss: () => setPhase({ kind: "idle" }) };
}

export function ExportButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn btn--primary"
      aria-keyshortcuts="Meta+E"
      aria-disabled={busy || undefined}
      onClick={onClick}
    >
      Export PDF + DOCX
    </button>
  );
}

export function ExportSheet({ phase, onClose }: { phase: Phase; onClose: () => void }) {
  if (phase.kind === "idle") return null;
  return (
    <div className="export" role={phase.kind === "error" ? "alert" : "status"}>
      {phase.kind === "working" ? (
        <>
          <p className="export__line">{phase.line}</p>
          <progress className="export__bar" max={100} value={phase.percent} aria-label="Export progress" />
        </>
      ) : null}
      {phase.kind === "done" ? (
        <>
          <p className="export__line">
            {phase.saved.length === 0
              ? "Nothing was saved."
              : phase.saved.length === 1
                ? "Saved one file. The Word file was not saved."
                : "Saved the PDF and the Word file."}
          </p>
          {phase.saved.map((path) => (
            <p className="export__path" key={path}>
              {path}
            </p>
          ))}
          {phase.engine ? <p className="export__quiet">{phase.engine}</p> : null}
          {phase.notes.map((note) => (
            <p className="export__quiet" key={note}>
              {note}
            </p>
          ))}
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </>
      ) : null}
      {phase.kind === "error" ? (
        <>
          <p className="export__line">{phase.message}</p>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      ) : null}
    </div>
  );
}
