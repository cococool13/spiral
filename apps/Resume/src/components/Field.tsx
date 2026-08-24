export function Field({
  label,
  value,
  onChange,
  multiline = false,
  type = "text",
  autoComplete,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {multiline ? (
        <textarea
          className="field__input field__input--prose"
          value={value}
          rows={5}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="field__input"
          type={type}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
