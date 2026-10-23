import type { ReactNode } from "react";

interface PlateProps {
  marked?: boolean;
  travel?: boolean;
  className?: string;
  children: ReactNode;
}

export function Plate({ marked = false, travel = false, className, children }: PlateProps) {
  const classes = className ? `plate ${className}` : "plate";
  return (
    <div className={classes}>
      {children}
      {marked ? (
        <span className="plate__marks" data-travel={travel ? "from" : undefined} aria-hidden="true">
          <span className="mk tl" />
          <span className="mk tr" />
          <span className="mk bl" />
          <span className="mk br" />
        </span>
      ) : null}
    </div>
  );
}
