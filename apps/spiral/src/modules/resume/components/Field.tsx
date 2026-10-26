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
  /** Spans both columns of a field grid, for values that run long. */
  wide?: boolean;
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
  wide = false,
}: TextFieldProps) {
  const generated = useId();
  return (
    <span className={["fact", edited && "fact--edited", wide && "fact--wide"].filter(Boolean).join(" ")}>
    <ShellField
      id={id ?? generated}
      label={label}
      value={value}
      type={type}
      autoComplete={autoComplete}
      spellCheck={type === "email" || type === "tel" ? false : undefined}
      autoFocus={autoFocus}
      multiline={multiline}
      onChange={(event) => onChange(event.target.value)}
    />
    </span>
  );
}
