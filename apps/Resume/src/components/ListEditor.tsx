/** A plain list of lines — awards, interests, the items inside a skill group.
 *  One input per line, because that is how a person reads them back. */
export function ListEditor({
  label,
  items,
  onChange,
  addLabel,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  addLabel: string;
}) {
  return (
    <div className="list-editor">
      <span className="field__label">{label}</span>
      {items.map((item, index) => (
        <div className="list-editor__row" key={`${label}-${index}`}>
          <input
            className="field__input"
            type="text"
            aria-label={`${label} ${index + 1}`}
            value={item}
            onChange={(e) =>
              onChange(items.map((existing, i) => (i === index ? e.target.value : existing)))
            }
          />
          <button
            type="button"
            className="btn"
            aria-label={`Remove ${label} ${index + 1}`}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="panel__actions">
        <button type="button" className="btn" onClick={() => onChange([...items, ""])}>
          {addLabel}
        </button>
      </div>
    </div>
  );
}
