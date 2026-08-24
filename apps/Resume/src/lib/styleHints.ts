/** Two or three facts about each style, shown on hover and focus. Structure
 *  only — never a claim that a template is "ATS-friendly" or endorsed. */
export const STYLE_HINTS: Record<string, string[]> = {
  column: ["Two columns, more on one page", "Skills sit beside the work", "Best when the page is full"],
  ledger: ["A large name, then the rest", "Quiet rules, lots of air", "Best for a short, senior page"],
  sheet: ["Single column, even type", "Nothing shouts", "Best when the words should carry it"],
  rule: ["A rule under every heading", "Dates sit flush right", "Best for a classic paper resume"],
  card: ["Name in a block at the top", "Then a single column", "Best when the name should land first"],
  bullet: ["Education first, name centred", "The conservative default", "Best for a first professional page"],
  brief: ["A labelled summary up top", "Headings underlined full-width", "Best when the summary is the argument"],
  chronicle: ["Education and activities first", "Built for a student page", "Best with more school than work"],
  index: ["Skills under education", "Then the roles", "Best for technical and lab work"],
  timeline: ["The jobs are the document", "Headline, skills, then role after role", "Best with a long work history"],
  blend: ["Skills and wins above the jobs", "Then the chronology", "Best when changing field"],
  lead: ["Name and headline between rules", "Experience written as outcomes", "Best for a senior search"],
};
