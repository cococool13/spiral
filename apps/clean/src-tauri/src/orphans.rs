//! Read-only leftover detection: bundle-id-shaped entries under the user's
//! Library that no installed application declares.
//!
//! This module never deletes and never calls into `remove.rs` — it only
//! proposes. It reuses `associate::LOCATIONS` (one bounded list, one place to
//! change) and `apps::discover_in` (never `apps::discover` — see [`find_in`])
//! so nothing here resolves a real home or scans a real directory on its own.
//!
//! **An entry belongs to an installed app whenever its id equals that app's
//! own id, or extends it with a `.`-separated suffix** — the same rule
//! `remove.rs::verified_name_matches` uses on the other side of the removal
//! boundary. Apple *requires* an app extension, helper, or updater to be
//! named this way, so `com.example.foo.SafariExtension` is not an edge case
//! of `com.example.foo` being installed — it is how Apple's own naming
//! convention represents "belongs to." Matching only exact equality here
//! would report every extension, helper, and updater of every installed app
//! as dead, which on a real Mac is not a handful of near-misses but hundreds
//! of entries.
//!
//! **A name this module does not understand is evidence of nothing.** Only
//! the three shapes [`resolve_verifiable_id`] names resolve to an id at all;
//! anything else is skipped. `UBF8T346G9.Office` is dotted, is not
//! `com.apple.*`, and matches no installed app's id — and it is Microsoft
//! Office's live group container, named after Microsoft's Team ID rather
//! than after any `CFBundleIdentifier`. Nothing declares that string, so
//! "no installed app declares it" is vacuously true of it. macOS names
//! group containers `<TeamID>.<name>` at least as often as `group.<id>`, so
//! this is not a rare shape: it is a large fraction of one whole location.
//!
//! **Apple and macOS own identifiers outside `com.apple.*`, and those are
//! refused by name.** Shortcuts stores itself as `is.workflow.*` and the
//! printing system as `org.cups.*` — well-formed reverse-DNS ids that no
//! application declares, because they do not belong to an application at
//! all. [`SYSTEM_OWNED_IDS`] is the refusal, and it is a maintenance list
//! that will go stale; read its own doc comment before assuming it is
//! complete or before trying to replace it with a wider discovery scan.
//!
//! **Discovery finding no installed applications at all makes this report
//! nothing, not everything.** An empty installed set is far more likely
//! evidence that `apps::discover_in` could not read `/Applications` than
//! evidence that zero applications exist — and treating it as the latter
//! would make a permissions problem look like license to propose every
//! bundle-id-shaped entry on the machine as dead. This module fails closed,
//! the same way the rest of this app does.

use crate::apps;
use crate::associate::LOCATIONS;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// A bundle-id-shaped entry (or set of entries, across [`LOCATIONS`]) that no
/// installed application declares.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Leftover {
    pub bundle_id: String,
    pub paths: Vec<PathBuf>,
    pub bytes: u64,
}

/// Component sequences that mark an identifier as belonging to Apple or to
/// macOS itself, lowercased. `com.apple` is the one `associate.rs` and
/// `remove.rs` each apply on their own side of the boundary; the rest are
/// system software Apple ships under someone else's reverse-DNS root.
///
/// **This list is incomplete by construction and it will go stale.** It is a
/// maintenance list, not an enumeration of anything knowable: macOS ships an
/// unbounded number of components under third-party roots, and each release
/// may add more. Treat a name absent from it as *unclassified*, never as
/// proven third-party. Adding an entry costs a leftover left behind; missing
/// one costs live system data proposed for the Trash, which is the failure
/// this module exists to prevent — so add generously on suspicion rather
/// than waiting for proof.
///
/// **Scanning `/System/Applications` into the installed set would not fix
/// this, and nobody should spend a day discovering that.** The
/// declaring-app match asks "does an installed app declare this id", and
/// these ids are not any application's `CFBundleIdentifier`:
/// `is.workflow.shortcuts` is Shortcuts' *storage* id, not Shortcuts'
/// bundle id, so discovering `Shortcuts.app` would not match it however
/// many roots discovery scanned. A refusal is the only mechanism that
/// reaches these at all.
///
/// Each entry is justified, not guessed:
///
/// * `com.apple` — Apple's own, by definition.
/// * `is.workflow` — Shortcuts and Automator workflow storage
///   (`group.is.workflow.my.app`, `group.is.workflow.shortcuts`), found live
///   on a real disk during the M4b branch review.
/// * `org.cups` — CUPS, the printing system macOS ships
///   (`org.cups.PrintingPrefs.plist`), found the same way.
/// * `org.openbsd` — OpenSSH, shipped by macOS (`org.openbsd.ssh-agent`).
/// * `edu.mit.kerberos` — the Kerberos implementation macOS ships.
/// * `org.swift` — the Swift toolchain, published by Apple through
///   swift.org and installed with Xcode's command-line tools.
///
/// Note what every non-Apple entry has in common: none of them is an
/// application, so no `apps::discover_in` scan of any root could declare
/// them.
const SYSTEM_OWNED_IDS: &[&[&str]] = &[
    &["com", "apple"],
    &["is", "workflow"],
    &["org", "cups"],
    &["org", "openbsd"],
    &["edu", "mit", "kerberos"],
    &["org", "swift"],
];

/// True when `bundle_id` belongs to Apple or to macOS itself,
/// case-insensitively — see [`SYSTEM_OWNED_IDS`].
///
/// **Tested at every `.`-separated component boundary, not only at the
/// start.** A group container is named `<TeamID>.<id>` at least as often as
/// `group.<id>`, so Apple's own Podcasts state is on disk as
/// `243LU875E5.groups.com.apple.podcasts` — an identifier that is Apple's
/// beyond any doubt and that a `starts_with("com.apple.")` test does not
/// refuse at all. Sliding each sequence's own window over the id refuses it,
/// and refuses any other system id however it is prefixed.
///
/// **Components, never substrings.** `com.applesomething.foo` and
/// `is.workflows.example` are third-party ids that merely begin the same
/// way, and they must keep being proposable: comparing whole components
/// rather than searching for the text `com.apple` is what separates the two.
/// This codebase has shipped a substring-where-a-component-was-meant bug
/// four separate times, and every one of them read as a safe simplification
/// of exactly this shape.
fn is_system_bundle_id(bundle_id: &str) -> bool {
    let segments: Vec<String> = bundle_id.split('.').map(str::to_lowercase).collect();
    SYSTEM_OWNED_IDS
        .iter()
        .any(|owned| segments.windows(owned.len()).any(|window| window == *owned))
}

/// Trailing components macOS appends to a bundle id to name a *file about*
/// that app, rather than components of the id itself.
///
/// Each is a file-format token, never a component of a real
/// `CFBundleIdentifier`: `~/Library/HTTPStorages/com.example.foo.binarycookies`
/// is the cookie jar belonging to `com.example.foo`, not an app called
/// `com.example.foo.binarycookies`. Stripping them is what makes one dead
/// application one row instead of several.
///
/// Kept deliberately short. A token added here is a token that can no longer
/// end a bundle id this module will resolve, so the bar for adding one is
/// that macOS itself generates the name — not that it looks file-like.
const KNOWN_SUFFIXES: &[&str] = &[".plist", ".savedState", ".binarycookies", ".lockfile"];

/// Strip every trailing [`KNOWN_SUFFIXES`] token, returning `name` unchanged
/// when it carries none.
///
/// Repeated rather than single, because macOS stacks them:
/// `~/Library/Preferences` holds `com.example.foo.plist.lockfile` while a
/// preference write is in flight, and stripping only the outer token would
/// leave `com.example.foo.plist` as a second, phantom application.
fn strip_known_suffixes(name: &str) -> &str {
    let mut current = name;
    'outer: loop {
        for suffix in KNOWN_SUFFIXES {
            if let Some(stripped) = current.strip_suffix(suffix) {
                current = stripped;
                continue 'outer;
            }
        }
        return current;
    }
}

/// Generic top-level domains a bundle id may begin with. Country-code TLDs
/// are not listed: every one of them is exactly two ASCII letters and no
/// other TLD is two characters long, so [`is_top_level_domain`] admits the
/// whole ccTLD space with one rule instead of 250 entries.
///
/// **An omission here costs a leftover left behind, never a wrong removal.**
/// That is the trade this list is chosen to make, so keep it to labels that
/// plausibly begin a real bundle id rather than reaching for completeness.
const GENERIC_TLDS: &[&str] = &[
    "com", "org", "net", "edu", "gov", "mil", "int", "info", "biz", "name", "pro", "mobi",
    "asia", "cat", "coop", "aero", "jobs", "museum", "travel", "post", "tel", "app", "dev",
    "page", "site", "online", "store", "shop", "blog", "cloud", "tech", "space", "world",
    "life", "live", "art", "design", "studio", "digital", "media", "agency", "systems",
    "solutions", "software", "tools", "works", "group", "team", "zone", "network", "email",
    "chat", "games", "link", "codes", "technology", "academy", "social", "expert", "center",
    "global", "company", "foundation", "institute", "xyz", "wiki", "one", "plus", "run",
    "club", "fun", "host",
];

/// True when `segment` is a top-level domain label — the first component of
/// a reverse-DNS name.
fn is_top_level_domain(segment: &str) -> bool {
    let segment = segment.to_lowercase();
    if segment.len() == 2 && segment.chars().all(|c| c.is_ascii_alphabetic()) {
        return true;
    }
    GENERIC_TLDS.contains(&segment.as_str())
}

/// True when `id` is reverse-DNS shaped: a top-level domain label, then at
/// least one further non-empty component, every component drawn from the
/// characters an identifier may contain.
///
/// **This is the whole of what makes an entry evidence.** "Contains a dot" is
/// not — `UBF8T346G9.Office` contains a dot, and it is Microsoft Office's
/// live group container, named after Microsoft's Team ID rather than after
/// any `CFBundleIdentifier`. No application anywhere declares that string, so
/// "no installed app declares it" is vacuously true of it and says nothing
/// whatever about whether Office is installed. Requiring the first component
/// to be a TLD is what separates a name an application could have declared
/// from a name that only looks dotted.
fn is_reverse_dns(id: &str) -> bool {
    let mut segments = id.split('.');
    let Some(first) = segments.next() else {
        return false;
    };
    if !is_top_level_domain(first) {
        return false;
    }
    let rest: Vec<&str> = segments.collect();
    !rest.is_empty()
        && rest.iter().all(|segment| {
            !segment.is_empty()
                && segment.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        })
}

/// The id `name` proves, or `None` when `name` is not one of the shapes this
/// module understands.
///
/// Three shapes resolve, and nothing else does:
///
/// * a reverse-DNS name itself (`com.foo.bar`), matching
///   `remove.rs::verified_name_matches`'s "name is the id" arm;
/// * that name plus [`KNOWN_SUFFIXES`] (`com.foo.bar.plist`), matching its
///   "id plus a `.`-separated suffix" arm;
/// * that name behind a `group.` prefix (`group.com.foo.bar`), matching its
///   "exact `group.<id>`" arm.
///
/// **The prefix and the suffix are never combined.** A name like
/// `group.com.foo.bar.plist` looks tempting to resolve to `com.foo.bar` by
/// stripping both, but `verified_name_matches("group.com.foo.bar.plist",
/// "com.foo.bar")` is `false` under all three of its own arms — the removal
/// boundary can never confirm that path carries that id. Proposing it anyway
/// would show the user a leftover that silently does nothing when acted on
/// (the exact failure mode the module doc comments in `associate.rs` and
/// `remove.rs` were each written to prevent), so a name shaped like both at
/// once resolves to nothing at all rather than a guess.
///
/// **A name this function does not understand resolves to nothing, never to
/// itself.** It used to fall through to the whole name as the id, and that
/// single line defeated the boundary check on the other side of the removal:
/// `remove.rs` re-checks `verified_name_matches(name, bundle_id)` to confirm
/// a path carries its claimed id, but an id *derived from* that name reduces
/// that call to `name == name`, which cannot fail. The re-check defends
/// against a wrong id and is structurally incapable of catching a
/// self-derived one, so the refusal has to happen here. Refusing costs a
/// leftover left behind; the fallback cost `UBF8T346G9.Office` — Microsoft
/// Office's live group container — being proposed as dead with Word
/// installed.
fn resolve_verifiable_id(name: &str) -> Option<&str> {
    let stripped = strip_known_suffixes(name);
    if stripped.len() < name.len() {
        // A suffix was stripped, so the `group.` arm is out of reach: see
        // "never combined" above.
        return (!stripped.starts_with("group.") && is_reverse_dns(stripped)).then_some(stripped);
    }
    let candidate = name.strip_prefix("group.").unwrap_or(name);
    is_reverse_dns(candidate).then_some(candidate)
}

/// True when `id` is one of `installed` itself, or extends one of them with
/// a `.`-separated suffix — the same shape `remove.rs::verified_name_matches`
/// uses to decide a *path* carries a bundle id, applied here to decide
/// whether an *id* belongs to an installed app's own namespace: an
/// extension, helper, or updater Apple requires to be named
/// `<app id>.<component>`.
///
/// **Deliberately not the reverse test** (`installed.starts_with(id)`), and
/// not `contains`. Either would let an installed `com.example.foobar` claim
/// a shorter, *different* app's `com.example.foo` — the identical bug class
/// `verified_name_matches`'s own doc comment records this codebase having
/// shipped once already, reached here from the opposite direction: this
/// function decides "is this id already accounted for," and the reverse test
/// would answer yes for two unrelated apps that merely share a prefix.
fn belongs_to_installed(id: &str, installed: &HashSet<String>) -> bool {
    let id = id.to_lowercase();
    installed.iter().any(|inst| id == *inst || id.starts_with(&format!("{inst}.")))
}


/// [`find_in`] against the real machine: the real `/Applications` and
/// `home.join("Applications")`, matching `apps::discover`'s own two roots
/// exactly. This is the only place either real path is named — see the
/// module doc comment on [`find_in`] for why every test goes through that
/// function directly instead.
///
/// Called by `commands::leftovers_scan`.
pub fn find(home: &Path) -> Vec<Leftover> {
    find_in(home, &[PathBuf::from("/Applications"), home.join("Applications")])
}

/// Find every leftover under `home/Library`: a bundle-id-shaped entry, in one
/// of [`LOCATIONS`], that resolves to an id no application discovered under
/// `app_roots` declares and that is not Apple's or macOS's own.
///
/// `app_roots` names every root `apps::discover_in` should scan for
/// installed applications — [`find`] is the only caller that ever names the
/// real `/Applications`; this function resolves nothing on its own, the same
/// seam `apps::discover_in` itself provides over `apps::discover`. A test
/// wanting deterministic, hermetic coverage calls this directly with fake
/// roots.
///
/// Walks each `LOCATIONS` entry's **immediate children only — no
/// recursion**, matching declared ids by [`belongs_to_installed`] rather than
/// exact equality, so an installed app's own extensions and helpers are
/// never proposed as dead. Entries that resolve to the same id (e.g.
/// `com.foo.bar` and `group.com.foo.bar`) are grouped into one [`Leftover`].
/// An unreadable directory is skipped, not fatal — a permission error on one
/// location is not evidence anything under it is dead. If discovery finds no
/// installed applications at all, this returns nothing at all — see the
/// module doc comment.
pub fn find_in(home: &Path, app_roots: &[PathBuf]) -> Vec<Leftover> {
    let installed: HashSet<String> =
        apps::discover_in(app_roots).into_iter().map(|app| app.bundle_id.to_lowercase()).collect();

    // Fail closed: see the module doc comment. An empty installed set almost
    // always means discovery could not read the disk, not that this Mac has
    // no applications at all.
    if installed.is_empty() {
        return Vec::new();
    }

    let library = home.join("Library");
    let mut by_id: HashMap<String, Leftover> = HashMap::new();

    for location in LOCATIONS {
        let dir = library.join(location);
        let Ok(entries) = std::fs::read_dir(&dir) else {
            // Missing or unreadable: skipped, not fatal — see the doc
            // comment above.
            continue;
        };

        for entry in entries.filter_map(Result::ok) {
            let name = entry.file_name();
            let name = name.to_string_lossy();

            let Some(id) = resolve_verifiable_id(&name) else {
                continue;
            };
            if is_system_bundle_id(id) {
                continue;
            }
            if belongs_to_installed(id, &installed) {
                continue;
            }

            let path = entry.path();
            let bytes = crate::sizing::size_of(&path);
            let leftover = by_id.entry(id.to_lowercase()).or_insert_with(|| Leftover {
                bundle_id: id.to_string(),
                paths: Vec::new(),
                bytes: 0,
            });
            leftover.paths.push(path);
            leftover.bytes += bytes;
        }
    }

    by_id.into_values().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plant(home: &std::path::Path, rel: &str) -> PathBuf {
        let p = home.join("Library").join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, b"xx").unwrap();
        p
    }

    /// Every positive-path test needs at least one installed app just to
    /// clear the fail-closed guard (see the module doc comment) — this plants
    /// one that is unrelated to whatever the test is actually exercising, so
    /// a passing test still proves the thing it names, not an accident of
    /// the guard tripping.
    fn decoy_app(apps_root: &std::path::Path) {
        std::fs::create_dir_all(apps_root).unwrap();
        crate::apps::tests_support::plant_app(apps_root, "Decoy", "com.example.decoy");
    }

    #[test]
    fn a_bundle_id_entry_with_no_installed_app_is_a_leftover() {
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Application Support/com.example.gone");
        let found = find_in(home.path(), &[apps]);
        assert!(found.iter().any(|l| l.bundle_id == "com.example.gone"));
    }

    #[test]
    fn an_entry_whose_app_is_installed_is_not_a_leftover() {
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        std::fs::create_dir_all(&apps).unwrap();
        crate::apps::tests_support::plant_app(&apps, "Here", "com.example.here");
        plant(home.path(), "Application Support/com.example.here");
        assert!(find_in(home.path(), &[apps]).iter().all(|l| l.bundle_id != "com.example.here"));
    }

    #[test]
    fn an_extension_of_an_installed_app_is_not_a_leftover() {
        // Apple requires an app extension, helper, or updater's bundle id to
        // be prefixed with its container app's id — this is not an edge
        // case, it is how they are named. Exact-equality matching would
        // report every one of these as dead.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        std::fs::create_dir_all(&apps).unwrap();
        crate::apps::tests_support::plant_app(&apps, "Here", "com.example.here");
        plant(home.path(), "Containers/com.example.here.SafariExtension");
        plant(home.path(), "Caches/com.example.here.ShipIt");
        plant(home.path(), "HTTPStorages/com.example.here.binarycookies");
        assert!(
            find_in(home.path(), &[apps]).is_empty(),
            "an installed app's own extensions and helpers must not be proposed as dead"
        );
    }

    #[test]
    fn a_bundle_id_that_merely_shares_a_prefix_with_an_installed_app_is_still_a_leftover() {
        // The bug class the reverse or `contains` test would reopen: an
        // installed `com.example.foobar` must not be allowed to claim a
        // shorter, unrelated app's `com.example.foo`.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        std::fs::create_dir_all(&apps).unwrap();
        crate::apps::tests_support::plant_app(&apps, "FooBar", "com.example.foobar");
        plant(home.path(), "Application Support/com.example.foo");
        let found = find_in(home.path(), &[apps]);
        assert!(
            found.iter().any(|l| l.bundle_id == "com.example.foo"),
            "a shorter id that only shares a prefix with an installed app must still be a leftover"
        );
    }

    #[test]
    fn a_longer_bundle_id_that_merely_shares_a_prefix_with_an_installed_app_is_still_a_leftover() {
        // The other direction from the test above, and a different claim:
        // without the literal `.` boundary, `com.example.foobar`.starts_with
        // `com.example.foo` is true, so a shorter installed app's id would
        // wrongly be read as "covering" a longer, unrelated app's own
        // leftover — the exact opposite mistake from the sibling test, and
        // one it cannot catch, since that test's pairing is false whether or
        // not the dot is present.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        std::fs::create_dir_all(&apps).unwrap();
        crate::apps::tests_support::plant_app(&apps, "Foo", "com.example.foo");
        plant(home.path(), "Application Support/com.example.foobar");
        let found = find_in(home.path(), &[apps]);
        assert!(
            found.iter().any(|l| l.bundle_id == "com.example.foobar"),
            "a longer id that only shares a prefix with an installed app must still be a leftover"
        );
    }

    #[test]
    fn a_plain_name_folder_is_never_proposed() {
        // A name proves far too little to infer that something is dead.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Application Support/Slack");
        assert!(find_in(home.path(), &[apps]).is_empty());
    }

    #[test]
    fn an_apple_id_is_never_proposed() {
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Preferences/com.apple.finder.plist");
        assert!(find_in(home.path(), &[apps]).is_empty());
    }

    #[test]
    fn a_group_container_is_recognised_and_attributed_to_its_id() {
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Group Containers/group.com.example.gone");
        let found = find_in(home.path(), &[apps]);
        assert!(found.iter().any(|l| l.bundle_id == "com.example.gone"));
    }

    #[test]
    fn a_group_prefixed_name_with_a_suffix_is_never_proposed() {
        // `group.com.example.gone.plist` resolves to `com.example.gone` by
        // stripping both the prefix and the suffix, but
        // `verified_name_matches` cannot verify that path against that id
        // under any of its three shapes — proposing it would show the user a
        // leftover that silently does nothing when acted on.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Preferences/group.com.example.gone.plist");
        assert!(find_in(home.path(), &[apps]).is_empty());
    }

    #[test]
    fn an_empty_installed_set_proposes_nothing() {
        // No installed app anywhere — not even an unrelated decoy. An empty
        // discovery result is far more likely evidence that `/Applications`
        // could not be read than evidence this Mac has zero applications, so
        // this must report nothing rather than treat every bundle-id-shaped
        // entry as fair game.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        std::fs::create_dir_all(&apps).unwrap();
        plant(home.path(), "Application Support/com.example.gone");
        assert!(find_in(home.path(), &[apps]).is_empty());
    }

    #[test]
    fn a_team_prefixed_group_container_of_an_installed_app_is_never_proposed() {
        // macOS names Group Containers `<TeamID>.<name>` at least as often as
        // `group.<id>`. `UBF8T346G9.Office` is Microsoft Office's live group
        // container, and no application on earth declares that string as its
        // `CFBundleIdentifier` — so "no installed app declares it" is
        // vacuously true of it and proves nothing at all. Deriving the id
        // from the whole name also made `remove.rs`'s
        // `verified_name_matches(name, bundle_id)` re-check degenerate to
        // `name == name`, which cannot fail. This must resolve to nothing.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        std::fs::create_dir_all(&apps).unwrap();
        crate::apps::tests_support::plant_app(&apps, "Microsoft Word", "com.microsoft.Word");
        plant(home.path(), "Group Containers/UBF8T346G9.Office");
        assert!(
            find_in(home.path(), &[apps]).is_empty(),
            "a team-prefixed group container must never be proposed as dead"
        );
    }

    #[test]
    fn a_team_prefixed_apple_group_container_is_never_proposed() {
        // `243LU875E5.groups.com.apple.podcasts` is Apple's own, but it does
        // not *start* `com.apple.`, so a prefix-only refusal misses it
        // entirely.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Group Containers/243LU875E5.groups.com.apple.podcasts");
        assert!(
            find_in(home.path(), &[apps]).is_empty(),
            "a team-prefixed Apple group container must never be proposed as dead"
        );
    }

    #[test]
    fn a_system_owned_id_is_refused_at_every_segment_boundary() {
        // Directly on the guard, so this test fails when the refusal is
        // narrowed back to a leading-prefix test — the shape check in
        // `resolve_verifiable_id` also refuses the team-prefixed name, and
        // an end-to-end test alone could not tell the two guards apart.
        assert!(is_system_bundle_id("com.apple.finder"));
        assert!(is_system_bundle_id("243LU875E5.groups.com.apple.podcasts"));
        assert!(is_system_bundle_id("group.com.apple.notes"));
        // System software Apple ships under someone else's reverse-DNS root.
        // `is.workflow` clears the ccTLD rule (`is` is Iceland's) and
        // `Shortcuts.app` lives in `/System/Applications`, which discovery
        // never scans — so nothing declares these and only a refusal reaches
        // them.
        assert!(is_system_bundle_id("is.workflow.my.app"));
        assert!(is_system_bundle_id("is.workflow.shortcuts"));
        assert!(is_system_bundle_id("org.cups.PrintingPrefs"));
        assert!(is_system_bundle_id("org.openbsd.ssh-agent"));
        assert!(is_system_bundle_id("edu.mit.Kerberos"));
        assert!(is_system_bundle_id("org.swift.swiftpm"));
        // Component boundary, never a substring: the four substring-vs-
        // component bugs this codebase has shipped all looked like this.
        assert!(!is_system_bundle_id("com.applesomething.foo"));
        assert!(!is_system_bundle_id("com.example.apple"));
        assert!(!is_system_bundle_id("com.notapple.foo"));
        assert!(!is_system_bundle_id("is.workflows.example"));
        assert!(!is_system_bundle_id("org.cupsomething.foo"));
        assert!(!is_system_bundle_id("com.example.workflow"));
        assert!(!is_system_bundle_id("org.swiftly.example"));
    }

    #[test]
    fn apple_shortcuts_group_containers_are_never_proposed() {
        // Live Shortcuts storage, found on a real disk by the M4b branch
        // review. `is` is Iceland's ccTLD, so `is.workflow.shortcuts` is a
        // perfectly well-formed reverse-DNS id that no installed
        // application declares — and moving it to the Trash would take the
        // user's Shortcuts with it.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Group Containers/group.is.workflow.my.app");
        plant(home.path(), "Group Containers/group.is.workflow.shortcuts");
        assert!(
            find_in(home.path(), &[apps]).is_empty(),
            "Shortcuts' own storage must never be proposed as dead"
        );
    }

    #[test]
    fn a_system_preference_outside_com_apple_is_never_proposed() {
        // CUPS is the printing system macOS ships. It is not an
        // application, so no `apps::discover_in` scan of any root — not even
        // `/System/Applications` — could ever declare its id.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Preferences/org.cups.PrintingPrefs.plist");
        assert!(
            find_in(home.path(), &[apps]).is_empty(),
            "macOS's own printing preferences must never be proposed as dead"
        );
    }

    #[test]
    fn a_third_party_id_under_a_system_root_is_still_proposed() {
        // The refusal must not swallow the feature: a vendor id that merely
        // shares a reverse-DNS root with system software stays proposable.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Application Support/is.workflows.example");
        plant(home.path(), "Application Support/org.cupsomething.foo");
        let found = find_in(home.path(), &[apps]);
        assert!(found.iter().any(|l| l.bundle_id == "is.workflows.example"));
        assert!(found.iter().any(|l| l.bundle_id == "org.cupsomething.foo"));
    }

    #[test]
    fn a_name_that_is_not_reverse_dns_resolves_to_nothing() {
        // Absence of a shape this module understands is not evidence of
        // anything. Each of these once became its own bundle id.
        assert_eq!(resolve_verifiable_id("UBF8T346G9.Office"), None);
        assert_eq!(resolve_verifiable_id("243LU875E5.groups.com.apple.podcasts"), None);
        assert_eq!(resolve_verifiable_id("9BNSXJN65R.group.io.example"), None);
        assert_eq!(resolve_verifiable_id("Slack"), None);
        assert_eq!(resolve_verifiable_id("Unity.Editor"), None);
        assert_eq!(resolve_verifiable_id(""), None);
        assert_eq!(resolve_verifiable_id(".hidden"), None);
        assert_eq!(resolve_verifiable_id("com."), None);
    }

    #[test]
    fn a_reverse_dns_name_still_resolves_to_its_id() {
        assert_eq!(resolve_verifiable_id("com.example.gone"), Some("com.example.gone"));
        assert_eq!(resolve_verifiable_id("group.com.example.gone"), Some("com.example.gone"));
        assert_eq!(resolve_verifiable_id("com.example.gone.plist"), Some("com.example.gone"));
        assert_eq!(
            resolve_verifiable_id("com.example.gone.savedState"),
            Some("com.example.gone")
        );
        // Every country-code TLD is two ASCII letters, so the whole ccTLD
        // space is admitted by one rule rather than an enumeration.
        assert_eq!(resolve_verifiable_id("de.example.gone"), Some("de.example.gone"));
        assert_eq!(resolve_verifiable_id("io.example.gone"), Some("io.example.gone"));
        assert_eq!(resolve_verifiable_id("org.example.gone"), Some("org.example.gone"));
    }

    #[test]
    fn stacked_suffixes_strip_down_to_the_one_id() {
        // `~/Library/Preferences` holds `com.example.gone.plist.lockfile`
        // while a preference write is in flight. Stripping only the outer
        // token would leave `com.example.gone.plist` as a second, phantom
        // application beside the real one.
        assert_eq!(
            resolve_verifiable_id("com.example.gone.plist.lockfile"),
            Some("com.example.gone")
        );
        assert_eq!(resolve_verifiable_id("com.example.gone.binarycookies"), Some("com.example.gone"));
    }

    #[test]
    fn a_combined_group_and_suffix_shape_resolves_to_nothing() {
        assert_eq!(resolve_verifiable_id("group.com.example.gone.plist"), None);
        assert_eq!(resolve_verifiable_id("group.com.example.gone.savedState"), None);
    }

    #[test]
    fn one_dead_app_is_one_row_however_its_entries_are_suffixed() {
        // Deferred minor 2: `com.example.gone.binarycookies` used to become
        // its own leftover with its own odd id, so one dead application
        // surfaced as several rows the user had to recognise as one thing.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Application Support/com.example.gone");
        plant(home.path(), "HTTPStorages/com.example.gone.binarycookies");
        plant(home.path(), "Preferences/com.example.gone.plist");
        plant(home.path(), "Saved Application State/com.example.gone.savedState");
        let found = find_in(home.path(), &[apps]);
        assert_eq!(found.len(), 1, "one dead application must be one row: {found:?}");
        assert_eq!(found[0].bundle_id, "com.example.gone");
        assert_eq!(found[0].paths.len(), 4, "every entry must be attributed to the one id");
    }
}
