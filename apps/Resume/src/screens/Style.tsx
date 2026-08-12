import { useEffect, useState } from "react";
import { renderThumbnails } from "../lib/ipc";
import type { ResumeDoc, Thumbnail } from "../lib/types";

export function Style({
  doc,
  chosen,
  onChoose,
  onContinue,
}: {
  doc: ResumeDoc;
  chosen: string;
  onChoose: (id: string) => void;
  onContinue: () => void;
}) {
  const [thumbnails, setThumbnails] = useState<Thumbnail[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    renderThumbnails(doc)
      .then((next) => {
        if (current) setThumbnails(next);
      })
      .catch((e) => {
        if (current) setError(`Could not draw the styles: ${e}. Go back and try again.`);
      });
    return () => {
      current = false;
    };
  }, [doc]);

  if (error) {
    return (
      <section className="panel">
        <h2 className="panel__title">Pick a style</h2>
        <p className="notice notice--warn">{error}</p>
      </section>
    );
  }

  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">Pick a style</h2>
      <p className="panel__lede">Every one of these is your resume, not a sample.</p>

      <div className="styles" role="radiogroup" aria-label="Resume style">
        {thumbnails === null
          ? <p className="notice">Setting your resume in five styles…</p>
          : thumbnails.map((thumbnail) => (
              <button
                key={thumbnail.id}
                type="button"
                role="radio"
                aria-checked={chosen === thumbnail.id}
                className="style-card"
                onClick={() => onChoose(thumbnail.id)}
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

      <div className="panel__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={chosen === ""}
          onClick={onContinue}
        >
          Use this style
        </button>
      </div>
    </section>
  );
}
