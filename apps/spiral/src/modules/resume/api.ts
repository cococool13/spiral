import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core";
import { providerClear, providerSet } from "../../shell/license/api";
import type { ProviderId } from "../../shell/license/types";
import type {
  Accent,
  BuildResult,
  BuiltVersion,
  BulletReview,
  Draft,
  EngineInfo,
  ModelList,
  Progress,
  ResumeDoc,
  StorageInfo,
  StoredDoc,
  Thumbnail,
} from "./lib/types";

export interface ResumeEvent {
  type: "progress";
  done: number;
  total: number;
}

export interface Finding {
  type: "hiddenText" | "unknownHeading" | "unparsedDate" | "missingContact";
  page?: number;
  sample?: string;
  raw?: string;
  field?: "name" | "email" | "phone" | "location";
}

type ResumeCall = Record<string, unknown> & { type: string };

let pendingSource = "";

export function takeImportedText(): string {
  const text = pendingSource;
  pendingSource = "";
  return text;
}

export const resume = {
  call<T>(body: ResumeCall, onEvent?: (event: ResumeEvent) => void): Promise<T> {
    const events = new Channel<ResumeEvent>();
    if (onEvent) events.onmessage = onEvent;
    return invoke<T>("resume", { call: body, events });
  },
};

export function cacheSrc(path: string): string {
  return path ? convertFileSrc(path) : "";
}

function asDoc(value: ResumeDoc & { source?: string }): ResumeDoc {
  pendingSource = typeof value.source === "string" ? value.source : pendingSource;
  const doc = { ...value };
  delete doc.source;
  return doc;
}

export async function importResumeFile(): Promise<ResumeDoc | null> {
  const value = await resume.call<(ResumeDoc & { source?: string }) | null>({ type: "import_file", path: "" });
  return value ? asDoc(value) : null;
}

export async function importDroppedFile(path: string): Promise<ResumeDoc> {
  const value = await resume.call<ResumeDoc & { source?: string }>({ type: "import_file", path });
  return asDoc(value);
}

export async function parsePastedText(text: string): Promise<ResumeDoc> {
  pendingSource = text;
  return resume.call<ResumeDoc>({ type: "parse_text", text });
}

export function previewDocument(doc: ResumeDoc, template: string, accent: string): Promise<{ pages: string[] }> {
  return resume.call({ type: "preview", doc, look: template, accent });
}

export async function renderThumbnails(accent: string, doc: ResumeDoc): Promise<Thumbnail[]> {
  const reply = await resume.call<{
    thumbs: Array<{ id: string; name: string; file: string; error: string }>;
  }>({ type: "thumbnails", doc, accent });
  return reply.thumbs.map((thumb) => ({
    id: thumb.id,
    name: thumb.name,
    svg: "",
    error: thumb.error,
    file: thumb.file,
  }));
}

export function listAccents(): Promise<Accent[]> {
  return resume.call({ type: "list_accents" });
}

export function buildDocument(
  draft: Draft,
  onProgress: (progress: Progress) => void,
  aim = "",
): Promise<BuildResult> {
  return resume.call(
    {
      type: "build",
      doc: draft.doc,
      look: draft.template,
      accent: draft.accent,
      aim: aim || "one_page",
      tighten: draft.tighten,
      format: draft.format || "pdf",
    },
    (event) => {
      if (event.total === 0) return;
      onProgress({
        stage: "Building",
        percent: Math.round((event.done / event.total) * 100),
        engine: "",
      });
    },
  );
}

export async function reviewWording(doc: ResumeDoc): Promise<BulletReview[]> {
  const value = await resume.call<unknown>({ type: "review_wording", doc });
  return Array.isArray(value) ? (value as BulletReview[]) : [];
}

export function checkResume(doc: ResumeDoc, text: string): Promise<{ findings: Finding[] }> {
  return resume.call({ type: "check", doc, text });
}

/** What one export answered: the files it wrote, or the files it would replace. */
export type ExportReply =
  | { kind: "saved"; files: string[]; dir: string; engine: string; notes: string[] }
  | { kind: "conflict"; files: string[]; dir: string };

/**
 * One export, both formats. An empty `dir` opens a folder picker; a `dir` is
 * only accepted again for the folder the person just chose. Rust writes
 * `<Name> Resume.pdf` and `.docx` side by side and never replaces a file
 * unless `replace` is set. `null` means the picker was cancelled.
 */
export async function exportBoth(
  draft: Draft,
  dir: string,
  replace: boolean,
  onProgress: (percent: number) => void,
): Promise<ExportReply | null> {
  const reply = await resume.call<Record<string, unknown> | null>(
    {
      type: "export_both",
      doc: draft.doc,
      look: draft.template,
      accent: draft.accent,
      aim: "one_page",
      tighten: draft.tighten,
      dir,
      replace,
    },
    (event) => {
      if (event.total > 0) onProgress(Math.round((event.done / event.total) * 100));
    },
  );
  if (!reply) return null;
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const folder = typeof reply.dir === "string" ? reply.dir : "";
  if (Array.isArray(reply.conflict)) return { kind: "conflict", files: strings(reply.conflict), dir: folder };
  return {
    kind: "saved",
    files: strings(reply.files),
    dir: folder,
    engine: typeof reply.engine === "string" ? reply.engine : "",
    notes: strings(reply.notes),
  };
}

export async function loadDocument(): Promise<StoredDoc | null> {
  const reply = await resume.call<{ stored: StoredDoc | null }>({ type: "load_document" });
  return reply.stored;
}

export function saveDocument(draft: Draft): Promise<void> {
  const stored: StoredDoc = { ...draft, savedAt: new Date().toISOString() };
  return resume.call({ type: "save_document", stored });
}

export function storageInfo(): Promise<StorageInfo> {
  return resume.call({ type: "storage_info" });
}

export function deleteStoredData(): Promise<void> {
  return resume.call({ type: "delete_stored_data" });
}

export function engineInfo(): Promise<EngineInfo> {
  return resume.call({ type: "engine_info" });
}

export function saveEngine(
  provider: string,
  model: string,
  baseUrl: string,
  offlineModel = "",
  rulesOnly = false,
): Promise<EngineInfo> {
  return resume.call({
    type: "save_engine",
    provider,
    model,
    base_url: baseUrl,
    offline_model: offlineModel,
    rules_only: rulesOnly,
  });
}

export function useRulesOnly(): Promise<EngineInfo> {
  return saveEngine("", "", "", "", true);
}

export function offlineModelStatus(): Promise<ModelList> {
  return resume.call({ type: "offline_models" });
}

export function downloadOfflineModel(
  id: string,
  onProgress: (progress: { received: number; total: number; percent: number }) => void,
): Promise<ModelList> {
  return resume.call({ type: "download_model", id }, (event) => {
    const percent = event.total === 0 ? 0 : Math.round((event.done / event.total) * 100);
    onProgress({ received: event.done, total: event.total, percent });
  });
}

export function removeOfflineModel(id: string): Promise<ModelList> {
  return resume.call({ type: "remove_model", id });
}

export async function chooseOfflineModel(id: string): Promise<ModelList> {
  await saveEngine("local", "", "", id);
  return offlineModelStatus();
}

function cloudProvider(provider: string): ProviderId {
  if (provider === "openai" || provider === "compatible") return provider;
  return "anthropic";
}

export async function saveApiKey(key: string): Promise<EngineInfo> {
  const info = await engineInfo();
  await providerSet(cloudProvider(info.provider), key);
  return engineInfo();
}

export async function clearApiKey(): Promise<EngineInfo> {
  const info = await engineInfo();
  await providerClear(cloudProvider(info.provider));
  return engineInfo();
}

export async function completeSetup(): Promise<EngineInfo> {
  const info = await engineInfo();
  return saveEngine(info.provider || "local", info.model, info.baseUrl);
}

export type { BuiltVersion };
