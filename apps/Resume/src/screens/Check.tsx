import { useEffect, useState } from "react";
import { Field } from "../components/Field";
import { ListEditor } from "../components/ListEditor";
import { RoleEditor } from "../components/RoleEditor";
import { reviewWording } from "../lib/ipc";
import { emptyRole, type BulletReview, type ResumeDoc, type Role } from "../lib/types";

/** The next free id for a section. Deriving it from `roles.length` collided
 *  after a removal — deleting the first of [exp-0, exp-1] and adding one
 *  produced a second "exp-1", which made two roles share bullet ids and let a
 *  model rewrite land on the wrong bullet. */
function nextRoleId(prefix: string, roles: Role[]): string {
  const used = roles
    .map((role) => Number.parseInt(role.id.slice(prefix.length + 1), 10))
    .filter((n) => Number.isFinite(n));
  const next = used.length === 0 ? 0 : Math.max(...used) + 1;
  return `${prefix}-${next}`;
}

/** One editable section of roles. Both fields are stated by the caller: the
 *  add-button label used to be derived from the heading text, so renaming
 *  "Experience" silently turned "Add a role" into "Add an activity". */
interface RoleSection {
  heading: string;
  /** What one entry is called, for the add button. */
  entry: string;
  idPrefix: string;
}

const EXPERIENCE: RoleSection = { heading: "Experience", entry: "a role", idPrefix: "exp" };
const LEADERSHIP: RoleSection = {
  heading: "Leadership & activities",
  entry: "an activity",
  idPrefix: "lead",
};

/** Experience and Leadership are the same shape, edited the same way. Writing
 *  the list twice would guarantee they drift. */
function roleSection(
  section: RoleSection,
  roles: Role[],
  reviews: BulletReview[],
  onChange: (roles: Role[]) => void,
) {
  const { heading, entry, idPrefix } = section;
  return (
    <>
      <h3 className="panel__heading">{heading}</h3>
      {roles.map((role, i) => (
        <RoleEditor
          key={role.id}
          role={role}
          reviews={reviews}
          onChange={(next) => onChange(roles.map((r, j) => (j === i ? next : r)))}
          onRemove={() => onChange(roles.filter((_, j) => j !== i))}
        />
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => onChange([...roles, emptyRole(nextRoleId(idPrefix, roles))])}
      >
        Add {entry}
      </button>
    </>
  );
}

export function Check({
  doc,
  tighten,
  onChange,
  onTighten,
  onContinue,
}: {
  doc: ResumeDoc;
  tighten: boolean;
  onChange: (doc: ResumeDoc) => void;
  onTighten: (tighten: boolean) => void;
  onContinue: () => void;
}) {
  const [reviews, setReviews] = useState<BulletReview[]>([]);

  useEffect(() => {
    let current = true;
    reviewWording(doc)
      .then((next) => {
        if (current) setReviews(next);
      })
      .catch(() => {
        if (current) setReviews([]);
      });
    return () => {
      current = false;
    };
  }, [doc]);

  const shown = tighten ? reviews : [];

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

      <Field
        label="Headline"
        value={doc.headline}
        onChange={(headline) => onChange({ ...doc, headline })}
      />

      <label className="toggle">
        <input
          type="checkbox"
          checked={tighten}
          onChange={(e) => onTighten(e.target.checked)}
        />
        Tighten my wording when building
      </label>
      <p className="panel__lede">
        Removes filler like "responsible for" and flags bullets with no numbers. It never changes
        a name, a date or a number.
      </p>

      {roleSection(EXPERIENCE, doc.experience, shown, (experience) =>
        onChange({ ...doc, experience }),
      )}

      {roleSection(LEADERSHIP, doc.leadership, shown, (leadership) =>
        onChange({ ...doc, leadership }),
      )}

      <h3 className="panel__heading">Skills</h3>
      {doc.skills.map((group, i) => (
        // Groups are positional; the whole list is replaced on every edit.
        // biome-ignore lint/suspicious/noArrayIndexKey: groups are ordinal
        <div className="entry" key={i}>
          <Field
            label="Category (leave blank for a plain list)"
            value={group.label}
            onChange={(label) =>
              onChange({
                ...doc,
                skills: doc.skills.map((g, j) => (j === i ? { ...g, label } : g)),
              })
            }
          />
          <ListEditor
            label="Skills"
            items={group.items}
            addLabel="Add a skill"
            onChange={(items) =>
              onChange({
                ...doc,
                skills: doc.skills.map((g, j) => (j === i ? { ...g, items } : g)),
              })
            }
          />
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => onChange({ ...doc, skills: [...doc.skills, { label: "", items: [] }] })}
      >
        Add a skill group
      </button>

      <h3 className="panel__heading">Awards</h3>
      <ListEditor
        label="Awards"
        items={doc.awards}
        addLabel="Add an award"
        onChange={(awards) => onChange({ ...doc, awards })}
      />

      <h3 className="panel__heading">Interests</h3>
      <ListEditor
        label="Interests"
        items={doc.interests}
        addLabel="Add an interest"
        onChange={(interests) => onChange({ ...doc, interests })}
      />

      <div className="panel__actions">
        <button type="button" className="btn btn--primary" onClick={onContinue}>
          This is right
        </button>
      </div>
    </section>
  );
}
