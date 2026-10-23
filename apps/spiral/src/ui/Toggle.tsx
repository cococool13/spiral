interface ToggleProps {
  checked: boolean;
  label: string;
  disabled?: boolean;
  describedBy?: string;
  onChange: (next: boolean) => void;
}

export function Toggle({ checked, label, disabled, describedBy, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      className={checked ? "switch switch--on" : "switch"}
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}
