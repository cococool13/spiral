use std::num::NonZeroU8;
use std::sync::Mutex;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::paths::Root;
use crate::settings::ShellSettings;

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
}

impl Shell {
    pub fn new(root: Root, settings: ShellSettings) -> Self {
        Self {
            root,
            settings: Mutex::new(settings),
        }
    }

    pub fn root(&self) -> &Root {
        &self.root
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

    pub fn sync_login_flags(
        &self,
        launch_at_login: bool,
        auto_update_check: bool,
    ) -> Result<(), String> {
        let mut settings = self.settings.lock().expect("shell settings");
        if settings.launch_at_login == launch_at_login
            && settings.auto_update_check == auto_update_check
        {
            return Ok(());
        }
        settings.launch_at_login = launch_at_login;
        settings.auto_update_check = auto_update_check;
        settings.save(&self.root)
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
