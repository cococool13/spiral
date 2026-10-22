use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use resume_core::engine_run::{rewrite_wording, ProviderKey};
use resume_core::model::ResumeDoc;
use resume_core::model_host::ModelHost;
use resume_core::settings::{self, EngineSettings};
use resume_core::store::{Store, StoredDoc};
use resume_core::{build, intake, local, templates, thumbs};
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
    cancelled: bool,
}

impl Session {
    pub fn open(root: &Path) -> Self {
        Self {
            root: root.to_path_buf(),
            host: ModelHost::Off,
            runtime: tokio::runtime::Runtime::new().expect("the resume engine runtime starts"),
            last_built: None,
            cancelled: false,
        }
    }

    pub fn cancel(&mut self) {
        self.cancelled = true;
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
        self.cancelled = false;
        let result = match call {
            Call::ImportFile { path } => {
                let doc = intake::import_file(Path::new(&path)).map_err(UserError::new)?;
                Ok(serde_json::to_value(doc).map_err(|err| UserError::new(err.to_string()))?)
            }
            Call::ParseText { text } => Ok(serde_json::to_value(intake::parse_pasted(&text))
                .map_err(|err| UserError::new(err.to_string()))?),
            Call::Preview { doc, look } => self.preview(doc, &look),
            Call::Thumbnails { doc, accent } => {
                let doc = doc_from(doc)?;
                let cards = thumbs::render_all_thumbnails(&doc, &accent);
                let mut paths = Vec::new();
                for (index, card) in cards.iter().enumerate() {
                    if card.svg.is_empty() {
                        continue;
                    }
                    let name = format!("cache/preview/thumb-{}-{index}.svg", card.id);
                    write_cache(&self.root, &name, card.svg.as_bytes())?;
                    paths.push(name);
                }
                Ok(json!({ "thumbs": paths }))
            }
            Call::Build {
                doc,
                look,
                aim,
                tighten,
                format,
            } => self.build(id, doc, &look, &aim, tighten, &format, host),
            Call::ReviewWording { doc } => self.review(id, doc, host),
            Call::SaveBuilt { path } => self.save_built(Path::new(&path)),
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
            } => self.save_engine(provider, model, base_url, offline_model),
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
        if self.cancelled {
            return Err(UserError::new("Cancelled."));
        }
        result
    }

    fn preview(&self, doc: Value, look: &str) -> Result<Value, UserError> {
        let doc = doc_from(doc)?;
        let template = templates::find(look)
            .ok_or_else(|| UserError::new("That style is no longer available."))?;
        let pages = templates::to_svg_pages(template, &doc, "ink").map_err(UserError::new)?;
        let stamp = stamp(&doc, look);
        let mut paths = Vec::new();
        for (index, page) in pages.iter().enumerate() {
            let name = format!("cache/preview/{stamp}-p{}.svg", index + 1);
            write_cache(&self.root, &name, page.as_bytes())?;
            paths.push(name);
        }
        Ok(json!({ "pages": paths }))
    }

    fn build(
        &mut self,
        id: u64,
        doc: Value,
        look: &str,
        aim: &str,
        tighten: bool,
        format: &str,
        host: &mut (impl ProviderKey + Events),
    ) -> Result<Value, UserError> {
        let doc = doc_from(doc)?;
        let template = templates::find(look)
            .ok_or_else(|| UserError::new("That style is no longer available."))?;
        let format = build::Format::parse(format).map_err(UserError::new)?;
        let stored = settings::load(&self.root);
        let provider = resume_core::provider::Provider::parse(&stored.provider, &stored.base_url)
            .map_err(UserError::new)?;
        let progress = std::cell::RefCell::new(Vec::new());
        let rewritten = self
            .runtime
            .block_on(rewrite_wording(
                &self.root,
                &stored,
                &provider,
                doc,
                aim,
                tighten,
                host,
                &mut self.host,
                &mut |step| progress.borrow_mut().push(step.percent),
            ))
            .map_err(UserError::new)?;
        for percent in progress.into_inner() {
            host.emit(
                id,
                Event::Progress {
                    done: u32::from(percent),
                    total: 100,
                },
            );
        }
        let build_progress = std::cell::RefCell::new(Vec::new());
        let built = build::build(
            &rewritten.doc,
            template,
            format,
            "ink",
            tighten && !(rewritten.used_model && rewritten.parsed),
            |step| build_progress.borrow_mut().push(step.percent),
        )
        .map_err(UserError::new)?;
        for percent in build_progress.into_inner() {
            host.emit(
                id,
                Event::Progress {
                    done: u32::from(percent),
                    total: 100,
                },
            );
        }
        let file_name = format!("cache/build/{}", built.suggested_name);
        write_cache(&self.root, &file_name, &built.bytes)?;
        let stamp = stamp(&rewritten.doc, look);
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
        id: u64,
        doc: Value,
        host: &mut (impl ProviderKey + Events),
    ) -> Result<Value, UserError> {
        let doc = doc_from(doc)?;
        let stored = settings::load(&self.root);
        if stored.provider == "local" && local::chosen(&self.root, &stored.offline_model).is_some()
        {
            let provider =
                resume_core::provider::Provider::parse(&stored.provider, &stored.base_url)
                    .map_err(UserError::new)?;
            let progress = std::cell::RefCell::new(Vec::new());
            let rewritten = self
                .runtime
                .block_on(rewrite_wording(
                    &self.root,
                    &stored,
                    &provider,
                    doc,
                    "",
                    true,
                    host,
                    &mut self.host,
                    &mut |step| progress.borrow_mut().push(step.percent),
                ))
                .map_err(UserError::new)?;
            for percent in progress.into_inner() {
                host.emit(
                    id,
                    Event::Progress {
                        done: u32::from(percent),
                        total: 100,
                    },
                );
            }
            return Ok(serde_json::to_value(&rewritten.doc)
                .map_err(|err| UserError::new(err.to_string()))?);
        }
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
        let Some(bytes) = self.last_built.as_ref() else {
            return Err(UserError::new(
                "There is nothing built yet. Build the resume first.",
            ));
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
        }))
    }

    fn save_engine(
        &self,
        provider: String,
        model: String,
        base_url: String,
        offline_model: String,
    ) -> Result<Value, UserError> {
        resume_core::provider::Provider::parse(&provider, &base_url).map_err(UserError::new)?;
        let previous = settings::load(&self.root);
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
        };
        settings::save(&self.root, &settings)
            .map_err(|err| UserError::new(format!("Could not save these settings: {err}.")))?;
        Ok(json!({
            "provider": settings.provider,
            "model": settings.model,
            "baseUrl": settings.base_url,
        }))
    }

    fn download(
        &self,
        request: u64,
        id: String,
        host: &mut impl Events,
    ) -> Result<Value, UserError> {
        let entry = local::find(&id).ok_or_else(|| {
            UserError::new(
                "This build does not offer that model. Use your own API key, or the free rule-based pass.",
            )
        })?;
        let progress = std::cell::RefCell::new(Vec::new());
        self.runtime
            .block_on(local::download(&self.root, &entry, |step| {
                progress.borrow_mut().push(step.percent);
            }))
            .map_err(UserError::new)?;
        for percent in progress.into_inner() {
            host.emit(
                request,
                Event::Progress {
                    done: u32::from(percent),
                    total: 100,
                },
            );
        }
        let mut stored = settings::load(&self.root);
        stored.offline_model = entry.id.clone();
        stored.setup_done = true;
        settings::save(&self.root, &stored).map_err(|err| {
            UserError::new(format!(
                "The model installed, but the choice could not be saved: {err}."
            ))
        })?;
        Ok(
            serde_json::to_value(local::status(&self.root, &stored.offline_model))
                .map_err(|err| UserError::new(err.to_string()))?,
        )
    }
}

fn doc_from(value: Value) -> Result<ResumeDoc, UserError> {
    serde_json::from_value(value).map_err(|_| UserError::new("That resume could not be read."))
}

fn stamp(doc: &ResumeDoc, look: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    serde_json::to_string(doc)
        .unwrap_or_default()
        .hash(&mut hasher);
    look.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
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
