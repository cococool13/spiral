import { useRadioGroup } from "../lib/useRadioGroup";
import type { ExportFormat } from "../lib/types";

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
  onGenerate,
}: {
  chosen: ExportFormat | "";
  onChoose: (format: ExportFormat) => void;
  onGenerate?: () => void;
}) {
  const formatProps = useRadioGroup(
    FORMATS.map((f) => f.id),
    chosen,
    onChoose,
  );

  return (
    <section className="stage">
      <h2 className="visually-hidden">Choose a format</h2>
      <div className="stage-tiles stage-tiles--formats" role="radiogroup" aria-label="Export format">
        {FORMATS.map((format) => (
          <button
            key={format.id}
            type="button"
            className="stage-tile stage-tile--compact"
            {...formatProps(format.id)}
          >
            <span className="stage-tile__name">{format.name}</span>
            <span className="stage-tile__note">{format.note}</span>
          </button>
        ))}
      </div>
      {onGenerate ? (
        <div className="panel__actions panel__actions--generate">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!chosen}
            onClick={onGenerate}
          >
            Generate
          </button>
        </div>
      ) : null}
    </section>
  );
}
