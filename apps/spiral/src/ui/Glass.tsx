import type { ButtonHTMLAttributes, ReactNode } from "react";

interface PillIconProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

/** A recessed round button sunk into the red pill. Icon only, so the label is
 *  the accessible name and the hover tip. */
export function PillIcon({ label, children, className, type = "button", ...props }: PillIconProps) {
  return (
    <button
      type={type}
      className={className ? `pill__icon ${className}` : "pill__icon"}
      aria-label={label}
      data-tip={label}
      {...props}
    >
      {children}
    </button>
  );
}

interface DomeProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  keys?: string;
  children: ReactNode;
}

/** The round glass dome beside the pill: the one main action of the module. */
export function Dome({ label, keys, children, type = "button", ...props }: DomeProps) {
  return (
    <button
      type={type}
      className="dome"
      aria-label={label}
      aria-keyshortcuts={keys}
      data-tip={label}
      {...props}
    >
      {children}
    </button>
  );
}
