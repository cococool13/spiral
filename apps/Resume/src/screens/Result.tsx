import { useState } from "react";
import { saveBuiltDocument } from "../lib/ipc";
import type { BuiltVersion, ExportFormat } from "../lib/types";
import { Notice } from "../components/Notice";
import { useRadioGroup } from "../lib/useRadioGroup";

const FORMAT_NAME: Record<ExportFormat, string> = { pdf: "PDF", docx: "Word file" };

function styleLabels(versions: BuiltVersion[]): string[] {
  const totals = new Map<string, number>();
  for (const version of versions) {
    totals.set(version.style, (totals.get(version.style) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return versions.map((version) => {
    const n = (seen.get(version.style) ?? 0) + 1;
    seen.set(version.style, n);
    return (totals.get(version.style) ?? 1) > 1 ? `${version.style} (${n})` : version.style;
  });
}

export function Result({
  versions,
  showing,
  format,
  onShow,
  onAnotherStyle,
}: {
  versions: BuiltVersion[];
  showing: number;
  format: ExportFormat;
  onShow: (index: number) => void;
  onAnotherStyle: () => void;
}) {
  const [savedTo, setSavedTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const result = versions[showing];
  const labels = styleLabels(versions);
  const keys = versions.map((_, index) => String(index));
  const versionProps = useRadioGroup(keys, keys[showing] ?? "", (key) => onShow(Number(key)));

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
    <section className="stage stage--result">
      <h2 className="visually-hidden">Your resume</h2>
      <p className="panel__lede">{result.engine}</p>

      {versions.length > 1 ? (
        <div className="versions" role="radiogroup" aria-label="Styles">
          {keys.map((key, index) => (
            <button key={key} type="button" className="btn" {...versionProps(key)}>
              {labels[index]}
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
