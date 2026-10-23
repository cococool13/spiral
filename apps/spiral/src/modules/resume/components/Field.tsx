import { useId } from "react";
import { Field as ShellField } from "../../../ui/Field";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  id?: string;
  edited?: boolean;
}

export function Field({
  label,
  value,
  onChange,
  multiline = false,
  type = "text",
  autoComplete,
  autoFocus = false,
  id,
  edited = false,
}: TextFieldProps) {
  const generated = useId();
  return (
    <span className={edited ? "fact fact--edited" : "fact"}>
    <ShellField
      id={id ?? generated}
      label={label}
      value={value}
      type={type}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      multiline={multiline}
      onChange={(event) => onChange(event.target.value)}
    />
    </span>
  );
}
