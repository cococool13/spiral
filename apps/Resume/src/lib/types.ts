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

/** The five choices that make a build. They travel together everywhere — the
 *  same five are saved, built, and re-built — so they are one value rather
 *  than five parameters repeated at every call site. Mirrors `BuildRequest`
 *  in Rust. */
export interface Draft {
  doc: ResumeDoc;
  template: string;
  /** Empty until PDF or Word is chosen on Build — a closed set, not a free
   *  string, so a bad value cannot travel to Rust and be rejected there. */
  format: ExportFormat | "";
  accent: string;
  tighten: boolean;
}


export interface StoredDoc extends Draft {
  savedAt: string;
}

/** The closed set of document swatches. The hex comes from Rust — the frontend
 *  may not hold colour values, because `check-hex` allows them only in the
 *  token file. */
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

/** A blank document ready to type into. One empty role with one empty bullet,
 *  so Check opens as a form rather than a heading and an Add button. Ids match
 *  the first experience entry Rust would mint. Empty bullets are skipped when
 *  typesetting — they do not print as holes. */
export function scratchDoc(): ResumeDoc {
  const id = "exp-0";
  return {
    ...emptyDoc(),
    experience: [
      {
        ...emptyRole(id),
        bullets: [{ id: `${id}-b-0`, text: "" }],
      },
    ],
  };
}

/** Ids match Rust's `entry_id("edu", n)`, so a school added here is
 *  indistinguishable from one the parser produced. */
export function emptySchool(id: string): School {
  return {
    id,
    institution: "",
    credential: "",
    location: "",
    start: emptyDate(),
    end: emptyDate(),
    notes: [],
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
  /** What is doing the work, named while it works. Empty until it is known. */
  engine: string;
}

export interface BuildResult {
  pages: string[];
  suggestedName: string;
  /** What actually ran, stated plainly on the result. */
  engine: string;
  /** One line per rewrite the fact gate refused. Not errors. */
  notes: string[];
}

/** A built file plus the style it was typeset in, so Result can name versions. */
export interface BuiltVersion extends BuildResult {
  style: string;
}

/** The optional offline model. `available: false` means this build ships no
 *  pinned model, and the UI says so rather than offering a broken download. */
/** One offline model, as Settings shows it. */
export interface ModelStatus {
  id: string;
  name: string;
  /** One line on what choosing this one costs and buys. */
  note: string;
  /** Already formatted — "2.7 GB". The UI never does size arithmetic. */
  size: string;
  installed: boolean;
  path: string;
  /** The one a build would actually run. At most one row carries this. */
  inUse: boolean;
}

export interface ModelList {
  /** False when this build pinned no models at all. */
  available: boolean;
  models: ModelStatus[];
}

export interface DownloadProgress {
  received: number;
  total: number;
  percent: number;
}

/** What Settings may know about the engine. There is deliberately no key
 *  field — the frontend can learn whether one exists, never what it is. */
export interface EngineInfo {
  provider: string;
  model: string;
  baseUrl: string;
  hasKey: boolean;
  /** Whether a rewrite would actually run. Not the same as `hasKey`: the
   *  offline tier needs no key and would report false. */
  usesModel: boolean;
  /** The exact host a key would be sent to, shown before anything is sent. */
  host: string;
  /** Where this provider issues keys, or empty when there is nowhere to go. */
  keyUrl: string;
  /** First launch has not yet chosen a wording path. */
  needsSetup: boolean;
}
