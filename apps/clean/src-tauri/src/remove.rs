use crate::catalog::{self, Disposition};
use crate::exclude::ExclusionList;
use std::path::{Path, PathBuf};

/// Why an item is eligible for removal. A candidate without one of these
/// cannot be constructed, which is what stops the frontend from asking for an
/// arbitrary deletion.
#[derive(Debug, Clone, serde::Deserialize)]
pub enum Justification {
    /// Matched a safe-category catalog entry, by id.
    Catalog(String),
    /// App-managed state whose owning app is gone (ADR-0007).
    Orphan { bundle_id: String },
    /// The application bundle and its associated files (ADR-0004).
    AppBundle { bundle_id: String },
    /// The user selected this specific item, e.g. an iOS device backup.
    UserChosen,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct Candidate {
    pub path: PathBuf,
    pub bytes: u64,
    pub justification: Justification,
}

#[derive(Debug, serde::Serialize)]
pub enum Outcome {
    Removed(Disposition),
    Excluded,
    Denied(String),
    Failed(String),
}

#[derive(Debug, serde::Serialize)]
pub struct Report {
    pub path: PathBuf,
    pub outcome: Outcome,
}

/// Directories that are user-created content by definition (ADR-0005). This
/// bar is unconditional: no justification, present or future, lifts it.
const USER_CONTENT: &[&str] = &[
    "Documents",
    "Desktop",
    "Downloads",
    "Movies",
    "Music",
    "Pictures",
    "Library/Mobile Documents",
];

fn is_user_content(path: &Path) -> bool {
    if path.starts_with("/Volumes") {
        return true;
    }
    match dirs::home_dir() {
        Some(home) => USER_CONTENT.iter().any(|r| path.starts_with(home.join(r))),
        None => true, // Cannot prove it is safe, so treat it as unsafe.
    }
}

/// Disposition is derived here, never supplied by the caller. A catalog match
/// is the only route to permanent deletion (ADR-0006).
fn disposition_for(j: &Justification) -> Result<Disposition, String> {
    match j {
        Justification::Catalog(id) => match catalog::find(id) {
            Some(entry) => Ok(entry.disposition),
            None => Err(format!(
                "\"{id}\" is not a category in this release. Nothing was removed."
            )),
        },
        Justification::AppBundle { .. } => Ok(Disposition::Permanent),
        Justification::Orphan { .. } => Ok(Disposition::Trash),
        Justification::UserChosen => Ok(Disposition::Trash),
    }
}

fn delete(path: &Path, how: Disposition) -> Result<(), String> {
    let result = match how {
        Disposition::Trash => trash::delete(path).map_err(|e| e.to_string()),
        Disposition::Permanent => {
            if path.is_dir() {
                std::fs::remove_dir_all(path).map_err(|e| e.to_string())
            } else {
                std::fs::remove_file(path).map_err(|e| e.to_string())
            }
        }
    };
    result.map_err(|e| format!("Could not remove {}: {e}", path.display()))
}

/// The only function in Spiral Clean that deletes anything.
///
/// Bars are applied in order — user content, then exclusions, then
/// justification — and no single failure aborts the batch, because a user who
/// asked to reclaim twelve categories should not lose eleven of them to one
/// unreadable file.
pub fn execute(candidates: Vec<Candidate>, excl: &ExclusionList) -> Vec<Report> {
    candidates
        .into_iter()
        .map(|c| {
            let outcome = if is_user_content(&c.path) {
                Outcome::Denied(format!(
                    "{} is your own content. Spiral Clean never removes it.",
                    c.path.display()
                ))
            } else if excl.covers(&c.path) {
                Outcome::Excluded
            } else {
                match disposition_for(&c.justification) {
                    Err(why) => Outcome::Denied(why),
                    Ok(how) => match delete(&c.path, how) {
                        Ok(()) => Outcome::Removed(how),
                        Err(why) => Outcome::Failed(why),
                    },
                }
            };
            Report { path: c.path, outcome }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::exclude;

    fn file(dir: &std::path::Path, name: &str) -> PathBuf {
        let p = dir.join(name);
        std::fs::write(&p, b"x").unwrap();
        p
    }

    fn candidate(path: PathBuf, j: Justification) -> Candidate {
        Candidate { path, bytes: 1, justification: j }
    }

    #[test]
    fn a_catalog_candidate_is_removed_permanently() {
        let dir = tempfile::tempdir().unwrap();
        let p = file(dir.path(), "cache.bin");
        let reports = execute(
            vec![candidate(p.clone(), Justification::Catalog("user-caches".into()))],
            &exclude::new(vec![]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Removed(Disposition::Permanent)));
        assert!(!p.exists());
    }

    #[test]
    fn an_unknown_catalog_id_is_denied() {
        // The frontend cannot invent a permanent deletion by naming a
        // category that does not exist.
        let dir = tempfile::tempdir().unwrap();
        let p = file(dir.path(), "cache.bin");
        let reports = execute(
            vec![candidate(p.clone(), Justification::Catalog("not-real".into()))],
            &exclude::new(vec![]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Denied(_)));
        assert!(p.exists());
    }

    #[test]
    fn an_orphan_goes_to_the_trash_not_permanent() {
        let dir = tempfile::tempdir().unwrap();
        let p = file(dir.path(), "leftover.plist");
        let reports = execute(
            vec![candidate(p, Justification::Orphan { bundle_id: "com.example.gone".into() })],
            &exclude::new(vec![]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Removed(Disposition::Trash)));
    }

    #[test]
    fn an_excluded_path_is_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let p = file(dir.path(), "cache.bin");
        let reports = execute(
            vec![candidate(p.clone(), Justification::Catalog("user-caches".into()))],
            &exclude::new(vec![dir.path().to_path_buf()]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Excluded));
        assert!(p.exists());
    }

    #[test]
    fn user_content_is_denied_whatever_the_justification() {
        // ADR-0005. Every justification variant must fail here, including the
        // ones a future feature might add for a "good reason".
        let home = dirs::home_dir().unwrap();
        for root in ["Documents", "Desktop", "Downloads", "Movies", "Music", "Pictures"] {
            for j in [
                Justification::Catalog("user-caches".into()),
                Justification::Orphan { bundle_id: "x".into() },
                Justification::AppBundle { bundle_id: "x".into() },
                Justification::UserChosen,
            ] {
                let reports = execute(
                    vec![candidate(home.join(root).join("file.txt"), j)],
                    &exclude::new(vec![]),
                );
                assert!(
                    matches!(reports[0].outcome, Outcome::Denied(_)),
                    "{root} was not denied"
                );
            }
        }
    }

    #[test]
    fn external_volumes_are_denied() {
        let reports = execute(
            vec![candidate(PathBuf::from("/Volumes/Backup/thing"), Justification::UserChosen)],
            &exclude::new(vec![]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Denied(_)));
    }

    #[test]
    fn one_failure_does_not_abort_the_batch() {
        let dir = tempfile::tempdir().unwrap();
        let good = file(dir.path(), "a.bin");
        let missing = dir.path().join("gone.bin");
        let reports = execute(
            vec![
                candidate(missing, Justification::Catalog("user-caches".into())),
                candidate(good.clone(), Justification::Catalog("user-caches".into())),
            ],
            &exclude::new(vec![]),
        );
        assert_eq!(reports.len(), 2);
        assert!(matches!(reports[1].outcome, Outcome::Removed(_)));
        assert!(!good.exists());
    }
}
