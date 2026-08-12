import { useState } from "react";
import { saveBuiltDocument } from "../lib/ipc";
import type { BuildResult, ExportFormat } from "../lib/types";
import { Notice } from "../components/Notice";
import { useRadioGroup } from "../lib/useRadioGroup";

const FORMAT_NAME: Record<ExportFormat, string> = { pdf: "PDF", docx: "Word file" };

export function Result({
  versions,
  showing,
  format,
  canRewrite,
  onShow,
  onRewrite,
  onAnotherStyle,
}: {
  versions: BuildResult[];
  showing: number;
  format: ExportFormat;
  /** Only true when a model tier would actually run — a saved key, or the
   *  offline model installed. Otherwise there is nothing behind the button,
   *  so it is not shown at all. */
  canRewrite: boolean;
  onShow: (index: number) => void;
  onRewrite: () => void;
  onAnotherStyle: () => void;
}) {
  const [savedTo, setSavedTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const result = versions[showing];
  const labels = versions.map((_, index) => (index === 0 ? "First" : `Version ${index + 1}`));
  const versionProps = useRadioGroup(labels, labels[showing] ?? "", (label) =>
    onShow(labels.indexOf(label)),
  );

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
      <p className="panel__lede">{result.engine}</p>

      {versions.length > 1 ? (
        <div className="versions" role="radiogroup" aria-label="Versions">
          {labels.map((label) => (
            <button key={label} type="button" className="btn" {...versionProps(label)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Drawn as glyph outlines, so there is no text in it to read. Naming the
          region and saying where the words are beats a silent unlabelled blob. */}
      <div
        className="result__pages"
        role="img"
        aria-label={`Your resume, ${result.pages.length === 1 ? "one page" : `${result.pages.length} pages`}. The wording is on the Check step.`}
      >
        {result.pages.map((page, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: pages are ordinal
          <div
            key={index}
            className="result__page"
            aria-hidden="true"
            // Safe: our own renderer produced this SVG in process from the
            // user's own data. Nothing external can reach it.
            dangerouslySetInnerHTML={{ __html: page }}
          />
        ))}
      </div>

      {result.notes.map((note) => (
        <Notice key={note}>{note}</Notice>
      ))}

      {savedTo ? <Notice>Saved to {savedTo}</Notice> : null}
      {error ? <Notice tone="warn">{error}</Notice> : null}

      <div className="panel__actions">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>
          Save the {FORMAT_NAME[format]} to your computer
        </button>
        {canRewrite ? (
          <button type="button" className="btn" disabled={busy} onClick={onRewrite}>
            Rewrite the wording again
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onAnotherStyle}>
          Try another style
        </button>
      </div>
    </section>
  );
}
