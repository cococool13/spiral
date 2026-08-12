import { Field } from "../components/Field";
import { RoleEditor } from "../components/RoleEditor";
import { emptyRole, type ResumeDoc } from "../lib/types";

export function Check({
  doc,
  onChange,
  onContinue,
}: {
  doc: ResumeDoc;
  onChange: (doc: ResumeDoc) => void;
  onContinue: () => void;
}) {
  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">Check what we read</h2>
      <p className="panel__lede">
        Nothing here is changed later. Titles, employers, dates and numbers are used exactly as
        they appear below.
      </p>

      <div className="entry__grid">
        <Field
          label="Name"
          value={doc.contact.name}
          onChange={(name) => onChange({ ...doc, contact: { ...doc.contact, name } })}
        />
        <Field
          label="Email"
          value={doc.contact.email}
          onChange={(email) => onChange({ ...doc, contact: { ...doc.contact, email } })}
        />
        <Field
          label="Phone"
          value={doc.contact.phone}
          onChange={(phone) => onChange({ ...doc, contact: { ...doc.contact, phone } })}
        />
        <Field
          label="Location"
          value={doc.contact.location}
          onChange={(location) => onChange({ ...doc, contact: { ...doc.contact, location } })}
        />
      </div>

      <h3 className="panel__heading">Experience</h3>
      {doc.experience.map((role, i) => (
        <RoleEditor
          key={role.id}
          role={role}
          onChange={(next) =>
            onChange({ ...doc, experience: doc.experience.map((r, j) => (j === i ? next : r)) })
          }
          onRemove={() =>
            onChange({ ...doc, experience: doc.experience.filter((_, j) => j !== i) })
          }
        />
      ))}
      <button
        type="button"
        className="btn"
        onClick={() =>
          onChange({
            ...doc,
            experience: [...doc.experience, emptyRole(`exp-${doc.experience.length}`)],
          })
        }
      >
        Add a role
      </button>

      <div className="panel__actions">
        <button type="button" className="btn btn--primary" onClick={onContinue}>
          This is right
        </button>
      </div>
    </section>
  );
}
