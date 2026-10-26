use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use resume_core::engine_run::{rewrite_wording, ProviderKey, Rewritten, WordingJob};
use resume_core::model::ResumeDoc;
use resume_core::model_host::ModelHost;
use resume_core::settings::{self, EngineSettings};
use resume_core::store::{Store, StoredDoc};
use resume_core::{ats, build, intake, local, templates, thumbs};
use resume_proto::{Call, Event, UserError};
use serde_json::{json, Value};

pub trait Events {
    fn emit(&mut self, id: u64, event: Event);
}

pub struct Session {
    root: PathBuf,
    host: ModelHost,
    runtime: tokio::runtime::Runtime,
    last_built: Option<Vec<u8>>,
    cancelled: Arc<AtomicBool>,
}

struct BuildSpec<'a> {
    look: &'a str,
    accent: &'a str,
    aim: &'a str,
    tighten: bool,
    format: &'a str,
}

impl Session {
    pub fn open(root: &Path) -> Self {
        Self {
            root: root.to_path_buf(),
            host: ModelHost::Off,
            runtime: tokio::runtime::Runtime::new().expect("the resume engine runtime starts"),
            last_built: None,
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn watch(&mut self, cancel: Arc<AtomicBool>) {
        self.cancelled = cancel;
    }

    pub fn cancel(&mut self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.host.stop();
    }

    pub fn handle(
        &mut self,
        id: u64,
        licensed: bool,
        call: Call,
        host: &mut (impl ProviderKey + Events),
    ) -> Result<Value, UserError> {
        if call.needs_license() && !licensed {
            return Err(UserError::new(
                "Spiral needs a license before this can run.",
            ));
        }
        self.cancelled.store(false, Ordering::SeqCst);
        let result = match call {
            Call::ImportFile { path } => {
                let (doc, text) =
                    intake::import_with_text(Path::new(&path)).map_err(UserError::new)?;
                let mut value =
                    serde_json::to_value(doc).map_err(|err| UserError::new(err.to_string()))?;
                if let Some(object) = value.as_object_mut() {
                    object.insert("source".into(), Value::String(text));
                }
                Ok(value)
            }
            Call::ParseText { text } => Ok(serde_json::to_value(intake::parse_pasted(&text))
                .map_err(|err| UserError::new(err.to_string()))?),
            Call::Preview { doc, look, accent } => self.preview(doc, &look, &accent),
            Call::Thumbnails { doc, accent } => {
                let doc = doc_from(doc)?;
                let cards = thumbs::render_all_thumbnails(&doc, &accent);
                let mut thumbs = Vec::new();
                for (index, card) in cards.iter().enumerate() {
                    let file = if card.svg.is_empty() {
                        String::new()
                    } else {
                        let name = format!(
                            "cache/preview/thumb-{}-{index}.svg",
                            stamp(&doc, &card.id, &accent)
                        );
                        write_cache(&self.root, &name, card.svg.as_bytes())?;
                        name
                    };
                    let error = if card.svg.is_empty() {
                        if card.error.is_empty() {
                            "Could not draw this style.".to_string()
                        } else {
                            card.error.clone()
                        }
                    } else {
                        String::new()
                    };
                    thumbs.push(json!({
                        "id": card.id,
                        "name": card.name,
                        "file": file,
                        "error": error,
                    }));
                }
                Ok(json!({ "thumbs": thumbs }))
            }
            Call::Build {
                doc,
                look,
                accent,
                aim,
                tighten,
                format,
            } => self.build(
                id,
                doc,
                BuildSpec {
                    look: &look,
                    accent: &accent,
                    aim: &aim,
                    tighten,
                    format: &format,
                },
                host,
            ),
            Call::Check { doc, text } => {
                let doc = doc_from(doc)?;
                let findings = ats::check(&text, &doc, &[]);
                Ok(json!({ "findings": findings }))
            }
            Call::ReviewWording { doc } => self.review(id, doc, host),
            Call::SaveBuilt { path } => self.save_built(Path::new(&path)),
            Call::ExportBoth {
                doc,
                look,
                accent,
                aim,
                tighten,
                dir,
                replace,
            } => self.export_both(
                id,
                doc,
                BuildSpec {
                    look: &look,
                    accent: &accent,
                    aim: &aim,
                    tighten,
                    format: "",
                },
                Path::new(&dir),
                replace,
                host,
            ),
            Call::SaveDocument { stored } => {
                let stored: StoredDoc = serde_json::from_value(stored)
                    .map_err(|_| UserError::new("That resume could not be saved."))?;
                Store::new(self.root.clone())
                    .save(&stored)
                    .map_err(|err| UserError::new(format!("Could not save the resume: {err}.")))?;
                Ok(json!({ "saved": true }))
            }
            Call::LoadDocument {} => {
                let stored = Store::new(self.root.clone()).load().map_err(|err| {
                    UserError::new(format!(
                        "Could not read the saved resume: {err}. The file was left in place."
                    ))
                })?;
                Ok(json!({ "stored": stored }))
            }
            Call::StorageInfo {} => {
                let store = Store::new(self.root.clone());
                Ok(json!({
                    "path": store.path().display().to_string(),
                    "exists": store.path().join("resume.json").is_file(),
                }))
            }
            Call::DeleteStoredData {} => {
                Store::new(self.root.clone()).delete_all().map_err(|err| {
                    UserError::new(format!("Could not delete the saved resume: {err}."))
                })?;
                Ok(json!({ "deleted": true }))
            }
            Call::EngineInfo {} => self.engine_info(host),
            Call::SaveEngine {
                provider,
                model,
                base_url,
                offline_model,
                rules_only,
            } => self.save_engine(provider, model, base_url, offline_model, rules_only),
            Call::OfflineModels {} => {
                let chosen = settings::load(&self.root).offline_model;
                Ok(serde_json::to_value(local::status(&self.root, &chosen))
                    .map_err(|err| UserError::new(err.to_string()))?)
            }
            Call::DownloadModel { id: model } => self.download(id, model, host),
            Call::RemoveModel { id } => {
                local::remove(&self.root, &id).map_err(UserError::new)?;
                let chosen = settings::load(&self.root).offline_model;
                Ok(serde_json::to_value(local::status(&self.root, &chosen))
                    .map_err(|err| UserError::new(err.to_string()))?)
            }
            Call::ListAccents {} => Ok(json!(resume_core::accent::ACCENTS
                .iter()
                .map(|(id, hex)| json!({ "id": id, "hex": format!("#{hex}") }))
                .collect::<Vec<_>>())),
        };
        if self.cancelled.load(Ordering::SeqCst) {
            self.host.stop();
            return Err(UserError::new("Cancelled."));
        }
        result
    }

    fn preview(&self, doc: Value, look: &str, accent: &str) -> Result<Value, UserError> {
        let doc = doc_from(doc)?;
        let template = templates::find(look)
            .ok_or_else(|| UserError::new("That style is no longer available."))?;
        let accent = if accent.is_empty() { "ink" } else { accent };
        let pages = templates::to_svg_pages(template, &doc, accent).map_err(UserError::new)?;
        let stamp = stamp(&doc, look, accent);
        let mut paths = Vec::new();
        for (index, page) in pages.iter().enumerate() {
            let name = format!("cache/preview/{stamp}-p{}.svg", index + 1);
            write_cache(&self.root, &name, page.as_bytes())?;
            paths.push(name);
        }
        Ok(json!({ "pages": paths }))
    }

    /// The wording pass. Every model rewrite goes through the fact gate
    /// (`resume_core::gate`) inside `rewrite_wording`; what comes back is the
    /// document every file is built from. Progress is reported inside `span`.
    fn rewrite(
        &mut self,
        id: u64,
        doc: ResumeDoc,
        aim: &str,
        tighten: bool,
        span: (u32, u32),
        host: &mut (impl ProviderKey + Events),
    ) -> Result<Rewritten, UserError> {
        let stored = settings::load(&self.root);
        let provider = resume_core::provider::Provider::parse(&stored.provider, &stored.base_url)
            .map_err(UserError::new)?;
        let key = if tighten
            && !stored.rules_only
            && stored.provider != "local"
            && provider.needs_key()
        {
            host.key(provider.id()).map_err(UserError::new)?
        } else {
            None
        };
        let cancel = Arc::clone(&self.cancelled);
        let rewritten = {
            let mut report = |step: resume_core::build::Progress| {
                host.emit(
                    id,
                    Event::Progress {
                        done: within(span, step.percent),
                        total: 100,
                    },
                );
            };
            self.runtime.block_on(async {
                tokio::select! {
                    result = rewrite_wording(WordingJob {
                        root: &self.root,
                        stored: &stored,
                        provider: &provider,
                        doc,
                        aim,
                        tighten,
                        key,
                        host: &mut self.host,
                        on_progress: &mut report,
                    }) => result,
                    _ = watch_cancel(cancel) => Err("Cancelled.".to_string()),
                }
            })
        };
        if rewritten.is_err() || self.cancelled.load(Ordering::SeqCst) {
            self.host.stop();
        }
        let rewritten = rewritten.map_err(UserError::new)?;
        if self.cancelled.load(Ordering::SeqCst) {
            return Err(UserError::new("Cancelled."));
        }
        Ok(rewritten)
    }

    /// One export, both formats. The wording pass runs once, so the PDF and
    /// the Word file carry the same words, then both files are written into
    /// `dir` as `<Name> Resume.pdf` and `.docx`. Existing files are never
    /// replaced unless `replace` is set: the first answer lists them instead,
    /// before anything is built.
    fn export_both(
        &mut self,
        id: u64,
        doc: Value,
        spec: BuildSpec<'_>,
        dir: &Path,
        replace: bool,
        host: &mut (impl ProviderKey + Events),
    ) -> Result<Value, UserError> {
        let BuildSpec {
            look,
            accent,
            aim,
            tighten,
            format: _,
        } = spec;
        let accent = if accent.is_empty() { "ink" } else { accent };
        let doc = doc_from(doc)?;
        let template = templates::find(look)
            .ok_or_else(|| UserError::new("That style is no longer available."))?;
        if !dir.is_dir() {
            return Err(UserError::new(
                "That folder is no longer there. Export again and choose another folder.",
            ));
        }
        let stem = build::export_stem(&doc);
        let formats = [build::Format::Pdf, build::Format::Docx];
        let targets: Vec<PathBuf> = formats
            .iter()
            .map(|format| dir.join(format!("{stem}.{}", format.extension())))
            .collect();
        let taken: Vec<String> = targets
            .iter()
            .filter(|path| path.exists())
            .filter_map(|path| path.file_name().map(|n| n.to_string_lossy().into_owned()))
            .collect();
        if !taken.is_empty() && !replace {
            return Ok(json!({ "conflict": taken, "dir": dir.display().to_string() }));
        }

        let rewritten = self.rewrite(id, doc, aim, tighten, (0, 40), host)?;
        let tighten_rules = tighten && !(rewritten.used_model && rewritten.parsed);
        let mut built = Vec::new();
        for (index, format) in formats.into_iter().enumerate() {
            let span = if index == 0 { (40, 70) } else { (70, 100) };
            let file = build::build(
                &rewritten.doc,
                template,
                format,
                accent,
                tighten_rules,
                |step| {
                    host.emit(
                        id,
                        Event::Progress {
                            done: within(span, step.percent),
                            total: 100,
                        },
                    );
                },
            )
            .map_err(UserError::new)?;
            if self.cancelled.load(Ordering::SeqCst) {
                return Err(UserError::new("Cancelled."));
            }
            built.push(file);
        }

        // Both files land, or neither: write both beside their targets first,
        // then move them into place.
        let parts: Vec<PathBuf> = targets
            .iter()
            .map(|path| path.with_extension(format!("{}.part", ext_of(path))))
            .collect();
        for (part, file) in parts.iter().zip(&built) {
            if let Err(err) = std::fs::write(part, &file.bytes) {
                for part in &parts {
                    let _ = std::fs::remove_file(part);
                }
                return Err(UserError::new(format!(
                    "Could not write into {}: {err}. Check the folder lets you save files, then export again.",
                    dir.display()
                )));
            }
        }
        for (part, target) in parts.iter().zip(&targets) {
            std::fs::rename(part, target).map_err(|err| {
                UserError::new(format!(
                    "Could not save {}: {err}. Export again.",
                    target.display()
                ))
            })?;
        }

        let mut notes = rewritten.notes;
        for file in built {
            for note in file.notes {
                if !notes.contains(&note) {
                    notes.push(note);
                }
            }
        }
        Ok(json!({
            "files": targets.iter().map(|path| path.display().to_string()).collect::<Vec<_>>(),
            "dir": dir.display().to_string(),
            "engine": rewritten.engine,
            "notes": notes,
        }))
    }

    fn build(
        &mut self,
        id: u64,
        doc: Value,
        spec: BuildSpec<'_>,
        host: &mut (impl ProviderKey + Events),
    ) -> Result<Value, UserError> {
        let BuildSpec {
            look,
            accent,
            aim,
            tighten,
            format,
        } = spec;
        let accent = if accent.is_empty() { "ink" } else { accent };
        let doc = doc_from(doc)?;
        let template = templates::find(look)
            .ok_or_else(|| UserError::new("That style is no longer available."))?;
        let format = build::Format::parse(format).map_err(UserError::new)?;
        let rewritten = self.rewrite(id, doc, aim, tighten, (0, 100), host)?;
        let built = build::build(
            &rewritten.doc,
            template,
            format,
            accent,
            tighten && !(rewritten.used_model && rewritten.parsed),
            |step| {
                host.emit(
                    id,
                    Event::Progress {
                        done: u32::from(step.percent),
                        total: 100,
                    },
                );
            },
        )
        .map_err(UserError::new)?;
        let file_name = format!("cache/build/{}", built.suggested_name);
        write_cache(&self.root, &file_name, &built.bytes)?;
        let manifest = serde_json::to_vec(&json!({
            "file": file_name,
            "len": built.bytes.len(),
        }))
        .map_err(|err| UserError::new(err.to_string()))?;
        write_cache(&self.root, "cache/build/last.json", &manifest)?;
        let stamp = stamp(&rewritten.doc, look, accent);
        let mut pages = Vec::new();
        for (index, page) in built.pages.iter().enumerate() {
            let name = format!("cache/preview/{stamp}-p{}.svg", index + 1);
            write_cache(&self.root, &name, page.as_bytes())?;
            pages.push(name);
        }
        self.last_built = Some(built.bytes);
        let mut notes = rewritten.notes;
        notes.extend(built.notes);
        Ok(json!({
            "pages": pages,
            "file": file_name,
            "suggestedName": built.suggested_name,
            "engine": rewritten.engine,
            "notes": notes,
        }))
    }

    fn review(
        &mut self,
        _id: u64,
        doc: Value,
        _host: &mut (impl ProviderKey + Events),
    ) -> Result<Value, UserError> {
        let doc = doc_from(doc)?;
        let mut out = Vec::new();
        for role in doc.roles() {
            for bullet in &role.bullets {
                if bullet.text.trim().is_empty() {
                    continue;
                }
                let result = resume_core::tighten::tighten_bullet(&bullet.text, role.end.present);
                if result.text != bullet.text || !result.notes.is_empty() {
                    out.push(json!({
                        "bulletId": bullet.id,
                        "tightened": result.text,
                        "notes": result.notes,
                    }));
                }
            }
        }
        Ok(json!(out))
    }

    fn save_built(&mut self, path: &Path) -> Result<Value, UserError> {
        let bytes = if let Some(bytes) = self.last_built.clone() {
            bytes
        } else {
            self.cached_build()?
        };
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|err| {
                    UserError::new(format!("That folder could not be created: {err}."))
                })?;
            }
        }
        std::fs::write(path, bytes)
            .map_err(|err| UserError::new(format!("Could not write {}: {err}.", path.display())))?;
        Ok(json!({ "path": path.display().to_string() }))
    }

    fn engine_info(&self, keys: &mut impl ProviderKey) -> Result<Value, UserError> {
        let stored = settings::load(&self.root);
        let provider = resume_core::provider::Provider::parse(&stored.provider, &stored.base_url)
            .map_err(UserError::new)?;
        let has_key = if provider.needs_key() {
            keys.key(provider.id()).map_err(UserError::new)?.is_some()
        } else {
            false
        };
        let ready = if stored.provider == "local" {
            local::chosen(&self.root, &stored.offline_model).is_some()
        } else {
            has_key
        };
        Ok(json!({
            "provider": stored.provider,
            "model": stored.model,
            "baseUrl": stored.base_url,
            "hasKey": has_key,
            "host": provider.host(),
            "keyUrl": provider.key_url(),
            "needsSetup": !stored.setup_done && !ready,
            "rulesOnly": stored.rules_only,
        }))
    }

    fn cached_build(&self) -> Result<Vec<u8>, UserError> {
        let missing = UserError::new("There is nothing built yet. Build the resume first.");
        let raw =
            std::fs::read(self.root.join("cache/build/last.json")).map_err(|_| missing.clone())?;
        let manifest: Value = serde_json::from_slice(&raw).map_err(|_| missing.clone())?;
        let file = manifest.get("file").and_then(Value::as_str).unwrap_or("");
        let len = manifest.get("len").and_then(Value::as_u64).unwrap_or(0) as usize;
        resume_proto::cache_relative(file).map_err(|_| missing.clone())?;
        let bytes = std::fs::read(self.root.join(file)).map_err(|_| missing.clone())?;
        if bytes.is_empty() || bytes.len() != len {
            return Err(missing);
        }
        Ok(bytes)
    }

    fn save_engine(
        &self,
        provider: String,
        model: String,
        base_url: String,
        offline_model: String,
        rules_only: bool,
    ) -> Result<Value, UserError> {
        let previous = settings::load(&self.root);
        if rules_only {
            let settings = EngineSettings {
                provider: previous.provider,
                model: previous.model,
                base_url: previous.base_url,
                offline_model: previous.offline_model,
                setup_done: true,
                rules_only: true,
            };
            settings::save(&self.root, &settings)
                .map_err(|err| UserError::new(format!("Could not save these settings: {err}.")))?;
            return Ok(json!({
                "provider": settings.provider,
                "model": settings.model,
                "baseUrl": settings.base_url,
                "rulesOnly": true,
            }));
        }
        resume_core::provider::Provider::parse(&provider, &base_url).map_err(UserError::new)?;
        let model = if model.trim().is_empty() {
            resume_core::provider::Provider::parse(&provider, &base_url)
                .map_err(UserError::new)?
                .default_model()
                .to_string()
        } else {
            model.trim().to_string()
        };
        let settings = EngineSettings {
            provider,
            model,
            base_url,
            offline_model: if offline_model.is_empty() {
                previous.offline_model
            } else {
                offline_model
            },
            setup_done: true,
            rules_only: false,
        };
        settings::save(&self.root, &settings)
            .map_err(|err| UserError::new(format!("Could not save these settings: {err}.")))?;
        Ok(json!({
            "provider": settings.provider,
            "model": settings.model,
            "baseUrl": settings.base_url,
            "rulesOnly": false,
        }))
    }

    fn download(
        &mut self,
        request: u64,
        id: String,
        host: &mut impl Events,
    ) -> Result<Value, UserError> {
        let entry = local::find(&id).ok_or_else(|| {
            UserError::new(
                "This build does not offer that model. Use your own API key, or the free rule-based pass.",
            )
        })?;
        let cancel = Arc::clone(&self.cancelled);
        let fetched = self.runtime.block_on(finish_or_cancel(
            local::download(&self.root, &entry, |step| {
                host.emit(
                    request,
                    Event::Progress {
                        done: u32::from(step.percent),
                        total: 100,
                    },
                );
            }),
            cancel,
        ));
        if fetched.is_err() || self.cancelled.load(Ordering::SeqCst) {
            self.host.stop();
        }
        fetched.map_err(UserError::new)?;
        if self.cancelled.load(Ordering::SeqCst) {
            return Err(UserError::new("Cancelled."));
        }
        let mut stored = settings::load(&self.root);
        mark_model_installed(&mut stored, &entry.id);
        settings::save(&self.root, &stored).map_err(|err| {
            UserError::new(format!(
                "The model installed, but the choice could not be saved: {err}."
            ))
        })?;
        serde_json::to_value(local::status(&self.root, &stored.offline_model))
            .map_err(|err| UserError::new(err.to_string()))
    }
}

/// `percent` of a step, placed inside the `span` of the whole job.
fn within(span: (u32, u32), percent: u8) -> u32 {
    let (from, to) = span;
    from + (to.saturating_sub(from) * u32::from(percent.min(100))) / 100
}

fn ext_of(path: &Path) -> String {
    path.extension()
        .map(|ext| ext.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn doc_from(value: Value) -> Result<ResumeDoc, UserError> {
    serde_json::from_value(value).map_err(|_| UserError::new("That resume could not be read."))
}

fn stamp(doc: &ResumeDoc, look: &str, accent: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    serde_json::to_string(doc)
        .unwrap_or_default()
        .hash(&mut hasher);
    look.hash(&mut hasher);
    accent.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn mark_model_installed(stored: &mut EngineSettings, id: &str) {
    stored.offline_model = id.to_string();
    stored.setup_done = true;
    stored.rules_only = false;
}

async fn finish_or_cancel<T>(
    work: impl std::future::Future<Output = Result<T, String>>,
    cancel: Arc<AtomicBool>,
) -> Result<T, String> {
    tokio::select! {
        result = work => result,
        _ = watch_cancel(cancel) => Err("Cancelled.".to_string()),
    }
}

async fn watch_cancel(flag: Arc<AtomicBool>) {
    loop {
        if flag.load(Ordering::SeqCst) {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
}

fn write_cache(root: &Path, relative: &str, bytes: &[u8]) -> Result<(), UserError> {
    resume_proto::cache_relative(relative).map_err(|err| UserError::new(err.message))?;
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| UserError::new(format!("Could not create the cache: {err}.")))?;
    }
    std::fs::write(path, bytes)
        .map_err(|err| UserError::new(format!("Could not write the preview: {err}.")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use resume_core::engine_run::ProviderKey;

    struct Silent;

    impl ProviderKey for Silent {
        fn key(&mut self, _provider: &str) -> Result<Option<String>, String> {
            Ok(None)
        }
    }

    impl Events for Silent {
        fn emit(&mut self, _id: u64, _event: Event) {}
    }

    #[test]
    fn preview_names_change_when_the_accent_or_template_changes() {
        let doc = ResumeDoc::empty();
        assert_ne!(stamp(&doc, "column", "ink"), stamp(&doc, "column", "pine"));
        assert_ne!(stamp(&doc, "column", "ink"), stamp(&doc, "classic", "ink"));
    }

    #[test]
    fn rules_only_keeps_the_saved_provider() {
        let dir = std::env::temp_dir().join(format!("spiral-rules-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut session = Session::open(&dir);
        let mut host = Silent;
        session
            .handle(
                1,
                true,
                Call::SaveEngine {
                    provider: "openai".into(),
                    model: "gpt".into(),
                    base_url: String::new(),
                    offline_model: String::new(),
                    rules_only: false,
                },
                &mut host,
            )
            .unwrap();
        let info = session
            .handle(
                2,
                true,
                Call::SaveEngine {
                    provider: "anthropic".into(),
                    model: String::new(),
                    base_url: String::new(),
                    offline_model: String::new(),
                    rules_only: true,
                },
                &mut host,
            )
            .unwrap();
        assert_eq!(info["provider"], "openai");
        assert_eq!(info["model"], "gpt");
        assert_eq!(info["rulesOnly"], true);
        let loaded = settings::load(&dir);
        assert!(loaded.rules_only);
        assert_eq!(loaded.provider, "openai");
        session
            .handle(
                3,
                true,
                Call::SaveEngine {
                    provider: "local".into(),
                    model: String::new(),
                    base_url: String::new(),
                    offline_model: "qwen3.5-4b".into(),
                    rules_only: false,
                },
                &mut host,
            )
            .unwrap();
        let chosen = settings::load(&dir);
        assert!(!chosen.rules_only);
        assert_eq!(chosen.offline_model, "qwen3.5-4b");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn installing_a_model_clears_rules_only() {
        let mut stored = EngineSettings {
            provider: "local".into(),
            model: String::new(),
            base_url: String::new(),
            offline_model: String::new(),
            setup_done: false,
            rules_only: true,
        };
        mark_model_installed(&mut stored, "qwen3.5-4b");
        assert!(!stored.rules_only);
        assert!(stored.setup_done);
        assert_eq!(stored.offline_model, "qwen3.5-4b");
    }

    #[tokio::test]
    async fn cancel_ends_a_download_that_has_not_finished() {
        let flag = Arc::new(AtomicBool::new(true));
        let err = finish_or_cancel(std::future::pending::<Result<(), String>>(), flag)
            .await
            .unwrap_err();
        assert_eq!(err, "Cancelled.");
    }

    #[test]
    fn a_cached_build_exports_after_the_engine_restarts() {
        let dir = std::env::temp_dir().join(format!("spiral-export-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut host = Silent;
        let mut session = Session::open(&dir);
        session
            .handle(
                1,
                true,
                Call::Build {
                    doc: {
                        let mut doc = ResumeDoc::empty();
                        doc.contact.name = "Ada".into();
                        serde_json::to_value(doc).unwrap()
                    },
                    look: "column".into(),
                    accent: "ink".into(),
                    aim: String::new(),
                    tighten: false,
                    format: "pdf".into(),
                },
                &mut host,
            )
            .unwrap();
        drop(session);
        let mut session = Session::open(&dir);
        let out = dir.join("out.pdf");
        session
            .handle(
                2,
                true,
                Call::SaveBuilt {
                    path: out.display().to_string(),
                },
                &mut host,
            )
            .unwrap();
        let bytes = std::fs::read(&out).unwrap();
        assert!(bytes.starts_with(b"%PDF"), "export was not a pdf");
        let _ = std::fs::remove_dir_all(dir);
    }

    fn export_call(dir: &Path, replace: bool) -> Call {
        let mut doc = ResumeDoc::empty();
        doc.contact.name = "Ada Lovelace".into();
        Call::ExportBoth {
            doc: serde_json::to_value(doc).unwrap(),
            look: "column".into(),
            accent: "ink".into(),
            aim: String::new(),
            tighten: false,
            dir: dir.display().to_string(),
            replace,
        }
    }

    #[test]
    fn one_export_writes_both_formats_and_never_overwrites_without_asking() {
        let root = std::env::temp_dir().join(format!("spiral-both-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let out = root.join("out");
        std::fs::create_dir_all(&out).unwrap();
        let mut host = Silent;
        let mut session = Session::open(&root);

        let done = session
            .handle(1, true, export_call(&out, false), &mut host)
            .unwrap();
        let pdf = out.join("Ada Lovelace Resume.pdf");
        let docx = out.join("Ada Lovelace Resume.docx");
        assert_eq!(done["files"][0], pdf.display().to_string());
        assert_eq!(done["files"][1], docx.display().to_string());
        assert!(std::fs::read(&pdf).unwrap().starts_with(b"%PDF"));
        assert!(std::fs::read(&docx).unwrap().starts_with(b"PK"));

        std::fs::write(&pdf, b"mine").unwrap();
        let asked = session
            .handle(2, true, export_call(&out, false), &mut host)
            .unwrap();
        assert_eq!(asked["conflict"][0], "Ada Lovelace Resume.pdf");
        assert_eq!(asked["conflict"][1], "Ada Lovelace Resume.docx");
        assert_eq!(std::fs::read(&pdf).unwrap(), b"mine");

        session
            .handle(3, true, export_call(&out, true), &mut host)
            .unwrap();
        assert!(std::fs::read(&pdf).unwrap().starts_with(b"%PDF"));
        let leftovers: Vec<_> = std::fs::read_dir(&out)
            .unwrap()
            .flatten()
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".part"))
            .collect();
        assert!(leftovers.is_empty());

        let err = session
            .handle(4, true, export_call(&root.join("gone"), false), &mut host)
            .unwrap_err();
        assert!(format!("{err:?}").contains("no longer there"));
        assert!(session
            .handle(5, false, export_call(&out, true), &mut host)
            .is_err());
        let _ = std::fs::remove_dir_all(root);
    }
}
