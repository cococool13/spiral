// The only file that talks to Tauri. Keeping the boundary in one place is what
// lets every screen be tested in jsdom without a running backend.
import { invoke } from "@tauri-apps/api/core";
import type { ResumeDoc, StorageInfo, StoredDoc } from "./types";

export function parsePastedText(text: string): Promise<ResumeDoc> {
  return invoke<ResumeDoc>("parse_pasted_text", { text });
}

export function saveDocument(doc: ResumeDoc): Promise<void> {
  return invoke<void>("save_document", { doc, savedAt: new Date().toISOString() });
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
