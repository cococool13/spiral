import { nextBulletId } from "../lib/ids";
import type { School } from "../lib/types";
import { Field } from "./Field";

/** A school is not a role: it has an institution rather than an employer, and
 *  its notes are facts — a GPA, a thesis, coursework — not achievements. That
 *  is why there is no tightening advice here; the wording pass never looks at
 *  them, and offering to rewrite "GPA 3.9" would be nonsense. */
export function SchoolEditor({
  school,
  onChange,
  onRemove,
}: {
  school: School;
  onChange: (school: School) => void;
  onRemove: () => void;
}) {
  return (
    <article className="entry">
      <div className="entry__grid">
        <Field
          label="Institution"
          value={school.institution}
          onChange={(institution) => onChange({ ...school, institution })}
        />
        <Field
          label="Qualification"
          value={school.credential}
          onChange={(credential) => onChange({ ...school, credential })}
        />
      </div>
      <Field
        label="Place"
        value={school.location}
        onChange={(location) => onChange({ ...school, location })}
      />
      <div className="entry__grid">
        <Field
          label="Started"
          value={school.start.raw}
          onChange={(raw) => onChange({ ...school, start: { ...school.start, raw } })}
        />
        <Field
          label="Ended"
          value={school.end.raw}
          onChange={(raw) => onChange({ ...school, end: { ...school.end, raw } })}
        />
      </div>

      <span className="field__label">Notes</span>
      <div className="entry__stack">
        {school.notes.map((note) => (
          <input
            key={note.id}
            className="field__input"
            type="text"
            aria-label={`Note in ${school.institution || "this school"}`}
            value={note.text}
            onChange={(e) =>
              onChange({
                ...school,
                notes: school.notes.map((n) =>
                  n.id === note.id ? { ...n, text: e.target.value } : n,
                ),
              })
            }
          />
        ))}
      </div>

      <div className="panel__actions">
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange({
              ...school,
              notes: [
                ...school.notes,
                { id: nextBulletId(school.id, school.notes.map((n) => n.id)), text: "" },
              ],
            })
          }
        >
          Add a note
        </button>
        <button type="button" className="btn" onClick={onRemove}>
          Remove this school
        </button>
      </div>
    </article>
  );
}
