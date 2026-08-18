import { useState } from "react";
import { saveBuiltDocument } from "../lib/ipc";
import type { BuildResult, ExportFormat } from "../lib/types";
import { Notice } from "../components/Notice";
import { useRadioGroup } from "../lib/useRadioGroup";

const FORMAT_NAME: Record<ExportFormat, string> = { pdf: "PDF", docx: "Word file" };

const COMMON = new Set(["Shorter bullets", "Stronger verbs", "More formal"]);

export function Result({
  versions,
  showing,
  format,
  canRewrite,
  onShow,
  onTweak,
  onAnotherStyle,
}: {
  versions: BuildResult[];
  showing: number;
  format: ExportFormat;
  canRewrite: boolean;
  onShow: (index: number) => void;
  onTweak: (aim: string) => void;
  onAnotherStyle: () => void;
}) {
  const [savedTo, setSavedTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tweakOpen, setTweakOpen] = useState(false);
  const [aim, setAim] = useState("");
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
    <section className="stage stage--result">
      <h2 className="visually-hidden">Your resume</h2>
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

      <div className="panel__actions panel__actions--dock">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>
          Save the {FORMAT_NAME[format]} to your computer
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => setTweakOpen((open) => !open)}>
          Tweak
        </button>
        <button type="button" className="btn" onClick={onAnotherStyle}>
          Try another style
        </button>
      </div>

      {tweakOpen ? (
        <form
          className="tweak"
          onSubmit={(e) => {
            e.preventDefault();
            const next = aim.trim();
            if (!next) return;
            if (!canRewrite) {
              setError("Tweaks that rewrite wording need a model in Settings. The free pass only shortens by rule.");
              return;
            }
            setError("");
            setTweakOpen(false);
            onTweak(next);
          }}
        >
          <label className="field">
            <span className="field__label">What should change</span>
            <select
              className="field__input"
              value={COMMON.has(aim) ? aim : ""}
              onChange={(e) => setAim(e.target.value)}
            >
              <option value="">A common tweak…</option>
              {[...COMMON].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Or type it</span>
            <input
              className="field__input"
              type="text"
              value={aim}
              onChange={(e) => setAim(e.target.value)}
              maxLength={200}
            />
          </label>
          <p className="tweak__note">
            Wording only. Titles, employers, dates and numbers stay as they are.
          </p>
          {canRewrite ? null : (
            <Notice>A model in Settings is what rewrites. Without one, Tweak has nothing to run.</Notice>
          )}
          <div className="panel__actions">
            <button type="submit" className="btn btn--primary" disabled={busy || !aim.trim()}>
              Apply the tweak
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
