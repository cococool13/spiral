/** The collection toggle: a pill track, red when on. Same control Wallpaper
 *  uses, with the label visible beside it so Check does not hide a setting
 *  behind an icon. */
export function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={checked ? "switch switch--on" : "switch"}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__track" aria-hidden="true">
        <span className="switch__knob" />
      </span>
      {label}
    </button>
  );
}
