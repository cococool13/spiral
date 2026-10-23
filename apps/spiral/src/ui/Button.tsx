import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  size?: "regular" | "large";
}

export function Button({
  variant = "secondary",
  size = "regular",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [
    "btn",
    variant === "primary" ? "btn--primary" : "",
    size === "large" ? "btn--lg" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...props} />;
}
