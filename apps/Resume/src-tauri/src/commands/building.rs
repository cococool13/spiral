//! Thumbnails, the build itself, and saving what it produced.

use super::{engine::{engine_of, model_ready}, store_for};
use crate::build::{self, Built, Format, Progress};
use crate::keys;
use crate::model::ResumeDoc;
use crate::provider::Provider;
use crate::templates;
use serde::Serialize;
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

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

/// Twelve compiles, roughly half a second in total. Deliberately synchronous:
/// the Style
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

/// The two engine names that are not built from a hostname. Stated once, so
/// the build screen and the result screen cannot say different things.
const OFFLINE_ENGINE: &str = "Built offline, no network used";
const LOCAL_ENGINE: &str = "Rewritten on this computer — nothing left it";

fn stage(name: &str, percent: u8, engine: &str) -> Progress {
    Progress {
        stage: name.to_string(),
        percent,
        engine: engine.to_string(),
    }
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

    // The model pass runs whenever a model tier is ready — a saved key, or the
    // offline model installed. It is deliberately *not* gated on `tighten`:
    // that toggle is the free rule-based pass, and letting it switch off a
    // configured engine meant a user with a key silently got no rewrite at all.
    // It replaces the deterministic tightening rather than stacking on top of
    // it — two passes over the same sentence is how wording gets mangled.
    let root = store_for(&app)?.path().to_path_buf();
    let (stored, provider) = engine_of(&app)?;
    let (doc, engine, notes, used_model) = if !model_ready(&root, &provider) {
        (doc, OFFLINE_ENGINE.to_string(), Vec::new(), false)
    } else if stored.provider == "local" {
        // The offline engine: a process on this machine, reachable only on
        // loopback, speaking the same shape as any other endpoint.
        let entry = crate::local::catalogue().ok_or_else(|| {
            "This build has no offline model. Use your own API key, or the free rule-based pass."
                .to_string()
        })?;
        let binary = app
            .path()
            .resolve("binaries/llama-server", tauri::path::BaseDirectory::Resource)
            .map_err(|_| "This build has no offline engine bundled.".to_string())?;
        let port = crate::sidecar::free_port()?;
        let engine_process =
            crate::sidecar::Sidecar::start(&binary, &crate::local::model_path(&root, &entry), port)?;
        let _ = on_progress.send(stage("Starting the offline engine", 5, LOCAL_ENGINE));
        crate::sidecar::wait_until_ready(port, crate::sidecar::READY_ATTEMPTS).await?;
        let _ = on_progress.send(stage("Rewriting wording", 10, LOCAL_ENGINE));
        let provider = Provider::Local {
            base_url: engine_process.url(),
        };
        let (rewritten, outcome) =
            crate::rewrite::rewrite_doc(&doc, &provider, "", &stored.model).await?;
        // The fact gate has just run inside `rewrite_doc`. Naming it is the one
        // stage that shows the promise doing work.
        let _ = on_progress.send(stage("Checking facts", 12, LOCAL_ENGINE));
        // The sidecar is dropped here, which kills it. Nothing keeps
        // running after a build.
        drop(engine_process);
        (rewritten, LOCAL_ENGINE.to_string(), outcome.notes, true)
    } else {
        // `model_ready` said a key is there; if it vanished between the two
        // calls, the free pass is a working answer, not an error.
        match keys::read(provider.id()) {
            Some(key) => {
                let named = format!("Rewritten with your key at {}", provider.host());
                let _ = on_progress.send(stage("Rewriting wording", 10, &named));
                let (rewritten, outcome) =
                    crate::rewrite::rewrite_doc(&doc, &provider, &key, &stored.model).await?;
                let _ = on_progress.send(stage("Checking facts", 12, &named));
                (rewritten, named, outcome.notes, true)
            }
            None => (doc, OFFLINE_ENGINE.to_string(), Vec::new(), false),
        }
    };

    // Every stage from here on carries the engine name, so the build screen
    // says what is doing the work while it is being done.
    let named = engine.clone();
    let result = build::build(
        &doc,
        template,
        format,
        &accent,
        tighten && !used_model,
        |mut progress| {
            progress.engine = named.clone();
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

#[cfg(test)]
mod tests {
    use super::*;
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
}
