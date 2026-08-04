use crate::catalog::{self, Disposition};
use crate::exclude::ExclusionList;
use std::path::{Path, PathBuf};

/// Why an item is eligible for removal. This is the caller's claim, not a
/// guarantee: `UserChosen` is a unit variant with no path constraint, so any
/// caller can justify Trashing any path that clears the user-content and
/// exclusion bars this way. What `execute` actually guarantees is narrower —
/// user content is denied no matter which variant is used, and `Catalog` can
/// only reach `Permanent` through a real catalog entry (see
/// `disposition_for`).
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
    /// A directory removal failed partway through. Some of its contents
    /// were already destroyed before the failure — this must never be
    /// reported as `Failed`, which reads as "nothing happened".
    PartiallyRemoved(String),
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

/// Normalise a path so `..` and the `/System/Volumes/Data` firmlink can't
/// defeat a literal `starts_with` comparison. Returns `None` when the path
/// cannot be reasoned about safely at all — relative, or containing a `..`
/// component. Every caller must treat `None` as "deny", never as "skip the
/// check": `Path::starts_with` compares components literally and does not
/// resolve `..`, so `~/Library/Caches/../Documents/tax.pdf` would otherwise
/// walk straight past a `starts_with(home.join("Documents"))` check, and
/// `/System/Volumes/Data/Users/<u>/Documents` shares a device+inode with
/// `~/Documents` without matching it as a string at all.
fn normalize(path: &Path) -> Option<PathBuf> {
    use std::path::Component;

    if path.is_relative() {
        return None;
    }
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return None;
    }

    Some(match path.strip_prefix("/System/Volumes/Data") {
        Ok(rest) => Path::new("/").join(rest),
        Err(_) => path.to_path_buf(),
    })
}

/// Component-wise, case-insensitive `starts_with`. APFS is case-insensitive
/// by default, so `~/documents` and `~/Documents` are the same folder on
/// disk, but a literal `starts_with` only catches one spelling. Comparing
/// whole lowercased path *strings* would reintroduce the bug `exclude.rs`
/// was specifically written to avoid — `/tmp/keep` matching
/// `/tmp/keepsake.txt` — so this compares one component at a time instead.
fn starts_with_case_insensitive(path: &Path, prefix: &Path) -> bool {
    let mut path_components = path.components();
    for prefix_component in prefix.components() {
        let matched = match path_components.next() {
            Some(pc) => pc
                .as_os_str()
                .to_string_lossy()
                .eq_ignore_ascii_case(&prefix_component.as_os_str().to_string_lossy()),
            None => false,
        };
        if !matched {
            return false;
        }
    }
    true
}

fn is_user_content(path: &Path) -> bool {
    let normalized = match normalize(path) {
        Some(p) => p,
        None => return true, // Cannot prove it is safe, so treat it as unsafe.
    };

    if normalized.starts_with("/Volumes") {
        return true;
    }

    match dirs::home_dir() {
        Some(home) => USER_CONTENT
            .iter()
            .any(|r| starts_with_case_insensitive(&normalized, &home.join(r))),
        None => true, // Cannot prove it is safe, so treat it as unsafe.
    }
}

/// Where an `AppBundle` justification may point (ADR-0004): the application
/// itself and its own app-managed state, nothing else. This is a
/// containment floor, not full validation — it does not prove the path
/// belongs to the named `bundle_id`; that lands with `associate.rs` in M4.
/// Runs on the same normalised path as `is_user_content`, or `..` and a
/// firmlink detour would defeat it exactly as they defeated bar 1.
fn is_within_app_bundle_scope(path: &Path) -> bool {
    let normalized = match normalize(path) {
        Some(p) => p,
        None => return false, // Cannot prove it is in scope, so treat it as out of scope.
    };

    if normalized.starts_with("/Applications") {
        return true;
    }

    match dirs::home_dir() {
        Some(home) => {
            starts_with_case_insensitive(&normalized, &home.join("Applications"))
                || starts_with_case_insensitive(&normalized, &home.join("Library"))
        }
        None => false,
    }
}

/// Disposition is derived here, never supplied by the caller. Two routes
/// reach `Permanent`: a `Catalog` match, and `AppBundle` (ADR-0004) — an app
/// uninstall is permanent by design. `AppBundle` is constrained to
/// `/Applications`, `~/Applications`, and `~/Library` (checked, note, after
/// the user-content bar has already run and already excludes
/// `~/Library/Mobile Documents`); it does not yet prove the path belongs to
/// the named `bundle_id` — that lands with `associate.rs` in M4, so this is
/// a containment floor, not full validation.
fn disposition_for(path: &Path, j: &Justification) -> Result<Disposition, String> {
    match j {
        Justification::Catalog(id) => match catalog::find(id) {
            Some(entry) => Ok(entry.disposition),
            None => Err(format!(
                "\"{id}\" is not a category in this release. Nothing was removed."
            )),
        },
        Justification::AppBundle { .. } => {
            if is_within_app_bundle_scope(path) {
                Ok(Disposition::Permanent)
            } else {
                Err(format!(
                    "{} is outside the locations an app uninstall may touch. Only the app bundle and its own support files can be removed.",
                    path.display()
                ))
            }
        }
        Justification::Orphan { .. } => Ok(Disposition::Trash),
        Justification::UserChosen => Ok(Disposition::Trash),
    }
}

/// Why a deletion attempt failed. The distinction matters: reporting a
/// partial directory failure as `Total` would read as "nothing happened"
/// when some of it was in fact destroyed.
enum FailureKind {
    Total(String),
    Partial(String),
}

fn delete(path: &Path, how: Disposition) -> Result<(), FailureKind> {
    match how {
        Disposition::Trash => trash::delete(path)
            .map_err(|e| FailureKind::Total(format!("Could not remove {}: {e}", path.display()))),
        Disposition::Permanent => delete_permanent(path),
    }
}

/// `std::fs::remove_dir_all` is not atomic and does not report how far it
/// got before failing. This walks the tree bottom-up and removes each entry
/// individually instead, so a directory is only attempted once everything
/// inside it has already been attempted — which is what makes it possible
/// to tell "destroyed some of it, then failed" apart from "destroyed
/// nothing", and report the former as `Partial` rather than `Total`.
fn delete_permanent(path: &Path) -> Result<(), FailureKind> {
    if !path.is_dir() {
        return std::fs::remove_file(path)
            .map_err(|e| FailureKind::Total(format!("Could not remove {}: {e}", path.display())));
    }

    let mut removed_any = false;
    let mut first_err: Option<String> = None;

    let walker = walkdir::WalkDir::new(path)
        .contents_first(true)
        .sort_by(|a, b| a.file_name().cmp(b.file_name()));

    for entry in walker {
        match entry {
            Ok(entry) => {
                let p = entry.path();
                let result = if entry.file_type().is_dir() {
                    std::fs::remove_dir(p)
                } else {
                    std::fs::remove_file(p)
                };
                match result {
                    Ok(()) => removed_any = true,
                    Err(e) => {
                        first_err.get_or_insert_with(|| format!("{}: {e}", p.display()));
                    }
                }
            }
            Err(e) => {
                first_err.get_or_insert_with(|| e.to_string());
            }
        }
    }

    match first_err {
        None => Ok(()),
        Some(e) if removed_any => Err(FailureKind::Partial(format!(
            "Some contents of {} were removed before a failure ({e}). The rest remains — check permissions and try again.",
            path.display()
        ))),
        Some(e) => Err(FailureKind::Total(format!("Could not remove {}: {e}", path.display()))),
    }
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
                match disposition_for(&c.path, &c.justification) {
                    Err(why) => Outcome::Denied(why),
                    Ok(how) => match delete(&c.path, how) {
                        Ok(()) => Outcome::Removed(how),
                        Err(FailureKind::Partial(why)) => Outcome::PartiallyRemoved(why),
                        Err(FailureKind::Total(why)) => Outcome::Failed(why),
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

    #[test]
    fn parent_dir_traversal_out_of_user_content_is_denied_whatever_the_justification() {
        // F1. `Path::starts_with` compares components literally and does not
        // resolve `..`, so a path that detours out of a safe directory and
        // back into Documents must be rejected on sight, not trusted.
        let home = dirs::home_dir().unwrap();
        let path = home.join("Library/Caches/../Documents/tax.pdf");
        for j in [
            Justification::Catalog("user-caches".into()),
            Justification::Orphan { bundle_id: "x".into() },
            Justification::AppBundle { bundle_id: "x".into() },
            Justification::UserChosen,
        ] {
            let reports = execute(vec![candidate(path.clone(), j)], &exclude::new(vec![]));
            assert!(
                matches!(reports[0].outcome, Outcome::Denied(_)),
                "traversal path was not denied"
            );
        }
    }

    #[test]
    fn case_variant_user_content_is_denied_whatever_the_justification() {
        // F2. APFS is case-insensitive by default: `~/documents` and
        // `~/Documents` are the same folder on disk, but a literal
        // `starts_with` only catches one spelling.
        let home = dirs::home_dir().unwrap();
        for variant in ["documents", "DOCUMENTS", "DoCuMeNtS"] {
            let path = home.join(variant).join("file.txt");
            for j in [
                Justification::Catalog("user-caches".into()),
                Justification::Orphan { bundle_id: "x".into() },
                Justification::AppBundle { bundle_id: "x".into() },
                Justification::UserChosen,
            ] {
                let reports = execute(vec![candidate(path.clone(), j)], &exclude::new(vec![]));
                assert!(
                    matches!(reports[0].outcome, Outcome::Denied(_)),
                    "{variant} was not denied"
                );
            }
        }
    }

    #[test]
    fn firmlink_data_volume_path_is_denied_whatever_the_justification() {
        // F3. `/System/Volumes/Data/Users/<u>/Documents` shares a
        // device+inode with `~/Documents` (verified with `stat -f %d:%i`)
        // but is neither under `/Volumes` nor under `home` as a literal
        // string.
        let home = dirs::home_dir().unwrap();
        let home_tail = home.strip_prefix("/").expect("home is absolute");
        let firmlink_path = Path::new("/System/Volumes/Data")
            .join(home_tail)
            .join("Documents/file.txt");
        for j in [
            Justification::Catalog("user-caches".into()),
            Justification::Orphan { bundle_id: "x".into() },
            Justification::AppBundle { bundle_id: "x".into() },
            Justification::UserChosen,
        ] {
            let reports =
                execute(vec![candidate(firmlink_path.clone(), j)], &exclude::new(vec![]));
            assert!(
                matches!(reports[0].outcome, Outcome::Denied(_)),
                "firmlink path was not denied"
            );
        }
    }

    #[test]
    fn an_app_bundle_under_applications_is_permitted_by_scope() {
        // F4. Exercises `disposition_for` directly rather than through
        // `execute`, because proving "permitted" through `execute` would
        // require actually deleting something at a real path under
        // `/Applications`.
        let result = disposition_for(
            Path::new("/Applications/Example.app"),
            &Justification::AppBundle { bundle_id: "com.example.app".into() },
        );
        assert_eq!(result, Ok(Disposition::Permanent));
    }

    #[test]
    fn an_app_bundle_outside_the_allowed_roots_is_denied() {
        // F4. /tmp is neither /Applications, ~/Applications, nor ~/Library.
        let reports = execute(
            vec![candidate(
                PathBuf::from("/tmp/Example.app"),
                Justification::AppBundle { bundle_id: "com.example.app".into() },
            )],
            &exclude::new(vec![]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Denied(_)));
    }

    #[test]
    fn app_bundle_scope_cannot_be_defeated_by_traversal() {
        // F4 requirement 1: the containment check runs on the same
        // normalised path as the user-content bar, or `..` would defeat it
        // exactly as it defeated bar 1.
        let reports = execute(
            vec![candidate(
                PathBuf::from("/Applications/../Users/anyone/Documents/file.txt"),
                Justification::AppBundle { bundle_id: "x".into() },
            )],
            &exclude::new(vec![]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Denied(_)));
    }

    #[test]
    fn icloud_drive_wins_over_app_bundle_containment() {
        // F4 requirement 2: `~/Library` is in scope for AppBundle, but
        // `~/Library/Mobile Documents` is iCloud Drive — user content — and
        // the user-content bar runs first and still wins.
        let home = dirs::home_dir().unwrap();
        let path = home.join("Library/Mobile Documents/com~apple~CloudDocs/thing");
        let reports = execute(
            vec![candidate(path, Justification::AppBundle { bundle_id: "x".into() })],
            &exclude::new(vec![]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Denied(_)));
    }

    #[test]
    fn partial_directory_failure_is_reported_not_hidden() {
        // F5. `remove_dir_all` is not atomic and does not say how far it
        // got. A directory with an unreadable subdirectory must report
        // `PartiallyRemoved`, not `Failed` — `Failed` reads as "nothing
        // happened", which would be a false statement in Task 9's history
        // log.
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("target");
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join("a_file.txt"), b"x").unwrap();
        let locked = target.join("z_locked");
        std::fs::create_dir(&locked).unwrap();
        std::fs::write(locked.join("inner.txt"), b"x").unwrap();
        // Remove write permission on the locked subdirectory so its own
        // contents cannot be deleted, while leaving "a_file.txt" (which
        // sorts first) deletable.
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o555)).unwrap();

        let reports = execute(
            vec![candidate(target.clone(), Justification::Catalog("user-caches".into()))],
            &exclude::new(vec![]),
        );

        // Restore permissions so the tempdir can clean itself up.
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();

        assert!(
            matches!(reports[0].outcome, Outcome::PartiallyRemoved(_)),
            "expected PartiallyRemoved, got {:?}",
            reports[0].outcome
        );
        assert!(!target.join("a_file.txt").exists());
    }
}
