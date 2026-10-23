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

pub struct WordingJob<'a> {
    pub root: &'a Path,
    pub stored: &'a EngineSettings,
    pub provider: &'a Provider,
    pub doc: ResumeDoc,
    pub aim: &'a str,
    pub tighten: bool,
    pub keys: &'a mut dyn ProviderKey,
    pub host: &'a mut ModelHost,
    pub on_progress: &'a mut dyn FnMut(Progress),
}

pub async fn rewrite_wording(job: WordingJob<'_>) -> Result<Rewritten, String> {
    let WordingJob {
        root,
        stored,
        provider,
        doc,
        aim,
        tighten,
        keys,
        host,
        on_progress,
    } = job;
    if !tighten || stored.rules_only {
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
        let _ = std::fs::write(
            root.join("llama.pid"),
            resume_proto::format_pid(running.pid, &binary),
        );
        if let Err(err) = host.wait_ready().await {
            host.stop();
            let _ = std::fs::remove_file(root.join("llama.pid"));
            return Err(err);
        }
        on_progress(stage("Rewriting wording", 10, LOCAL_ENGINE));
        let local = Provider::Local {
            base_url: running.url,
        };
        let rewritten =
            crate::rewrite::rewrite_doc(&doc, &local, &running.api_key, &stored.model, aim).await;
        host.stop();
        let _ = std::fs::remove_file(root.join("llama.pid"));
        let (doc, outcome) = rewritten?;
        on_progress(stage("Checking facts", 12, LOCAL_ENGINE));
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
