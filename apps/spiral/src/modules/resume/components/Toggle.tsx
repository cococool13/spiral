import { Toggle as ShellToggle } from "../../../ui/Toggle";

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
    <span className="resume-toggle">
      <ShellToggle checked={checked} label={label} onChange={onChange} />
      <span>{label}</span>
    </span>
  );
}
