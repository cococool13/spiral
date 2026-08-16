import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { importDroppedFile, importResumeFile, parsePastedText } from "../lib/ipc";
import { emptyDoc, type ResumeDoc } from "../lib/types";
import { Notice } from "../components/Notice";

export function Input({ onReady }: { onReady: (doc: ResumeDoc) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);

  // Dropping the file you already have is the shortest path through this app,
  // so the whole window is the target rather than a small rectangle.
  useEffect(() => {
    // `cancelled` matters as much as `stop`: registering is async, so a cleanup
    // that runs before the handle resolves would otherwise leave the listener
    // attached forever, and every re-registration would stack another one.
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
      // null means the picker was dismissed. That is not a failure and says
      // nothing to the user.
      if (doc) onReady(doc);
    } catch (e) {
      setError(`${e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={over ? "panel panel--drop" : "panel"}>
      <h2 className="panel__title">Start with what you have</h2>

      <div className="panel__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => run(importResumeFile)}
        >
          Choose a file
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => onReady(emptyDoc())}>
          Start from scratch
        </button>
      </div>
      <p className="panel__lede">
        PDF, Word or a text file, or drop one on this window. Two-column PDFs sometimes come out
        jumbled — the next screen is where you fix that.
      </p>

      <label className="field">
        <span className="field__label">Or paste your resume</span>
        <textarea
          className="field__input field__input--tall"
          value={text}
          rows={14}
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      <div className="panel__actions">
        <button
          type="button"
          className="btn"
          disabled={text.trim().length === 0 || busy}
          onClick={() => run(() => parsePastedText(text))}
        >
          Read the pasted text
        </button>
      </div>
    </section>
  );
}
