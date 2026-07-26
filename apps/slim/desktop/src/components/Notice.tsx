import type { WizardError } from "../lib/wizard";

/**
 * Errors are stated factually: what happened, then what to do. The next
 * step is never optional, so this component cannot render a dead end.
 */
export function Notice({ error }: { readonly error: WizardError }) {
  return (
    <div className="notice" role="alert">
      <p className="notice__title">{error.title}</p>
      <p className="notice__detail">{error.detail}</p>
      <p className="notice__next">{error.nextStep}</p>
    </div>
  );
}
