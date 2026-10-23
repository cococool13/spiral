import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { mark } from "../../bench";
import {
  cacheSrc,
  loadDocument,
  previewDocument,
  saveDocument,
  takeImportedText,
} from "./api";
import type { Step } from "./components/Stepper";
import { useDebounced } from "./lib/useDebounced";
import { emptyDoc, type Draft, type ResumeDoc } from "./lib/types";

const ORDER: Step[] = ["import", "details", "style", "build", "check", "export"];

function blank(): Draft {
  return { doc: emptyDoc(), template: "", format: "", accent: "ink", tighten: false };
}

function factCount(doc: ResumeDoc): number {
  let count = [doc.contact.name, doc.contact.email, doc.contact.phone, doc.contact.location, doc.headline, doc.summary].filter(
    (value) => value.trim(),
  ).length;
  count += doc.contact.links.filter((link) => link.trim()).length;
  for (const role of [...doc.experience, ...doc.projects, ...doc.leadership]) {
    count += [role.title, role.organization, role.location, role.start.raw, role.end.raw].filter((value) => value.trim()).length;
    count += role.bullets.filter((bullet) => bullet.text.trim()).length;
  }
  for (const school of doc.education) {
    count += [school.institution, school.credential, school.location].filter((value) => value.trim()).length;
    count += school.notes.filter((note) => note.text.trim()).length;
  }
  count += doc.awards.filter((item) => item.trim()).length;
  count += doc.interests.filter((item) => item.trim()).length;
  return count;
}

function editedCount(doc: ResumeDoc, baseline: ResumeDoc | null): number {
  if (!baseline) return 0;
  const pairs: Array<[string, string]> = [
    [doc.contact.name, baseline.contact.name],
    [doc.contact.email, baseline.contact.email],
    [doc.contact.phone, baseline.contact.phone],
    [doc.contact.location, baseline.contact.location],
    [doc.headline, baseline.headline],
    [doc.summary, baseline.summary],
  ];
  return pairs.filter(([next, previous]) => next !== previous).length;
}

export interface ResumeSession {
  step: Step;
  reached: Step[];
  draft: Draft;
  savedAt: string | null;
  fromScratch: boolean;
  baseline: ResumeDoc | null;
  source: string;
  setup: boolean;
  generate: boolean;
  versions: import("./lib/types").BuiltVersion[];
  pages: string[];
  saveError: string;
  line: string;
  go: (step: Step) => void;
  edit: (changed: Partial<Draft>) => void;
  ready: (doc: ResumeDoc, how?: "scratch") => void;
  openSaved: () => void;
  openSetup: () => void;
  closeSetup: () => void;
  startBuild: () => void;
  built: (result: import("./lib/types").BuildResult) => void;
  backToFormat: () => void;
  anotherStyle: () => void;
  painted: () => void;
}

const ResumeContext = createContext<ResumeSession | null>(null);

export function useResume(): ResumeSession {
  const value = useContext(ResumeContext);
  if (!value) throw new Error("Resume frame missing");
  return value;
}

export function Frame({ children }: { children: ReactNode }) {
  const value = useResumeSession();
  return <ResumeContext.Provider value={value}>{children}</ResumeContext.Provider>;
}

function useResumeSession(): ResumeSession {
  const [step, setStep] = useState<Step>("import");
  const [reached, setReached] = useState<Step[]>(["import"]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [fromScratch, setFromScratch] = useState(false);
  const [baseline, setBaseline] = useState<ResumeDoc | null>(null);
  const [source, setSource] = useState("");
  const [setup, setSetup] = useState(false);
  const [generate, setGenerate] = useState(false);
  const [versions, setVersions] = useState<ResumeSession["versions"]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [saveError, setSaveError] = useState("");
  const edited = useRef(false);
  const paintedOnce = useRef(false);
  const draftRef = useRef(draft);
  const savedKey = useRef("");
  const saveGen = useRef(0);
  draftRef.current = draft;
  const settled = useDebounced(draft);

  function persist(current: Draft) {
    const key = JSON.stringify(current);
    if (key === savedKey.current) return;
    const gen = ++saveGen.current;
    void saveDocument(current)
      .then(() => {
        if (gen !== saveGen.current) return;
        savedKey.current = key;
        setSaveError("");
      })
      .catch((err: unknown) => {
        if (gen !== saveGen.current) return;
        savedKey.current = "";
        setSaveError(String(err));
      });
  }

  useEffect(() => {
    let live = true;
    void invoke("module_activate", { id: "resume" })
      .then(() => {
        if (!live) return;
        mark("module_ready:resume");
        return loadDocument();
      })
      .then((stored) => {
        if (!live || !stored) return;
        setSavedAt(stored.savedAt);
        setBaseline(stored.doc);
        setDraft({
          doc: stored.doc,
          template: stored.template,
          format: stored.format === "pdf" || stored.format === "docx" ? stored.format : "",
          accent: stored.accent || "ink",
          tighten: stored.tighten,
        });
      })
      .catch(() => {
        if (live) setSavedAt(null);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!edited.current) return;
    persist(settled);
  }, [settled]);

  useEffect(() => {
    function flush() {
      if (!edited.current) return;
      persist(draftRef.current);
    }
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  useEffect(() => {
    if (step === "import") return;
    const empty = !draft.doc.contact.name.trim() && draft.doc.experience.length === 0;
    if (empty) return;
    const timer = window.setTimeout(() => {
      void previewDocument(draft.doc, draft.template || "column", draft.accent)
        .then((reply) => setPages(reply.pages))
        .catch(() => setPages([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, step]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [role='radio']")) return;
      const index = ORDER.indexOf(step);
      const next = ORDER[index + (event.key === "ArrowRight" ? 1 : -1)];
      if (next && reached.includes(next)) go(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function go(next: Step) {
    setStep(next);
    setReached((seen) => (seen.includes(next) ? seen : [...seen, next]));
    if (next === "build") setGenerate(false);
  }

  function edit(changed: Partial<Draft>) {
    edited.current = true;
    setDraft((current) => ({ ...current, ...changed }));
    if (changed.template || changed.accent || changed.doc) setVersions([]);
  }

  const facts = factCount(draft.doc);
  const editedFacts = editedCount(draft.doc, baseline);
  const pageCount = pages.length;
  const line = `${draft.doc.contact.name || "Resume"} · ${pageCount} ${pageCount === 1 ? "page" : "pages"} · ${facts} ${facts === 1 ? "fact" : "facts"}${editedFacts > 0 ? ` · ${editedFacts} edited` : ""}`;

  return {
    step,
    reached,
    draft,
    savedAt,
    fromScratch,
    baseline,
    source,
    setup,
    generate,
    versions,
    pages,
    saveError,
    line,
    go,
    edit,
    ready: (doc, how) => {
      edited.current = true;
      setSource(takeImportedText() || source);
      setFromScratch(how === "scratch");
      setBaseline(doc);
      setDraft((current) => ({ ...current, doc }));
      go("details");
    },
    openSaved: () => {
      setFromScratch(false);
      setBaseline(draft.doc);
      go("details");
    },
    openSetup: () => setSetup(true),
    closeSetup: () => setSetup(false),
    startBuild: () => setGenerate(true),
    built: (result) => {
      setVersions((all) => [...all, { ...result, style: draft.template }]);
      go("check");
    },
    backToFormat: () => {
      edit({ format: "" });
      setGenerate(false);
    },
    anotherStyle: () => {
      setVersions([]);
      setGenerate(false);
      go("style");
    },
    painted: () => {
      if (paintedOnce.current) return;
      paintedOnce.current = true;
      mark("first_useful_action:resume");
    },
  };
}

export function Preview({ pages, line, onPaint }: { pages: string[]; line: string; onPaint: () => void }) {
  return (
    <aside className="proof" aria-label="Preview">
      <p className="tile__line">
        {line}
        {line.includes("edited") ? <span className="fact-dot" aria-hidden="true" /> : null}
      </p>
      <div className="proof__pages">
        {pages.length === 0 ? <p className="panel__lede">Drawing the page.</p> : null}
        {pages.map((page) => (
          <img key={page} src={cacheSrc(page)} alt="" onLoad={onPaint} />
        ))}
      </div>
    </aside>
  );
}
