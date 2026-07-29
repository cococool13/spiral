//! Locating the SlimBrave Neo source and a Python to run it with.
//!
//! Spiral Slim ships no policy logic of its own; it drives the scripts that
//! already exist. Both halves of that — where the scripts are, and which
//! interpreter runs them — are resolved once, explicitly, and fail with an
//! actionable message rather than a silent fallback.

use std::path::{Path, PathBuf};

use crate::error::{SlimError, SlimResult};

/// Scripts the project root must contain before we will run anything from it.
///
/// The privileged entrypoint is platform-specific, and it is checked rather
/// than assumed: a bundle that shipped only the macOS script would otherwise
/// pass this check on Windows and fail later, mid-apply, with a much worse
/// message.
const REQUIRED_SHARED: [&str; 1] = ["browser_collection.py"];

fn required_scripts() -> [&'static str; 2] {
    let entrypoint = if cfg!(target_os = "windows") {
        "slimbrave-windows.py"
    } else {
        "slimbrave-mac.py"
    };
    [entrypoint, REQUIRED_SHARED[0]]
}

/// Checked in order. The scripts are stdlib-only, so the system interpreter
/// on macOS is enough and is preferred: an app launched from Finder has a
/// minimal PATH and should not depend on the user's shell setup.
#[cfg(not(target_os = "windows"))]
const PYTHON_CANDIDATES: [&str; 3] = [
    "/usr/bin/python3",
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
];

/// Windows ships no Python, so there is no fixed path to prefer. The launcher
/// is tried first because it is the one thing a python.org install always
/// puts in the system directory; after that, PATH.
#[cfg(target_os = "windows")]
const PYTHON_CANDIDATES: [&str; 2] = [
    r"C:\Windows\py.exe",
    r"C:\Windows\System32\py.exe",
];

/// Names to look for on PATH when no fixed path matched. Windows only: on
/// Unix the fixed list above is exhaustive enough, and a GUI app there has a
/// minimal PATH anyway.
#[cfg(target_os = "windows")]
const PYTHON_ON_PATH: [&str; 3] = ["python3.exe", "python.exe", "py.exe"];

/// Search PATH for the first name that exists.
#[cfg(target_os = "windows")]
fn python_on_path() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for directory in std::env::split_paths(&path) {
        for name in PYTHON_ON_PATH {
            let candidate = directory.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn python_on_path() -> Option<PathBuf> {
    None
}

/// What to tell someone whose machine has no Python.
const PYTHON_NEXT_STEP: &str = if cfg!(target_os = "windows") {
    "Install Python 3 from python.org (tick \"Add python.exe to PATH\"), then \
     reopen Spiral Slim."
} else {
    "Install the Xcode command line tools with `xcode-select --install`, then \
     reopen Spiral Slim."
};

#[derive(Debug, Clone)]
pub struct Project {
    pub root: PathBuf,
    pub python: PathBuf,
}

fn is_project_root(candidate: &Path) -> bool {
    required_scripts()
        .iter()
        .all(|name| candidate.join(name).is_file())
}

/// Candidate roots, most explicit first.
///
/// `resource_dir` is where the bundled copy lands. The compile-time checkout
/// path is a **debug-only** fallback, and that restriction is the point: it
/// exists so `tauri dev` works without bundling, but if a release build could
/// also reach it, a bundle that shipped its resources incorrectly would still
/// run perfectly on the machine that built it and fail for every other
/// person. A packaging bug has to be visible here or it is invisible until a
/// user hits it.
pub fn candidate_roots(resource_dir: Option<PathBuf>, env_override: Option<PathBuf>) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(path) = env_override {
        roots.push(path);
    }
    if let Some(dir) = resource_dir {
        roots.push(dir.join("slimbrave"));
        roots.push(dir);
    }
    #[cfg(debug_assertions)]
    {
        // src-tauri -> desktop -> slim
        let checkout = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(Path::parent)
            .map(Path::to_path_buf);
        if let Some(path) = checkout {
            roots.push(path);
        }
    }
    roots
}

pub fn resolve_root(candidates: &[PathBuf]) -> SlimResult<PathBuf> {
    candidates
        .iter()
        .find(|candidate| is_project_root(candidate))
        .cloned()
        .ok_or_else(|| {
            SlimError::new(
                "SlimBrave Neo source not found",
                format!(
                    "Spiral Slim looked for {} in {} location(s) and found neither.",
                    required_scripts().join(" and "),
                    candidates.len()
                ),
                "Set SPIRAL_SLIM_PROJECT_DIR to the apps/slim folder and reopen \
                 Spiral Slim.",
            )
        })
}

pub fn resolve_python(env_override: Option<PathBuf>) -> SlimResult<PathBuf> {
    if let Some(path) = env_override {
        if path.is_file() {
            return Ok(path);
        }
        return Err(SlimError::new(
            "Python not found",
            format!("SPIRAL_SLIM_PYTHON points at {}, which is not a file.", path.display()),
            "Correct SPIRAL_SLIM_PYTHON, or unset it to use the system Python 3.",
        ));
    }
    for candidate in PYTHON_CANDIDATES {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Ok(path);
        }
    }
    if let Some(path) = python_on_path() {
        return Ok(path);
    }
    Err(SlimError::new(
        "Python 3 not found",
        "Spiral Slim needs Python 3 to run the SlimBrave Neo scripts and could \
         not find it in any standard location."
            .to_string(),
        PYTHON_NEXT_STEP,
    ))
}

impl Project {
    pub fn locate(resource_dir: Option<PathBuf>) -> SlimResult<Self> {
        let env_root = std::env::var_os("SPIRAL_SLIM_PROJECT_DIR").map(PathBuf::from);
        let env_python = std::env::var_os("SPIRAL_SLIM_PYTHON").map(PathBuf::from);
        let candidates = candidate_roots(resource_dir, env_root);
        Ok(Self {
            root: resolve_root(&candidates)?,
            python: resolve_python(env_python)?,
        })
    }

    pub fn script(&self, name: &str) -> PathBuf {
        self.root.join(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_directory_without_the_scripts_is_not_a_project_root() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!is_project_root(dir.path()));
    }

    #[test]
    fn a_directory_with_both_scripts_is_a_project_root() {
        let dir = tempfile::tempdir().unwrap();
        for name in required_scripts() {
            std::fs::write(dir.path().join(name), "").unwrap();
        }
        assert!(is_project_root(dir.path()));
    }

    #[test]
    fn a_partial_checkout_is_rejected() {
        // Only one of the two scripts present: refuse rather than half-work.
        // Written via required_scripts() so this still tests what it claims
        // on Windows, where the macOS entrypoint is not one of them.
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(required_scripts()[0]), "").unwrap();
        assert!(!is_project_root(dir.path()));
    }

    #[test]
    fn the_required_entrypoint_matches_this_platform() {
        let expected = if cfg!(target_os = "windows") {
            "slimbrave-windows.py"
        } else {
            "slimbrave-mac.py"
        };
        assert_eq!(required_scripts()[0], expected);
        assert!(required_scripts().contains(&"browser_collection.py"));
    }

    #[test]
    fn the_python_next_step_names_a_tool_that_exists_on_this_platform() {
        // Telling a Windows user to run xcode-select is worse than saying
        // nothing; it sends them looking for a command they cannot have.
        if cfg!(target_os = "windows") {
            assert!(PYTHON_NEXT_STEP.contains("python.org"));
            assert!(!PYTHON_NEXT_STEP.contains("xcode-select"));
        } else {
            assert!(PYTHON_NEXT_STEP.contains("xcode-select"));
        }
    }

    #[test]
    fn the_env_override_is_tried_before_anything_else() {
        let roots = candidate_roots(
            Some(PathBuf::from("/resources")),
            Some(PathBuf::from("/explicit")),
        );
        assert_eq!(roots.first(), Some(&PathBuf::from("/explicit")));
    }

    /// A release build must depend on its own bundled resources and nothing
    /// else. If this ever regresses, a mis-packaged `.app` passes every test
    /// on the build machine and fails on every other one.
    #[test]
    #[cfg(not(debug_assertions))]
    fn a_release_build_never_falls_back_to_the_build_machine_checkout() {
        assert!(candidate_roots(None, None).is_empty());
    }

    #[test]
    #[cfg(debug_assertions)]
    fn a_debug_build_falls_back_to_the_checkout_so_tauri_dev_works() {
        let roots = candidate_roots(None, None);
        assert_eq!(roots.len(), 1);
        assert!(is_project_root(&roots[0]), "the checkout should be usable");
    }

    #[test]
    fn resolving_a_root_reports_where_it_looked() {
        let error = resolve_root(&[PathBuf::from("/nowhere")]).unwrap_err();
        assert!(error.next_step.contains("SPIRAL_SLIM_PROJECT_DIR"));
        assert!(!error.detail.is_empty());
    }

    #[test]
    fn a_bad_python_override_is_reported_rather_than_ignored() {
        let error = resolve_python(Some(PathBuf::from("/nowhere/python3"))).unwrap_err();
        assert!(error.detail.contains("/nowhere/python3"));
    }
}
