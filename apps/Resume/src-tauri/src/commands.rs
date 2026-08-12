//! The IPC surface. Thin on purpose: every command validates, delegates, and
//! turns an error into a sentence a person can act on. Nothing here parses,
//! writes, or knows a path — that belongs to `parse_text` and `store`.
//!
//! `save_into` and `load_from` exist so the logic is testable against a
//! temporary folder; the `#[tauri::command]` wrappers only resolve the real one.

use crate::model::ResumeDoc;
use crate::parse_text;
use crate::store::{Store, StoredDoc};
use crate::templates;
use serde::Serialize;
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub path: String,
    pub exists: bool,
}

/// One card in the style picker: the first page of the user's own resume, set
/// in that template. `error` is populated instead of `svg` when a template
/// fails, so one broken template shows one broken card rather than blanking
/// the whole screen.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Thumbnail {
    pub id: String,
    pub name: String,
    pub svg: String,
    pub error: String,
}

pub fn render_all_thumbnails(doc: &ResumeDoc) -> Vec<Thumbnail> {
    templates::all()
        .iter()
        .map(|template| match templates::to_svg_pages(template, doc) {
            Ok(mut pages) if !pages.is_empty() => Thumbnail {
                id: template.id.to_string(),
                name: template.name.to_string(),
                svg: pages.remove(0),
                error: String::new(),
            },
            Ok(_) => Thumbnail {
                id: template.id.to_string(),
                name: template.name.to_string(),
                svg: String::new(),
                error: "This style produced no pages. Choose another one.".to_string(),
            },
            Err(message) => Thumbnail {
                id: template.id.to_string(),
                name: template.name.to_string(),
                svg: String::new(),
                error: message,
            },
        })
        .collect()
}

pub fn save_into(
    store: &Store,
    doc: &ResumeDoc,
    template: &str,
    saved_at: &str,
) -> Result<(), String> {
    store.save(doc, template, saved_at).map_err(|e| {
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
pub fn parse_pasted_text(text: String) -> ResumeDoc {
    parse_text::parse_text(&text)
}

/// Five compiles, roughly 200 ms in total. Deliberately synchronous: the Style
/// screen has nothing to show until they are all done, and a progress bar for
/// a fifth of a second would be theatre.
#[tauri::command]
pub fn render_thumbnails(doc: ResumeDoc) -> Vec<Thumbnail> {
    render_all_thumbnails(&doc)
}

#[tauri::command]
pub fn save_document(
    app: tauri::AppHandle,
    doc: ResumeDoc,
    template: String,
    saved_at: String,
) -> Result<(), String> {
    save_into(&store_for(&app)?, &doc, &template, &saved_at)
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
    fn parsing_is_reachable_through_the_command_layer() {
        let doc = parse_pasted_text("Ada Lovelace\nada@example.com\n".to_string());
        assert_eq!(doc.contact.name, "Ada Lovelace");
    }

    #[test]
    fn save_and_load_go_through_one_store() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let mut doc = ResumeDoc::empty();
        doc.contact.name = "Ada".into();
        save_into(&store, &doc, "column", "2026-08-11T10:00:00Z").unwrap();
        assert_eq!(load_from(&store).unwrap().unwrap().doc.contact.name, "Ada");
    }

    #[test]
    fn thumbnails_come_back_one_per_template_as_svg() {
        let thumbs = render_all_thumbnails(&ResumeDoc::empty());
        assert_eq!(thumbs.len(), 5);
        for thumb in &thumbs {
            assert!(thumb.error.is_empty(), "{} errored: {}", thumb.id, thumb.error);
            assert!(thumb.svg.starts_with("<svg"), "{} is not an SVG", thumb.id);
            assert!(!thumb.name.is_empty());
        }
    }

    /// Typst renders text as glyph outlines, so the name cannot be grepped out
    /// of the SVG. What *can* be proved is that the card is a render of this
    /// document rather than a fixed sample: change the document, change the SVG.
    #[test]
    fn a_thumbnail_is_a_render_of_this_document_not_a_sample() {
        let mut ada = ResumeDoc::empty();
        ada.contact.name = "Ada Lovelace".into();
        let mut grace = ResumeDoc::empty();
        grace.contact.name = "Grace Hopper".into();

        let first = render_all_thumbnails(&ada);
        let second = render_all_thumbnails(&grace);
        for (a, b) in first.iter().zip(second.iter()) {
            assert_ne!(a.svg, b.svg, "{} rendered the same thing for two names", a.id);
        }
    }

    #[test]
    fn a_save_failure_reads_as_a_sentence_with_a_next_step() {
        // A file where the folder should be: create_dir_all cannot succeed.
        let dir = tempfile::tempdir().unwrap();
        let blocked = dir.path().join("blocked");
        std::fs::write(&blocked, b"x").unwrap();
        let store = Store::new(blocked);
        let err = save_into(&store, &ResumeDoc::empty(), "", "now").unwrap_err();
        assert!(err.starts_with("Could not save"), "got {err}");
        assert!(err.contains("Settings"), "no next step in: {err}");
    }
}
