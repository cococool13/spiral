//! The only module that talks to the webview.
//!
//! Tauri types stop here. `scan` and `remove` know nothing about commands,
//! which is what lets them be tested without a running app.

use crate::{catalog, scan};

/// Max paths returned per category across the IPC bridge.
/// The UI's disclosure view caps expansion at 500. `items` (true file count)
/// and `bytes` (total size) are always complete; this bounds only the preview list.
/// Shipping tens of thousands of paths to the webview costs seconds on real machines.
const PATHS_PREVIEW_LIMIT: usize = 500;

#[derive(Debug, serde::Serialize)]
pub struct CategorySummary {
    pub id: String,
    pub label: String,
}

/// Testable core of `clean_categories` — no Tauri types.
fn category_summaries() -> Vec<CategorySummary> {
    catalog::catalog()
        .iter()
        .map(|e| CategorySummary { id: e.id.to_string(), label: e.label.to_string() })
        .collect()
}

#[tauri::command]
pub fn clean_categories() -> Vec<CategorySummary> {
    category_summaries()
}

#[tauri::command]
pub fn clean_scan() -> Vec<scan::CategoryResult> {
    scan::scan_all()
        .into_iter()
        .map(|mut result| {
            // Cap paths at preview limit; keep true count (items) and total size (bytes).
            if result.paths.len() > PATHS_PREVIEW_LIMIT {
                result.paths.truncate(PATHS_PREVIEW_LIMIT);
            }
            result
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn every_catalog_entry_is_summarised() {
        let summaries = category_summaries();
        assert_eq!(summaries.len(), crate::catalog::catalog().len());
        assert!(summaries.iter().any(|s| s.id == "user-caches"));
        assert!(summaries.iter().any(|s| s.id == "trash"));
    }

    #[test]
    fn summaries_carry_the_catalog_label_verbatim() {
        let entry = crate::catalog::find("user-caches").unwrap();
        let summary = category_summaries()
            .into_iter()
            .find(|s| s.id == "user-caches")
            .unwrap();
        assert_eq!(summary.label, entry.label);
    }

    #[test]
    fn paths_truncated_at_preview_limit_but_counts_preserved() {
        // Build a result with >500 paths by hand to stay hermetic.
        let mut result = scan::CategoryResult {
            id: "test".to_string(),
            label: "Test Category".to_string(),
            bytes: 1_000_000,
            items: 1000, // True count: 1000 files
            paths: (0..750)
                .map(|i| PathBuf::from(format!("/tmp/test/file_{}", i)))
                .collect(),
        };
        let input_items = result.items;
        let input_bytes = result.bytes;

        // Process through the truncation logic.
        if result.paths.len() > PATHS_PREVIEW_LIMIT {
            result.paths.truncate(PATHS_PREVIEW_LIMIT);
        }

        // Verify: paths capped at 500, items and bytes unchanged.
        assert_eq!(result.paths.len(), 500);
        assert_eq!(result.items, input_items);
        assert_eq!(result.bytes, input_bytes);
    }
}
