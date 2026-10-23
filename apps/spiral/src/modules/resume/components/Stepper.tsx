import type { KeyboardEvent } from "react";

export const STEPS = [
  { id: "import", label: "Import" },
  { id: "details", label: "Details" },
  { id: "style", label: "Style" },
  { id: "build", label: "Build" },
  { id: "check", label: "Check" },
  { id: "export", label: "Export" },
] as const;

export type Step = (typeof STEPS)[number]["id"];

export function Stepper({
  current,
  reached,
  onJump,
}: {
  current: Step;
  reached: Step[];
  onJump: (step: Step) => void;
}) {
  function onKey(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = STEPS.findIndex((step) => step.id === current);
    const next = STEPS[index + (event.key === "ArrowRight" ? 1 : -1)];
    if (next && reached.includes(next.id)) onJump(next.id);
  }

  return (
    <nav className="stepper" aria-label="Resume steps" onKeyDown={onKey}>
      {STEPS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className={id === current ? "stepper__step stepper__step--on" : "stepper__step"}
          aria-current={id === current ? "step" : undefined}
          disabled={!reached.includes(id)}
          onClick={() => onJump(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
