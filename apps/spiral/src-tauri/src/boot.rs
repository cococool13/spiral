use serde::Serialize;

use crate::settings::ShellSettings;
use crate::shell::ModuleId;

pub const RESUME_MIN_MACOS: (u64, u64) = (13, 0);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Macos,
    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    Windows,
}

impl Platform {
    pub fn host() -> Self {
        #[cfg(target_os = "windows")]
        {
            Self::Windows
        }
        #[cfg(not(target_os = "windows"))]
        {
            Self::Macos
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleState {
    pub id: ModuleId,
    pub enabled: bool,
    pub available: bool,
    pub unavailable_reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Start {
    Picker { preselect: Vec<ModuleId> },
    Module { id: ModuleId },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootState {
    pub version: String,
    pub platform: Platform,
    pub modules: Vec<ModuleState>,
    pub start: Start,
    pub bench: bool,
}

impl BootState {
    pub fn from(settings: &ShellSettings, resume_supported: bool) -> Self {
        Self::with_context(
            settings,
            resume_supported,
            env!("CARGO_PKG_VERSION"),
            Platform::host(),
            crate::bench::enabled(),
        )
    }

    pub(crate) fn with_context(
        settings: &ShellSettings,
        resume_supported: bool,
        version: &str,
        platform: Platform,
        bench: bool,
    ) -> Self {
        let modules = [ModuleId::Wallpaper, ModuleId::Resume]
            .into_iter()
            .map(|id| module_state(settings, id, resume_supported))
            .collect();
        let start = if settings.picker_done {
            Start::Module {
                id: settings.last_module,
            }
        } else {
            let mut preselect: Vec<ModuleId> = settings
                .modules
                .iter()
                .filter(|id| *id != ModuleId::Resume || resume_supported)
                .collect();
            if preselect.is_empty() {
                preselect.push(ModuleId::Wallpaper);
            }
            Start::Picker { preselect }
        };
        Self {
            version: version.to_string(),
            platform,
            modules,
            start,
            bench,
        }
    }
}

fn module_state(settings: &ShellSettings, id: ModuleId, resume_supported: bool) -> ModuleState {
    let available = id != ModuleId::Resume || resume_supported;
    ModuleState {
        id,
        enabled: settings.modules.contains(id),
        available,
        unavailable_reason: if available {
            None
        } else {
            Some("Resume needs macOS 13.".to_string())
        },
    }
}

#[cfg(target_os = "macos")]
pub fn resume_supported() -> bool {
    macos_version() >= RESUME_MIN_MACOS
}

#[cfg(target_os = "windows")]
pub fn resume_supported() -> bool {
    true
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn resume_supported() -> bool {
    true
}

#[cfg(target_os = "macos")]
fn macos_version() -> (u64, u64) {
    let version = objc2_foundation::NSProcessInfo::processInfo().operatingSystemVersion();
    (version.majorVersion as u64, version.minorVersion as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::ShellSettings;
    use crate::shell::{ModuleId, ModuleSet};

    fn settings(ids: &[ModuleId], picker_done: bool, last: ModuleId) -> ShellSettings {
        ShellSettings {
            schema: 1,
            modules: ModuleSet::new(ids.iter().copied()).unwrap(),
            picker_done,
            last_module: last,
            launch_at_login: false,
            auto_update_check: true,
            rename_choice: crate::settings::RenameChoice::Pending,
        }
    }

    fn boot(settings: &ShellSettings, resume_supported: bool) -> BootState {
        BootState::with_context(settings, resume_supported, "2.0.0", Platform::Macos, false)
    }

    #[test]
    fn an_unavailable_resume_drops_out_of_the_preselect() {
        let settings = settings(
            &[ModuleId::Wallpaper, ModuleId::Resume],
            false,
            ModuleId::Wallpaper,
        );
        let boot = boot(&settings, false);
        assert_eq!(
            boot.start,
            Start::Picker {
                preselect: vec![ModuleId::Wallpaper],
            }
        );
        let resume = boot
            .modules
            .iter()
            .find(|module| module.id == ModuleId::Resume)
            .unwrap();
        assert!(!resume.available);
        assert_eq!(
            resume.unavailable_reason.as_deref(),
            Some("Resume needs macOS 13.")
        );
    }

    #[test]
    fn resume_only_on_an_old_os_preselects_wallpaper() {
        let settings = settings(&[ModuleId::Resume], false, ModuleId::Resume);
        let boot = boot(&settings, false);
        assert_eq!(
            boot.start,
            Start::Picker {
                preselect: vec![ModuleId::Wallpaper],
            }
        );
    }

    #[test]
    fn a_finished_picker_opens_the_last_module() {
        let settings = settings(&[ModuleId::Wallpaper], true, ModuleId::Wallpaper);
        let boot = boot(&settings, true);
        assert_eq!(
            boot.start,
            Start::Module {
                id: ModuleId::Wallpaper,
            }
        );
        let json = serde_json::to_value(&boot).unwrap();
        assert_eq!(json["start"]["kind"], "module");
        assert_eq!(json["start"]["id"], "wallpaper");
        assert!(json["modules"][0]["unavailableReason"].is_null());
        assert_eq!(json["version"], "2.0.0");
        assert!(!json["bench"].as_bool().unwrap());
    }
}
