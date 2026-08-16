export type Step = "input" | "check" | "style" | "format" | "build";

const STEPS: { id: Step; label: string }[] = [
  { id: "input", label: "Input" },
  { id: "check", label: "Check" },
  { id: "style", label: "Style" },
  { id: "format", label: "Format" },
  { id: "build", label: "Build" },
];

export function Stepper({
  current,
  reached,
  onJump,
}: {
  current: Step;
  reached: Step[];
  onJump: (step: Step) => void;
}) {
  return (
    <nav className="stepper" aria-label="Progress">
      {STEPS.map(({ id, label }, i) => (
        <button
          key={id}
          type="button"
          className="stepper__step"
          aria-current={id === current ? "step" : undefined}
          disabled={!reached.includes(id)}
          onClick={() => onJump(id)}
        >
          <span className="stepper__index">{i + 1}</span>
          {label}
        </button>
      ))}
    </nav>
  );
}
