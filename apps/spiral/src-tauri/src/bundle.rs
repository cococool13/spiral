use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::settings::RenameChoice;

const BUNDLE_ID: &str = "app.spiral.wallpaper";
const OLD_NAME: &str = "Spiral Wallpaper.app";
const NEW_NAME: &str = "Spiral.app";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RenameBlock {
    NotPending,
    Caskroom,
    Translocation,
    WrongName,
    ReadOnly,
    Sibling,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BundleFacts {
    pub path: PathBuf,
    pub parent_writable: bool,
    pub sibling_spiral: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RenameJob {
    pub from: PathBuf,
    pub to: PathBuf,
    pub old_exe: PathBuf,
    pub new_exe: PathBuf,
}

pub fn inspect(bundle: &Path) -> BundleFacts {
    let parent = bundle.parent();
    BundleFacts {
        path: bundle.to_path_buf(),
        parent_writable: parent.is_some_and(directory_writable),
        sibling_spiral: parent.is_some_and(|dir| {
            let sibling = dir.join(NEW_NAME);
            sibling.exists() && sibling != bundle
        }),
    }
}

pub fn rename_block(choice: RenameChoice, facts: &BundleFacts) -> Option<RenameBlock> {
    if choice != RenameChoice::Pending {
        return Some(RenameBlock::NotPending);
    }
    if has_component(&facts.path, "Caskroom") {
        return Some(RenameBlock::Caskroom);
    }
    if has_component(&facts.path, "AppTranslocation") {
        return Some(RenameBlock::Translocation);
    }
    if facts.path.file_name().and_then(|name| name.to_str()) != Some(OLD_NAME) {
        return Some(RenameBlock::WrongName);
    }
    if !facts.parent_writable {
        return Some(RenameBlock::ReadOnly);
    }
    if facts.sibling_spiral {
        return Some(RenameBlock::Sibling);
    }
    None
}

pub fn job(bundle: &Path) -> Option<RenameJob> {
    let parent = bundle.parent()?;
    let to = parent.join(NEW_NAME);
    Some(RenameJob {
        old_exe: login_executable(bundle),
        new_exe: login_executable(&to),
        from: bundle.to_path_buf(),
        to,
    })
}

pub fn perform(
    job: &RenameJob,
    login: bool,
    plist: Option<&Path>,
    relaunch: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    fs::rename(&job.from, &job.to).map_err(|_| rename_error())?;
    if login {
        if let Some(path) = plist {
            if let Err(err) = rewrite_login_at(path, &job.old_exe, &job.new_exe) {
                let _ = fs::rename(&job.to, &job.from);
                return Err(err);
            }
        }
    }
    if let Err(err) = relaunch(&job.to) {
        if login {
            if let Some(path) = plist {
                let _ = rewrite_login_at(path, &job.new_exe, &job.old_exe);
            }
        }
        let _ = fs::rename(&job.to, &job.from);
        return Err(err);
    }
    Ok(())
}

pub fn rewrite_login_at(plist: &Path, old_exe: &Path, new_exe: &Path) -> Result<(), String> {
    if !plist.is_file() {
        return Ok(());
    }
    let bytes = fs::read(plist).map_err(|_| login_error())?;
    let old = path_bytes(old_exe);
    let new = path_bytes(new_exe);
    if !contains_slice(&bytes, &old) {
        if contains_slice(&bytes, &new) {
            return Ok(());
        }
        return Err(login_error());
    }
    fs::write(plist, replace_slice(&bytes, &old, &new)).map_err(|_| login_error())
}

pub fn current_bundle() -> Option<PathBuf> {
    bundle_containing(&std::env::current_exe().ok()?)
}

pub fn bundle_containing(exe: &Path) -> Option<PathBuf> {
    let mut cursor = exe.parent();
    while let Some(path) = cursor {
        if path.extension().and_then(|ext| ext.to_str()) == Some("app") {
            return Some(path.to_path_buf());
        }
        cursor = path.parent();
    }
    None
}

pub fn payload_after_archive_root(entry: &Path) -> PathBuf {
    let mut parts = entry.components();
    parts.next();
    parts.as_path().to_path_buf()
}

pub fn relaunch_open(bundle: &Path) -> (&'static str, PathBuf) {
    ("/usr/bin/open", bundle.to_path_buf())
}

pub fn login_executable(bundle: &Path) -> PathBuf {
    bundle.join("Contents/MacOS/spiral-wallpaper")
}

pub fn other_copy(current: &Path, roots: &[PathBuf]) -> Option<PathBuf> {
    let mut found = Vec::new();
    for root in roots {
        let Ok(entries) = fs::read_dir(root) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("app") {
                continue;
            }
            if same_path(&path, current) || !spiral_bundle(&path) {
                continue;
            }
            found.push(path);
        }
    }
    found.sort();
    found.dedup();
    found.into_iter().next()
}

pub fn trash_allowed(current: &Path, target: &Path) -> bool {
    !same_path(current, target) && spiral_bundle(target)
}

pub fn trash_target(current: &Path, roots: &[PathBuf], requested: &str) -> Option<PathBuf> {
    if script_meta(requested) {
        return None;
    }
    let offered = other_copy(current, roots)?;
    if offered.display().to_string() != requested {
        return None;
    }
    trash_allowed(current, &offered).then_some(offered)
}

pub fn finder_delete_path(path: &Path) -> Option<String> {
    let text = path.to_string_lossy();
    if script_meta(&text) {
        None
    } else {
        Some(text.into_owned())
    }
}

fn script_meta(text: &str) -> bool {
    text.chars()
        .any(|ch| matches!(ch, '\\' | '"' | '\n' | '\r'))
}

pub fn launch_agent_plist() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        PathBuf::from(home)
            .join("Library/LaunchAgents")
            .join("Spiral Wallpaper.plist"),
    )
}

fn spiral_bundle(path: &Path) -> bool {
    let plist = path.join("Contents/Info.plist");
    let Ok(bytes) = fs::read(plist) else {
        return false;
    };
    contains_slice(&bytes, BUNDLE_ID.as_bytes())
}

fn same_path(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => left == right,
    }
}

fn has_component(path: &Path, name: &str) -> bool {
    path.components().any(|component| match component {
        Component::Normal(part) => part.eq_ignore_ascii_case(name),
        _ => false,
    })
}

fn directory_writable(dir: &Path) -> bool {
    let Ok(meta) = fs::metadata(dir) else {
        return false;
    };
    if !meta.is_dir() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let mode = meta.mode();
        let uid = unsafe { geteuid() };
        let gid = unsafe { getegid() };
        if meta.uid() == uid {
            mode & 0o200 != 0
        } else if meta.gid() == gid {
            mode & 0o020 != 0
        } else {
            mode & 0o002 != 0
        }
    }
    #[cfg(not(unix))]
    {
        !meta.permissions().readonly()
    }
}

fn path_bytes(path: &Path) -> Vec<u8> {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        path.as_os_str().as_bytes().to_vec()
    }
    #[cfg(not(unix))]
    {
        path.to_string_lossy().as_bytes().to_vec()
    }
}

fn contains_slice(haystack: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty()
        && haystack
            .windows(needle.len())
            .any(|window| window == needle)
}

fn replace_slice(haystack: &[u8], needle: &[u8], replacement: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(haystack.len());
    let mut index = 0;
    while index < haystack.len() {
        if haystack[index..].starts_with(needle) {
            out.extend_from_slice(replacement);
            index += needle.len();
        } else {
            out.push(haystack[index]);
            index += 1;
        }
    }
    out
}

fn rename_error() -> String {
    "Spiral could not rename the app. Try again.".into()
}

fn login_error() -> String {
    "Spiral could not update the login item. The name did not change.".into()
}

#[cfg(unix)]
unsafe extern "C" {
    fn geteuid() -> u32;
    fn getegid() -> u32;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static SEQ: AtomicU64 = AtomicU64::new(0);

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let n = SEQ.fetch_add(1, Ordering::Relaxed);
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join("spiral-bundle-rename");
            let path = root.join(format!("{}-{n}-{nanos}", std::process::id()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn bundle_at(parent: &Path, name: &str) -> PathBuf {
        let bundle = parent.join(name);
        fs::create_dir_all(bundle.join("Contents/MacOS")).unwrap();
        fs::write(
            bundle.join("Contents/Info.plist"),
            format!("<string>{BUNDLE_ID}</string>"),
        )
        .unwrap();
        bundle
    }

    #[test]
    fn rename_guards_reject_caskroom_translocation_and_a_read_only_parent() {
        let cask = PathBuf::from("/opt/homebrew/Caskroom/spiral-wallpaper/2.0.0").join(OLD_NAME);
        assert_eq!(
            rename_block(RenameChoice::Pending, &inspect(&cask)),
            Some(RenameBlock::Caskroom)
        );

        let moved = PathBuf::from("/private/var/folders/xx/AppTranslocation/d").join(OLD_NAME);
        assert_eq!(
            rename_block(RenameChoice::Pending, &inspect(&moved)),
            Some(RenameBlock::Translocation)
        );

        let scratch = Scratch::new();
        let parent = scratch.0.join("locked");
        fs::create_dir_all(&parent).unwrap();
        let bundle = bundle_at(&parent, OLD_NAME);
        lock_dir(&parent);
        let facts = inspect(&bundle);
        assert!(!facts.parent_writable);
        assert_eq!(
            rename_block(RenameChoice::Pending, &facts),
            Some(RenameBlock::ReadOnly)
        );
        unlock_dir(&parent);

        let open = scratch.0.join("open");
        fs::create_dir_all(&open).unwrap();
        let ready = bundle_at(&open, OLD_NAME);
        assert_eq!(rename_block(RenameChoice::Pending, &inspect(&ready)), None);
        assert_eq!(
            rename_block(RenameChoice::Declined, &inspect(&ready)),
            Some(RenameBlock::NotPending)
        );

        bundle_at(&open, NEW_NAME);
        assert_eq!(
            rename_block(RenameChoice::Pending, &inspect(&ready)),
            Some(RenameBlock::Sibling)
        );
    }

    #[test]
    fn a_failed_relaunch_puts_the_old_name_back() {
        let scratch = Scratch::new();
        let bundle = bundle_at(&scratch.0, OLD_NAME);
        let job = job(&bundle).unwrap();
        let err = perform(&job, false, None, |_| Err("open failed".into())).unwrap_err();
        assert_eq!(err, "open failed");
        assert!(job.from.is_dir());
        assert!(!job.to.exists());
    }

    #[test]
    fn a_login_rewrite_failure_puts_the_old_name_back() {
        let scratch = Scratch::new();
        let bundle = bundle_at(&scratch.0, OLD_NAME);
        let job = job(&bundle).unwrap();
        let plist = scratch.0.join("Spiral Wallpaper.plist");
        fs::write(&plist, b"ProgramArguments without the executable").unwrap();
        let err = perform(&job, true, Some(&plist), |_| Ok(())).unwrap_err();
        assert_eq!(err, login_error());
        assert!(job.from.is_dir());
        assert!(!job.to.exists());
    }

    #[test]
    fn rename_rewrites_the_login_item_and_keeps_the_new_name() {
        let scratch = Scratch::new();
        let bundle = bundle_at(&scratch.0, OLD_NAME);
        let job = job(&bundle).unwrap();
        let plist = scratch.0.join("Spiral Wallpaper.plist");
        fs::write(&plist, path_bytes(&job.old_exe)).unwrap();
        let mut opened = None;
        perform(&job, true, Some(&plist), |path| {
            opened = Some(path.to_path_buf());
            Ok(())
        })
        .unwrap();
        assert_eq!(opened.unwrap(), job.to);
        assert!(job.to.is_dir());
        assert!(!job.from.exists());
        let written = fs::read(&plist).unwrap();
        assert!(contains_slice(&written, &path_bytes(&job.new_exe)));
        assert!(!contains_slice(&written, &path_bytes(&job.old_exe)));
    }

    #[test]
    fn updater_replacement_keeps_the_running_bundle_and_drops_the_archive_root() {
        let running =
            PathBuf::from("/Applications/Spiral Wallpaper.app/Contents/MacOS/spiral-wallpaper");
        let bundle = bundle_containing(&running).unwrap();
        assert_eq!(bundle, PathBuf::from("/Applications/Spiral Wallpaper.app"));
        let entry = Path::new("Spiral.app/Contents/MacOS/spiral-wallpaper");
        let installed = bundle.join(payload_after_archive_root(entry));
        assert_eq!(installed, login_executable(&bundle));
        assert_ne!(
            installed,
            PathBuf::from("/Applications/Spiral.app/Contents/MacOS/spiral-wallpaper")
        );
    }

    #[test]
    fn relaunch_opens_the_bundle_and_reads_the_plist_executable() {
        let bundle = PathBuf::from("/Applications/Spiral Wallpaper.app");
        let (program, target) = relaunch_open(&bundle);
        assert_eq!(program, "/usr/bin/open");
        assert_eq!(target, bundle);
        let plist_executable = "spiral-wallpaper";
        let started = bundle.join("Contents/MacOS").join(plist_executable);
        assert_eq!(started, login_executable(&bundle));
        let renamed_in_plist = bundle.join("Contents/MacOS").join("spiral");
        assert_ne!(relaunch_open(&bundle).1, renamed_in_plist);
        assert_eq!(relaunch_open(&bundle).1, bundle);
    }

    #[test]
    fn login_launch_stores_the_executable_path() {
        let bundle = PathBuf::from("/Applications/Spiral Wallpaper.app");
        let program = login_executable(&bundle);
        assert!(program.ends_with("Contents/MacOS/spiral-wallpaper"));
        let (open_program, open_target) = relaunch_open(&bundle);
        assert_eq!(open_program, "/usr/bin/open");
        assert_ne!(open_target, program);
    }

    #[test]
    fn another_copy_is_reported_and_the_running_bundle_cannot_be_trashed() {
        let scratch = Scratch::new();
        let apps = scratch.0.join("Applications");
        fs::create_dir_all(&apps).unwrap();
        let current = bundle_at(&apps, OLD_NAME);
        let elsewhere = scratch.0.join("elsewhere");
        let other = bundle_at(&elsewhere, "Spiral.app");
        let foreign = apps.join("Other.app");
        fs::create_dir_all(foreign.join("Contents")).unwrap();
        fs::write(
            foreign.join("Contents/Info.plist"),
            b"<string>app.other</string>",
        )
        .unwrap();

        assert_eq!(
            other_copy(&current, &[apps.clone(), elsewhere.clone()]),
            Some(other.clone())
        );
        assert!(!trash_allowed(&current, &current));
        assert!(trash_allowed(&current, &other));
        assert!(!trash_allowed(&current, &foreign));
        let roots = [apps, elsewhere];
        let shown = other.display().to_string();
        assert_eq!(
            trash_target(&current, &roots, &shown).as_deref(),
            Some(other.as_path())
        );
        assert!(trash_target(&current, &roots, &format!("{shown}\\")).is_none());
        assert!(trash_target(&current, &roots, r"C:\Spiral.app").is_none());
        assert!(trash_target(&current, &roots, &current.display().to_string()).is_none());
        assert!(finder_delete_path(Path::new(r"C:\Spiral.app")).is_none());
        assert_eq!(
            finder_delete_path(Path::new("/Applications/Spiral.app")).as_deref(),
            Some("/Applications/Spiral.app")
        );
    }

    #[cfg(unix)]
    fn lock_dir(path: &Path) {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o555)).unwrap();
    }

    #[cfg(unix)]
    fn unlock_dir(path: &Path) {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[cfg(not(unix))]
    fn lock_dir(path: &Path) {
        let mut perms = fs::metadata(path).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(path, perms).unwrap();
    }

    #[cfg(not(unix))]
    fn unlock_dir(path: &Path) {
        let mut perms = fs::metadata(path).unwrap().permissions();
        perms.set_readonly(false);
        fs::set_permissions(path, perms).unwrap();
    }
}
