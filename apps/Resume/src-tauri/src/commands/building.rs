//! Thumbnails, the build itself, and saving what it produced.

use super::{engine::{engine_of, model_ready}, store_for};
use crate::build::{self, Format, Progress};
use crate::keys;
use crate::model::ResumeDoc;
use crate::provider::Provider;
use crate::templates;
use serde::Serialize;
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::State;
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

/// The twelve cards. Each template is an independent compile, so they run on
/// their own threads: twelve sequential compiles took about 250 ms, which is
/// long enough for the Style screen to look stuck.
pub fn render_all_thumbnails(doc: &ResumeDoc, accent: &str) -> Vec<Thumbnail> {
    // Built once and shared: it depends only on the resume and the accent, and
    // constructing it costs about half of a compile.
    let library = match templates::std_for(doc, accent) {
        Ok(library) => library,
        Err(message) => {
            return templates::all()
                .iter()
                .map(|template| failed_card(template, message.clone()))
                .collect();
        }
    };
    std::thread::scope(|scope| {
        let running: Vec<_> = templates::all()
            .iter()
            .map(|template| {
                let library = library.clone();
                scope.spawn(move || one_thumbnail(template, library))
            })
            .collect();
        running
            .into_iter()
            .map(|handle| {
                handle.join().unwrap_or_else(|_| Thumbnail {
                    id: String::new(),
                    name: String::new(),
                    svg: String::new(),
                    error: "This style could not be drawn. Choose another one.".to_string(),
                })
            })
            .collect()
    })
}

fn one_thumbnail(template: &templates::Template, library: crate::render::Std) -> Thumbnail {
    match templates::to_card(template, library) {
        Ok(Some(svg)) => Thumbnail {
            id: template.id.to_string(),
            name: template.name.to_string(),
            svg,
            error: String::new(),
        },
        Ok(None) => failed_card(template, "This style produced no pages. Choose another one."),
        Err(message) => failed_card(template, message),
    }
}

fn failed_card(template: &templates::Template, message: impl Into<String>) -> Thumbnail {
    Thumbnail {
        id: template.id.to_string(),
        name: template.name.to_string(),
        svg: String::new(),
        error: message.into(),
    }
}

/// `async` so Tauri runs this off the main thread, leaving the webview free to
/// paint while the twelve compiles run. One shot, no progress bar — a couple of
/// milliseconds of progress would be theatre.
#[tauri::command]
pub async fn render_thumbnails(doc: ResumeDoc, accent: String) -> Vec<Thumbnail> {
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

/// What the Save button needs, and nothing else — in particular not the page
/// SVGs, which the Result screen already holds.
pub struct Saveable {
    pub bytes: Vec<u8>,
    pub suggested_name: String,
    pub format: Format,
}

/// Holds the one built file between the Build screen and the Save button.
#[derive(Default)]
pub struct BuiltFile(pub Mutex<Option<Saveable>>);

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
    /// Optional wording aim for the model pass. Empty is the default rewrite.
    /// Truncated in `rewrite::system_for`. Never a fact, never a job description.
    #[serde(default)]
    pub aim: String,
}

/// The outcome of the wording pass, whichever tier ran it.
struct Rewritten {
    doc: ResumeDoc,
    /// What ran, in the words shown on the build screen and the result.
    engine: String,
    /// One line per rewrite the fact gate refused. Never an error.
    notes: Vec<String>,
    used_model: bool,
}

/// Choose a tier and run it. Extracted from `build_document` because tier
/// selection, sidecar lifetime and the engine's own name are one concern and
/// laying out a page is another — a fifth tier belongs here and nowhere else.
///
/// The model pass runs whenever a tier is ready — a saved key, or the offline
/// model installed. It is deliberately *not* gated on `tighten`: that toggle is
/// the free rule-based pass, and letting it switch off a configured engine meant
/// a user with a key silently got no rewrite at all. It replaces the
/// deterministic tightening rather than stacking on top of it — two passes over
/// the same sentence is how wording gets mangled.
async fn rewrite_wording(
    app: &tauri::AppHandle,
    doc: ResumeDoc,
    aim: &str,
    on_progress: &Channel<Progress>,
) -> Result<Rewritten, String> {
    let free = |doc| Rewritten {
        doc,
        engine: OFFLINE_ENGINE.to_string(),
        notes: Vec::new(),
        used_model: false,
    };

    let root = store_for(app)?.path().to_path_buf();
    let (stored, provider) = engine_of(app)?;
    if !model_ready(&root, &provider) {
        return Ok(free(doc));
    }

    if stored.provider == "local" {
        // The offline engine: a process on this machine, reachable only on
        // loopback, speaking the same shape as any other endpoint.
        let entry = crate::local::chosen(&root, &stored.offline_model).ok_or_else(|| {
            "No offline model is chosen. Pick one in Settings, or use your own API key or the free rule-based pass."
                .to_string()
        })?;
        let binary = crate::sidecar::beside_this_binary("llama-server")?;
        let port = crate::sidecar::free_port()?;
        let engine_process =
            crate::sidecar::Sidecar::start(&binary, &crate::local::model_path(&root, &entry), port)?;
        let _ = on_progress.send(stage("Starting the offline engine", 5, LOCAL_ENGINE));
        crate::sidecar::wait_until_ready(port, crate::sidecar::READY_ATTEMPTS).await?;
        let _ = on_progress.send(stage("Rewriting wording", 10, LOCAL_ENGINE));
        let local = Provider::Local {
            base_url: engine_process.url(),
        };
        let (doc, outcome) = crate::rewrite::rewrite_doc(&doc, &local, "", &stored.model, aim).await?;
        // The fact gate has just run inside `rewrite_doc`. Naming it is the one
        // stage that shows the promise doing work.
        let _ = on_progress.send(stage("Checking facts", 12, LOCAL_ENGINE));
        // The sidecar is dropped here, which kills it. Nothing keeps running
        // after a build.
        drop(engine_process);
        return Ok(Rewritten {
            doc,
            engine: LOCAL_ENGINE.to_string(),
            notes: outcome.notes,
            used_model: true,
        });
    }

    // `model_ready` said a key is there; if it vanished between the two calls,
    // the free pass is a working answer, not an error.
    let Some(key) = keys::read(provider.id()) else {
        return Ok(free(doc));
    };
    let named = format!("Rewritten with your key at {}", provider.host());
    let _ = on_progress.send(stage("Rewriting wording", 10, &named));
    let (doc, outcome) = crate::rewrite::rewrite_doc(&doc, &provider, &key, &stored.model, aim).await?;
    let _ = on_progress.send(stage("Checking facts", 12, &named));
    Ok(Rewritten {
        doc,
        engine: named,
        notes: outcome.notes,
        used_model: true,
    })
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
        aim,
    } = request;
    let template = templates::find(&template).ok_or_else(|| {
        "That style is no longer available. Go back to Style and choose another one.".to_string()
    })?;
    let format = Format::parse(&format)?;

    let rewritten = rewrite_wording(&app, doc, &aim, &on_progress).await?;
    let Rewritten {
        doc,
        engine,
        notes,
        used_model,
    } = rewritten;

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

    // The save path needs the bytes and the name; the preview pages belong to
    // the response and are moved into it. Keeping a second copy of every page
    // SVG alive for the life of the app bought nothing.
    *built.0.lock().map_err(|_| {
        "The last build could not be stored. Build it again.".to_string()
    })? = Some(Saveable {
        bytes: result.bytes,
        suggested_name: result.suggested_name.clone(),
        format: result.format,
    });
    // What the wording pass had to say, then what the page itself has to say.
    let mut notes = notes;
    notes.extend(result.notes);
    Ok(BuildResult {
        pages: result.pages,
        suggested_name: result.suggested_name,
        engine,
        notes,
    })
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
