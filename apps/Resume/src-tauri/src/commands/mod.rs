//! The IPC surface. Thin on purpose: every command validates, delegates, and
//! turns an error into a sentence a person can act on. Nothing here parses,
//! writes, or knows a path — that belongs to `parse_text` and `store`.
//!
//! Split by what each group touches: `editing` for what the user brings in,
//! `engine` for the credential and the model tier, `building` for producing a
//! file. This module keeps only what they share — the one store, and the
//! commands that read and write it.
//!
//! `save_into` and `load_from` exist so the logic is testable against a
//! temporary folder; the `#[tauri::command]` wrappers only resolve the real one.

pub mod building;
pub mod editing;
pub mod engine;

// Types only. A `#[tauri::command]` also generates hidden items that a
// re-export does not carry, so `generate_handler!` in `lib.rs` names each
// command by its real module path.
pub use building::{BuildRequest, BuildResult, BuiltFile};

use crate::model::ResumeDoc;
use crate::store::{Store, StoredDoc};
use serde::Serialize;
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub path: String,
    pub exists: bool,
}

pub fn save_into(
    store: &Store,
    doc: &ResumeDoc,
    template: &str,
    format: &str,
    accent: &str,
    tighten: bool,
    saved_at: &str,
) -> Result<(), String> {
    store
        .save(doc, template, format, accent, tighten, saved_at)
        .map_err(|e| {
        format!(
            "Could not save to {}: {e}. Check the folder is writable, or clear stored data in Settings.",
            store.path().display()
        )
        })
}

pub fn load_from(store: &Store) -> Result<Option<StoredDoc>, String> {
    store.load().map_err(|e| {
        format!(
            "Could not read {}: {e}. Clear stored data in Settings to start again.",
            store.path().display()
        )
    })
}

fn store_for(app: &tauri::AppHandle) -> Result<Store, String> {
    app.path()
        .app_data_dir()
        .map(Store::new)
        .map_err(|e| format!("Could not find this machine's application data folder: {e}."))
}

#[tauri::command]
pub fn save_document(
    app: tauri::AppHandle,
    doc: ResumeDoc,
    template: String,
    format: String,
    accent: String,
    tighten: bool,
    saved_at: String,
) -> Result<(), String> {
    save_into(
        &store_for(&app)?,
        &doc,
        &template,
        &format,
        &accent,
        tighten,
        &saved_at,
    )
}

#[tauri::command]
pub fn load_document(app: tauri::AppHandle) -> Result<Option<StoredDoc>, String> {
    load_from(&store_for(&app)?)
}

#[tauri::command]
pub fn storage_info(app: tauri::AppHandle) -> Result<StorageInfo, String> {
    let store = store_for(&app)?;
    Ok(StorageInfo {
        path: store.path().display().to_string(),
        exists: store.path().exists(),
    })
}

#[tauri::command]
pub fn delete_stored_data(app: tauri::AppHandle) -> Result<(), String> {
    let store = store_for(&app)?;
    store.delete_all().map_err(|e| {
        format!(
            "Could not delete {}: {e}. Remove the folder yourself to finish.",
            store.path().display()
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn save_and_load_go_through_one_store() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let mut doc = ResumeDoc::empty();
        doc.contact.name = "Ada".into();
        save_into(&store, &doc, "column", "pdf", "ink", true, "2026-08-11T10:00:00Z").unwrap();
        assert_eq!(load_from(&store).unwrap().unwrap().doc.contact.name, "Ada");
    }
    #[test]
    fn a_save_failure_reads_as_a_sentence_with_a_next_step() {
        // A file where the folder should be: create_dir_all cannot succeed.
        let dir = tempfile::tempdir().unwrap();
        let blocked = dir.path().join("blocked");
        std::fs::write(&blocked, b"x").unwrap();
        let store = Store::new(blocked);
        let err = save_into(&store, &ResumeDoc::empty(), "", "", "", true, "now").unwrap_err();
        assert!(err.starts_with("Could not save"), "got {err}");
        assert!(err.contains("Settings"), "no next step in: {err}");
    }
}
