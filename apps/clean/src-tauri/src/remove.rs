use crate::catalog::{self, Disposition};
use crate::exclude::ExclusionList;
use std::path::{Path, PathBuf};

/// Why an item is eligible for removal. This is the caller's claim, not a
/// guarantee: `UserChosen` is a unit variant with no path constraint, so any
/// caller can justify Trashing any path that clears the user-content and
/// exclusion bars this way. What `execute` actually guarantees is narrower —
/// user content (and anything above it) is denied no matter which variant
/// is used, and `Catalog` can only reach `Permanent` through a real catalog
/// entry whose own roots actually cover the path (see `disposition_for`).
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

/// Case-insensitive equality for a single path component. This is the one
/// place this module folds case, and both `starts_with_case_insensitive`
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
/// instead. Every case-insensitive path comparison in this module must go
/// through this function; a raw `starts_with` on a path that might vary in
/// case is the exact defect this exists to close.
fn starts_with_case_insensitive(path: &Path, prefix: &Path) -> bool {
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
fn strip_firmlink(path: PathBuf) -> PathBuf {
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
/// re-appends the remaining components to it — the resolved part is real, the
/// unresolved tail cannot contain a symlink because it does not exist yet.
///
/// Returns `None` — which every caller must treat as "deny", never as "skip
/// the check" — when canonicalisation fails for any reason other than
/// non-existence: a symlink loop (`ELOOP`), an unreadable ancestor
/// (`EACCES`), a name too long. The code must never guess at what a path it
/// could not resolve refers to.
fn resolve(path: &Path) -> Option<PathBuf> {
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

/// Put a path into the single normal form every comparison in this module
/// uses: absolute, `..`-free, symlink-free, and firmlink-free.
///
/// `None` means "cannot be reasoned about safely" and must be treated as a
/// denial by every caller. The `..` and relative-path rejections come first
/// and deliberately: `Path::starts_with` compares components literally and
/// does not resolve `..`, and `canonicalize` would silently *collapse* a
/// `..` rather than reject it — so rejecting up front keeps the existing
/// guarantee that a traversal path is refused on sight rather than
/// quietly rewritten into something that happens to look safe.
fn normalize(path: &Path) -> Option<PathBuf> {
    use std::path::Component;

    if path.is_relative() {
        return None;
    }
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return None;
    }

    Some(strip_firmlink(resolve(path)?))
}

/// Resolve a root that *authorises deletion* — a catalog root, or an
/// `AppBundle` scope root — and refuse it unless it resolves **exactly**
/// where the catalog declared it.
///
/// Round 4 resolved these roots and said so deliberately, and for a leaf
/// *candidate* that reasoning was right. For a *root* it was exactly
/// backwards, because a root does not merely describe a path — it grants
/// permission over everything beneath it. Resolving one lets a symlink
/// silently redefine what the catalog authorises, and every attempt to
/// contain that damage while still honouring relocation failed the same way:
///
/// ```text
/// ln -s /opt/homebrew ~/Library/Caches   # swept /opt/homebrew         (round 5)
/// ln -s ~ ~/Library/Caches               # deleted ~/.ssh/id_rsa       (round 6)
/// ln -s ~/Library ~/Library/Caches       # deleted login.keychain-db   (round 6)
/// ln -s ~/Library/Keychains ~/Library/Developer  # ancestor of the declared root
/// ```
///
/// Rounds 5 and 6 each answered with a denylist — an anchor, then a ceiling,
/// then container and top-level-home clauses — and each time the same attack
/// was still live one level lower. Enumerating forbidden destinations cannot
/// win: the attacker picks the destination.
///
/// **So the rule is relocation itself.** If a root does not resolve to the
/// exact path the catalog declared, that root is not usable and its category
/// is skipped. There is nothing left to enumerate. `~/.gradle` →
/// `~/dev/gradle` and `~/.npm/_cacache` → `~/npmcache` are skipped too; that
/// is intended, and the user is told why (see `disposition_for`).
///
/// Comparing the resolved path against the *lexical* declared path — not
/// against some anchor derived from it — is what makes this catch a symlinked
/// **ancestor** of the declared root, not just a symlinked final component.
///
/// An anchor check used to sit here and is now provably dead: `resolved ==
/// declared` satisfies every anchor that could be derived from `declared`, so
/// the branch was unreachable once relocation became the whole rule. Removed
/// rather than left in — round 6 shipped a dead ceiling clause nobody caught.
fn authorizing_root(root: &str, home: &Path) -> Option<PathBuf> {
    let lexical = catalog::expand(root, home);
    let declared = strip_firmlink(lexical.clone());
    let resolved = normalize(&lexical)?;

    // Mutual prefix is equality, using the one case-insensitive comparison
    // this module owns rather than a fourth one.
    let where_declared = starts_with_case_insensitive(&resolved, &declared)
        && starts_with_case_insensitive(&declared, &resolved);

    where_declared.then_some(resolved)
}

/// True when `path` is `root` itself, or an immediate child of it — the one
/// depth primitive this module owns.
fn is_at_or_just_below(path: &Path, root: &Path) -> bool {
    starts_with_case_insensitive(path, root)
        && path.components().count() <= root.components().count() + 1
}

/// True when `path` (already normalised) is `~/Library` itself, or an
/// immediate child of it.
///
/// `~/Library`'s immediate children are *containers*: `Application Support`,
/// `Preferences`, `Containers`, `Group Containers`, `LaunchAgents`,
/// `WebKit`, `HTTPStorages`, `Cookies`, and whatever macOS adds next. Each
/// holds state belonging to many apps at once. An uninstall legitimately
/// targets one app's state *inside* a container —
/// `~/Library/Application Support/Slack`,
/// `~/Library/LaunchAgents/com.foo.plist`, `~/Library/Containers/com.foo` —
/// and never the container itself. Removing one would destroy every app's
/// state of that kind on the machine.
///
/// So the requirement is depth: at least two levels below `~/Library`. This
/// replaced a hand-written list of four container names, which was the same
/// failure mode as the hand-written protected-roots list one round before
/// it — that list was already missing `LaunchAgents`, `WebKit`,
/// `HTTPStorages`, and `Cookies` on the day it was written, and would have
/// gone stale again with the next macOS release. Enumerating instances goes
/// stale; the depth rule does not.
fn is_library_container(path: &Path, library: Option<&Path>) -> bool {
    library.is_some_and(|library| is_at_or_just_below(path, library))
}

/// The set of real directories every bar is evaluated against.
///
/// Production builds this from the machine (`Roots::system`). Tests build it
/// over a temporary directory (`Roots::rooted_at`), which is what lets a unit
/// test exercise *genuine* containment — the check is not weakened, it is
/// simply pointed at a home that is not the developer's.
struct Roots {
    /// Already resolved, so that roots derived from it are directly
    /// comparable with resolved candidates.
    home: PathBuf,
    /// Directories that must never themselves be removed, nor have anything
    /// *above* them removed either.
    protected: Vec<PathBuf>,
    /// The `USER_CONTENT` roots, resolved.
    user_content: Vec<PathBuf>,
    /// Where an `AppBundle` justification may point (ADR-0004): the
    /// application itself and its own app-managed state, nothing else. This
    /// is a containment floor, not full validation — it does not prove the
    /// path belongs to the named `bundle_id`; that lands with `associate.rs`
    /// in M4. Every entry has passed `authorizing_root`.
    app_bundle_scope: Vec<PathBuf>,
    /// `~/Library`, resolved — what the container-depth rule counts from.
    /// Deliberately *not* `authorizing_root`-checked: it is used to deny, and
    /// a `~/Library` pointed elsewhere should have its target's containers
    /// denied too. The authorising copy lives in `app_bundle_scope` and is
    /// checked.
    library: Option<PathBuf>,
}

impl Roots {
    /// Every list is resolved once, here, rather than per candidate — and
    /// resolved, not merely firmlink-stripped, so that a user who has
    /// symlinked (say) `~/.gradle` elsewhere still has the real location
    /// both protected and recognised as the catalog root it is, rather than
    /// wrongly denied.
    ///
    /// A root that cannot be resolved at all — a symlink loop or an
    /// unreadable ancestor, never mere non-existence, which `resolve`
    /// handles — is dropped rather than guessed at. Dropping it does not
    /// open a hole: a candidate at or under that root goes through the same
    /// `resolve`, fails the same way, and `is_user_content` denies it on
    /// `None`. The protection is lost from this list only where the
    /// candidate side already refuses everything.
    fn new(home: &Path) -> Option<Self> {
        let home = strip_firmlink(resolve(home)?);

        let mut protected = vec![
            PathBuf::from("/Users"),
            PathBuf::from("/Applications"),
            home.join("Applications"),
            home.clone(),
        ];
        // Derived from the catalog itself, not transcribed from it: a
        // catalog entry added in a future release is protected the moment
        // it lands, rather than when someone remembers to mirror it here.
        // Protection is the *denial* direction, so these are resolved
        // without the `authorizing_root` anchor check — a root pointed
        // somewhere unexpected should have its target protected too. It is
        // `is_within_catalog_entry`, which grants permission, that must
        // refuse such a root.
        for entry in catalog::catalog() {
            for root in entry.roots {
                protected.push(catalog::expand(root, &home));
            }
        }
        let user_content: Vec<PathBuf> =
            USER_CONTENT.iter().filter_map(|r| normalize(&home.join(r))).collect();
        protected.extend(user_content.iter().cloned());

        let app_bundle_scope = ["/Applications", "~/Applications", "~/Library"]
            .into_iter()
            .filter_map(|r| authorizing_root(r, &home))
            .collect();

        Some(Self {
            protected: protected.into_iter().filter_map(|r| normalize(&r)).collect(),
            user_content,
            app_bundle_scope,
            library: normalize(&home.join("Library")),
            home,
        })
    }

    fn system() -> Option<Self> {
        Self::new(&dirs::home_dir()?)
    }

    #[cfg(test)]
    fn rooted_at(home: &Path) -> Self {
        Self::new(home).expect("a test home directory should resolve")
    }

    /// True when `path` (already normalised) is one of the protected roots,
    /// or an ancestor of one.
    ///
    /// This is not the same question as containment
    /// (`starts_with_case_insensitive(candidate, root)`, "is the candidate
    /// inside the root") — it is the mirror image
    /// (`starts_with_case_insensitive(root, candidate)`, "is the candidate
    /// the root, or above it"). `/Users` is an *ancestor* of `~/Documents`,
    /// not a descendant, so containment alone lets it straight through;
    /// deleting it would recursively destroy every account.
    fn is_ancestor_of_protected(&self, path: &Path) -> bool {
        self.protected.iter().any(|root| starts_with_case_insensitive(root, path))
    }

    /// True when `path` (already normalised) is inside one of the
    /// `USER_CONTENT` roots.
    fn is_within_user_content(&self, path: &Path) -> bool {
        self.user_content.iter().any(|r| starts_with_case_insensitive(path, r))
    }

    /// True when `path` (already normalised) is `~/Library` itself, or an
    /// immediate child of it. See the free `is_library_container` for the
    /// rule and why it is depth rather than a list of names.
    fn is_library_container(&self, path: &Path) -> bool {
        is_library_container(path, self.library.as_deref())
    }
}

fn is_user_content(path: &Path, roots: &Roots) -> bool {
    let normalized = match normalize(path) {
        Some(p) => p,
        None => return true, // Cannot prove it is safe, so treat it as unsafe.
    };

    if starts_with_case_insensitive(&normalized, Path::new("/Volumes")) {
        return true;
    }

    if roots.is_ancestor_of_protected(&normalized) {
        return true;
    }

    // The container-depth rule is applied here as well as in the `AppBundle`
    // scope check, because that is where the list it replaces used to live:
    // `APP_STATE_CONTAINERS` sat in `protected` and therefore denied a
    // container under *every* justification, not just `AppBundle`. Applying
    // the rule only at the `AppBundle` site would have removed the list and
    // quietly weakened `Orphan` and `UserChosen`, which can still Trash.
    if roots.is_library_container(&normalized) {
        return true;
    }

    roots.is_within_user_content(&normalized)
}

/// Runs on the same normalised path as `is_user_content`, or `..`, case, a
/// firmlink detour, or a symlink would defeat it exactly as they defeated
/// bar 1.
///
/// The candidate must be in scope **both as written and as resolved**.
/// Refusing a relocated scope root removes it from `app_bundle_scope`, but
/// that alone did not stop
/// `ln -s ~/Library/Containers/com.apple.mail/Data ~/Applications`: the
/// candidate `~/Applications/Envelope Index` resolves *into* `~/Library`,
/// which is a perfectly good scope root, so the resolved form passed on its
/// own. Requiring the written form to be in scope too closes the route —
/// `~/Applications` is no longer a usable root, so nothing named through it
/// is in scope no matter where it lands. This is an extra conjunct, never an
/// alternative, so it can only ever deny more.
fn is_within_app_bundle_scope(path: &Path, roots: &Roots) -> bool {
    let normalized = match normalize(path) {
        Some(p) => p,
        None => return false, // Cannot prove it is in scope, so treat it as out of scope.
    };

    // `~/Library` is in scope because that is where per-app state lives, but
    // an uninstall reaches *into* a container, never at one. Two levels
    // below `~/Library` minimum.
    if roots.is_library_container(&normalized) {
        return false;
    }

    let in_scope = |p: &Path| {
        roots.app_bundle_scope.iter().any(|scope| starts_with_case_insensitive(p, scope))
    };

    in_scope(&normalized) && in_scope(&strip_firmlink(path.to_path_buf()))
}

/// True when `path` (already normalised) lies at or beneath one of
/// `entry`'s own roots, expanded and normalised the same way. Catalog
/// membership is supposed to be the only route to `Permanent` deletion
/// (ADR-0006) — but an id existing on its own proves nothing about the path
/// handed in; without this check the id is a password with no lock
/// attached to it, and `Catalog("user-caches")` would justify deleting
/// anything at all.
///
/// Roots go through `authorizing_root`, not plain `normalize`: this is the
/// function that grants permission, so a root that has been relocated is
/// refused rather than swept.
fn is_within_catalog_entry(path: &Path, entry: &catalog::CatalogEntry, roots: &Roots) -> bool {
    entry.roots.iter().any(|root| {
        authorizing_root(root, &roots.home)
            .map(|r| starts_with_case_insensitive(path, &r))
            .unwrap_or(false)
    })
}

/// The roots of `entry` that have been relocated, described for the user:
/// what the catalog declares, and where that path actually leads now.
///
/// The project rule is that everything material is stated in plain language.
/// A skipped category is material — a user who deliberately moved a cache
/// should be able to tell that Spiral Clean saw the move and stood down,
/// rather than being handed a generic "not covered by this category" that
/// reads like a bug.
fn relocated_roots(entry: &catalog::CatalogEntry, home: &Path) -> Vec<String> {
    entry
        .roots
        .iter()
        .filter(|root| authorizing_root(root, home).is_none())
        .map(|root| {
            let declared = catalog::expand(root, home);
            match normalize(&declared) {
                Some(actual) => format!("{root} now leads to {}", actual.display()),
                None => format!("{root} could not be resolved"),
            }
        })
        .collect()
}

/// Disposition is derived here, never supplied by the caller. Two routes
/// reach `Permanent`: a `Catalog` match whose path is actually under that
/// entry's own roots (see `is_within_catalog_entry`), and `AppBundle`
/// (ADR-0004) — an app uninstall is permanent by design. `AppBundle` is
/// constrained to `/Applications`, `~/Applications`, and `~/Library`, the
/// last of those only from two levels down (see `is_library_container`); it
/// does not yet prove the path belongs to the named `bundle_id` — that lands
/// with `associate.rs` in M4, so this is a containment floor, not full
/// validation.
fn disposition_for(path: &Path, j: &Justification, roots: &Roots) -> Result<Disposition, String> {
    match j {
        Justification::Catalog(id) => match catalog::find(id) {
            Some(entry) => match normalize(path) {
                Some(normalized) if is_within_catalog_entry(&normalized, entry, roots) => {
                    Ok(entry.disposition)
                }
                _ => {
                    // Name the category and the root, and say what is
                    // actually wrong. "Not covered by this category" would be
                    // true but useless to someone who moved the cache on
                    // purpose and is wondering why nothing happened.
                    let relocated = relocated_roots(entry, &roots.home);
                    if relocated.is_empty() {
                        Err(format!(
                            "{} is not covered by the \"{id}\" category. Nothing was removed.",
                            path.display()
                        ))
                    } else {
                        Err(format!(
                            "The \"{}\" category was skipped because it no longer resolves where Spiral Clean expects it: {}. Spiral Clean only removes a category from the exact location it declares, so nothing was removed.",
                            entry.label,
                            relocated.join("; ")
                        ))
                    }
                }
            },
            None => Err(format!(
                "\"{id}\" is not a category in this release. Nothing was removed."
            )),
        },
        Justification::AppBundle { .. } => {
            if is_within_app_bundle_scope(path, roots) {
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
///
/// A symlink — the candidate itself, or anything inside the tree — is
/// unlinked, never followed. That is not incidental: `Path::is_dir` follows
/// symlinks, and `WalkDir` follows a symlinked *root* even with
/// `follow_links(false)` (`follow_root_links` defaults to true, verified:
/// walking a link to a directory yields the *target's* children). The old
/// code did both, so a link planted at a catalog path had its target's
/// contents deleted. `symlink_metadata` and the two explicit `follow_*`
/// settings below close that, and they close it again at delete time —
/// which also bounds the damage if a directory validated a moment ago is
/// swapped for a symlink before this runs.
///
/// **Known residual, accepted deliberately (round 5).** The window between
/// validation in `execute` and deletion here is narrowed, not closed. A
/// directory swapped for a *symlink* in that window is caught by the check
/// below; a directory swapped for a *different real directory* is not, and
/// would be deleted. Closing it properly means never re-resolving a path by
/// name — holding a directory handle from validation through deletion and
/// walking it with `openat`/`O_NOFOLLOW` — which is a substantially larger
/// change than the boundary needs today: Spiral Clean is a foreground,
/// user-initiated app, so an attacker must already be running as the user
/// and win a sub-second race to gain something they could not simply do
/// themselves. Revisit if removal ever moves to a background or scheduled
/// path, where the window stops being user-observable.
fn delete_permanent(path: &Path) -> Result<(), FailureKind> {
    let is_real_dir = match std::fs::symlink_metadata(path) {
        Ok(md) => md.file_type().is_dir(),
        Err(e) => {
            return Err(FailureKind::Total(format!(
                "Could not remove {}: {e}",
                path.display()
            )))
        }
    };

    if !is_real_dir {
        return std::fs::remove_file(path)
            .map_err(|e| FailureKind::Total(format!("Could not remove {}: {e}", path.display())));
    }

    let mut removed_any = false;
    let mut first_err: Option<String> = None;

    // No `.sort_by(...)` here on purpose: it would allocate and sort per
    // directory on every permanent delete, and it buys nothing. The loop
    // below never breaks early on an error, so every entry is attempted
    // regardless of iteration order — `removed_any` and `first_err` end up
    // the same either way. Ordering only matters for which error message
    // survives when more than one entry fails, which callers don't rely on.
    let walker = walkdir::WalkDir::new(path)
        .follow_links(false)
        .follow_root_links(false)
        .contents_first(true);

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
    execute_within(candidates, excl, Roots::system().as_ref())
}

/// The body of `execute`, against an explicit root set. `None` means the home
/// directory could not be resolved, in which case nothing can be proven safe
/// and nothing is removed.
fn execute_within(
    candidates: Vec<Candidate>,
    excl: &ExclusionList,
    roots: Option<&Roots>,
) -> Vec<Report> {
    candidates
        .into_iter()
        .map(|c| {
            let outcome = match roots {
                None => Outcome::Denied(
                    "Spiral Clean could not determine your home directory, so it cannot prove any path is safe to remove. Nothing was removed.".into(),
                ),
                Some(roots) => {
                    if is_user_content(&c.path, roots) {
                        Outcome::Denied(format!(
                            "{} is your own content. Spiral Clean never removes it.",
                            c.path.display()
                        ))
                    } else if excl.covers(&c.path) {
                        Outcome::Excluded
                    } else {
                        match disposition_for(&c.path, &c.justification, roots) {
                            Err(why) => Outcome::Denied(why),
                            Ok(how) => match delete(&c.path, how) {
                                Ok(()) => Outcome::Removed(how),
                                Err(FailureKind::Partial(why)) => Outcome::PartiallyRemoved(why),
                                Err(FailureKind::Total(why)) => Outcome::Failed(why),
                            },
                        }
                    }
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

    // ---- Fixtures -------------------------------------------------------
    //
    // Two kinds of test live here, and the distinction is a safety rule, not
    // a style preference:
    //
    //   * Tests that make Spiral Clean *delete* something run against a
    //     temporary home (`fake_home` + `Roots::rooted_at`). They never
    //     touch a real user directory, and containment is still genuinely
    //     enforced — the catalog roots simply expand under the tempdir.
    //   * Tests about real protected paths (`/Users`, `$HOME`,
    //     `~/Documents`, `/Applications`) assert against `is_user_content`
    //     and `disposition_for` *directly*, never through `execute`. Routing
    //     a real protected path through `execute` means that the day the
    //     guard regresses, `cargo test` deletes the developer's home
    //     directory — the tests would perform the very deletion they exist
    //     to prevent.
    //
    // No test in this file may pass a real protected path to `execute`.

    fn file(dir: &std::path::Path, name: &str) -> PathBuf {
        let p = dir.join(name);
        std::fs::write(&p, b"x").unwrap();
        p
    }

    fn candidate(path: PathBuf, j: Justification) -> Candidate {
        Candidate { path, bytes: 1, justification: j }
    }

    /// A temporary stand-in for the user's home directory.
    fn fake_home() -> tempfile::TempDir {
        tempfile::Builder::new()
            .prefix("spiral-clean-home-")
            .tempdir()
            .expect("a temporary home should be creatable")
    }

    /// `<fake home>/Library/Caches`, created — a genuine `user-caches`
    /// catalog root for the roots the test is run against.
    fn caches_dir(home: &Path) -> PathBuf {
        let dir = home.join("Library/Caches");
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn run(candidates: Vec<Candidate>, excl: &ExclusionList, roots: &Roots) -> Vec<Report> {
        execute_within(candidates, excl, Some(roots))
    }

    /// The real machine's roots. Only ever handed to `is_user_content` and
    /// `disposition_for`, which perform no I/O beyond `canonicalize`.
    fn system_roots() -> Roots {
        Roots::system().expect("home directory should resolve in tests")
    }

    fn symlink(target: &Path, link: &Path) {
        std::os::unix::fs::symlink(target, link).unwrap();
    }

    // ---- Deletion mechanics (temporary home, real containment) ----------

    #[test]
    fn a_catalog_candidate_is_removed_permanently() {
        let home = fake_home();
        let roots = Roots::rooted_at(home.path());
        let p = file(&caches_dir(home.path()), "cache.bin");
        let reports = run(
            vec![candidate(p.clone(), Justification::Catalog("user-caches".into()))],
            &exclude::new(vec![]),
            &roots,
        );
        assert!(matches!(reports[0].outcome, Outcome::Removed(Disposition::Permanent)));
        assert!(!p.exists());
    }

    #[test]
    fn an_unknown_catalog_id_is_denied() {
        // The frontend cannot invent a permanent deletion by naming a
        // category that does not exist.
        let home = fake_home();
        let roots = Roots::rooted_at(home.path());
        let p = file(&caches_dir(home.path()), "cache.bin");
        let reports = run(
            vec![candidate(p.clone(), Justification::Catalog("not-real".into()))],
            &exclude::new(vec![]),
            &roots,
        );
        assert!(matches!(reports[0].outcome, Outcome::Denied(_)));
        assert!(p.exists());
    }

    #[test]
    fn an_orphan_goes_to_the_trash_not_permanent() {
        let home = fake_home();
        let roots = Roots::rooted_at(home.path());
        let p = file(&caches_dir(home.path()), "leftover.plist");
        let reports = run(
            vec![candidate(p, Justification::Orphan { bundle_id: "com.example.gone".into() })],
            &exclude::new(vec![]),
            &roots,
        );
        assert!(matches!(reports[0].outcome, Outcome::Removed(Disposition::Trash)));
    }

    #[test]
    fn an_excluded_path_is_skipped() {
        let home = fake_home();
        let roots = Roots::rooted_at(home.path());
        let caches = caches_dir(home.path());
        let p = file(&caches, "cache.bin");
        let reports = run(
            vec![candidate(p.clone(), Justification::Catalog("user-caches".into()))],
            &exclude::new(vec![caches.clone()]),
            &roots,
        );
        assert!(matches!(reports[0].outcome, Outcome::Excluded));
        assert!(p.exists());
    }

    #[test]
    fn one_failure_does_not_abort_the_batch() {
        let home = fake_home();
        let roots = Roots::rooted_at(home.path());
        let caches = caches_dir(home.path());
        let good = file(&caches, "a.bin");
        let missing = caches.join("gone.bin");
        let reports = run(
            vec![
                candidate(missing, Justification::Catalog("user-caches".into())),
                candidate(good.clone(), Justification::Catalog("user-caches".into())),
            ],
            &exclude::new(vec![]),
            &roots,
        );
        assert_eq!(reports.len(), 2);
        assert!(matches!(reports[1].outcome, Outcome::Removed(_)));
        assert!(!good.exists());
    }

    #[test]
    fn partial_directory_failure_is_reported_not_hidden() {
        // F5. `remove_dir_all` is not atomic and does not say how far it
        // got. A directory with an unreadable subdirectory must report
        // `PartiallyRemoved`, not `Failed` — `Failed` reads as "nothing
        // happened", which would be a false statement in Task 9's history
        // log.
        use std::os::unix::fs::PermissionsExt;

        let home = fake_home();
        let roots = Roots::rooted_at(home.path());
        let target = caches_dir(home.path()).join("target");
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join("a_file.txt"), b"x").unwrap();
        let locked = target.join("z_locked");
        std::fs::create_dir(&locked).unwrap();
        std::fs::write(locked.join("inner.txt"), b"x").unwrap();
        // Remove write permission on the locked subdirectory so its own
        // contents cannot be deleted, while leaving "a_file.txt" (which
        // sorts first) deletable. Unlike the previous revision of this test
        // the chmod happens inside a throwaway temporary directory, so a
        // SIGINT in this window cannot leave an undeletable directory in the
        // user's real cache.
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o555)).unwrap();

        let reports = run(
            vec![candidate(target.clone(), Justification::Catalog("user-caches".into()))],
            &exclude::new(vec![]),
            &roots,
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

    #[test]
    fn the_first_bar_is_wired_into_execute() {
        // The protected-path tests below deliberately bypass `execute`, so
        // this one proves `execute` actually consults bar 1 — using a path
        // that is protected (`/Volumes`) but certain not to exist, so a
        // regression here fails the assertion instead of destroying data.
        let reports = execute(
            vec![candidate(
                PathBuf::from("/Volumes/spiral-clean-no-such-volume/thing"),
                Justification::UserChosen,
            )],
            &exclude::new(vec![]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Denied(_)));
    }

    #[test]
    fn nothing_is_removed_when_the_home_directory_cannot_be_resolved() {
        let home = fake_home();
        let p = file(&caches_dir(home.path()), "cache.bin");
        let reports = execute_within(
            vec![candidate(p.clone(), Justification::Catalog("user-caches".into()))],
            &exclude::new(vec![]),
            None,
        );
        assert!(matches!(reports[0].outcome, Outcome::Denied(_)));
        assert!(p.exists());
    }

    // ---- Symlink resolution (CRITICAL) ----------------------------------

    #[test]
    fn a_symlink_out_of_a_catalog_root_cannot_reach_its_target() {
        // The reviewer's exact attack: a symlink planted inside a catalog
        // root by any process that can write there. Every bar in this module
        // was lexical, so `~/Library/Caches/x/precious.txt` read as an
        // ordinary cache path — and `delete_permanent` destroyed the file at
        // the other end of the link.
        let home = fake_home();
        let roots = Roots::rooted_at(home.path());
        let elsewhere = fake_home();
        let victim_dir = elsewhere.path().join("victim");
        std::fs::create_dir(&victim_dir).unwrap();
        let victim = file(&victim_dir, "precious.txt");
        symlink(&victim_dir, &caches_dir(home.path()).join("x"));

        let reports = run(
            vec![candidate(
                home.path().join("Library/Caches/x/precious.txt"),
                Justification::Catalog("user-caches".into()),
            )],
            &exclude::new(vec![]),
            &roots,
        );
        assert!(
            matches!(reports[0].outcome, Outcome::Denied(_)),
            "symlinked path was not denied: {:?}",
            reports[0].outcome
        );
        assert!(victim.exists(), "the symlink target was destroyed");
    }

    #[test]
    fn a_symlink_into_user_content_is_denied_whatever_the_justification() {
        // Point the same planted link at Documents and every guard built
        // over three rounds is bypassed at once — unless the path is
        // resolved before any of them run.
        let home = fake_home();
        let roots = Roots::rooted_at(home.path());
        let documents = home.path().join("Documents");
        std::fs::create_dir_all(&documents).unwrap();
        let tax = file(&documents, "tax.pdf");
        symlink(&documents, &caches_dir(home.path()).join("x"));

        // Two distinct shapes: the link as an interior component of the
        // candidate, and the link *as* the candidate pointing straight at a
        // protected file.
        symlink(&tax, &home.path().join("Library/Caches/direct.pdf"));
        for path in [
            home.path().join("Library/Caches/x/tax.pdf"),
            home.path().join("Library/Caches/direct.pdf"),
        ] {
            for j in [
                Justification::Catalog("user-caches".into()),
                Justification::Orphan { bundle_id: "x".into() },
                Justification::AppBundle { bundle_id: "x".into() },
                Justification::UserChosen,
            ] {
                assert!(
                    is_user_content(&path, &roots),
                    "{} was not denied",
                    path.display()
                );
                let reports = run(vec![candidate(path.clone(), j)], &exclude::new(vec![]), &roots);
                assert!(matches!(reports[0].outcome, Outcome::Denied(_)));
            }
        }
        assert!(tax.exists(), "the symlink target was destroyed");
    }

    #[test]
    fn a_chain_of_symlinks_is_followed_to_the_end() {
        // One level of resolution is not enough: a link whose target is
        // itself a link must resolve all the way through.
        //
        // Asserted on `normalize`, not `is_user_content`. `is_user_content`
        // returns `true` both when the chain resolves into Documents *and*
        // when resolution fails outright, so it cannot tell success from
        // failure — the previous revision of this test was vacuous.
        let home = fake_home();
        let documents = home.path().join("Documents");
        std::fs::create_dir_all(&documents).unwrap();
        let caches = caches_dir(home.path());
        symlink(&documents, &caches.join("hop2"));
        symlink(&caches.join("hop2"), &caches.join("hop1"));

        let expected = normalize(&documents).unwrap().join("tax.pdf");
        assert_eq!(
            normalize(&caches.join("hop1/tax.pdf")),
            Some(expected),
            "the symlink chain did not resolve all the way to Documents"
        );
    }

    #[test]
    fn a_catalog_root_symlinked_out_of_the_home_is_refused_not_swept() {
        // Round 4 stopped symlinks *inside* a catalog root. This is the root
        // itself:
        //
        //     mv ~/Library/Caches ~/Library/Caches.real
        //     ln -s /opt/homebrew ~/Library/Caches
        //
        // Resolving the root let the link silently redefine what the catalog
        // authorises, and an ordinary sweep returned `Removed(Permanent)`
        // for files under the target — permanent, no Trash, no recovery.
        let home = fake_home();
        let outside = fake_home();
        let target = outside.path().join("homebrew/bin");
        std::fs::create_dir_all(&target).unwrap();
        let victim = file(&target, "brew");
        std::fs::create_dir_all(home.path().join("Library")).unwrap();
        symlink(&outside.path().join("homebrew"), &home.path().join("Library/Caches"));

        let roots = Roots::rooted_at(home.path());
        let reports = run(
            vec![candidate(
                home.path().join("Library/Caches/bin/brew"),
                Justification::Catalog("user-caches".into()),
            )],
            &exclude::new(vec![]),
            &roots,
        );
        assert!(
            matches!(reports[0].outcome, Outcome::Denied(_)),
            "a symlinked catalog root was swept: {:?}",
            reports[0].outcome
        );
        assert!(victim.exists(), "the symlinked root's target was destroyed");
    }

    #[test]
    fn every_relocation_target_ever_reproduced_is_refused() {
        // Rounds 5-7 in one table. Each row is `~/Library/Caches` symlinked
        // at the named directory, then an ordinary `Catalog("user-caches")`
        // clean of a file inside it. Every one of these returned
        // `Removed(Permanent)` against real files at some point across the
        // six previous rounds; the last six are the round-7 findings, which
        // the ceiling missed by exactly one level.
        for dir in [
            "",                                       // $HOME itself
            "Library",
            "Library/Keychains",
            "Library/Keychains/AAAA-BBBB-UUID",       // where keychain-2.db lives
            "Library/Application Support",
            "Library/Application Support/Signal",
            "Library/Containers/com.apple.mail/Data",
            "Library/Group Containers/group.com.apple.notes",
            "Documents",
            ".ssh",
            ".config/gh",
            ".local/share/keyrings",
            "projects",
        ] {
            let home = fake_home();
            let target =
                if dir.is_empty() { home.path().to_path_buf() } else { home.path().join(dir) };
            std::fs::create_dir_all(&target).unwrap();
            std::fs::create_dir_all(home.path().join("Library")).unwrap();
            let precious = file(&target, "precious.bin");
            symlink(&target, &home.path().join("Library/Caches"));

            let roots = Roots::rooted_at(home.path());
            let reports = run(
                vec![candidate(
                    home.path().join("Library/Caches/precious.bin"),
                    Justification::Catalog("user-caches".into()),
                )],
                &exclude::new(vec![]),
                &roots,
            );
            assert!(
                matches!(reports[0].outcome, Outcome::Denied(_)),
                "a root relocated to ~/{dir} was swept: {:?}",
                reports[0].outcome
            );
            assert!(precious.exists(), "~/{dir}/precious.bin was destroyed");
        }
    }

    #[test]
    fn a_relocated_ancestor_of_a_declared_root_is_refused() {
        // `ln -s ~/Library/Keychains ~/Library/Developer` moves an
        // *ancestor* of `xcode-derived-data`'s declared root
        // (`~/Library/Developer/Xcode/DerivedData`), not its final
        // component. Comparing the resolved path against the lexical
        // declared path — rather than against an anchor derived from it —
        // is what catches this.
        let home = fake_home();
        let keychains = home.path().join("Library/Keychains");
        std::fs::create_dir_all(keychains.join("Xcode/DerivedData")).unwrap();
        let keychain = file(&keychains, "keychain-2.db");
        symlink(&keychains, &home.path().join("Library/Developer"));

        let roots = Roots::rooted_at(home.path());
        let reports = run(
            vec![candidate(
                home.path().join("Library/Developer/Xcode/DerivedData"),
                Justification::Catalog("xcode-derived-data".into()),
            )],
            &exclude::new(vec![]),
            &roots,
        );
        assert!(
            matches!(reports[0].outcome, Outcome::Denied(_)),
            "a relocated ancestor of a declared root was swept: {:?}",
            reports[0].outcome
        );
        assert!(keychain.exists(), "keychain-2.db was destroyed");
    }

    #[test]
    fn a_relocated_applications_root_is_refused_under_app_bundle() {
        // `ln -s ~/Library/Containers/com.apple.mail/Data ~/Applications`
        // under `AppBundle`. The scope roots go through the same rule as
        // catalog roots, so relocation refuses them identically.
        let home = fake_home();
        let mail = home.path().join("Library/Containers/com.apple.mail/Data");
        std::fs::create_dir_all(&mail).unwrap();
        let db = file(&mail, "Envelope Index");
        symlink(&mail, &home.path().join("Applications"));

        let roots = Roots::rooted_at(home.path());
        let reports = run(
            vec![candidate(
                home.path().join("Applications/Envelope Index"),
                Justification::AppBundle { bundle_id: "com.example.app".into() },
            )],
            &exclude::new(vec![]),
            &roots,
        );
        assert!(
            matches!(reports[0].outcome, Outcome::Denied(_)),
            "a relocated ~/Applications was swept: {:?}",
            reports[0].outcome
        );
        assert!(db.exists(), "Mail's Envelope Index was destroyed");
    }

    #[test]
    fn a_relocated_root_is_skipped_and_the_user_is_told_why() {
        // Round 4 through 6 kept this relocation working — `~/.gradle`
        // symlinked to `~/dev/gradle` — and every containment rule built
        // around it was defeated one level lower. Cohen dropped the
        // constraint in round 7: relocation itself is now the refusal.
        //
        // Skipping silently would be its own defect, so this also pins the
        // message: it must name the category and the root and say what is
        // actually wrong.
        let home = fake_home();
        let real = home.path().join("dev/gradle");
        std::fs::create_dir_all(real.join("caches")).unwrap();
        symlink(&real, &home.path().join(".gradle"));

        let roots = Roots::rooted_at(home.path());
        let p = file(&real.join("caches"), "modules.bin");
        let reports = run(
            vec![candidate(
                home.path().join(".gradle/caches/modules.bin"),
                Justification::Catalog("package-manager-caches".into()),
            )],
            &exclude::new(vec![]),
            &roots,
        );

        let why = match &reports[0].outcome {
            Outcome::Denied(why) => why.clone(),
            other => panic!("expected Denied, got {other:?}"),
        };
        assert!(p.exists(), "a relocated root was swept");
        assert!(
            why.contains("Package manager download caches"),
            "the message does not name the category: {why}"
        );
        assert!(
            why.contains("~/.gradle/caches"),
            "the message does not name the relocated root: {why}"
        );
        assert!(
            why.contains(&real.join("caches").to_string_lossy().to_string()),
            "the message does not say where the root actually leads: {why}"
        );
        assert!(
            why.contains("skipped"),
            "the message does not say the category was skipped: {why}"
        );
    }

    #[test]
    fn a_relocated_app_bundle_root_is_refused_at_its_call_site() {
        // The previous version of this test asserted only on
        // `authorizing_root` and still passed with *both* call sites
        // reverted, so it proved less than its name claimed. This one goes
        // through `Roots::new` (which builds `app_bundle_scope`) and
        // `disposition_for` (which consumes it).
        let home = fake_home();
        let outside = fake_home();
        let apps = outside.path().join("Apps");
        std::fs::create_dir_all(apps.join("Example.app")).unwrap();
        symlink(&apps, &home.path().join("Applications"));

        let roots = Roots::rooted_at(home.path());
        assert!(
            !roots.app_bundle_scope.iter().any(|s| starts_with_case_insensitive(s, &normalize(&apps).unwrap())),
            "a relocated ~/Applications stayed in the AppBundle scope: {:?}",
            roots.app_bundle_scope
        );
        assert!(
            disposition_for(
                &home.path().join("Applications/Example.app"),
                &Justification::AppBundle { bundle_id: "com.example.app".into() },
                &roots,
            )
            .is_err(),
            "a relocated ~/Applications still authorised an uninstall"
        );
    }

    #[test]
    fn an_absolute_root_that_is_a_symlink_is_refused() {
        // Asserted on the helper because no call site can reach an absolute
        // root today: every catalog entry is `~/`-rooted, and the one
        // absolute scope root (`/Applications`) is a real directory this
        // test cannot replace. `/tmp` is a symlink to `/private/tmp` on
        // macOS, so it does not resolve where it is declared and is refused
        // by the same rule as any other relocated root. Named for what it
        // actually proves.
        let roots = system_roots();
        assert_eq!(authorizing_root("/tmp", &roots.home), None);
        assert_eq!(
            authorizing_root("/Applications", &roots.home),
            Some("/Applications".into())
        );
    }

    #[test]
    fn a_catalog_root_symlinked_to_the_home_itself_is_refused() {
        // `ln -s ~ ~/Library/Caches` makes the entire home minus
        // `USER_CONTENT` catalog-authorised, and an ordinary sweep
        // permanently deleted `~/.ssh/id_rsa`. The anchor rule alone let
        // this through: the home is trivially "inside the home".
        let home = fake_home();
        let ssh = home.path().join(".ssh");
        std::fs::create_dir_all(&ssh).unwrap();
        let key = file(&ssh, "id_rsa");
        std::fs::create_dir_all(home.path().join("Library")).unwrap();
        symlink(home.path(), &home.path().join("Library/Caches"));

        let roots = Roots::rooted_at(home.path());
        let reports = run(
            vec![candidate(
                home.path().join("Library/Caches/.ssh/id_rsa"),
                Justification::Catalog("user-caches".into()),
            )],
            &exclude::new(vec![]),
            &roots,
        );
        assert!(
            matches!(reports[0].outcome, Outcome::Denied(_)),
            "a root pointed at $HOME was swept: {:?}",
            reports[0].outcome
        );
        assert!(key.exists(), "~/.ssh/id_rsa was destroyed");
    }

    #[test]
    fn a_catalog_root_symlinked_to_library_is_refused() {
        // `ln -s ~/Library ~/Library/Caches` permanently deleted
        // `~/Library/Keychains/login.keychain-db`. The container-depth rule
        // does not help: everything under the redirected root lands two or
        // more levels below `~/Library`.
        let home = fake_home();
        let keychains = home.path().join("Library/Keychains");
        std::fs::create_dir_all(&keychains).unwrap();
        let keychain = file(&keychains, "login.keychain-db");
        symlink(&home.path().join("Library"), &home.path().join("Library/Caches"));

        let roots = Roots::rooted_at(home.path());
        let reports = run(
            vec![candidate(
                home.path().join("Library/Caches/Keychains/login.keychain-db"),
                Justification::Catalog("user-caches".into()),
            )],
            &exclude::new(vec![]),
            &roots,
        );
        assert!(
            matches!(reports[0].outcome, Outcome::Denied(_)),
            "a root pointed at ~/Library was swept: {:?}",
            reports[0].outcome
        );
        assert!(keychain.exists(), "login.keychain-db was destroyed");
    }

    #[test]
    fn a_catalog_root_relocated_onto_a_library_container_is_refused() {
        // `~/Library/Caches` → `~/Library/Keychains`: the proven
        // `→ ~/Library` attack aimed one level lower. Round 6's ceiling
        // missed it (`~/Library` is not an *ancestor* of
        // `~/Library/Keychains`) and bar 1 misses it (the candidate lands two
        // levels below `~/Library`, clearing the container rule). Refused
        // now for the only reason that matters: the root moved.
        let home = fake_home();
        let keychains = home.path().join("Library/Keychains");
        std::fs::create_dir_all(&keychains).unwrap();
        let keychain = file(&keychains, "login.keychain-db");
        symlink(&keychains, &home.path().join("Library/Caches"));

        let roots = Roots::rooted_at(home.path());
        let reports = run(
            vec![candidate(
                home.path().join("Library/Caches/login.keychain-db"),
                Justification::Catalog("user-caches".into()),
            )],
            &exclude::new(vec![]),
            &roots,
        );
        assert!(
            matches!(reports[0].outcome, Outcome::Denied(_)),
            "a root relocated onto a container was swept: {:?}",
            reports[0].outcome
        );
        assert!(keychain.exists(), "login.keychain-db was destroyed");
    }

    #[test]
    fn a_catalog_root_relocated_to_a_top_level_home_directory_is_refused() {
        // `ln -s ~/.ssh ~/Library/Caches` is the `ln -s ~ ~/Library/Caches`
        // attack aimed one level lower, and reached the same file: it
        // returned `Removed(Permanent)` for `id_rsa` under round 6's
        // ceiling. `~/projects` is the same shape for a source tree.
        for (dir, leaf) in [(".ssh", "id_rsa"), ("projects", "src.rs")] {
            let home = fake_home();
            let target = home.path().join(dir);
            std::fs::create_dir_all(&target).unwrap();
            let precious = file(&target, leaf);
            std::fs::create_dir_all(home.path().join("Library")).unwrap();
            symlink(&target, &home.path().join("Library/Caches"));

            let roots = Roots::rooted_at(home.path());
            let reports = run(
                vec![candidate(
                    home.path().join("Library/Caches").join(leaf),
                    Justification::Catalog("user-caches".into()),
                )],
                &exclude::new(vec![]),
                &roots,
            );
            assert!(
                matches!(reports[0].outcome, Outcome::Denied(_)),
                "a root relocated to ~/{dir} was swept: {:?}",
                reports[0].outcome
            );
            assert!(precious.exists(), "~/{dir}/{leaf} was destroyed");
        }
    }

    #[test]
    fn library_symlinked_to_the_home_is_refused_under_app_bundle() {
        // `ln -s ~ ~/Library` made every `AppBundle` candidate in the home
        // permanent-deletable, and destroyed `~/.ssh/id_rsa`. `~/Library` is
        // an `AppBundle` scope root, so the same relocation rule has to
        // apply to the scope list, not only to catalog roots.
        let home = fake_home();
        let ssh = home.path().join(".ssh");
        std::fs::create_dir_all(&ssh).unwrap();
        let key = file(&ssh, "id_rsa");
        symlink(home.path(), &home.path().join("Library"));

        let roots = Roots::rooted_at(home.path());
        let reports = run(
            vec![candidate(
                home.path().join("Library/.ssh/id_rsa"),
                Justification::AppBundle { bundle_id: "com.example.app".into() },
            )],
            &exclude::new(vec![]),
            &roots,
        );
        assert!(
            matches!(reports[0].outcome, Outcome::Denied(_)),
            "~/Library pointed at $HOME still authorised an uninstall: {:?}",
            reports[0].outcome
        );
        assert!(key.exists(), "~/.ssh/id_rsa was destroyed");
    }

    #[test]
    fn a_symlink_loop_is_denied_rather_than_guessed_at() {
        // `canonicalize` fails with ELOOP, which is not "does not exist".
        // The code must deny rather than fall back to the lexical path.
        let home = fake_home();
        let roots = Roots::rooted_at(home.path());
        let caches = caches_dir(home.path());
        symlink(&caches.join("b"), &caches.join("a"));
        symlink(&caches.join("a"), &caches.join("b"));

        let path = caches.join("a");
        assert!(is_user_content(&path, &roots), "a symlink loop was not denied");
        assert!(
            disposition_for(&path, &Justification::Catalog("user-caches".into()), &roots).is_err()
        );
    }

    #[test]
    fn a_symlink_candidate_is_unlinked_not_followed_into() {
        // The link itself resolves to a location genuinely inside the
        // catalog root, so it clears every bar and is actually deleted —
        // which is precisely the case that proves `delete_permanent` unlinks
        // the link instead of walking into the directory it names.
        let home = fake_home();
        let roots = Roots::rooted_at(home.path());
        let caches = caches_dir(home.path());
        let real_dir = caches.join("real");
        std::fs::create_dir(&real_dir).unwrap();
        let kept = file(&real_dir, "keep.bin");
        let link = caches.join("link");
        symlink(&real_dir, &link);

        let reports = run(
            vec![candidate(link.clone(), Justification::Catalog("user-caches".into()))],
            &exclude::new(vec![]),
            &roots,
        );
        assert!(
            matches!(reports[0].outcome, Outcome::Removed(Disposition::Permanent)),
            "expected the link to be removed, got {:?}",
            reports[0].outcome
        );
        assert!(std::fs::symlink_metadata(&link).is_err(), "the symlink was not unlinked");
        assert!(kept.exists(), "the symlink was followed into its target");
        assert!(real_dir.exists(), "the symlink target directory was removed");
    }

    // ---- Protected roots (asserted directly, never through `execute`) ----

    #[test]
    fn user_content_is_denied_whatever_the_justification() {
        // ADR-0005. Every justification variant must fail here, including the
        // ones a future feature might add for a "good reason". Asserted
        // against `is_user_content`, which runs first and unconditionally in
        // `execute` for every variant, rather than by handing the real
        // `~/Documents` to a function whose job is to delete things.
        let roots = system_roots();
        let home = &roots.home;
        for root in ["Documents", "Desktop", "Downloads", "Movies", "Music", "Pictures"] {
            let path = home.join(root).join("file.txt");
            assert!(is_user_content(&path, &roots), "{root} was not denied");
        }
    }

    #[test]
    fn external_volumes_are_denied_regardless_of_case() {
        // F2/F3: APFS is case-insensitive, so `/volumes` and `/VOLUMES` are
        // the same mount point as `/Volumes` and must be denied too.
        let roots = system_roots();
        for prefix in ["/Volumes", "/volumes", "/VOLUMES"] {
            let path = PathBuf::from(format!("{prefix}/Backup/thing"));
            assert!(is_user_content(&path, &roots), "{prefix} was not denied");
        }
    }

    #[test]
    fn parent_dir_traversal_out_of_user_content_is_denied() {
        // F1. `Path::starts_with` compares components literally and does not
        // resolve `..`, and `canonicalize` would silently *collapse* one —
        // so a path that detours out of a safe directory and back into
        // Documents must be rejected on sight.
        let roots = system_roots();
        let path = roots.home.join("Library/Caches/../Documents/tax.pdf");
        assert!(is_user_content(&path, &roots), "traversal path was not denied");
        assert!(!is_within_app_bundle_scope(&path, &roots), "traversal path was in app scope");
    }

    #[test]
    fn case_variant_user_content_is_denied() {
        // F2. APFS is case-insensitive by default: `~/documents` and
        // `~/Documents` are the same folder on disk, but a literal
        // `starts_with` only catches one spelling — and `realpath` does not
        // correct the case either (verified on this macOS).
        let roots = system_roots();
        for variant in ["documents", "DOCUMENTS", "DoCuMeNtS"] {
            let path = roots.home.join(variant).join("file.txt");
            assert!(is_user_content(&path, &roots), "{variant} was not denied");
        }
    }

    #[test]
    fn firmlink_data_volume_path_is_denied() {
        // F3. `/System/Volumes/Data/Users/<u>/Documents` shares a
        // device+inode with `~/Documents` (verified with `stat -f %d:%i`)
        // but is neither under `/Volumes` nor under `home` as a literal
        // string — and `realpath` does *not* collapse it, so
        // canonicalisation cannot replace this check. Per F2 the prefix must
        // be matched regardless of case too.
        let roots = system_roots();
        let home_tail = roots.home.strip_prefix("/").expect("home is absolute");
        for prefix in ["/System/Volumes/Data", "/system/Volumes/Data", "/System/volumes/data"] {
            let path = Path::new(prefix).join(home_tail).join("Documents/file.txt");
            assert!(is_user_content(&path, &roots), "{prefix} firmlink path was not denied");
        }
    }

    #[test]
    fn a_doubled_firmlink_prefix_is_stripped_not_half_stripped() {
        // The strip is a loop, not a single strip. `/System/Volumes/Data/
        // System/Volumes` does not exist on this macOS, so `resolve`
        // canonicalises `/System/Volumes/Data/System` and re-appends the
        // rest verbatim — which is exactly how a doubled prefix reaches the
        // comparison, and exactly what stripping once would leave behind.
        let roots = system_roots();
        let home_tail = roots.home.strip_prefix("/").expect("home is absolute");
        let path = Path::new("/System/Volumes/Data/System/Volumes/Data")
            .join(home_tail)
            .join("Documents/x");
        assert!(is_user_content(&path, &roots), "doubled firmlink prefix was not denied");
    }

    #[test]
    fn a_relative_path_is_denied() {
        // `canonicalize` resolves a relative path against the process's
        // working directory, which is not something this module may guess at.
        //
        // Asserted on `normalize`, and with a relative path that genuinely
        // *exists* relative to the working directory. The previous version
        // used `Documents/tax.pdf`, which does not exist, so `resolve`
        // returned `None` on its own and the test passed with the guard
        // deleted — it survived mutation. `Cargo.toml` is present in the
        // crate root, which is `cargo test`'s working directory, so without
        // the guard this resolves to a real path and the assertion fails.
        assert_eq!(normalize(Path::new("Cargo.toml")), None, "a relative path resolved");
        assert_eq!(normalize(Path::new("src")), None, "a relative directory resolved");

        let roots = system_roots();
        assert!(is_user_content(Path::new("Cargo.toml"), &roots));
        assert!(!is_within_app_bundle_scope(Path::new("Example.app"), &roots));
    }

    #[test]
    fn a_trailing_slash_does_not_change_the_verdict() {
        // Components ignore a trailing separator, so `/Users/` must be
        // treated exactly as `/Users` is.
        let roots = system_roots();
        assert!(is_user_content(Path::new("/Users/"), &roots));
        assert!(is_user_content(&roots.home.join("Documents/"), &roots));
    }

    #[test]
    fn protected_roots_are_derived_from_the_catalog_not_transcribed() {
        // The list used to be hand-maintained, and `$HOME/Applications` —
        // the exact mirror of the `/Applications` entry that *was* there —
        // was missing, so `disposition_for($HOME/Applications, AppBundle)`
        // returned `Ok(Permanent)`: recursive permanent deletion of every
        // per-user app. Deriving the set from `catalog::catalog()` means a
        // catalog entry added in a future release is protected on the day it
        // lands rather than when someone remembers.
        let roots = system_roots();
        for entry in catalog::catalog() {
            for root in entry.roots {
                let path = catalog::expand(root, &roots.home);
                assert!(
                    is_user_content(&path, &roots),
                    "catalog root {} ({}) is not protected",
                    path.display(),
                    entry.id
                );
            }
        }
        for path in [
            PathBuf::from("/Users"),
            PathBuf::from("/Applications"),
            roots.home.join("Applications"),
            roots.home.join("Library"),
            roots.home.join("Library/Application Support"),
            roots.home.clone(),
        ] {
            assert!(is_user_content(&path, &roots), "{} is not protected", path.display());
        }
    }

    #[test]
    fn an_ancestor_of_a_protected_root_is_denied() {
        // `/Users` is an *ancestor* of `~/Documents`, not a descendant, so
        // the containment check alone let it through — and
        // `/System/Volumes/Data/Users` normalises to the same thing.
        // Asserted against `is_user_content`, which runs before
        // `disposition_for` and so covers every justification at once; a
        // sibling test proves `execute` consults it.
        let roots = system_roots();
        for path in [
            PathBuf::from("/"),
            PathBuf::from("/Users"),
            roots.home.clone(),
            PathBuf::from("/System/Volumes/Data/Users"),
        ] {
            assert!(is_user_content(&path, &roots), "{} was not denied", path.display());
        }
    }

    #[test]
    fn library_and_applications_themselves_are_denied() {
        // `~/Library` is in scope for `AppBundle` — it has to be, that is
        // where per-app support state lives — but `~/Library` itself, and
        // `/Applications` itself, must never be deletable. Caught by the
        // same ancestor rule as `/Users`.
        let roots = system_roots();
        for path in [
            roots.home.join("Library"),
            PathBuf::from("/Applications"),
            roots.home.join("Applications"),
        ] {
            assert!(is_user_content(&path, &roots), "{} was not denied", path.display());
        }
    }

    #[test]
    fn every_immediate_child_of_library_is_denied_by_depth() {
        // The list this replaces held four names and was already missing
        // `LaunchAgents`, `WebKit`, `HTTPStorages`, and `Cookies` on the day
        // it was written — each of which reached
        // `disposition_for(.., AppBundle) == Ok(Permanent)`, i.e.
        // whole-directory permanent deletion of every app's state of that
        // kind. The last entry below is deliberately invented: it stands for
        // the container macOS adds next, which a list cannot cover and the
        // depth rule does.
        let roots = system_roots();
        for name in [
            "Application Support",
            "Preferences",
            "Containers",
            "Group Containers",
            "LaunchAgents",
            "WebKit",
            "HTTPStorages",
            "Cookies",
            "SomeContainerAppleHasNotShippedYet",
        ] {
            let path = roots.home.join("Library").join(name);
            assert!(is_user_content(&path, &roots), "~/Library/{name} was not denied");
            assert!(
                disposition_for(&path, &Justification::AppBundle { bundle_id: "x".into() }, &roots)
                    .is_err(),
                "~/Library/{name} was permitted under AppBundle"
            );
        }
    }

    #[test]
    fn one_apps_state_inside_a_container_is_still_permitted() {
        // The depth rule must not cost the app its actual job: an uninstall
        // reaches *into* a container. Two levels below `~/Library` is the
        // shallowest legitimate target.
        let roots = system_roots();
        for path in [
            roots.home.join("Library/Application Support/Slack"),
            roots.home.join("Library/Preferences/com.foo.plist"),
            roots.home.join("Library/Containers/com.foo"),
            roots.home.join("Library/LaunchAgents/com.foo.plist"),
        ] {
            assert!(!is_user_content(&path, &roots), "{} was wrongly denied", path.display());
            assert_eq!(
                disposition_for(&path, &Justification::AppBundle { bundle_id: "x".into() }, &roots),
                Ok(Disposition::Permanent),
                "{} was not permitted under AppBundle",
                path.display()
            );
        }
    }

    #[test]
    fn icloud_drive_wins_over_app_bundle_containment() {
        // `~/Library` is in scope for AppBundle, but
        // `~/Library/Mobile Documents` is iCloud Drive — user content — and
        // the user-content bar runs first and still wins.
        let roots = system_roots();
        let path = roots.home.join("Library/Mobile Documents/com~apple~CloudDocs/thing");
        assert!(is_user_content(&path, &roots));
    }

    // ---- Justification containment --------------------------------------

    #[test]
    fn an_app_bundle_under_applications_is_permitted_regardless_of_case() {
        // F2/F3 requirement 3: the same case-insensitivity fix applies to
        // the AppBundle containment check, not just the user-content bar.
        let roots = system_roots();
        for path in ["/Applications/Example.app", "/applications/Example.app"] {
            let result = disposition_for(
                Path::new(path),
                &Justification::AppBundle { bundle_id: "com.example.app".into() },
                &roots,
            );
            assert_eq!(result, Ok(Disposition::Permanent), "{path} was not permitted");
        }
    }

    #[test]
    fn an_app_bundle_outside_the_allowed_roots_is_denied() {
        // F4. /tmp is neither /Applications, ~/Applications, nor ~/Library.
        let roots = system_roots();
        let result = disposition_for(
            Path::new("/tmp/Example.app"),
            &Justification::AppBundle { bundle_id: "com.example.app".into() },
            &roots,
        );
        assert!(result.is_err());
    }

    #[test]
    fn catalog_justification_is_validated_against_its_own_entrys_roots() {
        // A catalog id existing is not enough on its own: `disposition_for`
        // used to grant `Permanent` to *any* path once the id looked up,
        // with zero relationship to what that id actually names.
        let roots = system_roots();

        let wrong_entry = disposition_for(
            &roots.home.join("Library/Logs/some.log"),
            &Justification::Catalog("user-caches".into()),
            &roots,
        );
        assert!(
            wrong_entry.is_err(),
            "a Library/Logs path was accepted under the user-caches justification"
        );
    }

    #[test]
    fn real_catalog_paths_still_reach_permanent() {
        // The other side of every guard in this module: the app has to be
        // able to do its job. None of the symlink, ancestor, or derived-root
        // work may block an ordinary cache sweep. (`~/Library/Caches` itself
        // reaches `Ok(Permanent)` here and is separately stopped by the
        // ancestor rule inside `execute` — the disposition is correct, the
        // whole-root deletion is what is refused.)
        let roots = system_roots();
        for (path, id) in [
            (roots.home.join("Library/Caches/thing/f.bin"), "user-caches"),
            (roots.home.join("Library/Caches"), "user-caches"),
            (roots.home.join(".gradle/caches"), "package-manager-caches"),
        ] {
            assert_eq!(
                disposition_for(&path, &Justification::Catalog(id.into()), &roots),
                Ok(Disposition::Permanent),
                "{} was not permitted under {id}",
                path.display()
            );
        }
    }
}

