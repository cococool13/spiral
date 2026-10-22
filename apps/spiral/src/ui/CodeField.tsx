import { useRef } from "react";

interface CodeFieldProps {
  value: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}

export function CodeField({ value, disabled, invalid, onChange }: CodeFieldProps) {
  const cells = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.replace(/\D/g, "").slice(0, 6);

  function write(next: string) {
    onChange(next.replace(/\D/g, "").slice(0, 6));
  }

  function fill(index: number, digit: string) {
    const chars = digits.split("");
    chars[index] = digit;
    const next = chars.join("").slice(0, 6);
    write(next);
    if (digit) cells.current[Math.min(index + 1, 5)]?.focus();
  }

  return (
    <div className={invalid ? "code code--invalid" : "code"} onPaste={(event) => {
      const pasted = event.clipboardData.getData("text");
      if (!/\d/.test(pasted)) return;
      event.preventDefault();
      write(pasted);
      const count = pasted.replace(/\D/g, "").slice(0, 6).length;
      cells.current[Math.min(count, 5)]?.focus();
    }}>
      {Array.from({ length: 6 }, (_, index) => (
        <input
          key={index}
          ref={(el) => {
            cells.current[index] = el;
          }}
          className="code__cell"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1}`}
          maxLength={1}
          value={digits[index] ?? ""}
          disabled={disabled}
          onChange={(event) => {
            const digit = event.target.value.replace(/\D/g, "").slice(-1);
            fill(index, digit);
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !digits[index] && index > 0) {
              cells.current[index - 1]?.focus();
            }
          }}
        />
      ))}
    </div>
  );
}
