//! The single normal form every path comparison in Spiral Clean is made in.
//!
//! This lives in its own module for one reason: `remove.rs` decides what may
//! be deleted and `exclude.rs` decides what may never be, and those two
//! answers are only trustworthy if they are computed about the *same* path.
//! While `covers()` compared raw literal strings and `execute` resolved,
//! case-folded, and firmlink-stripped, a path the user had explicitly
//! protected stayed reachable under a different spelling of itself. There is
//! one normalisation here, and both modules call it.

use std::path::{Path, PathBuf};

/// Case-insensitive equality for a single path component. This is the one
/// place Spiral Clean folds case, and both `starts_with_case_insensitive`
/// and the firmlink strip in `strip_firmlink` go through it — one
/// case-folding rule, used everywhere a comparison needs it, rather than a
/// second almost-identical helper appearing later.
fn component_eq_ignore_case(a: std::path::Component, b: std::path::Component) -> bool {
    a.as_os_str()
        .to_string_lossy()
        .eq_ignore_ascii_case(&b.as_os_str().to_string_lossy())
}

/// Component-wise, case-insensitive `starts_with`. APFS is case-insensitive
/// by default, so `~/documents` and `~/Documents` — and `/volumes` and
/// `/Volumes`, and `/system/Volumes/Data` and `/System/Volumes/Data` — are
/// the same path on disk, but a literal `starts_with` only catches one
/// spelling. Comparing whole lowercased path *strings* would reintroduce
/// the bug `exclude.rs` was specifically written to avoid — `/tmp/keep`
/// matching `/tmp/keepsake.txt` — so this compares one component at a time
/// instead. Every case-insensitive path comparison in Spiral Clean must go
/// through this function — including `ExclusionList::covers`, which used to
/// call raw `Path::starts_with` and so protected only one spelling of a path
/// the user had explicitly told the app never to touch. A raw `starts_with`
/// on a path that might vary in case is the exact defect this exists to
/// close.
pub(crate) fn starts_with_case_insensitive(path: &Path, prefix: &Path) -> bool {
    let mut path_components = path.components();
    for prefix_component in prefix.components() {
        match path_components.next() {
            Some(pc) if component_eq_ignore_case(pc, prefix_component) => {}
            _ => return false,
        }
    }
    true
}

/// Strip the `/System/Volumes/Data` firmlink prefix, however many times it
/// appears. `realpath(3)` does *not* collapse this on macOS (verified:
/// `realpath("/System/Volumes/Data/Users/<u>/Documents")` returns itself),
/// so canonicalisation cannot replace this step — a firmlinked path shares a
/// device+inode with `~/Documents` while matching no prefix of it as a
/// string.
///
/// A loop, not a single strip: macOS does not nest this firmlink today
/// (`/System/Volumes/Data/System/Volumes` does not exist, confirmed on the
/// current macOS), so a doubled prefix cannot arise from a real resolved
/// path — but it *can* arise from an unresolved tail re-appended by
/// `resolve`, and stripping only once would leave it half-stripped. One
/// extra loop condition is cheap insurance on a security-critical
/// comparison.
pub(crate) fn strip_firmlink(path: PathBuf) -> PathBuf {
    const FIRMLINK_PREFIX: &str = "/System/Volumes/Data";
    let prefix = Path::new(FIRMLINK_PREFIX);
    let mut stripped = path;
    while starts_with_case_insensitive(&stripped, prefix) {
        let mut remaining = stripped.components();
        for _ in prefix.components() {
            remaining.next();
        }
        stripped = Path::new("/").join(remaining.as_path());
    }
    stripped
}

/// Resolve `path` to the location it actually *refers to*, following every
/// symlink along the way.
///
/// Without this, every bar in this module is purely lexical and a symlink
/// walks past all of them at once: `ln -s ~/Documents ~/Library/Caches/x`
/// makes `~/Library/Caches/x/tax.pdf` read as an ordinary cache path to a
/// string comparison, while `delete_permanent` — `WalkDir` follows a
/// symlinked root even with `follow_links(false)` — destroys the contents of
/// `~/Documents`. Any process that can write to `~/Library/Caches` can plant
/// that link.
///
/// `std::fs::canonicalize` fails outright on a path that does not exist, and
/// a candidate may legitimately not exist (it may have been removed since the
/// scan). So this canonicalises the deepest ancestor that *does* exist and
/// re-appends the remaining components to it.
///
/// The re-appended tail is **not** guaranteed to be symlink-free, and an
/// earlier version of this comment claimed it was. `canonicalize` reports
/// `NotFound` for two different situations: a component that genuinely does
/// not exist, and a component that exists as a *dangling* symlink — a link
/// whose target is missing. `ln -s ~/nowhere ~/.npm` used to be peeled and
/// re-appended verbatim, so `~/.npm/_cacache` compared equal to the catalog's
/// declared root and the relocation rule saw nothing wrong; creating
/// `~/nowhere/_cacache` flipped the identical setup to refused. The verdict
/// must not depend on whether a link's target happens to exist yet.
///
/// **Where the dangling link sits decides the answer**, and a first version of
/// this guard missed that distinction and refused both cases:
///
/// * A dangling link as an **interior** component (`tail` is non-empty — at
///   least one component has already been peeled past it) is refused. That
///   link stands between the caller and whatever it named; re-appending it
///   would put an unresolved link back into a path every later comparison
///   treats as resolved. This is the `~/.npm/_cacache` attack.
/// * A dangling link that **is the candidate itself** (`tail` is empty, so
///   nothing has been peeled yet) resolves normally: its ancestors are
///   canonicalised and its own name is re-appended. Nothing lies beyond it to
///   be misidentified — the name refers to the link, and unlinking a broken
///   link in a cache directory is precisely the tidying this app exists to do.
///   Refusing it made `~/Library/Caches/stale → gone` permanently
///   un-cleanable and reported it as the user's own content, which was untrue.
///
/// Returns `None` — which every caller must treat as "deny", never as "skip
/// the check" — for the interior case, and when canonicalisation fails for any
/// reason other than non-existence: a symlink loop (`ELOOP`), an unreadable
/// ancestor (`EACCES`), a name too long. The code must never guess at what a
/// path it could not resolve refers to.
pub(crate) fn resolve(path: &Path) -> Option<PathBuf> {
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    let mut cursor = path;

    loop {
        match std::fs::canonicalize(cursor) {
            Ok(base) => {
                let mut resolved = base;
                for name in tail.iter().rev() {
                    resolved.push(name);
                }
                return Some(resolved);
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // `lstat` succeeding where `realpath` said NotFound means the
                // component is there but points nowhere — a dangling symlink.
                // Refused only when something has already been peeled past
                // it, i.e. when it is an interior component of the path
                // rather than the thing the path names. See above.
                if !tail.is_empty() && std::fs::symlink_metadata(cursor).is_ok() {
                    return None;
                }
                // Peel the last component and try the parent. `file_name`
                // is `None` only at the filesystem root, which always
                // canonicalises, so this terminates.
                tail.push(cursor.file_name()?.to_os_string());
                cursor = cursor.parent()?;
            }
            Err(_) => return None,
        }
    }
}

/// True when `path` exists as a symlink whose target does not — a broken
/// link. `lstat` succeeds where `realpath` does not, and that pair of answers
/// has no other cause.
///
/// `resolve` deliberately lets a dangling link *as the final component*
/// through, because unlinking a broken link is legitimate work. A caller that
/// needs the stricter question — "is this thing actually there?", which is
/// what an authorising root has to ask — uses this.
pub(crate) fn is_dangling(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok() && std::fs::canonicalize(path).is_err()
}

/// Put a path into the single normal form every comparison in Spiral Clean
/// uses: absolute, `..`-free, symlink-free, and firmlink-free.
///
/// `None` means "cannot be reasoned about safely" and must be treated as a
/// denial by every caller. The `..` and relative-path rejections come first
/// and deliberately: `Path::starts_with` compares components literally and
/// does not resolve `..`, and `canonicalize` would silently *collapse* a
/// `..` rather than reject it — so rejecting up front keeps the existing
/// guarantee that a traversal path is refused on sight rather than
/// quietly rewritten into something that happens to look safe.
pub(crate) fn normalize(path: &Path) -> Option<PathBuf> {
    use std::path::Component;

    if path.is_relative() {
        return None;
    }
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return None;
    }

    Some(strip_firmlink(resolve(path)?))
}
