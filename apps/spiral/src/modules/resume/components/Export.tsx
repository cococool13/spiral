import { useEffect, useRef, useState } from "react";
import { noteResumeExported } from "../../../shell/analytics/client";
import { exportBoth, type ExportReply } from "../api";
import type { Draft } from "../lib/types";

export type Phase =
  | { kind: "idle" }
  | { kind: "working"; line: string; percent: number }
  | { kind: "confirm"; files: string[]; dir: string }
  | { kind: "done"; saved: string[]; dir: string; engine: string; notes: string[] }
  | { kind: "error"; message: string };

const TYPESETTING = "Typesetting the PDF and the Word file on this Mac";

/** One Export: one folder, both formats, named after the person on the resume.
 *  Files already there are only replaced after an in-app yes. */
export function useExport(draft: Draft) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function attempt(dir: string, replace: boolean) {
    setPhase({
      kind: "working",
      line: dir ? TYPESETTING : "Choose a folder for the PDF and the Word file",
      percent: 0,
    });
    let reply: ExportReply | null;
    try {
      reply = await exportBoth(draft, dir, replace, (percent) =>
        setPhase({ kind: "working", line: TYPESETTING, percent }),
      );
    } catch (err: unknown) {
      setPhase({
        kind: "error",
        message: `${err instanceof Error ? err.message : String(err)} Nothing was saved. Try Export again.`,
      });
      return;
    }
    if (!reply) {
      setPhase({ kind: "idle" });
      return;
    }
    if (reply.kind === "conflict") {
      setPhase({ kind: "confirm", files: reply.files, dir: reply.dir });
      return;
    }
    noteResumeExported();
    setPhase({ kind: "done", saved: reply.files, dir: reply.dir, engine: reply.engine, notes: reply.notes });
  }

  async function run() {
    if (phase.kind === "working") return;
    await attempt("", false);
  }

  async function replace() {
    if (phase.kind !== "confirm") return;
    await attempt(phase.dir, true);
  }

  return { phase, run, replace, dismiss: () => setPhase({ kind: "idle" }) };
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

function both(files: string[]): string {
  return files.length === 2 ? `${files[0]} and ${files[1]}` : files.join(", ");
}

export function ExportSheet({
  phase,
  onClose,
  onReplace,
}: {
  phase: Phase;
  onClose: () => void;
  onReplace: () => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // The safe answer has focus, so Return never replaces a file by accident.
    if (phase.kind === "confirm") keepRef.current?.focus();
  }, [phase.kind]);

  if (phase.kind === "idle") return null;
  return (
    <div
      className="export"
      role={phase.kind === "error" ? "alert" : phase.kind === "confirm" ? "alertdialog" : "status"}
      aria-labelledby={phase.kind === "confirm" ? "export-confirm" : undefined}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || phase.kind === "working") return;
        event.stopPropagation();
        onClose();
      }}
    >
      {phase.kind === "working" ? (
        <>
          <p className="export__line">{phase.line}</p>
          <progress className="export__bar" max={100} value={phase.percent} aria-label="Export progress" />
        </>
      ) : null}
      {phase.kind === "confirm" ? (
        <>
          <p className="export__line" id="export-confirm">
            {phase.files.length === 1 ? `${phase.files[0]} is` : `${both(phase.files)} are`} already in that folder.
            Replace {phase.files.length === 1 ? "it" : "them"}?
          </p>
          <p className="export__path">{phase.dir}</p>
          <div className="export__actions">
            <button type="button" className="btn" ref={keepRef} onClick={onClose}>
              Keep the old files
            </button>
            <button type="button" className="btn btn--primary" onClick={onReplace}>
              Replace
            </button>
          </div>
        </>
      ) : null}
      {phase.kind === "done" ? (
        <>
          <p className="export__line">Saved the PDF and the Word file. Finder shows them.</p>
          {phase.saved.map((path) => (
            <p className="export__path" key={path} title={path}>
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
