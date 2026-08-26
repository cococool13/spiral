import { useEffect, useState } from "react";
import { Field } from "../components/Field";
import { ListEditor } from "../components/ListEditor";
import { RoleEditor, type EntryWords } from "../components/RoleEditor";
import { SchoolEditor } from "../components/SchoolEditor";
import { Toggle } from "../components/Toggle";
import { nextBulletId, nextEntryId } from "../lib/ids";
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

function addRole(section: RoleSection, roles: Role[]): Role[] {
  const id = nextEntryId(section.idPrefix, roles.map((r) => r.id));
  const role = emptyRole(id);
  // One empty bullet so typing a role does not start with an extra click.
  // Typesetting skips blank bullets, so an unused one does not print.
  role.bullets = [{ id: nextBulletId(id, []), text: "" }];
  return [...roles, role];
}

/** Experience and Leadership are the same shape, edited the same way. Writing
 *  the list twice would guarantee they drift. An empty optional section stays
 *  off the page until the person asks for it — Check is a review, not a blank
 *  form of every heading a resume might have. */
function roleSection(
  section: RoleSection,
  roles: Role[],
  reviews: BulletReview[],
  onChange: (roles: Role[]) => void,
  required = false,
) {
  if (!required && roles.length === 0) return null;
  const { heading, add, words } = section;
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
      <button type="button" className="btn" onClick={() => onChange(addRole(section, roles))}>
        {add}
      </button>
    </>
  );
}

/** Education is the one section that is not a list of roles: a school has an
 *  institution and a qualification, and its notes are facts rather than
 *  achievements. Same editing shape, different fields. */
function educationSection(schools: School[], onChange: (schools: School[]) => void) {
  if (schools.length === 0) return null;
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
  fromScratch = false,
  onChange,
  onTighten,
  onContinue,
}: {
  doc: ResumeDoc;
  tighten: boolean;
  fromScratch?: boolean;
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
      <h2 className="panel__title">
        {fromScratch ? "Fill in the facts" : "Check what we read"}
      </h2>
      <p className="panel__lede">
        {fromScratch
          ? "Type what belongs on the page. Optional sections stay off until you add them."
          : "Titles, employers, dates and numbers stay exactly as they appear here. A style restyles this page. Tightening wording is optional."}
      </p>

      <div className="entry__grid">
        <Field
          label="Name"
          value={doc.contact.name}
          autoComplete="name"
          autoFocus={fromScratch}
          onChange={(name) => onChange({ ...doc, contact: { ...doc.contact, name } })}
        />
        <Field
          label="Email"
          value={doc.contact.email}
          type="email"
          autoComplete="email"
          onChange={(email) => onChange({ ...doc, contact: { ...doc.contact, email } })}
        />
        <Field
          label="Phone"
          value={doc.contact.phone}
          type="tel"
          autoComplete="tel"
          onChange={(phone) => onChange({ ...doc, contact: { ...doc.contact, phone } })}
        />
        <Field
          label="Location"
          value={doc.contact.location}
          autoComplete="address-level2"
          onChange={(location) => onChange({ ...doc, contact: { ...doc.contact, location } })}
        />
      </div>

      <ListEditor
        label="Links"
        items={doc.contact.links}
        addLabel="Add a link"
        onChange={(links) => onChange({ ...doc, contact: { ...doc.contact, links } })}
      />

      <Field
        label="Headline"
        value={doc.headline}
        onChange={(headline) => onChange({ ...doc, headline })}
      />

      <Field
        label="Summary"
        value={doc.summary}
        multiline
        onChange={(summary) => onChange({ ...doc, summary })}
      />

      {roleSection(EXPERIENCE, doc.experience, shown, (experience) =>
        onChange({ ...doc, experience }), true,
      )}

      {roleSection(PROJECTS, doc.projects, shown, (projects) => onChange({ ...doc, projects }))}

      {educationSection(doc.education, (education) => onChange({ ...doc, education }))}

      {roleSection(LEADERSHIP, doc.leadership, shown, (leadership) =>
        onChange({ ...doc, leadership }),
      )}

      {doc.skills.length > 0 ? (
        <>
          <h3 className="panel__heading">Skills</h3>
          {doc.skills.map((group, i) => (
            // Groups are positional; the whole list is replaced on every edit.
            // biome-ignore lint/suspicious/noArrayIndexKey: groups are ordinal
            <div className="entry" key={i}>
              <Field
                label="Category"
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
        </>
      ) : null}

      {doc.awards.length > 0 ? (
        <>
          <h3 className="panel__heading">Awards</h3>
          <ListEditor
            label="Awards"
            items={doc.awards}
            addLabel="Add an award"
            onChange={(awards) => onChange({ ...doc, awards })}
          />
        </>
      ) : null}

      {doc.interests.length > 0 ? (
        <>
          <h3 className="panel__heading">Interests</h3>
          <ListEditor
            label="Interests"
            items={doc.interests}
            addLabel="Add an interest"
            onChange={(interests) => onChange({ ...doc, interests })}
          />
        </>
      ) : null}

      <div className="section-adds">
        {doc.projects.length === 0 ? (
          <button
            type="button"
            className="btn"
            onClick={() => onChange({ ...doc, projects: addRole(PROJECTS, doc.projects) })}
          >
            Add a project
          </button>
        ) : null}
        {doc.education.length === 0 ? (
          <button
            type="button"
            className="btn"
            onClick={() =>
              onChange({
                ...doc,
                education: [emptySchool(nextEntryId("edu", doc.education.map((s) => s.id)))],
              })
            }
          >
            Add a school
          </button>
        ) : null}
        {doc.leadership.length === 0 ? (
          <button
            type="button"
            className="btn"
            onClick={() => onChange({ ...doc, leadership: addRole(LEADERSHIP, doc.leadership) })}
          >
            Add an activity
          </button>
        ) : null}
        {doc.skills.length === 0 ? (
          <button
            type="button"
            className="btn"
            onClick={() => onChange({ ...doc, skills: [{ label: "", items: [] }] })}
          >
            Add a skill group
          </button>
        ) : null}
        {doc.awards.length === 0 ? (
          <button
            type="button"
            className="btn"
            onClick={() => onChange({ ...doc, awards: [""] })}
          >
            Add an award
          </button>
        ) : null}
        {doc.interests.length === 0 ? (
          <button
            type="button"
            className="btn"
            onClick={() => onChange({ ...doc, interests: [""] })}
          >
            Add an interest
          </button>
        ) : null}
      </div>

      <div className="panel__actions panel__actions--dock">
        <Toggle
          checked={tighten}
          label="Tighten wording"
          onChange={onTighten}
        />
        <button type="button" className="btn btn--primary" onClick={onContinue}>
          Continue to Style
        </button>
      </div>
    </section>
  );
}
