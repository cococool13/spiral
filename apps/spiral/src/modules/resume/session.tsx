import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { mark } from "../../bench";
import {
  importResumeFile,
  loadDocument,
  previewDocument,
  saveDocument,
  takeImportedText,
} from "./api";
import { recommendTemplate } from "./lib/recommend";
import { useDebounced } from "./lib/useDebounced";
import { emptyDoc, type Draft, type ResumeDoc } from "./lib/types";

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

export type Stage = "empty" | "editor";

export interface ResumeSession {
  stage: Stage;
  draft: Draft;
  savedAt: string | null;
  fromScratch: boolean;
  baseline: ResumeDoc | null;
  source: string;
  setup: boolean;
  pages: string[];
  saveError: string;
  opening: boolean;
  openError: string;
  line: string;
  edit: (changed: Partial<Draft>) => void;
  ready: (doc: ResumeDoc, how?: "scratch") => void;
  openFile: () => void;
  openSaved: () => void;
  openSetup: () => void;
  closeSetup: () => void;
  startOver: () => void;
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
  const [stage, setStage] = useState<Stage>("empty");
  const [draft, setDraft] = useState<Draft>(blank);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [fromScratch, setFromScratch] = useState(false);
  const [baseline, setBaseline] = useState<ResumeDoc | null>(null);
  const [source, setSource] = useState("");
  const [setup, setSetup] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");
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
    if (stage !== "editor") return;
    const empty = !draft.doc.contact.name.trim() && draft.doc.experience.length === 0;
    if (empty) return;
    const timer = window.setTimeout(() => {
      void previewDocument(draft.doc, draft.template || "column", draft.accent)
        .then((reply) => setPages(reply.pages))
        .catch(() => setPages([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, stage]);

  function edit(changed: Partial<Draft>) {
    edited.current = true;
    setDraft((current) => ({ ...current, ...changed }));
  }

  function ready(doc: ResumeDoc, how?: "scratch") {
    edited.current = true;
    setSource(takeImportedText() || source);
    setFromScratch(how === "scratch");
    setBaseline(doc);
    setDraft((current) => ({ ...current, doc, template: current.template || recommendTemplate(doc) }));
    setPages([]);
    setStage("editor");
  }

  function openFile() {
    if (opening) return;
    setOpening(true);
    setOpenError("");
    void importResumeFile()
      .then((doc) => {
        if (doc) ready(doc);
      })
      .catch((err: unknown) => setOpenError(`${err}`))
      .finally(() => setOpening(false));
  }

  const facts = factCount(draft.doc);
  const editedFacts = editedCount(draft.doc, baseline);
  const pageCount = pages.length;
  const line = `${draft.doc.contact.name || "Resume"} · ${pageCount} ${pageCount === 1 ? "page" : "pages"} · ${facts} ${facts === 1 ? "fact" : "facts"}${editedFacts > 0 ? ` · ${editedFacts} edited` : ""}`;

  return {
    stage,
    draft,
    savedAt,
    fromScratch,
    baseline,
    source,
    setup,
    pages,
    saveError,
    opening,
    openError,
    line,
    edit,
    ready,
    openFile,
    openSaved: () => {
      setFromScratch(false);
      setBaseline(draft.doc);
      setStage("editor");
    },
    openSetup: () => setSetup(true),
    closeSetup: () => setSetup(false),
    startOver: () => {
      setStage("empty");
      setPages([]);
    },
    painted: () => {
      if (paintedOnce.current) return;
      paintedOnce.current = true;
      mark("first_useful_action:resume");
    },
  };
}
