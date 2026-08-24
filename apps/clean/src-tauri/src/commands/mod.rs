//! The only module that talks to the webview.
//!
//! Tauri types stop here. `scan` and `remove` know nothing about commands,
//! which is what lets them be tested without a running app.
//!
//! Split by screen when the single file passed 2,200 lines. What stays
//! here is what more than one screen needs: the timestamp, the canonical
//! home, and re-exports of the clean-run tally helpers Uninstall and
//! Leftovers share.

pub(crate) mod clean;
pub(crate) mod leftovers;
pub(crate) mod uninstall;

pub use clean::*;
pub use leftovers::*;
pub use uninstall::*;

use crate::paths;
use std::path::{Path, PathBuf};

/// Max paths returned per category across the IPC bridge.
/// The UI's disclosure view caps expansion at 500. `items` (true file count)
/// and `bytes` (total size) are always complete; this bounds only the preview list.
/// Shipping tens of thousands of paths to the webview costs seconds on real machines.
pub(crate) const PATHS_PREVIEW_LIMIT: usize = 500;

// Shared by Uninstall and Leftovers; owned by `catalog_clean` with Clean.
pub(crate) use crate::catalog_clean::{tally, Tally};

/// Canonicalise `home` the same way `remove::execute`'s own `Roots::new`
/// will when it builds its scope roots — `strip_firmlink(resolve(home))` —
/// and do it exactly once, here, before `home` reaches either consumer.
///
/// Two earlier reviews (Tasks 2 and 4) traced the same defect from opposite
/// ends: `associate::associate` builds every `InspectItem.path` from
/// whatever spelling of `home` it is given, and `remove::Roots::new`
/// canonicalises its own copy independently. `is_within_app_bundle_scope`
/// then checks a candidate's *written* form as well as its resolved one (see
/// `remove.rs` — the symlinked-`~/Applications` attack that check exists to
/// close), so if `associate` saw `/var/...` while `Roots::new` saw
/// `/private/var/...`, every `AppBundle` candidate would fail that
/// written-form check and be silently denied. Canonicalising inside
/// `associate` alone cannot fix this, because `Roots::new` still
/// canonicalises its own copy independently — the two sides would simply
/// disagree in the other direction. The only fix is a single canonical
/// `home`, computed once, handed unchanged to both.
///
/// `dirs::home_dir()` is already canonical on macOS (`/Users/<name>` has no
/// symlinked ancestor — verified three ways in Task 4's review), so this
/// changes nothing in production. It matters only for a caller — every test
/// in this module — that stands a `tempfile::tempdir()` in for `home`:
/// `tempfile` places its directories under `/var/folders/...`, and macOS
/// resolves `/var` to `/private/var` via a top-level symlink.
pub(crate) fn canonical_home(home: &Path) -> Result<PathBuf, String> {
    paths::resolve(home).map(paths::strip_firmlink).ok_or_else(|| {
        "Spiral Clean could not resolve your home folder, so it cannot verify any path is \
         safe to remove. Nothing was uninstalled. Reopen Spiral Clean and try again."
            .to_string()
    })
}

/// A UTC timestamp for the run log, `YYYY-MM-DDTHH:MM:SSZ` — the same shape
/// the webview sends `clean_execute` via `Date.toISOString()`. Generated
/// here rather than accepted as a parameter, because `uninstall_execute`'s
/// interface takes none. Built with `libc::gmtime_r` rather than adding a
/// date/time crate for one timestamp — `libc` is already a dependency (see
/// `volume.rs`).
pub(crate) fn now_iso8601() -> String {
    let now = unsafe { libc::time(std::ptr::null_mut()) };
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    unsafe { libc::gmtime_r(&now, &mut tm) };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        tm.tm_year + 1900,
        tm.tm_mon + 1,
        tm.tm_mday,
        tm.tm_hour,
        tm.tm_min,
        tm.tm_sec,
    )
}

#[cfg(test)]
mod tests;
