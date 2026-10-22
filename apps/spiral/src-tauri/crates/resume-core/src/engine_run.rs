use crate::build::Progress;
use crate::model::ResumeDoc;
use crate::model_host::ModelHost;
use crate::provider::Provider;
use crate::settings::EngineSettings;
use std::path::Path;

pub const OFFLINE_ENGINE: &str = "Built offline, no network used";
pub const LOCAL_ENGINE: &str = "Rewritten on this computer. Nothing left it.";
pub const RESTYLE_ENGINE: &str = "Your wording, restyled";

pub struct Rewritten {
    pub doc: ResumeDoc,
    pub engine: String,
    pub notes: Vec<String>,
    pub used_model: bool,
    pub parsed: bool,
}

pub trait ProviderKey {
    fn key(&mut self, provider: &str) -> Result<Option<String>, String>;
}

fn stage(name: &str, percent: u8, engine: &str) -> Progress {
    Progress {
        stage: name.to_string(),
        percent,
        engine: engine.to_string(),
    }
}

fn free(doc: ResumeDoc) -> Rewritten {
    Rewritten {
        doc,
        engine: OFFLINE_ENGINE.to_string(),
        notes: Vec::new(),
        used_model: false,
        parsed: false,
    }
}

pub async fn rewrite_wording(
    root: &Path,
    stored: &EngineSettings,
    provider: &Provider,
    doc: ResumeDoc,
    aim: &str,
    tighten: bool,
    keys: &mut dyn ProviderKey,
    host: &mut ModelHost,
    on_progress: &mut dyn FnMut(Progress),
) -> Result<Rewritten, String> {
    if !tighten {
        return Ok(Rewritten {
            doc,
            engine: RESTYLE_ENGINE.to_string(),
            notes: Vec::new(),
            used_model: false,
            parsed: false,
        });
    }

    if stored.provider == "local" {
        let Some(entry) = crate::local::chosen(root, &stored.offline_model) else {
            return Ok(free(doc));
        };
        let binary = crate::model_host::beside_this_binary("llama-server")?;
        let model = crate::local::model_path(root, &entry);
        on_progress(stage("Starting the offline engine", 5, LOCAL_ENGINE));
        let running = host.run(&binary, &model)?;
        crate::model_host::wait_until_ready(running.port, crate::model_host::READY_ATTEMPTS)
            .await?;
        on_progress(stage("Rewriting wording", 10, LOCAL_ENGINE));
        let local = Provider::Local {
            base_url: running.url,
        };
        let (doc, outcome) =
            crate::rewrite::rewrite_doc(&doc, &local, "", &stored.model, aim).await?;
        on_progress(stage("Checking facts", 12, LOCAL_ENGINE));
        host.stop();
        return Ok(Rewritten {
            doc,
            engine: LOCAL_ENGINE.to_string(),
            notes: outcome.notes,
            used_model: true,
            parsed: outcome.parsed,
        });
    }

    if !provider.needs_key() {
        return Ok(free(doc));
    }
    let Some(key) = keys.key(provider.id())? else {
        return Ok(free(doc));
    };
    let named = format!("Rewritten with your key at {}", provider.host());
    on_progress(stage("Rewriting wording", 10, &named));
    let (doc, outcome) =
        crate::rewrite::rewrite_doc(&doc, provider, &key, &stored.model, aim).await?;
    on_progress(stage("Checking facts", 12, &named));
    Ok(Rewritten {
        doc,
        engine: named,
        notes: outcome.notes,
        used_model: true,
        parsed: outcome.parsed,
    })
}
