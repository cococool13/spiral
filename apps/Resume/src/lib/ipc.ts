// The only file that talks to Tauri. Keeping the boundary in one place is what
// lets every screen be tested in jsdom without a running backend.
import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  BuildResult,
  Progress,
  ResumeDoc,
  StorageInfo,
  StoredDoc,
  Thumbnail,
} from "./types";

export function parsePastedText(text: string): Promise<ResumeDoc> {
  return invoke<ResumeDoc>("parse_pasted_text", { text });
}

export function renderThumbnails(doc: ResumeDoc): Promise<Thumbnail[]> {
  return invoke<Thumbnail[]>("render_thumbnails", { doc });
}

export function saveDocument(
  doc: ResumeDoc,
  template: string,
  format: string,
): Promise<void> {
  return invoke<void>("save_document", {
    doc,
    template,
    format,
    savedAt: new Date().toISOString(),
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
  doc: ResumeDoc,
  template: string,
  format: string,
  onProgress: (progress: Progress) => void,
): Promise<BuildResult> {
  const channel = new Channel<Progress>();
  channel.onmessage = onProgress;
  return invoke<BuildResult>("build_document", { doc, template, format, onProgress: channel });
}

/** Resolves to the path written, or null when the user closed the dialog. */
export function saveBuiltDocument(): Promise<string | null> {
  return invoke<string | null>("save_built_document");
}
