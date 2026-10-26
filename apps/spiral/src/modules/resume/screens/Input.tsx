import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { importDroppedFile, importResumeFile, parsePastedText } from "../api";
import { scratchDoc, type ResumeDoc } from "../lib/types";
import { Notice } from "../components/Notice";

/** The empty state is one drop zone. The whole window takes the drop; the
 *  buttons are for people who would rather click. */
export function Input({
  onReady,
  savedAt,
  onOpenSaved,
  opening = false,
  openError = "",
}: {
  onReady: (doc: ResumeDoc, how?: "scratch") => void;
  savedAt?: string | null;
  onOpenSaved?: () => void;
  opening?: boolean;
  openError?: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    let webview;
    try {
      webview = getCurrentWebview();
    } catch {
      return;
    }
    webview
      .onDragDropEvent(async (event) => {
        if (cancelled) return;
        if (event.payload.type === "over") {
          setOver(true);
          return;
        }
        if (event.payload.type === "leave") {
          setOver(false);
          return;
        }
        setOver(false);
        const paths = event.payload.paths;
        const path = paths[0];
        if (!path) return;
        if (paths.length > 1) {
          setError("Drop one resume at a time. Spiral did not read any of these files.");
          return;
        }
        // The dropped file is read directly; the picker is only for Open a file.
        await run(() => importDroppedFile(path));
      })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        stop = unlisten;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
    // run only reads state setters and onReady.
  }, [onReady]);

  async function run(work: () => Promise<ResumeDoc | null>) {
    setBusy(true);
    setError("");
    try {
      const doc = await work();
      if (doc) onReady(doc);
    } catch (e) {
      setError(`${e}`);
    } finally {
      setBusy(false);
    }
  }

  const working = busy || opening;
  const problem = error || openError;

  if (paste) {
    const empty = text.trim().length === 0;
    return (
      <section className="drop drop--paste">
        <h2 className="visually-hidden">Paste your resume</h2>
        <label className="field drop__paste">
          <span>Paste your resume</span>
          <textarea value={text} rows={16} autoFocus onChange={(e) => setText(e.target.value)} />
        </label>
        {empty ? <Notice>Paste the resume text to continue.</Notice> : null}
        {working ? <Notice>Reading the pasted text on this Mac.</Notice> : null}
        {problem ? <Notice tone="warn">{problem}</Notice> : null}
        <div className="drop__actions">
          <button
            type="button"
            className="btn btn--primary"
            aria-disabled={empty || undefined}
            disabled={working}
            onClick={() => {
              if (empty) return;
              void run(() => parsePastedText(text));
            }}
          >
            Read the pasted text
          </button>
          <button type="button" className="btn" disabled={working} onClick={() => setPaste(false)}>
            Back
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="drop" data-over={over || undefined} aria-busy={working || undefined}>
      <div className="drop__body">
        <h2 className="drop__title">
          Drop a <em>resume</em>
        </h2>
        <p className="drop__note" id="import-file-note">
          PDF, Word or text. It is read on this Mac and nothing is uploaded.
        </p>
        <div className="drop__actions">
          <button
            type="button"
            className="btn btn--primary"
            aria-describedby="import-file-note"
            aria-keyshortcuts="Meta+O"
            disabled={working}
            onClick={() => void run(importResumeFile)}
          >
            Open a file
          </button>
          <button type="button" className="btn" disabled={working} onClick={() => setPaste(true)}>
            Paste text
          </button>
        </div>
        <p className="drop__quiet">
          No resume yet?{" "}
          <button type="button" className="link" disabled={working} onClick={() => onReady(scratchDoc(), "scratch")}>
            Start from scratch
          </button>
          {savedAt && onOpenSaved ? (
            <>
              {" "}
              Saved from {new Date(savedAt).toLocaleString()}.{" "}
              <button type="button" className="link" onClick={onOpenSaved}>
                Open it
              </button>
            </>
          ) : null}
        </p>
        {working ? <Notice>Reading the file on this Mac.</Notice> : null}
        {problem ? <Notice tone="warn">{problem}</Notice> : null}
      </div>
    </section>
  );
}
