import { useState } from "react";
import { cacheSrc, saveBuiltDocument } from "../api";
import { noteResumeExported } from "../../../shell/analytics/client";
import type { BuiltVersion, ExportFormat } from "../lib/types";
import { Notice } from "../components/Notice";

const FORMAT_NAME: Record<ExportFormat, string> = { pdf: "PDF", docx: "Word file" };

export function Result({
  versions,
  format,
  onAnotherStyle,
}: {
  versions: BuiltVersion[];
  format: ExportFormat;
  onAnotherStyle: () => void;
}) {
  const [savedTo, setSavedTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const result = versions[versions.length - 1];

  async function save() {
    setBusy(true);
    setError("");
    try {
      const path = await saveBuiltDocument(result.suggestedName);
      if (path) {
        setSavedTo(path);
        noteResumeExported();
      }
    } catch (e) {
      setError(`${e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stage stage--result">
      <h2 className="visually-hidden">Your resume</h2>
      <p className="panel__lede">{result.engine}</p>

      <div
        className="result__pages"
        role="img"
        aria-label={`Your resume, ${result.pages.length === 1 ? "one page" : `${result.pages.length} pages`}. The wording is on the Details step.`}
      >
        {result.pages.map((page, index) =>
          page.trimStart().startsWith("<") ? (
            <div key={page.slice(0, 24) + index} className="result__page" aria-hidden="true" dangerouslySetInnerHTML={{ __html: page }} />
          ) : (
            <img key={page} className="result__page" alt="" src={cacheSrc(page)} />
          ),
        )}
      </div>

      {result.notes.map((note) => (
        <Notice key={note}>{note}</Notice>
      ))}

      {savedTo ? <Notice>Saved to {savedTo}</Notice> : null}
      {error ? <Notice tone="warn">{error}</Notice> : null}

      <div className="panel__actions panel__actions--dock">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>
          Save the {FORMAT_NAME[format]} to your computer
        </button>
        <button type="button" className="btn" onClick={onAnotherStyle}>
          Try another style
        </button>
      </div>
    </section>
  );
}
