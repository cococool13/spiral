import { useEffect, useState } from "react";
import { Field } from "../components/Field";
import { ListEditor } from "../components/ListEditor";
import { RoleEditor, type EntryWords } from "../components/RoleEditor";
import { SchoolEditor } from "../components/SchoolEditor";
import { nextEntryId } from "../lib/ids";
import { reviewWording } from "../lib/ipc";
import { useDebounced } from "../lib/useDebounced";
import {
  emptyRole,
  emptySchool,
  type BulletReview,
  type ResumeDoc,
  type Role,
  type School,
} from "../lib/types";

/** One editable section of roles. Every label is stated by the caller: the
 *  labels are not derived from the heading text, so renaming a section cannot
 *  silently change what its add button offers to add.
 *
 *  `idPrefix` must match what Rust mints (`model.rs::entry_id`), or an entry
 *  added here would not be the same kind of thing as one that was parsed. */
interface RoleSection {
  heading: string;
  idPrefix: string;
  add: string;
  words: EntryWords;
}

const EXPERIENCE: RoleSection = {
  heading: "Experience",
  idPrefix: "exp",
  add: "Add a role",
  words: { title: "Title", organization: "Employer", remove: "Remove this role" },
};

const PROJECTS: RoleSection = {
  heading: "Projects",
  idPrefix: "proj",
  add: "Add a project",
  words: { title: "Project", organization: "Built for", remove: "Remove this project" },
};

const LEADERSHIP: RoleSection = {
  heading: "Leadership & activities",
  idPrefix: "lead",
  add: "Add an activity",
  words: { title: "Role", organization: "Organisation", remove: "Remove this activity" },
};

/** Experience and Leadership are the same shape, edited the same way. Writing
 *  the list twice would guarantee they drift. */
function roleSection(
  section: RoleSection,
  roles: Role[],
  reviews: BulletReview[],
  onChange: (roles: Role[]) => void,
) {
  const { heading, idPrefix, add, words } = section;
  return (
    <>
      <h3 className="panel__heading">{heading}</h3>
      {roles.map((role, i) => (
        <RoleEditor
          key={role.id}
          role={role}
          words={words}
          reviews={reviews}
          onChange={(next) => onChange(roles.map((r, j) => (j === i ? next : r)))}
          onRemove={() => onChange(roles.filter((_, j) => j !== i))}
        />
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => onChange([...roles, emptyRole(nextEntryId(idPrefix, roles.map((r) => r.id)))])}
      >
        {add}
      </button>
    </>
  );
}

/** Education is the one section that is not a list of roles: a school has an
 *  institution and a qualification, and its notes are facts rather than
 *  achievements. Same editing shape, different fields. */
function educationSection(schools: School[], onChange: (schools: School[]) => void) {
  return (
    <>
      <h3 className="panel__heading">Education</h3>
      {schools.map((school, i) => (
        <SchoolEditor
          key={school.id}
          school={school}
          onChange={(next) => onChange(schools.map((s, j) => (j === i ? next : s)))}
          onRemove={() => onChange(schools.filter((_, j) => j !== i))}
        />
      ))}
      <button
        type="button"
        className="btn"
        onClick={() =>
          onChange([...schools, emptySchool(nextEntryId("edu", schools.map((s) => s.id)))])
        }
      >
        Add a school
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
  // The review re-tightens every bullet in the document, so it waits for the
  // typing to stop rather than running per keystroke.
  const settled = useDebounced(doc);

  useEffect(() => {
    let current = true;
    reviewWording(settled)
      .then((next) => {
        if (current) setReviews(next);
      })
      .catch(() => {
        if (current) setReviews([]);
      });
    return () => {
      current = false;
    };
  }, [settled]);

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
        Removes filler like "responsible for" and flags bullets with no numbers.
      </p>

      {roleSection(EXPERIENCE, doc.experience, shown, (experience) =>
        onChange({ ...doc, experience }),
      )}

      {roleSection(PROJECTS, doc.projects, shown, (projects) => onChange({ ...doc, projects }))}

      {educationSection(doc.education, (education) => onChange({ ...doc, education }))}

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
