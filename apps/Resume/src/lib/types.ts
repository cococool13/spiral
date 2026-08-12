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

export interface ResumeDoc {
  contact: Contact;
  summary: string;
  experience: Role[];
  education: School[];
  projects: Role[];
  skills: string[];
}

/** PDF or Word. Chosen on the Format step, before anything is built. */
export type ExportFormat = "pdf" | "docx";

export interface StoredDoc {
  doc: ResumeDoc;
  savedAt: string;
  template: string;
  format: string;
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
    summary: "",
    experience: [],
    education: [],
    projects: [],
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
