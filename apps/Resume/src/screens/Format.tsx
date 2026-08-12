import type { ExportFormat } from "../lib/types";

/** The one place in this app where a line under a label earns its keep: a
 *  student choosing between these does not know which one an application wants,
 *  and choosing wrong is a real error rather than a preference. */
const FORMATS: { id: ExportFormat; name: string; note: string }[] = [
  {
    id: "pdf",
    name: "PDF",
    note: "What most applications ask for. Looks the same on every computer.",
  },
  {
    id: "docx",
    name: "Word (.docx)",
    note: "Editable in Word. Some career centres and job boards require it.",
  },
];

export function Format({
  chosen,
  onChoose,
  onContinue,
}: {
  chosen: ExportFormat | "";
  onChoose: (format: ExportFormat) => void;
  onContinue: () => void;
}) {
  return (
    <section className="panel">
      <h2 className="panel__title">Choose a format</h2>

      <div className="formats" role="radiogroup" aria-label="Export format">
        {FORMATS.map((format) => (
          <button
            key={format.id}
            type="button"
            role="radio"
            aria-checked={chosen === format.id}
            className="format-card"
            onClick={() => onChoose(format.id)}
          >
            <span className="format-card__name">{format.name}</span>
            <span className="format-card__note">{format.note}</span>
          </button>
        ))}
      </div>

      <div className="panel__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={chosen === ""}
          onClick={onContinue}
        >
          Build my resume
        </button>
      </div>
    </section>
  );
}
