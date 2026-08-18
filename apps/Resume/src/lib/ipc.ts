// The only file that talks to Tauri. Keeping the boundary in one place is what
// lets every screen be tested in jsdom without a running backend.
import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  Accent,
  BuildResult,
  BulletReview,
  Draft,
  DownloadProgress,
  EngineInfo,
  ModelList,
  Progress,
  ResumeDoc,
  StorageInfo,
  StoredDoc,
  Thumbnail,
} from "./types";

export function parsePastedText(text: string): Promise<ResumeDoc> {
  return invoke<ResumeDoc>("parse_pasted_text", { text });
}

export function renderThumbnails(doc: ResumeDoc, accent: string): Promise<Thumbnail[]> {
  return invoke<Thumbnail[]>("render_thumbnails", { doc, accent });
}

/** Opens the file picker. Resolves to null when the user dismisses it. */
export function importResumeFile(): Promise<ResumeDoc | null> {
  return invoke<ResumeDoc | null>("import_resume_file");
}

/** Reads a file the user dropped onto the window. */
export function importDroppedFile(path: string): Promise<ResumeDoc> {
  return invoke<ResumeDoc>("import_dropped_file", { path });
}

/** What the free wording pass would change, and what it wants to flag. */
export function reviewWording(doc: ResumeDoc): Promise<BulletReview[]> {
  return invoke<BulletReview[]>("review_wording", { doc });
}

export function listAccents(): Promise<Accent[]> {
  return invoke<Accent[]>("list_accents");
}

export function saveDocument(draft: Draft): Promise<void> {
  return invoke<void>("save_document", {
    stored: { ...draft, savedAt: new Date().toISOString() },
  });
}

export function loadDocument(): Promise<StoredDoc | null> {
  return invoke<StoredDoc | null>("load_document");
}

export function storageInfo(): Promise<StorageInfo> {
  return invoke<StorageInfo>("storage_info");
}

export function deleteStoredData(): Promise<void> {
  return invoke<void>("delete_stored_data");
}

/** Builds the file and reports each real stage through a channel. The bytes
 *  stay in Rust; only the preview pages and a suggested filename come back. */
export function buildDocument(
  draft: Draft,
  onProgress: (progress: Progress) => void,
  aim = "",
): Promise<BuildResult> {
  const channel = new Channel<Progress>();
  channel.onmessage = onProgress;
  return invoke<BuildResult>("build_document", {
    request: { ...draft, aim },
    onProgress: channel,
  });
}

export function offlineModelStatus(): Promise<ModelList> {
  return invoke<ModelList>("offline_model_status");
}

/** Remembers which offline model to run. Saved whether or not it is on disk. */
export function chooseOfflineModel(id: string): Promise<ModelList> {
  return invoke<ModelList>("choose_offline_model", { id });
}

/** Downloads one offline model, reporting real bytes as they arrive.
 *  Downloading it also chooses it — nobody fetches gigabytes by accident. */
export function downloadOfflineModel(
  id: string,
  onProgress: (progress: DownloadProgress) => void,
): Promise<ModelList> {
  const channel = new Channel<DownloadProgress>();
  channel.onmessage = onProgress;
  return invoke<ModelList>("download_offline_model", { id, onProgress: channel });
}

export function removeOfflineModel(id: string): Promise<ModelList> {
  return invoke<ModelList>("remove_offline_model", { id });
}

export function engineInfo(): Promise<EngineInfo> {
  return invoke<EngineInfo>("engine_info");
}

export function saveEngine(
  provider: string,
  model: string,
  baseUrl: string,
): Promise<EngineInfo> {
  return invoke<EngineInfo>("save_engine", { provider, model, baseUrl });
}

/** The key goes straight to the OS keychain and is never read back. */
export function saveApiKey(key: string): Promise<EngineInfo> {
  return invoke<EngineInfo>("save_api_key", { key });
}

export function clearApiKey(): Promise<EngineInfo> {
  return invoke<EngineInfo>("clear_api_key");
}

/** Resolves to the path written, or null when the user closed the dialog. */
export function saveBuiltDocument(): Promise<string | null> {
  return invoke<string | null>("save_built_document");
}
