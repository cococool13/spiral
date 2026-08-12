//! The IPC surface. Thin on purpose: every command validates, delegates, and
//! turns an error into a sentence a person can act on. Nothing here parses,
//! writes, or knows a path — that belongs to `parse_text` and `store`.
//!
//! `save_into` and `load_from` exist so the logic is testable against a
//! temporary folder; the `#[tauri::command]` wrappers only resolve the real one.

use crate::build::{self, Built, Format, Progress};
use crate::keys;
use crate::provider::Provider;
use crate::settings::{self, EngineSettings};
use crate::model::ResumeDoc;
use crate::parse_text;
use crate::store::{Store, StoredDoc};
use crate::templates;
use serde::Serialize;
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

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

pub fn render_all_thumbnails(doc: &ResumeDoc, accent: &str) -> Vec<Thumbnail> {
    templates::all()
        .iter()
        .map(|template| match templates::to_svg_pages(template, doc, accent) {
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

/// The six swatches, served from Rust because the hex values may not live in
/// the frontend — `check-hex` allows colours only in the brand token file, and
/// these are the user's document colours, not Spiral's.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Accent {
    pub id: String,
    pub hex: String,
}

#[tauri::command]
pub fn list_accents() -> Vec<Accent> {
    crate::accent::ACCENTS
        .iter()
        .map(|(id, hex)| Accent {
            id: id.to_string(),
            hex: format!("#{hex}"),
        })
        .collect()
}

/// Reads a resume the user pointed at. `Ok(None)` means they dismissed the
/// picker, which is not a failure.
#[tauri::command]
pub async fn import_resume_file(app: tauri::AppHandle) -> Result<Option<ResumeDoc>, String> {
    let Some(chosen) = app
        .dialog()
        .file()
        .add_filter("Resume", &["pdf", "docx"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = chosen
        .into_path()
        .map_err(|e| format!("That file cannot be opened: {e}. Choose another one."))?;
    Ok(Some(import_from(&path)?))
}

/// The drag-and-drop path. The path comes from the window's own drop event, so
/// it is a file the user physically dropped — but it is still read through the
/// same extension check as everything else.
#[tauri::command]
pub fn import_dropped_file(path: String) -> Result<ResumeDoc, String> {
    import_from(std::path::Path::new(&path))
}

fn import_from(path: &std::path::Path) -> Result<ResumeDoc, String> {
    let text = crate::import::from_path(path)?;
    let doc = parse_text::parse_text(&text);
    if doc.contact.name.is_empty() && doc.experience.is_empty() && doc.education.is_empty() {
        return Err(format!(
            "Nothing could be read out of {}. Open it, copy the text, and paste it instead.",
            path.display()
        ));
    }
    Ok(doc)
}

/// What the Check screen shows beside each bullet: the tightened wording, and
/// any advice. Advice is never a change.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulletReview {
    pub bullet_id: String,
    pub tightened: String,
    pub notes: Vec<String>,
}

#[tauri::command]
pub fn review_wording(doc: ResumeDoc) -> Vec<BulletReview> {
    let mut out = Vec::new();
    for role in doc
        .experience
        .iter()
        .chain(doc.projects.iter())
        .chain(doc.leadership.iter())
    {
        for bullet in &role.bullets {
            if bullet.text.trim().is_empty() {
                continue;
            }
            let result = crate::tighten::tighten_bullet(&bullet.text, role.end.present);
            // Only worth showing when there is something to say.
            if result.text != bullet.text || !result.notes.is_empty() {
                out.push(BulletReview {
                    bullet_id: bullet.id.clone(),
                    tightened: result.text,
                    notes: result.notes,
                });
            }
        }
    }
    out
}

/// Everything the Settings screen needs to describe the engine — and nothing
/// it must not have. There is no key field here, by design: the frontend can
/// learn *whether* a key exists, never what it is.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub provider: String,
    pub model: String,
    pub base_url: String,
    pub has_key: bool,
    /// The exact hostname the key would be sent to, shown before anything is.
    pub host: String,
}

fn engine_of(app: &tauri::AppHandle) -> Result<(EngineSettings, Provider), String> {
    let root = store_for(app)?.path().to_path_buf();
    let stored = settings::load(&root);
    let provider = Provider::parse(&stored.provider, &stored.base_url)?;
    Ok((stored, provider))
}

#[tauri::command]
pub fn engine_info(app: tauri::AppHandle) -> Result<EngineInfo, String> {
    let (stored, provider) = engine_of(&app)?;
    Ok(EngineInfo {
        has_key: keys::has(provider.id()),
        host: provider.host(),
        provider: stored.provider,
        model: stored.model,
        base_url: stored.base_url,
    })
}

#[tauri::command]
pub fn save_engine(
    app: tauri::AppHandle,
    provider: String,
    model: String,
    base_url: String,
) -> Result<EngineInfo, String> {
    // Validate before writing, so a bad base URL is refused rather than stored.
    Provider::parse(&provider, &base_url)?;
    let root = store_for(&app)?.path().to_path_buf();
    let model = if model.trim().is_empty() {
        Provider::parse(&provider, &base_url)?.default_model().to_string()
    } else {
        model.trim().to_string()
    };
    settings::save(
        &root,
        &EngineSettings {
            provider,
            model,
            base_url,
        },
    )
    .map_err(|e| format!("Could not save these settings: {e}."))?;
    engine_info(app)
}

/// The key goes straight to the OS keychain. It is never returned, logged, or
/// written to the app data folder.
#[tauri::command]
pub fn save_api_key(app: tauri::AppHandle, key: String) -> Result<EngineInfo, String> {
    let (_, provider) = engine_of(&app)?;
    keys::store(provider.id(), &key)?;
    engine_info(app)
}

#[tauri::command]
pub fn clear_api_key(app: tauri::AppHandle) -> Result<EngineInfo, String> {
    let (_, provider) = engine_of(&app)?;
    keys::clear(provider.id())?;
    engine_info(app)
}

#[tauri::command]
pub fn parse_pasted_text(text: String) -> ResumeDoc {
    parse_text::parse_text(&text)
}

/// Five compiles, roughly 200 ms in total. Deliberately synchronous: the Style
/// screen has nothing to show until they are all done, and a progress bar for
/// a fifth of a second would be theatre.
#[tauri::command]
pub fn render_thumbnails(doc: ResumeDoc, accent: String) -> Vec<Thumbnail> {
    render_all_thumbnails(&doc, &accent)
}

/// What the Build screen gets back. The bytes stay in Rust — sending a whole
/// PDF through IPC and back again to save it would be pure waste, and the file
/// has no business existing in the webview at all.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildResult {
    pub pages: Vec<String>,
    pub suggested_name: String,
    /// Named plainly on the result screen: what actually ran.
    pub engine: String,
    /// One line per rewrite the fact gate refused. Never an error.
    pub notes: Vec<String>,
}

/// Holds the one built file between the Build screen and the Save button.
#[derive(Default)]
pub struct BuiltFile(pub Mutex<Option<Built>>);

/// Grouped because the build takes five choices and Rust rightly complains at
/// a function with eight parameters. The frontend sends one object.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRequest {
    pub doc: ResumeDoc,
    pub template: String,
    pub format: String,
    pub accent: String,
    pub tighten: bool,
}

#[tauri::command]
pub async fn build_document(
    app: tauri::AppHandle,
    request: BuildRequest,
    built: State<'_, BuiltFile>,
    on_progress: Channel<Progress>,
) -> Result<BuildResult, String> {
    let BuildRequest {
        doc,
        template,
        format,
        accent,
        tighten,
    } = request;
    let template = templates::find(&template).ok_or_else(|| {
        "That style is no longer available. Go back to Style and choose another one.".to_string()
    })?;
    let format = Format::parse(&format)?;

    // The model pass, when the user has configured a key. It replaces the
    // deterministic tightening rather than stacking on top of it — two passes
    // over the same sentence is how wording gets mangled.
    let (doc, engine, notes) = if tighten {
        let (stored, provider) = engine_of(&app)?;
        match keys::read(provider.id()) {
            Some(key) => {
                let _ = on_progress.send(Progress {
                    stage: "Rewriting wording".to_string(),
                    percent: 10,
                });
                let (rewritten, outcome) =
                    crate::rewrite::rewrite_doc(&doc, &provider, &key, &stored.model).await?;
                let engine = format!("Rewritten with your key at {}", provider.host());
                (rewritten, engine, outcome.notes)
            }
            None => (doc, "Built offline, no network used".to_string(), Vec::new()),
        }
    } else {
        (doc, "Built offline, no network used".to_string(), Vec::new())
    };

    // When the model already rewrote the wording, the deterministic pass is
    // skipped — but its stage name still appears, so the build screen's
    // vocabulary does not change under the user.
    let used_model = engine.starts_with("Rewritten");
    let result = build::build(
        &doc,
        template,
        format,
        &accent,
        tighten && !used_model,
        |progress| {
            let _ = on_progress.send(progress);
        },
    )?;

    let response = BuildResult {
        pages: result.pages.clone(),
        suggested_name: result.suggested_name.clone(),
        engine,
        notes,
    };
    *built.0.lock().map_err(|_| {
        "The last build could not be stored. Build it again.".to_string()
    })? = Some(result);
    Ok(response)
}

/// Opens the system save dialog and writes the built file to whatever path the
/// user picked. The app never chooses a folder itself and never writes anywhere
/// the user did not name.
///
/// `Ok(None)` means the user closed the dialog. Cancelling is not a failure and
/// must not be reported as one.
#[tauri::command]
pub async fn save_built_document(
    app: tauri::AppHandle,
    built: State<'_, BuiltFile>,
) -> Result<Option<String>, String> {
    let (bytes, suggested, extension) = {
        let guard = built
            .0
            .lock()
            .map_err(|_| "The built file could not be read. Build it again.".to_string())?;
        let file = guard
            .as_ref()
            .ok_or_else(|| "There is nothing built yet. Build your resume first.".to_string())?;
        (
            file.bytes.clone(),
            file.suggested_name.clone(),
            file.format.extension(),
        )
    };

    let Some(chosen) = app
        .dialog()
        .file()
        .set_file_name(&suggested)
        .add_filter(extension.to_uppercase(), &[extension])
        .blocking_save_file()
    else {
        return Ok(None);
    };

    let path = chosen
        .into_path()
        .map_err(|e| format!("That location cannot be written to: {e}. Choose another folder."))?;

    std::fs::write(&path, bytes)
        .map_err(|e| format!("Could not write {}: {e}. Choose another folder.", path.display()))?;
    Ok(Some(path.display().to_string()))
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

    /// An importable file that yields nothing is worse than an error: the user
    /// would land on an empty Check screen with no idea why.
    #[test]
    fn a_file_that_parses_to_nothing_is_reported_rather_than_shown_as_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("empty.docx");
        let doc = ResumeDoc::empty();
        let template = templates::find("column").unwrap();
        std::fs::write(
            &path,
            crate::docx::to_docx(&doc, &template.docx, "ink").unwrap(),
        )
        .unwrap();
        let err = import_from(&path).unwrap_err();
        assert!(err.contains("paste it instead"), "got {err}");
    }

    #[test]
    fn a_real_file_imports_into_a_document() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ada.docx");
        let original = parse_text::parse_text(
            "Ada Lovelace\nada@example.com\n\nEXPERIENCE\nAnalyst, Admiralty\nJan 2021 - Present\n- Wrote it\n",
        );
        let template = templates::find("column").unwrap();
        std::fs::write(
            &path,
            crate::docx::to_docx(&original, &template.docx, "ink").unwrap(),
        )
        .unwrap();
        let back = import_from(&path).unwrap();
        assert_eq!(back.contact.name, "Ada Lovelace");
        assert_eq!(back.experience[0].organization, "Admiralty");
    }

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
        save_into(&store, &doc, "column", "pdf", "ink", true, "2026-08-11T10:00:00Z").unwrap();
        assert_eq!(load_from(&store).unwrap().unwrap().doc.contact.name, "Ada");
    }

    #[test]
    fn thumbnails_come_back_one_per_template_as_svg() {
        let thumbs = render_all_thumbnails(&ResumeDoc::empty(), "ink");
        assert_eq!(thumbs.len(), 12);
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

        let first = render_all_thumbnails(&ada, "ink");
        let second = render_all_thumbnails(&grace, "ink");
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
        let err = save_into(&store, &ResumeDoc::empty(), "", "", "", true, "now").unwrap_err();
        assert!(err.starts_with("Could not save"), "got {err}");
        assert!(err.contains("Settings"), "no next step in: {err}");
    }
}
