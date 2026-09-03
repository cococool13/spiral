//! Whop license commands for Slim.

use spiral_license::{self, AppId, LicenseError};
use tauri::AppHandle;

const APP: AppId = AppId::Slim;

fn validator_url() -> String {
    std::env::var("SPIRAL_LICENSE_URL")
        .unwrap_or_else(|_| spiral_license::DEFAULT_VALIDATOR_URL.into())
}

fn map_err(e: LicenseError) -> String {
    e.user_message()
}

#[tauri::command]
pub fn license_status() -> Result<bool, String> {
    Ok(spiral_license::has_key(APP))
}

#[tauri::command]
pub async fn license_activate(key: String) -> Result<(), String> {
    spiral_license::activate(APP, &key, &validator_url())
        .await
        .map_err(map_err)
}

#[tauri::command]
pub async fn license_ensure() -> Result<(), String> {
    spiral_license::ensure_licensed(APP, &validator_url())
        .await
        .map_err(map_err)
}

#[tauri::command]
pub fn license_clear() -> Result<(), String> {
    spiral_license::clear_key(APP).map_err(map_err)
}

/// Refuse product commands until a key is present.
pub fn require(_app: &AppHandle) -> Result<(), String> {
    if !spiral_license::has_key(APP) {
        return Err(LicenseError::EmptyKey.user_message());
    }
    Ok(())
}
