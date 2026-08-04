use crate::paths::{normalize, starts_with_case_insensitive, strip_firmlink};
use std::io::Write;
use std::path::{Path, PathBuf};

const FILE: &str = "exclusions.json";

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct ExclusionList {
    paths: Vec<PathBuf>,
}

pub fn new(paths: Vec<PathBuf>) -> ExclusionList {
    ExclusionList { paths }
}

impl ExclusionList {
    /// True when `candidate` is an excluded path, lives beneath one, or is an
    /// ancestor of one.
    ///
    /// This is the one function in Spiral Clean whose entire job is "never
    /// touch this", so it is deliberately generous about what counts as a
    /// match — every clause below can only ever protect *more*.
    ///
    /// It used to compare raw, literal, case-sensitive paths with
    /// `Path::starts_with`, while `execute` — in the same call, two lines
    /// away — resolved its candidates through symlinks, folded case, and
    /// stripped firmlinks. The bar that normalises and the bar that does not
    /// were being asked about the same file, and a path the user had
    /// explicitly protected stayed reachable under a different spelling of
    /// itself: `~/keep` vs `~/KEEP`, `/System/Volumes/Data/Users/…/keep`, or
    /// any symlink pointing at it. Both sides now go through
    /// `crate::paths`, which is where `execute` gets its normal form too.
    ///
    /// Three clauses, in cost order:
    ///
    /// 1. **Lexical** — case-folded and firmlink-stripped, no I/O. This one
    ///    holds even when neither side exists on disk, which is what keeps
    ///    the check from failing open on a path that cannot be resolved.
    /// 2. **Resolved** — both sides put through `normalize`, so a symlinked
    ///    route to an excluded file matches the exclusion. Normalising here
    ///    rather than once at load time is deliberate: it reads the
    ///    filesystem at the moment the decision is made, so a link created
    ///    after the list was loaded is still seen.
    /// 3. **Ancestor** — the mirror of clause 1. Excluding `~/x/keep` has to
    ///    stop a candidate of `~/x` as well, or the exclusion is worthless:
    ///    `execute` removes a candidate whole, so deleting the parent
    ///    destroys the protected child just as surely as naming it.
    ///
    /// All three compare whole path *components*, never lowercased strings,
    /// so `/tmp/keep` still does not match `/tmp/keepsake.txt`.
    pub fn covers(&self, candidate: &Path) -> bool {
        let lexical_candidate = strip_firmlink(candidate.to_path_buf());
        let resolved_candidate = normalize(candidate);

        self.paths.iter().any(|excluded| {
            let lexical_excluded = strip_firmlink(excluded.clone());

            if starts_with_case_insensitive(&lexical_candidate, &lexical_excluded) {
                return true;
            }

            let resolved_match = match (&resolved_candidate, normalize(excluded)) {
                (Some(candidate), Some(excluded)) => {
                    starts_with_case_insensitive(candidate, &excluded)
                }
                // Neither side may be guessed at when it cannot be resolved;
                // clause 1 has already had its say, and clause 3 still does.
                _ => false,
            };

            resolved_match || starts_with_case_insensitive(&lexical_excluded, &lexical_candidate)
        })
    }

    /// Write the list atomically: a full temp file, flushed to disk, then
    /// renamed over the real one. `rename(2)` is atomic within a directory,
    /// so a crash leaves either the old list or the new one — never a
    /// half-written file.
    ///
    /// This used to be a plain `fs::write`, which truncates first and writes
    /// second. A crash in that window left a truncated file, and the old
    /// `load` turned that into an empty list without a word — every path the
    /// user had protected silently became deletable. The two halves of that
    /// defect are fixed together: this writes atomically, and `load` refuses
    /// to interpret a file it cannot parse.
    pub fn save(&self, dir: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(dir)?;
        let json = serde_json::to_string_pretty(self)?;

        // Same directory as the destination, or the rename would cross a
        // filesystem boundary and stop being atomic.
        let temp = dir.join(format!("{FILE}.{}.tmp", std::process::id()));
        let write_then_rename = || -> std::io::Result<()> {
            let mut file = std::fs::File::create(&temp)?;
            file.write_all(json.as_bytes())?;
            // Before the rename, not after: the rename is only worth
            // anything if the contents are already durable.
            file.sync_all()?;
            drop(file);
            std::fs::rename(&temp, dir.join(FILE))
        };

        write_then_rename().inspect_err(|_| {
            // Leaving a stray temp file behind would be its own small mess.
            let _ = std::fs::remove_file(&temp);
        })
    }
}

/// Load the exclusion list, distinguishing "not there yet" from "there and
/// unreadable".
///
/// A **missing** file is the normal first run: an empty list, `Ok`.
///
/// A file that exists but cannot be read or parsed is a different thing
/// entirely, and this used to swallow it and return an empty list too. That
/// failed open — the one direction this feature must never fail — turning
/// "I could not tell what you asked me to protect" into "you asked me to
/// protect nothing". It is now an error naming the file, and `execute`
/// refuses every candidate while it stands.
pub fn load(dir: &Path) -> Result<ExclusionList, String> {
    let path = dir.join(FILE);
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| unreadable(&path, &e.to_string())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(ExclusionList::default()),
        Err(e) => Err(unreadable(&path, &e.to_string())),
    }
}

/// States the problem and a next step, per the project's error-copy rule.
fn unreadable(path: &Path, why: &str) -> String {
    format!(
        "Spiral Clean could not read your exclusion list at {} ({why}). Nothing was removed, because it cannot tell which paths you asked it to protect. Fix that file, or move it aside to start again with an empty list.",
        path.display()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn covers_an_exact_path() {
        let list = new(vec![PathBuf::from("/tmp/keep.txt")]);
        assert!(list.covers(Path::new("/tmp/keep.txt")));
    }

    #[test]
    fn covers_everything_beneath_an_excluded_directory() {
        // Excluding a folder whose contents remain deletable is not an
        // exclusion. This is the test that makes the guarantee real.
        let list = new(vec![PathBuf::from("/tmp/keep")]);
        assert!(list.covers(Path::new("/tmp/keep/nested/deep.txt")));
    }

    #[test]
    fn does_not_cover_a_sibling_with_a_shared_prefix() {
        // The component-wise property, which every clause of `covers` has to
        // preserve. Comparing lowercased whole strings would break exactly
        // this and nothing else would notice.
        let list = new(vec![PathBuf::from("/tmp/keep")]);
        assert!(!list.covers(Path::new("/tmp/keepsake.txt")));
        assert!(!list.covers(Path::new("/tmp/KEEPSAKE.txt")));
        assert!(!list.covers(Path::new("/tmp/kee")));
    }

    #[test]
    fn empty_list_covers_nothing() {
        let list = new(vec![]);
        assert!(!list.covers(Path::new("/tmp/anything")));
    }

    #[test]
    fn covers_a_case_variant_of_an_excluded_path() {
        // APFS is case-insensitive by default, so `~/Keep` and `~/keep` are
        // the same directory on disk. A literal comparison protected one
        // spelling of a path the user explicitly told the app never to touch.
        let list = new(vec![PathBuf::from("/tmp/Keep")]);
        for candidate in ["/tmp/keep", "/tmp/KEEP/inner.txt", "/TMP/kEeP/inner.txt"] {
            assert!(list.covers(Path::new(candidate)), "{candidate} escaped the exclusion");
        }
    }

    #[test]
    fn covers_a_firmlink_route_to_an_excluded_path() {
        // `/System/Volumes/Data/Users/<u>/keep` is the same directory as
        // `/Users/<u>/keep` — macOS firmlinks it, and `realpath` does not
        // collapse it. Asserted on paths that do not exist, so it is the
        // lexical clause being tested and not resolution.
        let list = new(vec![PathBuf::from("/Users/someone/keep")]);
        assert!(list.covers(Path::new("/System/Volumes/Data/Users/someone/keep/f.bin")));
        assert!(!list.covers(Path::new("/System/Volumes/Data/Users/someone/keepsake")));
    }

    #[test]
    fn covers_a_symlinked_route_to_an_excluded_path() {
        // Any process that can write next to the excluded directory can
        // plant a link to it and reach the protected files under a name the
        // list never mentions.
        let dir = temp();
        let keep = dir.path().join("keep");
        std::fs::create_dir(&keep).unwrap();
        std::fs::write(keep.join("precious.txt"), b"x").unwrap();
        let link = dir.path().join("link");
        std::os::unix::fs::symlink(&keep, &link).unwrap();

        let list = new(vec![keep.clone()]);
        assert!(list.covers(&link.join("precious.txt")), "a symlinked route escaped");
        assert!(list.covers(&link), "the link itself escaped");
    }

    #[test]
    fn covers_an_excluded_path_reached_through_a_symlinked_ancestor() {
        // The link is an interior component rather than the leaf: the
        // exclusion names the real path, the candidate names a route to it.
        let dir = temp();
        let real = dir.path().join("real/keep");
        std::fs::create_dir_all(&real).unwrap();
        std::fs::write(real.join("precious.txt"), b"x").unwrap();
        std::os::unix::fs::symlink(dir.path().join("real"), dir.path().join("alias")).unwrap();

        let list = new(vec![real]);
        assert!(list.covers(&dir.path().join("alias/keep/precious.txt")));
    }

    #[test]
    fn covers_a_path_it_cannot_resolve_rather_than_failing_open() {
        // What the lexical clause is actually for. On a live filesystem the
        // resolved clause happens to catch case variants and firmlinks too,
        // so the only thing that proves clause 1 is load-bearing is a path
        // `normalize` refuses to reason about — a symlink loop here. An
        // exclusion that worked only on resolvable paths would fail open on
        // exactly the paths it understands least.
        let dir = temp();
        let keep = dir.path().join("keep");
        std::fs::create_dir(&keep).unwrap();
        std::os::unix::fs::symlink(keep.join("b"), keep.join("a")).unwrap();
        std::os::unix::fs::symlink(keep.join("a"), keep.join("b")).unwrap();
        assert_eq!(normalize(&keep.join("a")), None, "the loop resolved; this proves nothing");

        let list = new(vec![keep.clone()]);
        assert!(list.covers(&keep.join("a")), "an unresolvable path escaped the exclusion");

        // And the same unresolvable path spelled in a different case.
        let shouty = dir.path().join("KEEP/a");
        assert_eq!(normalize(&shouty), None, "the loop resolved; this proves nothing");
        assert!(list.covers(&shouty), "a case variant of an unresolvable path escaped");
    }

    #[test]
    fn covers_an_ancestor_of_an_excluded_path() {
        // `execute` removes a candidate whole, so a candidate of `/tmp/x`
        // destroys an excluded `/tmp/x/keep` just as surely as naming it.
        // The sibling-prefix property still has to survive this clause.
        let list = new(vec![PathBuf::from("/tmp/x/keep")]);
        assert!(list.covers(Path::new("/tmp/x")));
        assert!(list.covers(Path::new("/tmp")));
        assert!(!list.covers(Path::new("/tmp/xylophone")));
    }

    #[test]
    fn round_trips_through_disk() {
        let dir = temp();
        let list = new(vec![PathBuf::from("/tmp/keep")]);
        list.save(dir.path()).unwrap();
        assert!(load(dir.path()).unwrap().covers(Path::new("/tmp/keep/inner")));
    }

    #[test]
    fn missing_file_loads_as_empty() {
        // Normal first run: nothing protected yet, and that is not an error.
        let dir = temp();
        let list = load(dir.path()).expect("a missing list is not an error");
        assert!(!list.covers(Path::new("/tmp/anything")));
    }

    #[test]
    fn a_corrupt_file_is_an_error_not_an_empty_list() {
        // The failure this exists to stop: a crash mid-write truncates the
        // file, the old `load` swallowed the parse error, and every path the
        // user had protected silently became deletable.
        let dir = temp();
        std::fs::write(dir.path().join(FILE), b"{\"paths\": [\"/tmp/kee").unwrap();

        let why = load(dir.path()).expect_err("a truncated list loaded as empty");
        assert!(
            why.contains(&dir.path().join(FILE).display().to_string()),
            "the message does not name the file: {why}"
        );
        assert!(
            why.contains("move it aside"),
            "the message does not say how to reset it: {why}"
        );
    }

    #[test]
    fn save_never_truncates_the_existing_list_to_write_the_new_one() {
        // Atomicity, made observable: with the directory read-only, creating
        // the temp file fails and `save` reports it, leaving the previous
        // list intact. A plain `fs::write` would instead open the existing
        // file — writable, in a read-only directory — truncate it, and
        // succeed, which is precisely the window a crash used to land in.
        use std::os::unix::fs::PermissionsExt;

        let dir = temp();
        new(vec![PathBuf::from("/tmp/keep")]).save(dir.path()).unwrap();
        std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o555)).unwrap();

        let result = new(vec![PathBuf::from("/tmp/other")]).save(dir.path());

        std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o755)).unwrap();

        assert!(result.is_err(), "save reported success in a directory it cannot write");
        let reloaded = load(dir.path()).expect("the previous list should still parse");
        assert!(reloaded.covers(Path::new("/tmp/keep")), "the previous list was lost");
    }

    #[test]
    fn save_leaves_no_temp_file_behind() {
        let dir = temp();
        new(vec![PathBuf::from("/tmp/keep")]).save(dir.path()).unwrap();
        let names: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec![FILE.to_string()], "save left something behind: {names:?}");
    }
}
