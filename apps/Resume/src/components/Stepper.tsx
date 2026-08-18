export type Step = "input" | "check" | "style" | "build";

const STEPS: { id: Step; label: string }[] = [
  { id: "input", label: "Import" },
  { id: "check", label: "Check" },
  { id: "style", label: "Style" },
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
  if (current === "input") return null;
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
          <span className="stepper__label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
