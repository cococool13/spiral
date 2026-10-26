import { useEffect, useState } from "react";
import { cacheSrc, listAccents, renderThumbnails } from "../api";
import { styleName } from "../lib/styleHints";
import type { Accent, ResumeDoc, Thumbnail } from "../lib/types";
import { useDebounced } from "../lib/useDebounced";
import { useRadioGroup } from "../lib/useRadioGroup";

function swatchFill(hex: string): string {
  if (hex.startsWith("var(") || hex.startsWith("#")) return hex;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`;
  return "var(--ink)";
}

interface TemplatesProps {
  doc: ResumeDoc;
  chosen: string;
  accent: string;
  onChoose: (id: string) => void;
  onAccent: (id: string) => void;
  onList: (ids: string[]) => void;
}

/** Your own resume in every template. ⌘1 to ⌘9 pick one. */
export function Templates({ doc, chosen, accent, onChoose, onAccent, onList }: TemplatesProps) {
  const settled = useDebounced(doc, 900);
  const [thumbs, setThumbs] = useState<Thumbnail[] | null>(null);
  const [accents, setAccents] = useState<Accent[]>([]);
  const [error, setError] = useState("");
  const styleProps = useRadioGroup((thumbs ?? []).map((t) => t.id), chosen, onChoose);
  const accentProps = useRadioGroup(accents.map((a) => a.id), accent, onAccent);

  useEffect(() => {
    listAccents()
      .then(setAccents)
      .catch(() => setAccents([]));
  }, []);

  useEffect(() => {
    let live = true;
    renderThumbnails(accent, settled)
      .then((next) => {
        if (!live) return;
        setThumbs(next);
        onList(next.map((thumb) => thumb.id));
        setError("");
      })
      .catch((e) => {
        if (live) setError(`The templates did not draw: ${e}. Edit a field to try again.`);
      });
    return () => {
      live = false;
    };
  }, [accent, settled, onList]);

  return (
    <footer className="strip">
      <div className="strip__styles" role="radiogroup" aria-label="Template">
        {error ? <p className="strip__quiet">{error}</p> : null}
        {thumbs === null && !error ? <p className="strip__quiet">Setting your resume in each template.</p> : null}
        {(thumbs ?? []).map((thumb, index) => (
          <button
            key={thumb.id}
            type="button"
            className="strip__style"
            aria-keyshortcuts={index < 9 ? `Meta+${index + 1}` : undefined}
            {...styleProps(thumb.id)}
          >
            {thumb.error ? (
              <span className="strip__failed">{thumb.error}</span>
            ) : (
              <img src={cacheSrc(thumb.file ?? "")} alt="" />
            )}
            <span className="strip__name">
              {thumb.name || styleName(thumb.id)}
              {index < 9 ? <kbd>⌘{index + 1}</kbd> : null}
            </span>
          </button>
        ))}
      </div>
      {accents.length > 0 ? (
        <div className="strip__accents" role="radiogroup" aria-label="Accent colour">
          {accents.map((swatch) => (
            <button
              key={swatch.id}
              type="button"
              className="accent"
              aria-label={styleName(swatch.id)}
              style={{ background: swatchFill(swatch.hex) }}
              {...accentProps(swatch.id)}
            />
          ))}
        </div>
      ) : null}
    </footer>
  );
}
