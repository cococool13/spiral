//! Commands for sources, displays, credits and the activity log. Registered in
//! `lib.rs`; kept here so the shell file only lists them.

use tauri::{AppHandle, State};

use super::displays::{self, Display};
use super::{ActivityEntry, Credit, SourceInfo, WallId};
use crate::{license, shell};

#[tauri::command]
pub async fn sources_list(shell: State<'_, shell::Shell>) -> Result<Vec<SourceInfo>, String> {
    Ok(shell.wallpaper()?.sources_info())
}

/// No network: reads the screens of this computer.
#[tauri::command]
pub async fn displays_list(app: AppHandle) -> Result<Vec<Display>, String> {
    Ok(displays::list(&app))
}

#[tauri::command]
pub async fn source_credit(
    app: AppHandle,
    shell: State<'_, shell::Shell>,
    id: WallId,
) -> Result<Option<Credit>, String> {
    license::require(&app).await?;
    shell
        .wallpaper()?
        .credit(&id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn activity_list(
    shell: State<'_, shell::Shell>,
    limit: Option<usize>,
) -> Result<Vec<ActivityEntry>, String> {
    Ok(shell.wallpaper()?.activity(limit.unwrap_or(200).min(1000)))
}

#[tauri::command]
pub async fn activity_clear(shell: State<'_, shell::Shell>) -> Result<(), String> {
    shell.wallpaper()?.clear_activity();
    Ok(())
}

/// A person's own key for a source that offers one. `None` removes it.
#[tauri::command]
pub async fn source_key_set(
    shell: State<'_, shell::Shell>,
    source: String,
    key: Option<String>,
) -> Result<(), String> {
    shell
        .wallpaper()?
        .set_source_key(&source, key)
        .map_err(|err| err.to_string())
}
