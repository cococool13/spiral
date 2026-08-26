import { useEffect, useState } from "react";
import { listAccents, renderThumbnails } from "../lib/ipc";
import { recommendTemplate } from "../lib/recommend";
import { STYLE_HINTS, styleName } from "../lib/styleHints";
import type { Accent, ResumeDoc, Thumbnail } from "../lib/types";
import { Notice } from "../components/Notice";
import { useRadioGroup } from "../lib/useRadioGroup";

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
  const [draw, setDraw] = useState(0);
  const recommended = recommendTemplate(doc);

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
    renderThumbnails(accent, doc)
      .then((next) => {
        if (!current) return;
        setThumbnails(next);
        setError("");
      })
      .catch((e) => {
        if (current) setError(`Could not draw the styles: ${e}. Try again.`);
      });
    return () => {
      current = false;
    };
  }, [accent, doc, draw]);

  if (error) {
    return (
      <section className="panel">
        <h2 className="panel__title">Pick a style</h2>
        <Notice tone="warn">{error}</Notice>
        <div className="panel__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setError("");
              setThumbnails(null);
              setDraw((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">Pick a style</h2>
      {thumbnails === null ? (
        <Notice>Setting twelve styles…</Notice>
      ) : (
        <>
          <div className="panel__actions">
            <button
              type="button"
              className="btn"
              onClick={() => onChoose(recommended)}
            >
              Pick one that fits this resume
            </button>
          </div>
          <div className="styles" role="radiogroup" aria-label="Resume style">
            {thumbnails.map((thumbnail) => (
              <button
                key={thumbnail.id}
                type="button"
                className={
                  thumbnail.id === recommended ? "style-card style-card--fit" : "style-card"
                }
                {...styleProps(thumbnail.id)}
              >
                {thumbnail.error ? (
                  <span className="style-card__failed">{thumbnail.error}</span>
                ) : (
                  <span
                    className="style-card__page"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: thumbnail.svg }}
                  />
                )}
                <span className="style-card__meta">
                  <span className="style-card__name">
                    {thumbnail.name}
                    {thumbnail.id === recommended ? " · fits this resume" : ""}
                  </span>
                  {STYLE_HINTS[thumbnail.id] ? (
                    <ul className="style-card__hint">
                      {STYLE_HINTS[thumbnail.id].map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <h3 className="panel__heading">Accent</h3>
      <div className="accents" role="radiogroup" aria-label="Accent colour">
        {accents.map((swatch) => (
          <button
            key={swatch.id}
            type="button"
            aria-label={styleName(swatch.id)}
            className="accent"
            style={{ background: swatch.hex }}
            {...accentProps(swatch.id)}
          />
        ))}
      </div>

      {chosen === "" ? <Notice>Pick a style to carry on.</Notice> : null}

      <div className="panel__actions panel__actions--dock">
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
