import { useEffect, useState } from "react";
import { listAccents, renderThumbnails } from "../lib/ipc";
import type { Accent, ResumeDoc, Thumbnail } from "../lib/types";
import { Notice } from "../components/Notice";
import { useRadioGroup } from "../lib/useRadioGroup";

/** The swatches are colours with no visible label, so the accessible name is
 *  the only name they have. "oxblood" is an id; "Oxblood" is a name. */
const named = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

export function Style({
  doc,
  chosen,
  accent,
  onChoose,
  onChooseAccent,
  onContinue,
}: {
  doc: ResumeDoc;
  chosen: string;
  accent: string;
  onChoose: (id: string) => void;
  onChooseAccent: (id: string) => void;
  onContinue: () => void;
}) {
  const [thumbnails, setThumbnails] = useState<Thumbnail[] | null>(null);
  const [accents, setAccents] = useState<Accent[]>([]);
  const [error, setError] = useState("");

  const styleProps = useRadioGroup(
    (thumbnails ?? []).map((t) => t.id),
    chosen,
    onChoose,
  );
  const accentProps = useRadioGroup(
    accents.map((a) => a.id),
    accent,
    onChooseAccent,
  );

  useEffect(() => {
    listAccents()
      .then(setAccents)
      .catch(() => setAccents([]));
  }, []);

  useEffect(() => {
    let current = true;
    renderThumbnails(doc, accent)
      .then((next) => {
        if (current) setThumbnails(next);
      })
      .catch((e) => {
        if (current) setError(`Could not draw the styles: ${e}. Go back and try again.`);
      });
    return () => {
      current = false;
    };
  }, [doc, accent]);

  if (error) {
    return (
      <section className="panel">
        <h2 className="panel__title">Pick a style</h2>
        <Notice tone="warn">{error}</Notice>
      </section>
    );
  }

  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">Pick a style</h2>
      {thumbnails === null ? (
        <Notice>Setting your resume in twelve styles…</Notice>
      ) : (
        <div className="styles" role="radiogroup" aria-label="Resume style">
          {thumbnails.map((thumbnail) => (
              <button
                key={thumbnail.id}
                type="button"
                className="style-card"
                {...styleProps(thumbnail.id)}
              >
                {thumbnail.error ? (
                  // Not aria-hidden: a card that failed has to say so out loud.
                  <span className="style-card__failed">{thumbnail.error}</span>
                ) : (
                  <span
                    className="style-card__page"
                    aria-hidden="true"
                    // Safe: this SVG comes from our own Typst renderer, in
                    // process, from data the user typed. No third-party markup
                    // can reach it — the app makes no network requests at all.
                    dangerouslySetInnerHTML={{ __html: thumbnail.svg }}
                  />
                )}
                <span className="style-card__name">{thumbnail.name}</span>
              </button>
            ))}
        </div>
      )}

      <h3 className="panel__heading">Accent</h3>
      <div className="accents" role="radiogroup" aria-label="Accent colour">
        {accents.map((swatch) => (
          <button
            key={swatch.id}
            type="button"
            aria-label={named(swatch.id)}
            className="accent"
            style={{ background: swatch.hex }}
            {...accentProps(swatch.id)}
          />
        ))}
      </div>

      {chosen === "" ? <Notice>Pick a style to carry on.</Notice> : null}

      <div className="panel__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => chosen !== "" && onContinue()}
          aria-disabled={chosen === ""}
        >
          Use this style
        </button>
      </div>
    </section>
  );
}
