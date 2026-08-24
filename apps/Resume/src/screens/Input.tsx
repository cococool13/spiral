import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { importDroppedFile, importResumeFile, parsePastedText } from "../lib/ipc";
import { scratchDoc, type ResumeDoc } from "../lib/types";
import { Notice } from "../components/Notice";

export function Input({
  onReady,
  savedAt,
  onOpenSaved,
}: {
  onReady: (doc: ResumeDoc, how?: "scratch") => void;
  savedAt?: string | null;
  onOpenSaved?: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState(false);

  // Dropping the file you already have is the shortest path through this app,
  // so the whole window is the target rather than a small rectangle.
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    getCurrentWebview()
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
        const path = event.payload.paths[0];
        if (!path) return;
        setBusy(true);
        setError("");
        try {
          onReady(await importDroppedFile(path));
        } catch (e) {
          setError(`${e}`);
        } finally {
          setBusy(false);
        }
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

  if (paste) {
    return (
      <section className="stage">
        <h2 className="visually-hidden">Paste your resume</h2>
        <label className="field stage__paste">
          <span className="field__label">Paste your resume</span>
          <textarea
            className="field__input field__input--tall"
            value={text}
            rows={16}
            autoFocus
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {error ? <Notice tone="warn">{error}</Notice> : null}
        <div className="panel__actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={text.trim().length === 0 || busy}
            onClick={() => run(() => parsePastedText(text))}
          >
            Read the pasted text
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => setPaste(false)}>
            Back
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={over ? "stage stage--drop" : "stage"}>
      <h2 className="visually-hidden">Import</h2>
      <div className="stage-tiles">
        <button
          type="button"
          className="stage-tile"
          aria-label="Upload a file"
          disabled={busy}
          onClick={() => run(importResumeFile)}
        >
          <span className="stage-tile__name">Upload a file</span>
          <span className="stage-tile__note">PDF, Word or text. Drag and drop, or click.</span>
        </button>
        <button
          type="button"
          className="stage-tile"
          aria-label="Start from scratch"
          disabled={busy}
          onClick={() => onReady(scratchDoc(), "scratch")}
        >
          <span className="stage-tile__name">Start from scratch</span>
          <span className="stage-tile__note">Type the facts on the next screen. Nothing is invented.</span>
        </button>
        <button
          type="button"
          className="stage-tile"
          aria-label="Paste contents"
          disabled={busy}
          onClick={() => setPaste(true)}
        >
          <span className="stage-tile__name">Paste contents</span>
          <span className="stage-tile__note">A two-column PDF may look jumbled — fix it on Check.</span>
        </button>
      </div>
      {savedAt && onOpenSaved ? (
        <p className="stage__saved">
          Saved from {new Date(savedAt).toLocaleString()}.{" "}
          <button type="button" className="btn btn--quiet" onClick={onOpenSaved}>
            Open it
          </button>
        </p>
      ) : null}
      {error ? <Notice tone="warn">{error}</Notice> : null}
    </section>
  );
}
