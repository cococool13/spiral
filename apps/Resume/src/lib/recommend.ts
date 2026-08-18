import type { ResumeDoc } from "./types";

/** Pick the template whose structure matches what is actually on the page.
 *  A guess, stated as one, never a score. */
export function recommendTemplate(doc: ResumeDoc): string {
  const roles = doc.experience.filter((r) => r.title || r.organization).length;
  const schools = doc.education.filter((s) => s.institution || s.credential).length;
  const projects = doc.projects.filter((r) => r.title || r.organization).length;
  const skillCount = doc.skills.reduce((n, group) => n + group.items.filter(Boolean).length, 0);
  const bullets = doc.experience.reduce(
    (n, role) => n + role.bullets.filter((b) => b.text.trim()).length,
    0,
  );
  const headline = doc.headline.trim().length > 0;
  const summary = doc.summary.trim().length > 40;

  if (schools > roles && roles <= 1) return "chronicle";
  if (skillCount >= 8 && projects >= 1) return "index";
  if (headline && roles >= 4) return "lead";
  if (roles >= 3 && bullets >= 8) return "timeline";
  if (doc.skills.length >= 2 && roles >= 1) return "blend";
  if (summary && schools >= 1) return "brief";
  if (roles >= 2) return "column";
  return "bullet";
}
