/** Two facts about each style, under the name on the picker card.
 *  Structure, then when it fits — never a claim that a template is
 *  "ATS-friendly" or endorsed. */
export const STYLE_HINTS: Record<string, string[]> = {
  column: ["Two columns, more on one page", "Best when the page is full"],
  ledger: ["A large name, then the rest", "Best for a short, senior page"],
  sheet: ["Single column, even type", "Best when the words should carry it"],
  rule: ["A rule under every heading", "Best for a classic paper resume"],
  card: ["Name in a block at the top", "Best when the name should land first"],
  bullet: ["Education first, name centred", "Best for a first professional page"],
  brief: ["A labelled summary up top", "Best when the summary is the argument"],
  chronicle: ["Education and activities first", "Best with more school than work"],
  index: ["Skills under education, then the roles", "Best for technical and lab work"],
  timeline: ["The jobs are the document", "Best with a long work history"],
  blend: ["Skills and wins above the jobs", "Best when changing field"],
  lead: ["Name and headline between rules", "Best for a senior search"],
};

/** Template ids are lowercase; the picker and the result strip print them as a name. */
export function styleName(id: string): string {
  if (!id) return "Style";
  return id.charAt(0).toUpperCase() + id.slice(1);
}
