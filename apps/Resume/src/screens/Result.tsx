import { useState } from "react";
import { saveBuiltDocument } from "../lib/ipc";
import type { BuildResult, ExportFormat } from "../lib/types";

const FORMAT_NAME: Record<ExportFormat, string> = { pdf: "PDF", docx: "Word file" };

export function Result({
  result,
  format,
  onAnotherStyle,
}: {
  result: BuildResult;
  format: ExportFormat;
  onAnotherStyle: () => void;
}) {
  const [savedTo, setSavedTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const path = await saveBuiltDocument();
      // null means the user closed the dialog. Cancelling is not a failure, so
      // nothing is said about it.
      if (path) setSavedTo(path);
    } catch (e) {
      setError(`${e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">Your resume</h2>

      <div className="result__pages">
        {result.pages.map((page, index) => (
          <div
            // Pages have no identity beyond their order, and the list is
            // replaced wholesale on every build.
            // biome-ignore lint/suspicious/noArrayIndexKey: pages are ordinal
            key={index}
            className="result__page"
            aria-hidden="true"
            // Safe: our own renderer produced this SVG in process from the
            // user's own data. Nothing external can reach it.
            dangerouslySetInnerHTML={{ __html: page }}
          />
        ))}
      </div>

      {savedTo ? <p className="notice">Saved to {savedTo}</p> : null}
      {error ? <p className="notice notice--warn">{error}</p> : null}

      <div className="panel__actions">
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
