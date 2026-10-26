//! What the desktop looked like before each apply, so it can be put back.
//!
//! `history.json` keeps two things, both local and never sent:
//! - `original`: the person's own wallpaper, captured the last time Spiral
//!   applied over a desktop that was not showing one of Spiral's files.
//! - `undo`: the desktop before each of the last 20 applies, newest last.
//!
//! Files that history points at are pinned: the wallpaper prune never deletes
//! them, so an undo still has a picture to put back.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};

use crate::paths::{self, Root};
use crate::settings::FitMode;

use super::model::{Applied, UserError, WallId};

pub const UNDO_DEPTH: usize = 20;

/// One screen's desktop picture and how it was placed.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Screen {
    /// The screen's name as the OS shows it. Restore matches on it first.
    pub name: String,
    /// Position in the OS screen list, used when the name no longer matches.
    pub index: u32,
    pub path: PathBuf,
    /// macOS: `NSImageScaling` raw value. Windows: the `WallpaperStyle` value.
    #[serde(default)]
    pub scaling: Option<i64>,
    #[serde(default)]
    pub clipping: Option<bool>,
}

/// The OS desktop, behind a trait so history can be tested without one.
pub trait Desktop: Sync {
    fn capture(&self) -> Result<Vec<Screen>, UserError>;
    fn set(&self, path: PathBuf, fit: FitMode) -> Result<Applied, UserError>;
    /// Puts each screen back. Returns how many screens changed.
    fn restore(&self, screens: &[Screen]) -> Result<u32, UserError>;
    /// False where Spiral cannot read the desktop, so the UI hides the controls.
    fn supported(&self) -> bool {
        true
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct History {
    #[serde(default)]
    pub original: Option<Vec<Screen>>,
    #[serde(default)]
    pub undo: Vec<Vec<Screen>>,
}

/// What Settings and the activity panel need to show the controls.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryView {
    pub supported: bool,
    pub undo: u32,
    pub original: Option<OriginalView>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginalView {
    /// The file name only. The full path stays in Rust.
    pub name: String,
    pub exists: bool,
}

/// What an undo or restore did.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Restored {
    pub displays: u32,
    /// File names that were gone, so those screens were left as they were.
    pub missing: Vec<String>,
    /// The Spiral wallpaper now showing, when the restored file is one of ours.
    pub current: Option<WallId>,
}

impl History {
    /// Called after a successful apply with the desktop as it was just before.
    pub fn record(&mut self, before: Vec<Screen>, ours: &Path) {
        if before.is_empty() {
            return;
        }
        if !before.iter().any(|screen| is_ours(&screen.path, ours)) {
            self.original = Some(before.clone());
        }
        self.push_undo(before);
    }

    /// Adds a desktop to the undo stack without touching the original.
    pub fn push_undo(&mut self, before: Vec<Screen>) {
        if before.is_empty() {
            return;
        }
        if self.undo.last() != Some(&before) {
            self.undo.push(before);
        }
        if self.undo.len() > UNDO_DEPTH {
            let extra = self.undo.len() - UNDO_DEPTH;
            self.undo.drain(..extra);
        }
    }

    pub fn pinned(&self) -> Vec<PathBuf> {
        self.original
            .iter()
            .chain(self.undo.iter())
            .flatten()
            .map(|screen| screen.path.clone())
            .collect()
    }

    pub fn view(&self, supported: bool) -> HistoryView {
        HistoryView {
            supported,
            undo: self.undo.len() as u32,
            original: self.original.as_ref().and_then(|screens| {
                let first = screens.first()?;
                Some(OriginalView {
                    name: file_name(&first.path),
                    exists: screens.iter().any(|screen| screen.path.is_file()),
                })
            }),
        }
    }
}

/// Applies, undos and restores read and write `history.json` one at a time.
pub fn lock() -> MutexGuard<'static, ()> {
    static LOCK: Mutex<()> = Mutex::new(());
    LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Takes the newest snapshot off the stack and puts it back. A snapshot whose
/// files are all gone is dropped, and the error names the file.
pub fn undo(root: &Root, desktop: &dyn Desktop) -> Result<Restored, UserError> {
    let _guard = lock();
    let mut history = load(root);
    let snapshot = history
        .undo
        .pop()
        .ok_or_else(|| UserError::new("nothing_to_undo"))?;
    let result = put_back(desktop, &snapshot, &root.wallpapers());
    if matches!(&result, Err(err) if err.code() != "restore_missing") {
        return result;
    }
    save(root, &history)?;
    result
}

/// Puts back the person's own wallpaper. The desktop it replaces goes on the
/// undo stack, so this can be undone too.
pub fn restore_original(root: &Root, desktop: &dyn Desktop) -> Result<Restored, UserError> {
    let _guard = lock();
    let mut history = load(root);
    let original = history
        .original
        .clone()
        .ok_or_else(|| UserError::new("no_original"))?;
    let before = desktop.capture().unwrap_or_default();
    let restored = put_back(desktop, &original, &root.wallpapers())?;
    history.push_undo(before);
    save(root, &history)?;
    Ok(restored)
}

pub fn load(root: &Root) -> History {
    fs::read(file(root))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

pub fn save(root: &Root, history: &History) -> Result<(), UserError> {
    let failed = || UserError::new("history_failed");
    fs::create_dir_all(root.dir()).map_err(|_| failed())?;
    let bytes = serde_json::to_vec(history).map_err(|_| failed())?;
    let tmp = root.dir().join("history.json.tmp");
    {
        let mut out = File::create(&tmp).map_err(|_| failed())?;
        out.write_all(&bytes).map_err(|_| failed())?;
        out.sync_all().map_err(|_| failed())?;
    }
    paths::replace_file(&tmp, &file(root)).map_err(|_| failed())
}

/// Puts `screens` back through `desktop`, skipping screens whose file is gone.
/// Every file gone is an error that names the first one, so the UI can say so.
pub fn put_back(
    desktop: &dyn Desktop,
    screens: &[Screen],
    ours: &Path,
) -> Result<Restored, UserError> {
    let (present, gone): (Vec<&Screen>, Vec<&Screen>) =
        screens.iter().partition(|screen| screen.path.is_file());
    if present.is_empty() {
        let name = screens
            .first()
            .map(|s| file_name(&s.path))
            .unwrap_or_default();
        return Err(UserError::with("restore_missing", name));
    }
    let present: Vec<Screen> = present.into_iter().cloned().collect();
    let displays = desktop.restore(&present)?;
    let mut missing: Vec<String> = gone.iter().map(|screen| file_name(&screen.path)).collect();
    missing.dedup();
    Ok(Restored {
        displays,
        missing,
        current: present.iter().find_map(|screen| our_id(&screen.path, ours)),
    })
}

/// The screen in `screens` that belongs to the live screen `name` at `index`.
pub fn match_screen<'a>(screens: &'a [Screen], name: &str, index: u32) -> Option<&'a Screen> {
    screens
        .iter()
        .find(|screen| !name.is_empty() && screen.name == name)
        .or_else(|| screens.iter().find(|screen| screen.index == index))
        .or_else(|| (screens.len() == 1).then(|| &screens[0]))
}

fn file(root: &Root) -> PathBuf {
    root.dir().join("history.json")
}

fn is_ours(path: &Path, ours: &Path) -> bool {
    path.parent() == Some(ours)
}

fn our_id(path: &Path, ours: &Path) -> Option<WallId> {
    if !is_ours(path, ours) {
        return None;
    }
    WallId::parse(path.file_stem()?.to_str()?).ok()
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn screen(path: &Path) -> Screen {
        Screen {
            name: "Built-in Display".into(),
            index: 0,
            path: path.to_path_buf(),
            scaling: Some(3),
            clipping: Some(true),
        }
    }

    #[test]
    fn the_first_non_spiral_desktop_becomes_the_original_and_spiral_files_never_replace_it() {
        let ours = Path::new("/data/wallpapers");
        let mut history = History::default();
        history.record(vec![screen(Path::new("/Users/me/beach.jpg"))], ours);
        history.record(vec![screen(&ours.join("w-abc.jpg"))], ours);
        let original = history.original.clone().unwrap();
        assert_eq!(original[0].path, Path::new("/Users/me/beach.jpg"));
        assert_eq!(history.undo.len(), 2);

        history.record(vec![screen(Path::new("/Users/me/forest.png"))], ours);
        assert_eq!(
            history.original.unwrap()[0].path,
            Path::new("/Users/me/forest.png")
        );
    }

    #[test]
    fn undo_keeps_the_last_twenty_and_drops_repeats() {
        let ours = Path::new("/data/wallpapers");
        let mut history = History::default();
        for n in 0..30 {
            let path = ours.join(format!("w-{n}.jpg"));
            history.record(vec![screen(&path)], ours);
            history.record(vec![screen(&path)], ours);
        }
        assert_eq!(history.undo.len(), UNDO_DEPTH);
        assert_eq!(history.undo[0][0].path, ours.join("w-10.jpg"));
        assert_eq!(history.undo[19][0].path, ours.join("w-29.jpg"));
        assert!(history.pinned().contains(&ours.join("w-29.jpg")));
        assert!(!history.pinned().contains(&ours.join("w-9.jpg")));
    }

    #[test]
    fn a_screen_matches_by_name_then_by_position() {
        let mut other = screen(Path::new("/b.jpg"));
        other.name = "LG UltraFine".into();
        other.index = 1;
        let screens = vec![screen(Path::new("/a.jpg")), other];
        assert_eq!(
            match_screen(&screens, "LG UltraFine", 0).unwrap().path,
            Path::new("/b.jpg")
        );
        assert_eq!(
            match_screen(&screens, "Studio Display", 1).unwrap().path,
            Path::new("/b.jpg")
        );
        assert!(match_screen(&screens, "Studio Display", 4).is_none());
    }

    #[test]
    fn the_original_view_names_the_file_without_its_folder() {
        let ours = Path::new("/data/wallpapers");
        let mut history = History::default();
        history.record(vec![screen(Path::new("/nowhere/gone/beach.jpg"))], ours);
        let view = history.view(true);
        let original = view.original.unwrap();
        assert_eq!(original.name, "beach.jpg");
        assert!(!original.exists);
        assert_eq!(view.undo, 1);
        let json = serde_json::to_string(&history.view(true)).unwrap();
        assert!(!json.contains("/nowhere"));
    }
}
