import type { ResumeDoc, Role } from "./types";

/** The resume as plain text, in reading order: roughly what an applicant
 *  tracking system pulls out of a one-column PDF. Built from the same facts
 *  the page is typeset from, so it cannot say anything the page does not. */
export function plainText(doc: ResumeDoc): string {
  const lines: string[] = [];
  const push = (...more: string[]) => lines.push(...more);
  const contact = [doc.contact.email, doc.contact.phone, doc.contact.location, ...doc.contact.links]
    .map((part) => part.trim())
    .filter(Boolean);

  if (doc.contact.name.trim()) push(doc.contact.name.trim().toUpperCase());
  if (doc.headline.trim()) push(doc.headline.trim());
  if (contact.length) push(contact.join(" | "));
  if (doc.summary.trim()) push("", doc.summary.trim());

  const roles = (heading: string, list: Role[]) => {
    const real = list.filter((role) => role.title || role.organization);
    if (real.length === 0) return;
    push("", heading.toUpperCase());
    for (const role of real) {
      const dates = [role.start.raw, role.end.raw].filter(Boolean).join(" - ");
      const head = [role.title, role.organization].filter(Boolean).join(", ");
      push([head, role.location, dates].filter(Boolean).join("  "));
      for (const bullet of role.bullets) if (bullet.text.trim()) push(`- ${bullet.text.trim()}`);
    }
  };

  roles("Experience", doc.experience);
  roles("Projects", doc.projects);

  const schools = doc.education.filter((school) => school.institution || school.credential);
  if (schools.length) {
    push("", "EDUCATION");
    for (const school of schools) {
      const dates = [school.start.raw, school.end.raw].filter(Boolean).join(" - ");
      push([[school.credential, school.institution].filter(Boolean).join(", "), school.location, dates].filter(Boolean).join("  "));
      for (const note of school.notes) if (note.text.trim()) push(`- ${note.text.trim()}`);
    }
  }

  roles("Leadership and activities", doc.leadership);

  const skills = doc.skills.filter((group) => group.items.some(Boolean));
  if (skills.length) {
    push("", "SKILLS");
    for (const group of skills) {
      const items = group.items.filter(Boolean).join(", ");
      push(group.label ? `${group.label}: ${items}` : items);
    }
  }
  if (doc.awards.some(Boolean)) push("", "AWARDS", ...doc.awards.filter(Boolean).map((award) => `- ${award}`));
  if (doc.interests.some(Boolean)) push("", "INTERESTS", doc.interests.filter(Boolean).join(", "));
  return lines.join("\n").trim();
}
