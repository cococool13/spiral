import type { ResumeDoc, Role, School } from "./types";

/** One fact as it reads on the page, keyed so the same fact can be found in
 *  the original and in the current document even after entries move. */
export interface Fact {
  key: string;
  label: string;
  value: string;
}

export type FactState = "unchanged" | "edited" | "added" | "removed";

export interface FactRow {
  key: string;
  label: string;
  original: string;
  current: string;
  state: FactState;
}

function roleFacts(word: string, roles: Role[]): Fact[] {
  return roles.flatMap((role, index) => {
    const n = index + 1;
    const out: Fact[] = [
      { key: `${role.id}.title`, label: `${word} ${n}`, value: role.title },
      { key: `${role.id}.org`, label: `${word} ${n} at`, value: role.organization },
      { key: `${role.id}.place`, label: `${word} ${n} place`, value: role.location },
      {
        key: `${role.id}.dates`,
        label: `${word} ${n} dates`,
        value: [role.start.raw, role.end.raw].filter(Boolean).join(" – "),
      },
    ];
    role.bullets.forEach((bullet, line) => {
      out.push({ key: `${role.id}.${bullet.id}`, label: `${word} ${n} line ${line + 1}`, value: bullet.text });
    });
    return out.filter((fact) => fact.value.trim());
  });
}

function schoolFacts(schools: School[]): Fact[] {
  return schools.flatMap((school, index) => {
    const n = index + 1;
    return [
      { key: `${school.id}.school`, label: `School ${n}`, value: school.institution },
      { key: `${school.id}.credential`, label: `School ${n} credential`, value: school.credential },
      { key: `${school.id}.place`, label: `School ${n} place`, value: school.location },
      {
        key: `${school.id}.dates`,
        label: `School ${n} dates`,
        value: [school.start.raw, school.end.raw].filter(Boolean).join(" – "),
      },
      ...school.notes.map((note, line) => ({
        key: `${school.id}.${note.id}`,
        label: `School ${n} note ${line + 1}`,
        value: note.text,
      })),
    ].filter((fact) => fact.value.trim());
  });
}

export function facts(doc: ResumeDoc): Fact[] {
  const list: Fact[] = [
    { key: "name", label: "Name", value: doc.contact.name },
    { key: "email", label: "Email", value: doc.contact.email },
    { key: "phone", label: "Phone", value: doc.contact.phone },
    { key: "location", label: "Location", value: doc.contact.location },
    ...doc.contact.links.map((link, i) => ({ key: `link.${i}`, label: `Link ${i + 1}`, value: link })),
    { key: "headline", label: "Headline", value: doc.headline },
    { key: "summary", label: "Summary", value: doc.summary },
    ...roleFacts("Role", doc.experience),
    ...roleFacts("Project", doc.projects),
    ...schoolFacts(doc.education),
    ...roleFacts("Activity", doc.leadership),
    ...doc.skills.map((group, i) => ({
      key: `skills.${i}`,
      label: group.label || "Skills",
      value: group.items.filter(Boolean).join(", "),
    })),
    ...doc.awards.map((award, i) => ({ key: `award.${i}`, label: `Award ${i + 1}`, value: award })),
    ...doc.interests.map((item, i) => ({ key: `interest.${i}`, label: `Interest ${i + 1}`, value: item })),
  ];
  return list.filter((fact) => fact.value.trim());
}

/** Original beside current, each marked. Spiral never edits a fact; every
 *  difference here was typed by the person. */
export function compareFacts(original: ResumeDoc, current: ResumeDoc): FactRow[] {
  const before = facts(original);
  const after = facts(current);
  const now = new Map(after.map((fact) => [fact.key, fact]));
  const was = new Set(before.map((fact) => fact.key));
  const rows: FactRow[] = before.map((fact) => {
    const next = now.get(fact.key);
    return {
      key: fact.key,
      label: fact.label,
      original: fact.value,
      current: next?.value ?? "",
      state: !next ? "removed" : next.value === fact.value ? "unchanged" : "edited",
    };
  });
  for (const fact of after) {
    if (!was.has(fact.key)) {
      rows.push({ key: fact.key, label: fact.label, original: "", current: fact.value, state: "added" });
    }
  }
  return rows;
}
