use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum Disposition {
    /// Deleted outright. Only ever reached via a catalog match.
    Permanent,
    /// Moved to the macOS Trash.
    Trash,
}

#[derive(Debug)]
pub struct CatalogEntry {
    pub id: &'static str,
    pub label: &'static str,
    /// Roots this entry sweeps. A leading `~` is expanded at runtime.
    pub roots: &'static [&'static str],
    pub disposition: Disposition,
}

/// The safe-category catalog (ADR-0006). This list is the sole authority on
/// what Spiral Clean may permanently delete. Adding to it is a release
/// decision, never a runtime inference.
static CATALOG: &[CatalogEntry] = &[
    CatalogEntry {
        id: "user-caches",
        label: "Application caches",
        roots: &["~/Library/Caches"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "user-logs",
        label: "Logs",
        roots: &["~/Library/Logs"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "crash-reports",
        label: "Crash reports",
        roots: &["~/Library/Logs/DiagnosticReports"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "saved-state",
        label: "Saved application state",
        roots: &["~/Library/Saved Application State"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "xcode-derived-data",
        label: "Xcode derived data",
        roots: &["~/Library/Developer/Xcode/DerivedData"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "ios-device-support",
        label: "iOS device support",
        roots: &["~/Library/Developer/Xcode/iOS DeviceSupport"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "simulator-caches",
        label: "Simulator caches",
        roots: &["~/Library/Developer/CoreSimulator/Caches"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "package-manager-caches",
        label: "Package manager download caches",
        roots: &[
            "~/Library/Caches/org.swift.swiftpm",
            "~/.gradle/caches",
            "~/.npm/_cacache",
        ],
        disposition: Disposition::Permanent,
    },
];

pub fn catalog() -> &'static [CatalogEntry] {
    CATALOG
}

pub fn find(id: &str) -> Option<&'static CatalogEntry> {
    CATALOG.iter().find(|e| e.id == id)
}

/// Resolve a catalog root. Only a leading `~/` is special; everything else is
/// taken literally so a root can never be built from user input.
pub fn expand(root: &str) -> Option<PathBuf> {
    match root.strip_prefix("~/") {
        Some(rest) => dirs::home_dir().map(|h| h.join(rest)),
        None => Some(PathBuf::from(root)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_entry_is_permanent() {
        // ADR-0001 as amended: catalog membership *is* the permanent-delete
        // rule. A Trash-bound entry here would mean the catalog no longer
        // answers "what may this app destroy".
        for entry in catalog() {
            assert_eq!(entry.disposition, Disposition::Permanent, "{}", entry.id);
        }
    }

    #[test]
    fn entry_ids_are_unique() {
        let mut ids: Vec<&str> = catalog().iter().map(|e| e.id).collect();
        ids.sort_unstable();
        let before = ids.len();
        ids.dedup();
        assert_eq!(before, ids.len(), "duplicate catalog id");
    }

    #[test]
    fn no_entry_reaches_into_user_content() {
        // ADR-0005. A catalog root under Documents or Downloads would make
        // every other safeguard irrelevant.
        for entry in catalog() {
            for root in entry.roots {
                for banned in ["Documents", "Desktop", "Downloads", "Movies", "Music", "Pictures"] {
                    assert!(!root.contains(banned), "{} reaches {}", entry.id, banned);
                }
            }
        }
    }

    #[test]
    fn find_returns_a_known_entry() {
        assert!(find("user-caches").is_some());
        assert!(find("not-a-real-id").is_none());
    }

    #[test]
    fn expand_resolves_the_home_prefix() {
        let home = dirs::home_dir().expect("home directory should resolve in tests");
        assert_eq!(expand("~/Library/Caches"), Some(home.join("Library/Caches")));
    }
}
