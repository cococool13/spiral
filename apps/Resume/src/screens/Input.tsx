import { useState } from "react";
import { parsePastedText } from "../lib/ipc";
import { emptyDoc, type ResumeDoc } from "../lib/types";

export function Input({ onReady }: { onReady: (doc: ResumeDoc) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function read() {
    setBusy(true);
    setError("");
    try {
      onReady(await parsePastedText(text));
    } catch (e) {
      setError(`Could not read that text: ${e}. Try pasting it again.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel__title">Start with what you have</h2>
      <label className="field">
        <span className="field__label">Paste your resume</span>
        <textarea
          className="field__input field__input--tall"
          value={text}
          rows={16}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {error ? <p className="notice notice--warn">{error}</p> : null}
      <div className="panel__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={text.trim().length === 0 || busy}
          onClick={read}
        >
          Read it
        </button>
        <button type="button" className="btn" onClick={() => onReady(emptyDoc())}>
          Start from scratch
        </button>
      </div>
    </section>
  );
}
