use std::num::NonZeroU8;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::paths::Root;
use crate::resume::bridge::Link;
use crate::settings::ShellSettings;
use crate::wallpaper::WallpaperEngine;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModuleId {
    Wallpaper,
    Resume,
}

#[derive(Debug, PartialEq, Eq)]
pub struct EmptyModuleSet;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct ModuleSet(NonZeroU8);

fn bit(id: ModuleId) -> u8 {
    match id {
        ModuleId::Wallpaper => 0b01,
        ModuleId::Resume => 0b10,
    }
}

impl ModuleSet {
    pub fn new(ids: impl IntoIterator<Item = ModuleId>) -> Result<Self, EmptyModuleSet> {
        let mut bits = 0u8;
        for id in ids {
            bits |= bit(id);
        }
        NonZeroU8::new(bits).map(Self).ok_or(EmptyModuleSet)
    }

    pub fn contains(self, id: ModuleId) -> bool {
        self.0.get() & bit(id) != 0
    }

    pub fn iter(self) -> impl Iterator<Item = ModuleId> {
        let bits = self.0.get();
        [ModuleId::Wallpaper, ModuleId::Resume]
            .into_iter()
            .filter(move |id| bits & bit(*id) != 0)
    }
}

impl Serialize for ModuleSet {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.iter().collect::<Vec<_>>().serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for ModuleSet {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let ids = Vec::<ModuleId>::deserialize(deserializer)?;
        Self::new(ids).map_err(|_| serde::de::Error::custom("module set is empty"))
    }
}

pub struct Shell {
    root: Root,
    settings: Mutex<ShellSettings>,
    active: Mutex<Option<ModuleId>>,
    wallpaper: Mutex<Option<Arc<WallpaperEngine>>>,
    resume: Mutex<Link>,
}

impl Shell {
    pub fn new(root: Root, settings: ShellSettings) -> Self {
        Self {
            root,
            settings: Mutex::new(settings),
            active: Mutex::new(None),
            wallpaper: Mutex::new(None),
            resume: Mutex::new(Link::new()),
        }
    }

    pub fn root(&self) -> &Root {
        &self.root
    }

    pub fn snapshot(&self) -> ShellSettings {
        self.settings.lock().expect("shell settings").clone()
    }

    pub fn settings_mut(&self) -> std::sync::MutexGuard<'_, ShellSettings> {
        self.settings.lock().expect("shell settings")
    }

    pub fn contains(&self, id: ModuleId) -> bool {
        self.settings
            .lock()
            .expect("shell settings")
            .modules
            .contains(id)
    }

    #[cfg_attr(debug_assertions, allow(dead_code))]
    pub fn launch_at_login(&self) -> bool {
        self.settings
            .lock()
            .expect("shell settings")
            .launch_at_login
    }

    pub fn set_modules(&self, ids: Vec<ModuleId>) -> Result<(), String> {
        let modules = ModuleSet::new(ids).map_err(|_| "Keep one tool on.".to_string())?;
        let last_module = if modules.contains(ModuleId::Wallpaper) {
            ModuleId::Wallpaper
        } else {
            ModuleId::Resume
        };
        let mut settings = self.settings.lock().expect("shell settings");
        settings.modules = modules;
        settings.last_module = last_module;
        settings.picker_done = true;
        settings.save(&self.root)
    }

    pub fn active(&self) -> Option<ModuleId> {
        *self.active.lock().expect("active")
    }

    pub fn set_active(&self, id: ModuleId) {
        *self.active.lock().expect("active") = Some(id);
    }

    pub fn resume_link(&self) -> std::sync::MutexGuard<'_, Link> {
        self.resume.lock().expect("resume")
    }

    pub fn ensure_wallpaper(&self, engine: Arc<WallpaperEngine>) {
        let mut slot = self.wallpaper.lock().expect("wallpaper");
        if slot.is_none() {
            engine.start_default_search();
            *slot = Some(engine);
        }
    }

    pub fn wallpaper(&self) -> Result<Arc<WallpaperEngine>, String> {
        let active = *self.active.lock().expect("active");
        if active != Some(ModuleId::Wallpaper) || !self.contains(ModuleId::Wallpaper) {
            return Err("module_inactive".into());
        }
        self.wallpaper
            .lock()
            .expect("wallpaper")
            .clone()
            .ok_or_else(|| "module_inactive".into())
    }

    pub fn wallpaper_engine(&self) -> Option<Arc<WallpaperEngine>> {
        self.wallpaper.lock().expect("wallpaper").clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_module_set_is_rejected() {
        assert!(ModuleSet::new(std::iter::empty()).is_err());
        assert!(serde_json::from_str::<ModuleSet>("[]").is_err());
    }

    #[test]
    fn wallpaper_is_inactive_until_it_is_the_active_module() {
        let path = std::env::temp_dir().join(format!("spiral-shell-active-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).unwrap();
        let root = Root::at(&path);
        let legacy = crate::paths::LegacyRoots::at(path.join("legacy"));
        let settings = ShellSettings::load_or_derive(&root, &legacy);
        let shell = Shell::new(root, settings);
        assert!(shell.contains(ModuleId::Wallpaper) || shell.contains(ModuleId::Resume));
        assert_eq!(shell.wallpaper().err().as_deref(), Some("module_inactive"));
        assert!(shell.wallpaper_engine().is_none());
        let _ = std::fs::remove_dir_all(&path);
    }

    #[test]
    fn a_module_set_round_trips_wallpaper_before_resume() {
        let set = ModuleSet::new([ModuleId::Resume, ModuleId::Wallpaper]).unwrap();
        let json = serde_json::to_string(&set).unwrap();
        assert_eq!(json, r#"["wallpaper","resume"]"#);
        let back: ModuleSet = serde_json::from_str(&json).unwrap();
        assert_eq!(
            back.iter().collect::<Vec<_>>(),
            set.iter().collect::<Vec<_>>()
        );
    }
}
