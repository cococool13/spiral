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
        <input
          // These lines have no identity beyond their position, and the whole
          // list is replaced on every edit.
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are ordinal
          key={index}
          className="field__input"
          type="text"
          aria-label={`${label} ${index + 1}`}
          value={item}
          onChange={(e) =>
            onChange(items.map((existing, i) => (i === index ? e.target.value : existing)))
          }
        />
      ))}
      <div className="panel__actions">
        <button type="button" className="btn" onClick={() => onChange([...items, ""])}>
          {addLabel}
        </button>
        {items.length > 0 ? (
          <button
            type="button"
            className="btn"
            onClick={() => onChange(items.slice(0, -1))}
          >
            Remove the last one
          </button>
        ) : null}
      </div>
    </div>
  );
}
