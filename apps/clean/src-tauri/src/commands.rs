//! The only module that talks to the webview.
//!
//! Tauri types stop here. `scan` and `remove` know nothing about commands,
//! which is what lets them be tested without a running app.

use crate::{catalog, scan};

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
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
