use std::fs::{self, File};
use std::io::Write;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::paths::{self, LegacyRoots, Root};
use crate::shell::{ModuleId, ModuleSet};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub launch_at_login: bool,
    pub fit_mode: FitMode,
    pub first_run_completed: bool,
    /// One request to GitHub when the app opens, stated in Settings. Off
    /// means Spiral never checks on its own.
    pub auto_update_check: bool,
}

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FitMode {
    Fill,
    Fit,
    Center,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            launch_at_login: false,
            fit_mode: FitMode::Fill,
            first_run_completed: false,
            auto_update_check: true,
        }
    }
}

pub struct SettingsState(pub Mutex<Settings>);

pub fn load(root: &Root) -> Settings {
    fs::read_to_string(root.settings_json())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save(root: &Root, settings: &Settings) -> Result<(), String> {
    let path = root.settings_json();
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|err| format!("settings_failed:{err}"))?;
    }
    let json =
        serde_json::to_string_pretty(settings).map_err(|err| format!("settings_failed:{err}"))?;
    fs::write(path, json).map_err(|err| format!("settings_failed:{err}"))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RenameChoice {
    Pending,
    Declined,
    Done,
    Skipped,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShellSettings {
    pub schema: u32,
    pub modules: ModuleSet,
    pub picker_done: bool,
    pub last_module: ModuleId,
    pub launch_at_login: bool,
    pub auto_update_check: bool,
    pub rename_choice: RenameChoice,
}

impl ShellSettings {
    pub fn load_or_derive(root: &Root, legacy: &LegacyRoots) -> Self {
        if let Some(settings) = read_valid(root) {
            return settings;
        }
        let derived = derive(root, legacy);
        let _ = derived.save(root);
        derived
    }

    pub fn save(&self, root: &Root) -> Result<(), String> {
        let path = root.spiral_json();
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|err| format!("settings_failed:{err}"))?;
        }
        let mut json =
            serde_json::to_vec_pretty(self).map_err(|err| format!("settings_failed:{err}"))?;
        json.push(b'\n');
        let tmp = root.spiral_json_tmp();
        {
            let mut file = File::create(&tmp).map_err(|err| format!("settings_failed:{err}"))?;
            file.write_all(&json)
                .map_err(|err| format!("settings_failed:{err}"))?;
            file.sync_all()
                .map_err(|err| format!("settings_failed:{err}"))?;
        }
        paths::replace_file(&tmp, &path).map_err(|err| format!("settings_failed:{err}"))
    }

    fn is_consistent(&self) -> bool {
        self.schema == 1 && self.modules.contains(self.last_module)
    }
}

fn read_valid(root: &Root) -> Option<ShellSettings> {
    let text = fs::read_to_string(root.spiral_json()).ok()?;
    match serde_json::from_str::<ShellSettings>(&text) {
        Ok(settings) if settings.is_consistent() => Some(settings),
        _ => {
            let _ = fs::rename(root.spiral_json(), root.spiral_json_bad());
            None
        }
    }
}

fn derive(root: &Root, legacy: &LegacyRoots) -> ShellSettings {
    let wallpaper = load(root);
    let modules = match (root.has_wallpaper_files(), legacy.has_data()) {
        (true, false) => ModuleSet::new([ModuleId::Wallpaper]),
        (false, true) => ModuleSet::new([ModuleId::Resume]),
        _ => ModuleSet::new([ModuleId::Wallpaper, ModuleId::Resume]),
    }
    .expect("preselect is non-empty");
    ShellSettings {
        schema: 1,
        last_module: modules.iter().next().expect("preselect is non-empty"),
        modules,
        picker_done: false,
        launch_at_login: wallpaper.launch_at_login,
        auto_update_check: wallpaper.auto_update_check,
        rename_choice: RenameChoice::Pending,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;

    static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

    struct Dir(std::path::PathBuf);

    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn scratch() -> Dir {
        let n = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("spiral-shell-{}-{n}", std::process::id()));
        fs::create_dir_all(&path).unwrap();
        Dir(path)
    }

    fn pair() -> (Dir, Dir, Root, LegacyRoots) {
        let root_dir = scratch();
        let legacy_dir = scratch();
        let root = Root::at(root_dir.0.clone());
        let legacy = LegacyRoots::at(legacy_dir.0.clone());
        (root_dir, legacy_dir, root, legacy)
    }

    #[test]
    fn preselect_follows_the_evidence_table() {
        let cases = [
            (true, true, vec![ModuleId::Wallpaper, ModuleId::Resume]),
            (true, false, vec![ModuleId::Wallpaper]),
            (false, true, vec![ModuleId::Resume]),
            (false, false, vec![ModuleId::Wallpaper, ModuleId::Resume]),
        ];
        for (wallpaper, resume, expect) in cases {
            let (_root_dir, _legacy_dir, root, legacy) = pair();
            if wallpaper {
                fs::create_dir_all(root.thumbs()).unwrap();
            }
            if resume {
                fs::write(legacy.resume_json(), b"{}").unwrap();
            }
            let settings = ShellSettings::load_or_derive(&root, &legacy);
            assert_eq!(settings.modules.iter().collect::<Vec<_>>(), expect);
            assert!(!settings.picker_done);
            assert_eq!(settings.last_module, expect[0]);
            assert_eq!(settings.schema, 1);
            assert_eq!(settings.rename_choice, RenameChoice::Pending);
            assert!(root.spiral_json().is_file());
        }
    }

    #[test]
    fn wallpaper_evidence_includes_wallpapers_and_resume_evidence_includes_models() {
        let (_root_dir, _legacy_dir, root, legacy) = pair();
        fs::create_dir_all(root.wallpapers()).unwrap();
        let wallpaper_only = ShellSettings::load_or_derive(&root, &legacy);
        assert_eq!(
            wallpaper_only.modules.iter().collect::<Vec<_>>(),
            vec![ModuleId::Wallpaper]
        );

        let (_root_dir, _legacy_dir, root, legacy) = pair();
        fs::create_dir_all(legacy.models()).unwrap();
        let resume_only = ShellSettings::load_or_derive(&root, &legacy);
        assert_eq!(
            resume_only.modules.iter().collect::<Vec<_>>(),
            vec![ModuleId::Resume]
        );

        let (_root_dir, _legacy_dir, root, legacy) = pair();
        fs::write(legacy.engine_json(), b"{}").unwrap();
        let from_engine = ShellSettings::load_or_derive(&root, &legacy);
        assert_eq!(
            from_engine.modules.iter().collect::<Vec<_>>(),
            vec![ModuleId::Resume]
        );
    }

    #[test]
    fn derive_copies_login_flags_and_does_not_skip_the_picker() {
        let (_root_dir, _legacy_dir, root, legacy) = pair();
        save(
            &root,
            &Settings {
                launch_at_login: true,
                fit_mode: FitMode::Fit,
                first_run_completed: true,
                auto_update_check: false,
            },
        )
        .unwrap();
        let before = fs::read(root.settings_json()).unwrap();
        let settings = ShellSettings::load_or_derive(&root, &legacy);
        assert_eq!(fs::read(root.settings_json()).unwrap(), before);
        assert!(settings.launch_at_login);
        assert!(!settings.auto_update_check);
        assert!(!settings.picker_done);
        assert_eq!(
            settings.modules.iter().collect::<Vec<_>>(),
            vec![ModuleId::Wallpaper]
        );
    }

    #[test]
    fn a_saved_shell_file_is_not_derived_again() {
        let (_root_dir, _legacy_dir, root, legacy) = pair();
        let mut settings = ShellSettings::load_or_derive(&root, &legacy);
        settings.picker_done = true;
        settings.modules = ModuleSet::new([ModuleId::Wallpaper]).unwrap();
        settings.last_module = ModuleId::Wallpaper;
        settings.save(&root).unwrap();
        fs::write(legacy.resume_json(), b"{}").unwrap();
        let again = ShellSettings::load_or_derive(&root, &legacy);
        assert!(again.picker_done);
        assert_eq!(
            again.modules.iter().collect::<Vec<_>>(),
            vec![ModuleId::Wallpaper]
        );
    }

    #[test]
    fn a_corrupt_shell_file_is_kept_and_the_picker_returns() {
        let (_root_dir, _legacy_dir, root, legacy) = pair();
        fs::create_dir_all(root.spiral_json().parent().unwrap()).unwrap();
        fs::write(root.spiral_json(), b"{").unwrap();
        let settings = ShellSettings::load_or_derive(&root, &legacy);
        assert!(!settings.picker_done);
        assert_eq!(fs::read(root.spiral_json_bad()).unwrap(), b"{");
        assert!(root.spiral_json().is_file());
        let saved: ShellSettings =
            serde_json::from_str(&fs::read_to_string(root.spiral_json()).unwrap()).unwrap();
        assert!(saved.is_consistent());
    }

    #[test]
    fn an_inconsistent_shell_file_is_kept_and_derived_again() {
        let (_root_dir, _legacy_dir, root, legacy) = pair();
        fs::create_dir_all(root.spiral_json().parent().unwrap()).unwrap();
        let bad = r#"{"schema":1,"modules":["wallpaper"],"picker_done":true,"last_module":"resume","launch_at_login":false,"auto_update_check":true,"rename_choice":"pending"}"#;
        fs::write(root.spiral_json(), bad).unwrap();
        let settings = ShellSettings::load_or_derive(&root, &legacy);
        assert!(!settings.picker_done);
        assert_eq!(fs::read(root.spiral_json_bad()).unwrap(), bad.as_bytes());
    }
}
