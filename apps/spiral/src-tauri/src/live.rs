//! Pin still to all Spaces, through Spiral Live (`apps/spiral/live`).
//!
//! `NSWorkspace.setDesktopImageURL` changes the Space in front only (measured
//! on macOS 27.0.1: it writes a per-Space entry in the wallpaper store), so a
//! still reaches other Spaces only when something sets it again there. That
//! something is Spiral Live: a separate, menu-bar-only helper nested at
//! `Contents/Library/LoginItems/Spiral Live.app`, off by default, which makes
//! no network calls and exits as soon as nothing is pinned.
//!
//! The contract is two small files in `<root>/live/`, plus one Darwin
//! notification:
//! - `job.json`, written here: what to pin, and whether to keep it at login.
//! - `status.json`, written by the helper: running, `ackSeq`, login item.
//! - `app.spiral.wallpaper.live.job`, posted here after each job write.
//!
//! The JSON shapes are pinned by fixtures shared with `swift test`
//! (`live/Tests/LiveCoreTests/fixtures`).

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::activity;
use crate::paths::Root;
use crate::settings::FitMode;

pub const BUNDLE_ID: &str = "app.spiral.wallpaper.live";
pub const JOB_CHANGED: &str = "app.spiral.wallpaper.live.job";
const HELPER_APP: &str = "Spiral Live.app";
const MODE_OFF: &str = "off";
const MODE_PIN: &str = "pinStill";
const STILL_EXTENSIONS: [&str; 8] = ["jpg", "jpeg", "png", "heic", "heif", "tif", "tiff", "webp"];
const ACK_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub v: u32,
    pub seq: u64,
    pub mode: String,
    pub still: Option<Still>,
    pub keep_after_restart: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Still {
    pub path: String,
    pub fit: FitMode,
}

impl Job {
    fn off(seq: u64) -> Self {
        Self {
            v: 1,
            seq,
            mode: MODE_OFF.into(),
            still: None,
            keep_after_restart: false,
        }
    }

    pub fn pinned(&self) -> Option<&Still> {
        if self.v != 1 || self.mode != MODE_PIN {
            return None;
        }
        self.still
            .as_ref()
            .filter(|still| still.path.starts_with('/'))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub pid: i32,
    pub running: bool,
    pub ack_seq: u64,
    pub pinned: Option<String>,
    pub login_item: String,
    pub applied: u64,
    pub error: Option<String>,
}

/// Everything the UI needs to draw the switch honestly.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PinState {
    /// False on Windows, on macOS before 13, or when the helper is missing.
    pub available: bool,
    pub reason: Option<String>,
    pub pinned: bool,
    /// Spiral Live is running now (its menu-bar item is showing).
    pub running: bool,
    pub keep_after_restart: bool,
    /// `off`, `enabled`, `requiresApproval`, `notFound` or `failed`.
    pub login_item: String,
    pub error: Option<String>,
}

pub struct LivePaths {
    dir: PathBuf,
}

impl LivePaths {
    pub fn new(root: &Root) -> Self {
        Self {
            dir: root.dir().join("live"),
        }
    }
    pub fn dir(&self) -> &Path {
        &self.dir
    }
    pub fn job(&self) -> PathBuf {
        self.dir.join("job.json")
    }
    pub fn status(&self) -> PathBuf {
        self.dir.join("status.json")
    }
    pub fn pinned_dir(&self) -> PathBuf {
        self.dir.join("pinned")
    }
}

// ---- availability -------------------------------------------------------

/// The nested helper, or where a development build put it.
pub fn helper_app() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("SPIRAL_LIVE_APP") {
        let path = PathBuf::from(path);
        return path.is_dir().then_some(path);
    }
    let exe = std::env::current_exe().ok()?;
    let contents = exe.parent()?.parent()?;
    let nested = contents.join("Library").join("LoginItems").join(HELPER_APP);
    if nested.is_dir() {
        return Some(nested);
    }
    if cfg!(debug_assertions) {
        let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("live")
            .join("build")
            .join(HELPER_APP);
        if dev.is_dir() {
            return Some(dev);
        }
    }
    None
}

pub fn unavailable_reason(macos: Option<(u64, u64)>, helper: bool) -> Option<&'static str> {
    match macos {
        None => Some("pin_mac_only"),
        Some(version) if version < crate::boot::RESUME_MIN_MACOS => Some("pin_needs_macos13"),
        Some(_) if !helper => Some("helper_missing"),
        Some(_) => None,
    }
}

pub fn availability() -> Result<PathBuf, &'static str> {
    let helper = helper_app();
    match unavailable_reason(crate::boot::macos_version_opt(), helper.is_some()) {
        Some(reason) => Err(reason),
        None => helper.ok_or("helper_missing"),
    }
}

// ---- files ---------------------------------------------------------------

pub fn read_job(paths: &LivePaths) -> Option<Job> {
    let bytes = std::fs::read(paths.job()).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn write_job(paths: &LivePaths, job: &Job) -> Result<(), String> {
    std::fs::create_dir_all(paths.dir()).map_err(|_| "pin_failed".to_string())?;
    let tmp = paths.dir().join("job.json.tmp");
    let bytes = serde_json::to_vec(job).map_err(|_| "pin_failed".to_string())?;
    std::fs::write(&tmp, bytes).map_err(|_| "pin_failed".to_string())?;
    std::fs::rename(&tmp, paths.job()).map_err(|_| "pin_failed".to_string())
}

pub fn read_status(paths: &LivePaths) -> Option<Status> {
    let bytes = std::fs::read(paths.status()).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn next_seq(previous: Option<&Job>) -> u64 {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    now.max(previous.map_or(0, |job| job.seq + 1))
}

pub fn is_still(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| STILL_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Copies the picture into `live/pinned/` so clearing Spiral's caches can
/// never pull it out from under the helper. One pinned file at a time.
fn keep_copy(paths: &LivePaths, source: &Path) -> Result<PathBuf, String> {
    if !source.is_file() || !is_still(source) {
        return Err("pin_not_still".into());
    }
    let dir = paths.pinned_dir();
    std::fs::create_dir_all(&dir).map_err(|_| "pin_failed".to_string())?;
    if source.starts_with(&dir) {
        return Ok(source.to_path_buf());
    }
    let name = source
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .ok_or_else(|| "pin_not_still".to_string())?;
    let target = dir.join(&name);
    std::fs::copy(source, &target).map_err(|_| "pin_failed".to_string())?;
    clear_pinned(paths, Some(&target));
    Ok(target)
}

fn clear_pinned(paths: &LivePaths, keep: Option<&Path>) {
    let Ok(entries) = std::fs::read_dir(paths.pinned_dir()) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if Some(path.as_path()) != keep {
            let _ = std::fs::remove_file(path);
        }
    }
}

// ---- process -----------------------------------------------------------

#[cfg(target_os = "macos")]
pub fn helper_running() -> bool {
    use objc2_app_kit::NSRunningApplication;
    use objc2_foundation::NSString;
    let apps = NSRunningApplication::runningApplicationsWithBundleIdentifier(&NSString::from_str(
        BUNDLE_ID,
    ));
    apps.iter().any(|app| !app.isTerminated())
}

#[cfg(not(target_os = "macos"))]
pub fn helper_running() -> bool {
    false
}

#[cfg(target_os = "macos")]
fn post_job_changed() {
    extern "C" {
        fn notify_post(name: *const std::ffi::c_char) -> u32;
    }
    let name = std::ffi::CString::new(JOB_CHANGED).expect("static name");
    // SAFETY: a valid NUL-terminated string; notify_post copies it.
    unsafe {
        notify_post(name.as_ptr());
    }
}

#[cfg(not(target_os = "macos"))]
fn post_job_changed() {}

/// Starts Spiral Live through LaunchServices, so it is its own process and
/// outlives this window. `-g` keeps focus where it is.
pub fn launch_args(helper: &Path, root: &Path) -> Vec<std::ffi::OsString> {
    vec![
        "-g".into(),
        "-a".into(),
        helper.as_os_str().to_owned(),
        "--args".into(),
        "--root".into(),
        root.as_os_str().to_owned(),
    ]
}

fn launch(helper: &Path, root: &Root) -> Result<(), String> {
    let status = std::process::Command::new("/usr/bin/open")
        .args(launch_args(helper, root.dir()))
        .status()
        .map_err(|_| "helper_failed".to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("helper_failed".into())
    }
}

/// Wait for the helper to say it read job `seq`, in the state we expect.
fn wait_ack(paths: &LivePaths, seq: u64, running: bool) -> Option<Status> {
    let started = Instant::now();
    loop {
        if let Some(status) = read_status(paths) {
            if status.ack_seq >= seq && status.running == running {
                return Some(status);
            }
        }
        if started.elapsed() > ACK_TIMEOUT {
            return None;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

// ---- commands ----------------------------------------------------------

pub fn state(root: &Root) -> PinState {
    let paths = LivePaths::new(root);
    let job = read_job(&paths);
    let status = read_status(&paths);
    let running = helper_running();
    let (available, reason) = match availability() {
        Ok(_) => (true, None),
        Err(reason) => (false, Some(reason.to_string())),
    };
    PinState {
        available,
        reason,
        pinned: job.as_ref().and_then(Job::pinned).is_some(),
        running,
        keep_after_restart: job.as_ref().is_some_and(|job| job.keep_after_restart),
        login_item: status
            .as_ref()
            .map_or_else(|| "off".to_string(), |status| status.login_item.clone()),
        error: status.and_then(|status| status.error),
    }
}

/// Pins `source` (the picture on this Space) and makes sure the helper runs.
pub fn pin(root: &Root, source: &Path, fit: FitMode) -> Result<PinState, String> {
    let helper = availability().map_err(str::to_string)?;
    let paths = LivePaths::new(root);
    let previous = read_job(&paths);
    let file = keep_copy(&paths, source)?;
    let job = Job {
        v: 1,
        seq: next_seq(previous.as_ref()),
        mode: MODE_PIN.into(),
        still: Some(Still {
            path: file.to_string_lossy().to_string(),
            fit,
        }),
        keep_after_restart: previous.as_ref().is_some_and(|job| job.keep_after_restart),
    };
    write_job(&paths, &job)?;
    start_or_tell(&helper, root)?;
    activity::append(root, &activity::Entry::app("apply", "pin"));
    finish(root, &paths, job.seq, true)
}

/// Unpins: the helper reads `mode: off`, removes its login item and exits.
pub fn unpin(root: &Root) -> Result<PinState, String> {
    let paths = LivePaths::new(root);
    let previous = read_job(&paths);
    let job = Job::off(next_seq(previous.as_ref()));
    write_job(&paths, &job)?;
    let was_running = helper_running();
    post_job_changed();
    activity::append(root, &activity::Entry::app("apply", "unpin"));
    if was_running {
        wait_ack(&paths, job.seq, false);
    }
    clear_pinned(&paths, None);
    Ok(state(root))
}

/// "Keep pinned after restart": the helper registers itself with
/// `SMAppService.mainApp` (off by default). Only meaningful while pinned.
pub fn set_keep(root: &Root, keep: bool) -> Result<PinState, String> {
    let helper = availability().map_err(str::to_string)?;
    let paths = LivePaths::new(root);
    let Some(mut job) = read_job(&paths).filter(|job| job.pinned().is_some()) else {
        return Err("pin_off".into());
    };
    job.keep_after_restart = keep;
    job.seq = next_seq(Some(&job));
    write_job(&paths, &job)?;
    start_or_tell(&helper, root)?;
    finish(root, &paths, job.seq, true)
}

/// The pin is on but Spiral Live is not running (Quit in its menu, or a
/// restart without the login item). Opening Wallpaper starts it again.
pub fn resume(root: &Root) -> Result<PinState, String> {
    let helper = availability().map_err(str::to_string)?;
    let paths = LivePaths::new(root);
    let Some(job) = read_job(&paths).filter(|job| job.pinned().is_some()) else {
        return Ok(state(root));
    };
    if !helper_running() {
        launch(&helper, root)?;
        activity::append(root, &activity::Entry::app("live", "resumed"));
    }
    finish(root, &paths, job.seq, true)
}

/// After Spiral sets a new wallpaper while a pin is on, pin the new one, so
/// the helper does not put the old picture back on the next Space switch.
pub fn follow_apply(root: &Root, applied: &Path, fit: FitMode) {
    let paths = LivePaths::new(root);
    let Some(previous) = read_job(&paths).filter(|job| job.pinned().is_some()) else {
        return;
    };
    let Ok(file) = keep_copy(&paths, applied) else {
        return;
    };
    let job = Job {
        v: 1,
        seq: next_seq(Some(&previous)),
        mode: MODE_PIN.into(),
        still: Some(Still {
            path: file.to_string_lossy().to_string(),
            fit,
        }),
        keep_after_restart: previous.keep_after_restart,
    };
    if write_job(&paths, &job).is_ok() {
        post_job_changed();
    }
}

fn start_or_tell(helper: &Path, root: &Root) -> Result<(), String> {
    if helper_running() {
        post_job_changed();
        Ok(())
    } else {
        launch(helper, root)
    }
}

fn finish(root: &Root, paths: &LivePaths, seq: u64, running: bool) -> Result<PinState, String> {
    match wait_ack(paths, seq, running) {
        Some(status) if status.error.as_deref() == Some("menu_bar_failed") => {
            Err("helper_menu_bar".into())
        }
        Some(_) => Ok(state(root)),
        None => Err("helper_silent".into()),
    }
}

// ---- the picture on this Space ------------------------------------------

/// The desktop picture of the main screen on the Space in front.
pub fn current_desktop(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(macos_current());
        })
        .map_err(|_| "pin_failed".to_string())?;
        rx.recv()
            .map_err(|_| "pin_failed".to_string())?
            .ok_or_else(|| "pin_not_still".to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("pin_mac_only".into())
    }
}

#[cfg(target_os = "macos")]
fn macos_current() -> Option<PathBuf> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSScreen, NSWorkspace};
    let mtm = MainThreadMarker::new()?;
    let screen = NSScreen::mainScreen(mtm)?;
    let url = NSWorkspace::sharedWorkspace().desktopImageURLForScreen(&screen)?;
    url.path().map(|path| PathBuf::from(path.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURES: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../live/Tests/LiveCoreTests/fixtures"
    );

    fn fixture(name: &str) -> String {
        std::fs::read_to_string(format!("{FIXTURES}/{name}.json")).expect("fixture")
    }

    struct Dir(PathBuf);
    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn scratch(name: &str) -> Dir {
        let dir = std::env::temp_dir().join(format!(
            "spiral-live-{name}-{}-{}",
            std::process::id(),
            next_seq(None)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        Dir(dir)
    }

    #[test]
    fn the_shared_job_fixtures_decode_and_round_trip() {
        let pin: Job = serde_json::from_str(&fixture("job-pin")).unwrap();
        assert_eq!(pin.seq, 1_761_487_200_000);
        assert_eq!(pin.pinned().unwrap().fit, FitMode::Fill);
        assert!(!pin.keep_after_restart);
        let again: Job = serde_json::from_value(serde_json::to_value(&pin).unwrap()).unwrap();
        assert_eq!(again, pin);
        let json = serde_json::to_value(&pin).unwrap();
        assert!(json.get("keepAfterRestart").is_some());

        let off: Job = serde_json::from_str(&fixture("job-off")).unwrap();
        assert!(off.pinned().is_none());
        assert_eq!(
            serde_json::to_value(Job::off(off.seq)).unwrap(),
            serde_json::from_str::<serde_json::Value>(&fixture("job-off")).unwrap()
        );
    }

    #[test]
    fn the_shared_status_fixture_decodes() {
        let status: Status = serde_json::from_str(&fixture("status-running")).unwrap();
        assert!(status.running);
        assert_eq!(status.ack_seq, 1_761_487_200_000);
        assert_eq!(status.login_item, "off");
    }

    #[test]
    fn an_unknown_mode_or_a_relative_path_is_not_a_pin() {
        let mut job = Job::off(1);
        job.mode = "live".into();
        job.still = Some(Still {
            path: "/a.jpg".into(),
            fit: FitMode::Fill,
        });
        assert!(job.pinned().is_none());
        job.mode = MODE_PIN.into();
        assert!(job.pinned().is_some());
        job.still.as_mut().unwrap().path = "a.jpg".into();
        assert!(job.pinned().is_none());
    }

    #[test]
    fn availability_names_why_pin_is_off() {
        assert_eq!(unavailable_reason(None, true), Some("pin_mac_only"));
        assert_eq!(
            unavailable_reason(Some((12, 7)), true),
            Some("pin_needs_macos13")
        );
        assert_eq!(
            unavailable_reason(Some((13, 0)), false),
            Some("helper_missing")
        );
        assert_eq!(unavailable_reason(Some((27, 0)), true), None);
    }

    #[test]
    fn only_still_pictures_can_be_pinned() {
        assert!(is_still(Path::new("/a/w-1.JPG")));
        assert!(is_still(Path::new("/a/b.heic")));
        assert!(!is_still(Path::new("/a/wallspace.mov")));
        assert!(!is_still(Path::new(
            "/System/Library/Desktop Pictures/Sonoma.madesktop"
        )));
        assert!(!is_still(Path::new("/a/noext")));
    }

    #[test]
    fn the_helper_is_opened_in_the_background_with_the_data_root() {
        let args = launch_args(Path::new("/A/Spiral Live.app"), Path::new("/R"));
        let args: Vec<String> = args
            .iter()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        assert_eq!(
            args,
            ["-g", "-a", "/A/Spiral Live.app", "--args", "--root", "/R"]
        );
    }

    #[test]
    fn the_sequence_always_moves_forward() {
        let mut job = Job::off(u64::MAX / 2);
        let next = next_seq(Some(&job));
        assert_eq!(next, u64::MAX / 2 + 1);
        job.seq = 1;
        assert!(next_seq(Some(&job)) > 1_700_000_000_000);
    }

    #[test]
    fn a_pinned_copy_survives_and_replaces_the_previous_one() {
        let dir = scratch("copy");
        let root = Root::at(&dir.0);
        let paths = LivePaths::new(&root);
        let first = dir.0.join("w-one.jpg");
        let second = dir.0.join("w-two.png");
        std::fs::write(&first, b"one").unwrap();
        std::fs::write(&second, b"two").unwrap();
        let a = keep_copy(&paths, &first).unwrap();
        assert_eq!(a, paths.pinned_dir().join("w-one.jpg"));
        let b = keep_copy(&paths, &second).unwrap();
        assert!(!a.exists());
        assert_eq!(std::fs::read(&b).unwrap(), b"two");
        assert_eq!(keep_copy(&paths, &b).unwrap(), b);
        let movie = dir.0.join("x.mov");
        std::fs::write(&movie, b"m").unwrap();
        assert_eq!(keep_copy(&paths, &movie).unwrap_err(), "pin_not_still");
    }

    #[test]
    fn following_an_apply_moves_the_pin_only_when_pinned() {
        let dir = scratch("follow");
        let root = Root::at(&dir.0);
        let paths = LivePaths::new(&root);
        let applied = dir.0.join("w-new.jpg");
        std::fs::write(&applied, b"new").unwrap();
        follow_apply(&root, &applied, FitMode::Fit);
        assert!(read_job(&paths).is_none(), "no pin, no job");

        let job = Job {
            v: 1,
            seq: 5,
            mode: MODE_PIN.into(),
            still: Some(Still {
                path: "/old.jpg".into(),
                fit: FitMode::Fill,
            }),
            keep_after_restart: true,
        };
        write_job(&paths, &job).unwrap();
        follow_apply(&root, &applied, FitMode::Fit);
        let moved = read_job(&paths).unwrap();
        assert!(moved.seq > 5);
        assert!(moved.keep_after_restart);
        let still = moved.pinned().unwrap();
        assert_eq!(still.fit, FitMode::Fit);
        assert!(still.path.ends_with("/live/pinned/w-new.jpg"));
    }

    #[test]
    fn state_reads_the_job_and_status_files() {
        let dir = scratch("state");
        let root = Root::at(&dir.0);
        let paths = LivePaths::new(&root);
        let blank = state(&root);
        assert!(!blank.pinned);
        assert!(!blank.keep_after_restart);
        assert_eq!(blank.login_item, "off");

        let mut job: Job = serde_json::from_str(&fixture("job-pin")).unwrap();
        job.keep_after_restart = true;
        write_job(&paths, &job).unwrap();
        std::fs::write(paths.status(), fixture("status-running")).unwrap();
        let pinned = state(&root);
        assert!(pinned.pinned);
        assert!(pinned.keep_after_restart);
        let json = serde_json::to_value(&pinned).unwrap();
        for key in [
            "available",
            "reason",
            "pinned",
            "running",
            "keepAfterRestart",
            "loginItem",
            "error",
        ] {
            assert!(json.get(key).is_some(), "{key}");
        }
    }

    #[test]
    fn unpinning_without_a_running_helper_writes_off_and_clears_the_copy() {
        let dir = scratch("unpin");
        let root = Root::at(&dir.0);
        let paths = LivePaths::new(&root);
        std::fs::create_dir_all(paths.pinned_dir()).unwrap();
        std::fs::write(paths.pinned_dir().join("w-a.jpg"), b"a").unwrap();
        let job: Job = serde_json::from_str(&fixture("job-pin")).unwrap();
        write_job(&paths, &job).unwrap();
        if helper_running() {
            // A real Spiral Live on this Mac would get the notification; skip.
            return;
        }
        let state = unpin(&root).unwrap();
        assert!(!state.pinned);
        assert!(read_job(&paths).unwrap().pinned().is_none());
        assert_eq!(std::fs::read_dir(paths.pinned_dir()).unwrap().count(), 0);
        let log = std::fs::read_to_string(root.dir().join("activity.jsonl")).unwrap();
        assert!(log.contains("\"action\":\"unpin\""));
    }
}
