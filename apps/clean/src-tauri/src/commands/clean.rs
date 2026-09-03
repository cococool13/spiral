//! The Clean screen: scan the catalog, and remove what was selected.
//!
//! Destructive catalog runs live in `crate::catalog_clean` so Optimize can
//! reuse them without calling through this Tauri adapter. This module owns
//! IPC shapes and progressive scan; `clean_execute` is a thin wrap.

use crate::catalog_clean::{self, CleanReport};
use crate::{catalog, scan};
use super::PATHS_PREVIEW_LIMIT;

#[derive(Debug, serde::Serialize)]
pub struct CategorySummary {
    pub id: String,
    pub label: String,
}

/// Testable core of `clean_categories` — no Tauri types.
pub(crate) fn category_summaries() -> Vec<CategorySummary> {
    catalog::catalog()
        .iter()
        .map(|e| CategorySummary { id: e.id.to_string(), label: e.label.to_string() })
        .collect()
}

#[tauri::command]
pub fn clean_categories() -> Vec<CategorySummary> {
    category_summaries()
}

/// Cap the path preview; the true count (`items`) and total (`bytes`) stay.
pub(crate) fn capped(mut result: scan::CategoryResult) -> scan::CategoryResult {
    if result.paths.len() > PATHS_PREVIEW_LIMIT {
        result.paths.truncate(PATHS_PREVIEW_LIMIT);
    }
    result
}

/// Scan every catalog category, **emitting each one the moment it is final**.
///
/// `scan_attributed_streaming`, not `scan_attributed`: a cold scan of a large
/// home directory takes long enough that a single return value leaves the
/// Clean screen saying "Looking for reclaimable files…" with nothing to show
/// for it. The design spec's data flow has always described this as
/// progressive; until now it was not.
///
/// The whole set is still returned, so a frontend that missed an event — or
/// never subscribed — is never left with a partial list. The events are an
/// improvement to *when* the user learns something, never the only copy of it.
#[tauri::command]
pub fn clean_scan(app: tauri::AppHandle) -> Result<Vec<scan::CategoryResult>, String> {
    crate::license::require(&app)?;
    use tauri::Emitter;
    let home = dirs::home_dir();
    let emit = |result: &scan::CategoryResult| {
        // A failed emit is not a failed scan. The batch return still carries
        // everything, so a dropped event costs promptness, never correctness.
        let _ = app.emit("clean:category", capped(result.clone()));
    };

    let all = match &home {
        Some(home) => scan::scan_attributed_streaming(home, &emit),
        None => scan::scan_attributed(),
    };
    Ok(all.into_iter().map(capped).collect())
}

#[tauri::command]
pub fn clean_execute(
    app: tauri::AppHandle,
    ids: Vec<String>,
    started_at: String,
) -> Result<CleanReport, String> {
    crate::license::require(&app)?;
    use tauri::Manager;
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Could not locate Spiral Clean's settings folder: {e}. Reopen the app."))?;
    let home = dirs::home_dir()
        .ok_or("Could not locate your home folder, so nothing was scanned.")?;
    catalog_clean::run_clean(ids, &dir, &home, started_at)
}
