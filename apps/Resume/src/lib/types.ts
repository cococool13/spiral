// Mirrors src-tauri/src/model.rs. Rust serialises camelCase, so these names
// must match field-for-field — there is no adapter layer between them.

export interface Contact {
  name: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
}

export interface DateMark {
  raw: string;
  year: number | null;
  month: number | null;
  present: boolean;
}

export interface Bullet {
  id: string;
  text: string;
}

export interface Role {
  id: string;
  title: string;
  organization: string;
  location: string;
  start: DateMark;
  end: DateMark;
  bullets: Bullet[];
}

export interface School {
  id: string;
  institution: string;
  credential: string;
  location: string;
  start: DateMark;
  end: DateMark;
  notes: Bullet[];
}

/** Skills either as one flat list (empty label) or as labelled groups —
 *  "Technical: Rust, Python". One representation, not two. */
export interface SkillGroup {
  label: string;
  items: string[];
}

export interface ResumeDoc {
  contact: Contact;
  /** Never parsed — a headline is a claim, and the app does not invent claims. */
  headline: string;
  summary: string;
  experience: Role[];
  education: School[];
  projects: Role[];
  leadership: Role[];
  awards: string[];
  interests: string[];
  skills: SkillGroup[];
}

/** PDF or Word. Chosen on the Format step, before anything is built. */
export type ExportFormat = "pdf" | "docx";

export interface StoredDoc {
  doc: ResumeDoc;
  savedAt: string;
  template: string;
  format: string;
  accent: string;
  tighten: boolean;
}

/** One of six swatches. The hex comes from Rust — the frontend may not hold
 *  colour values, because `check-hex` allows them only in the token file. */
export interface Accent {
  id: string;
  hex: string;
}

/** One card in the style picker. `error` is set instead of `svg` when a
 *  template fails, so one bad style cannot blank the screen. */
export interface Thumbnail {
  id: string;
  name: string;
  svg: string;
  error: string;
}

export interface StorageInfo {
  path: string;
  exists: boolean;
}

export function emptyDate(): DateMark {
  return { raw: "", year: null, month: null, present: false };
}

export function emptyDoc(): ResumeDoc {
  return {
    contact: { name: "", email: "", phone: "", location: "", links: [] },
    headline: "",
    summary: "",
    experience: [],
    education: [],
    projects: [],
    leadership: [],
    awards: [],
    interests: [],
    skills: [],
  };
}

export function emptyRole(id: string): Role {
  return {
    id,
    title: "",
    organization: "",
    location: "",
    start: emptyDate(),
    end: emptyDate(),
    bullets: [],
  };
}

/** What tightening would do to one bullet, shown on the Check screen before
 *  anything is built. `notes` is advice, never a change. */
export interface BulletReview {
  bulletId: string;
  tightened: string;
  notes: string[];
}

/** One stage of the build, reported by Rust after the work it names finished. */
export interface Progress {
  stage: string;
  percent: number;
}

export interface BuildResult {
  pages: string[];
  suggestedName: string;
}
