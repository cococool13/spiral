import { useState, type FormEvent } from "react";
import { Button } from "../../ui/Button";
import { sourceKeySet } from "./api";
import { errorCopy } from "./errors";
import { FILTERS, PALETTE, introSentence, swatchFill } from "./catalog";
import type { SourceFilter, SourceInfo } from "./types";

interface SourceFilterChipsProps {
  value: SourceFilter;
  onChange: (value: SourceFilter) => void;
}

/** Where pictures come from. Groups ask several sources at once. */
export function SourceFilterChips({ value, onChange }: SourceFilterChipsProps) {
  return (
    <div className="chips" role="radiogroup" aria-label="Source">
      {FILTERS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          role="radio"
          className="chip"
          aria-checked={value === chip.id}
          onClick={() => onChange(chip.id)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

interface PaletteSwatchesProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

/** Wallhaven's colour filter, behind one button so the row stays quiet. */
export function PaletteSwatches({ value, onChange }: PaletteSwatchesProps) {
  const [open, setOpen] = useState(false);
  const picked = PALETTE.find((entry) => entry.hex === value);
  return (
    <div className="palette">
      <button
        type="button"
        className="chip chip--colour"
        aria-expanded={open}
        aria-controls="palette-swatches"
        onClick={() => setOpen(!open)}
      >
        {picked ? <span className="palette__dot" style={{ background: swatchFill(picked.hex) }} aria-hidden="true" /> : null}
        {picked ? picked.name : "Colour"}
      </button>
      {open ? (
        <div className="swatches swatches--palette" id="palette-swatches" role="group" aria-label="Colour">
          {PALETTE.map((entry) => (
            <button
              key={entry.hex}
              type="button"
              className="swatch"
              aria-label={entry.name}
              aria-pressed={value === entry.hex}
              style={{ background: swatchFill(entry.hex) }}
              onClick={() => onChange(value === entry.hex ? null : entry.hex)}
            />
          ))}
          {value ? (
            <button type="button" className="link" onClick={() => onChange(null)}>
              Any colour
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface SourceIntroProps {
  ids: string[];
  infos: SourceInfo[];
  onContinue: () => void;
  onBack: () => void;
}

/** Said once, before a source's first request. */
export function SourceIntro({ ids, infos, onContinue, onBack }: SourceIntroProps) {
  const named = infos.filter((info) => ids.includes(info.id));
  return (
    <section className="intro" aria-labelledby="intro-title">
      <h2 className="intro__title" id="intro-title">
        Before Spiral asks
      </h2>
      <p className="intro__lede">{introSentence(ids, infos)}</p>
      <ul className="intro__list">
        {named.map((info) => (
          <li key={info.id}>
            <span className="intro__name">{info.name}</span>
            <span className="intro__licence">{info.licence}</span>
          </li>
        ))}
      </ul>
      <div className="intro__actions">
        <Button variant="primary" onClick={onContinue} autoFocus>
          Continue
        </Button>
        <Button onClick={onBack}>Back to Wallhaven</Button>
      </div>
    </section>
  );
}

interface SourceKeysProps {
  infos: SourceInfo[];
  onSaved: (message: string) => void;
}

/** Optional keys a person brings for sources that offer them. A key stays on
 *  this computer and goes only to its own source. */
export function SourceKeys({ infos, onSaved }: SourceKeysProps) {
  const keyed = infos.filter((info) => info.optionalKey);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  if (keyed.length === 0) return null;
  return (
    <>
      {keyed.map((info) => {
        async function save(event: FormEvent) {
          event.preventDefault();
          setError(undefined);
          try {
            await sourceKeySet(info.id, draft.trim() === "" ? null : draft.trim());
            setDraft("");
            onSaved(draft.trim() === "" ? `Removed your ${info.name} key.` : `Saved your ${info.name} key on this computer.`);
          } catch (err: unknown) {
            setError(
              String(err).startsWith("bad_response")
                ? "That key is not 20 to 64 letters and digits. Nothing was saved."
                : errorCopy(err, info.name),
            );
          }
        }
        return (
          <form key={info.id} className="source-key" onSubmit={save}>
            <label className="source-key__label" htmlFor={`key-${info.id}`}>
              Your {info.name} key {info.keyed ? "(saved)" : "(optional)"}
            </label>
            <p className="source-key__hint">
              Without one, Spiral uses the shared demo key, about 10 searches an hour. A free key from api.data.gov
              raises that. It is sent only to {info.hosts[0] ?? info.name}.
            </p>
            <div className="source-key__row">
              <input
                id={`key-${info.id}`}
                className="source-key__input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={info.keyed ? "Leave empty to remove" : "Paste key"}
              />
              <Button type="submit">{draft.trim() === "" && info.keyed ? "Remove" : "Save"}</Button>
            </div>
            {error ? (
              <p className="source-key__error" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        );
      })}
    </>
  );
}
