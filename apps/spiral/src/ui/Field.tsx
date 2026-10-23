import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  multiline?: boolean;
  rows?: number;
}

export function Field({ label, id, multiline = false, rows = 5, ...props }: FieldProps) {
  const shared: TextareaHTMLAttributes<HTMLTextAreaElement> = {
    id,
    rows,
    value: props.value,
    autoFocus: props.autoFocus,
    disabled: props.disabled,
    placeholder: props.placeholder,
    autoComplete: props.autoComplete,
    spellCheck: props.spellCheck,
    onChange: props.onChange as TextareaHTMLAttributes<HTMLTextAreaElement>["onChange"],
  };
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {multiline ? <textarea {...shared} /> : <input id={id} {...props} />}
    </label>
  );
}
