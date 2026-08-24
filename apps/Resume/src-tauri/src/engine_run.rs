//! Wording tier for a build: free rules, offline model, or the user's key.

use crate::build::Progress;
use crate::keys;
use crate::model::ResumeDoc;
use crate::provider::Provider;
use crate::settings::EngineSettings;
use std::path::Path;
use tauri::ipc::Channel;

pub const OFFLINE_ENGINE: &str = "Built offline, no network used";
pub const LOCAL_ENGINE: &str = "Rewritten on this computer — nothing left it";

pub struct Rewritten {
    pub doc: ResumeDoc,
    pub engine: String,
    pub notes: Vec<String>,
    pub used_model: bool,
}

fn stage(name: &str, percent: u8, engine: &str) -> Progress {
    Progress {
        stage: name.to_string(),
        percent,
        engine: engine.to_string(),
    }
}

/// Is there a model behind the button? Same question `commands::engine` asks,
/// kept here so a build does not import the IPC module for tier selection.
fn model_ready(root: &Path, provider: &Provider, offline_model: &str) -> bool {
    if provider.needs_key() {
        keys::has(provider.id())
    } else {
        crate::local::chosen(root, offline_model).is_some()
    }
}

/// Pick a wording tier and run it. Ready model (key or offline) replaces the
/// free tighten pass; it never stacks on top.
pub async fn rewrite_wording(
    root: &Path,
    stored: &EngineSettings,
    provider: &Provider,
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

    if !model_ready(root, provider, &stored.offline_model) {
        return Ok(free(doc));
    }

    if stored.provider == "local" {
        // The offline engine: a process on this machine, reachable only on
        // loopback, speaking the same shape as any other endpoint.
        let entry = crate::local::chosen(root, &stored.offline_model).ok_or_else(|| {
            "No offline model is chosen. Pick one in Settings, or use your own API key or the free rule-based pass."
                .to_string()
        })?;
        let binary = crate::sidecar::beside_this_binary("llama-server")?;
        let port = crate::sidecar::free_port()?;
        let engine_process =
            crate::sidecar::Sidecar::start(&binary, &crate::local::model_path(root, &entry), port)?;
        let _ = on_progress.send(stage("Starting the offline engine", 5, LOCAL_ENGINE));
        crate::sidecar::wait_until_ready(port, crate::sidecar::READY_ATTEMPTS).await?;
        let _ = on_progress.send(stage("Rewriting wording", 10, LOCAL_ENGINE));
        let local = Provider::Local {
            base_url: engine_process.url(),
        };
        let (doc, outcome) =
            crate::rewrite::rewrite_doc(&doc, &local, "", &stored.model, aim).await?;
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
    let (doc, outcome) =
        crate::rewrite::rewrite_doc(&doc, provider, &key, &stored.model, aim).await?;
    let _ = on_progress.send(stage("Checking facts", 12, &named));
    Ok(Rewritten {
        doc,
        engine: named,
        notes: outcome.notes,
        used_model: true,
    })
}
