//! Which engine, whose key, and whether a model is there at all.
//!
//! Separate from the rest of the IPC surface because it is the only part that
//! touches a credential: `keys::read` is never reachable from here, and no
//! command in this file can return a key.

use super::store_for;
use crate::keys;
use crate::provider::Provider;
use crate::settings::{self, EngineSettings};
use serde::Serialize;
use tauri::ipc::Channel;

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
    /// Whether a model tier would actually run. Not the same question as
    /// `has_key` — the offline tier needs no key and reports `false` for one —
    /// and this is what "another version" hangs on.
    pub uses_model: bool,
    /// The exact hostname the key would be sent to, shown before anything is.
    pub host: String,
    /// Where this provider issues keys, or empty when there is nowhere to send
    /// someone. The frontend opens it; it never guesses it.
    pub key_url: String,
    /// True until the person has picked a wording path — a model, a key, or
    /// the rule-based pass — so first launch can open on that choice.
    pub needs_setup: bool,
}

pub(super) fn engine_of(app: &tauri::AppHandle) -> Result<(EngineSettings, Provider), String> {
    let root = store_for(app)?.path().to_path_buf();
    let stored = settings::load(&root);
    let provider = Provider::parse(&stored.provider, &stored.base_url)?;
    Ok((stored, provider))
}

/// Is there a model behind the button? A saved key for a hosted provider, or
/// the downloaded model for the offline one. Everything that offers a rewrite
/// asks this, so the two tiers cannot drift apart.
pub(super) fn model_ready(root: &std::path::Path, provider: &Provider) -> bool {
    if provider.needs_key() {
        keys::has(provider.id())
    } else {
        // Ready means a model this build would actually run — which, with two
        // installed and neither chosen, is none of them.
        crate::local::chosen(root, &crate::settings::load(root).offline_model).is_some()
    }
}

#[tauri::command]
pub fn engine_info(app: tauri::AppHandle) -> Result<EngineInfo, String> {
    let root = store_for(&app)?.path().to_path_buf();
    let (stored, provider) = engine_of(&app)?;
    Ok(EngineInfo {
        // An engine that needs no credential never reports one.
        has_key: provider.needs_key() && keys::has(provider.id()),
        uses_model: model_ready(&root, &provider),
        host: provider.host(),
        key_url: provider.key_url().to_string(),
        provider: stored.provider,
        model: stored.model,
        base_url: stored.base_url,
        needs_setup: !stored.setup_done && !model_ready(&root, &provider),
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
            // Changing provider does not forget which offline model was picked.
            offline_model: settings::load(&root).offline_model,
            setup_done: true,
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
    if !provider.needs_key() {
        return Err("The offline engine runs on this computer and needs no key.".to_string());
    }
    keys::store(provider.id(), &key)?;
    mark_setup_done(store_for(&app)?.path())?;
    engine_info(app)
}

#[tauri::command]
pub fn clear_api_key(app: tauri::AppHandle) -> Result<EngineInfo, String> {
    let (_, provider) = engine_of(&app)?;
    keys::clear(provider.id())?;
    engine_info(app)
}

#[tauri::command]
pub fn offline_model_status(app: tauri::AppHandle) -> Result<crate::local::ModelList, String> {
    let root = store_for(&app)?.path().to_path_buf();
    Ok(crate::local::status(&root, &crate::settings::load(&root).offline_model))
}

/// Remembers which offline model to run. Saved even when it is not downloaded
/// yet, so choosing one and then fetching it works in either order.
#[tauri::command]
pub fn choose_offline_model(
    app: tauri::AppHandle,
    id: String,
) -> Result<crate::local::ModelList, String> {
    let root = store_for(&app)?.path().to_path_buf();
    let mut stored = crate::settings::load(&root);
    stored.offline_model = id;
    crate::settings::save(&root, &stored)
        .map_err(|e| format!("Could not save that choice: {e}."))?;
    Ok(crate::local::status(&root, &stored.offline_model))
}

/// Downloads the offline model, reporting real bytes. Nothing here starts on
/// its own — the user asks for it, having been told the size first.
#[tauri::command]
pub async fn download_offline_model(
    app: tauri::AppHandle,
    id: String,
    on_progress: Channel<crate::local::DownloadProgress>,
) -> Result<crate::local::ModelList, String> {
    let root = store_for(&app)?.path().to_path_buf();
    let entry = crate::local::find(&id).ok_or_else(|| {
        "This build does not offer that model. Use your own API key, or the free rule-based pass."
            .to_string()
    })?;
    crate::local::download(&root, &entry, |progress| {
        let _ = on_progress.send(progress);
    })
    .await?;
    // Downloading one is choosing it: nobody fetches gigabytes they did not
    // intend to use, and leaving the old choice in place would run the model
    // they just replaced.
    let mut stored = crate::settings::load(&root);
    stored.offline_model = entry.id.clone();
    stored.setup_done = true;
    crate::settings::save(&root, &stored)
        .map_err(|e| format!("The model installed, but the choice could not be saved: {e}."))?;
    Ok(crate::local::status(&root, &stored.offline_model))
}

#[tauri::command]
pub fn remove_offline_model(
    app: tauri::AppHandle,
    id: String,
) -> Result<crate::local::ModelList, String> {
    let root = store_for(&app)?.path().to_path_buf();
    crate::local::remove(&root, &id)?;
    Ok(crate::local::status(&root, &crate::settings::load(&root).offline_model))
}

fn mark_setup_done(root: &std::path::Path) -> Result<(), String> {
    let mut stored = settings::load(root);
    stored.setup_done = true;
    settings::save(root, &stored).map_err(|e| format!("Could not save these settings: {e}."))
}

/// First-run skip, or any other path that has finished choosing how wording
/// is rewritten. Does not change the provider.
#[tauri::command]
pub fn complete_setup(app: tauri::AppHandle) -> Result<EngineInfo, String> {
    mark_setup_done(store_for(&app)?.path())?;
    engine_info(app)
}
