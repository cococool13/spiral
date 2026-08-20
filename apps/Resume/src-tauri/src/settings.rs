//! Engine settings — which provider, which model, which endpoint.
//!
//! Deliberately a separate file from the resume: deleting your document must
//! not delete your key configuration, and clearing stored data must not leave a
//! half-configured engine behind. **No secret is ever written here** — the key
//! itself lives in the OS keychain (`keys.rs`); this file holds only the choice
//! of provider and model.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const FILE: &str = "engine.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineSettings {
    /// "anthropic", "openai", "compatible", or "local".
    pub provider: String,
    pub model: String,
    /// Only meaningful for "compatible".
    pub base_url: String,
    /// Which offline model to run, by catalogue id. Empty means "the one that
    /// is installed" — which is unambiguous until a second one is, and then
    /// the app asks rather than guessing.
    #[serde(default)]
    pub offline_model: String,
    /// The first-run engine screen has been dismissed — a model is installed,
    /// a key is saved, or the person chose the rule-based pass.
    #[serde(default)]
    pub setup_done: bool,
}

impl Default for EngineSettings {
    fn default() -> Self {
        Self {
            provider: "anthropic".to_string(),
            model: crate::provider::ANTHROPIC_DEFAULT_MODEL.to_string(),
            base_url: String::new(),
            offline_model: String::new(),
            setup_done: false,
        }
    }
}

pub fn path_in(root: &Path) -> PathBuf {
    root.join(FILE)
}

pub fn load(root: &Path) -> EngineSettings {
    // A missing or unreadable settings file is not an error — the defaults are
    // a working configuration, and the app must still open.
    fs::read(path_in(root))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

pub fn save(root: &Path, settings: &EngineSettings) -> io::Result<()> {
    fs::create_dir_all(root)?;
    let json = serde_json::to_vec_pretty(settings)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    fs::write(path_in(root), json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_is_a_working_anthropic_configuration() {
        let settings = EngineSettings::default();
        assert_eq!(settings.provider, "anthropic");
        assert!(crate::provider::Provider::parse(&settings.provider, "").is_ok());
        assert!(!settings.model.is_empty());
    }

    /// A settings file written before the offline tier had a choice in it must
    /// still load — it is the user's engine configuration, not a cache.
    #[test]
    fn a_file_written_before_the_choice_existed_still_loads() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            path_in(dir.path()),
            br#"{"provider":"local","model":"","baseUrl":""}"#,
        )
        .unwrap();
        let loaded = load(dir.path());
        assert_eq!(loaded.provider, "local");
        assert_eq!(loaded.offline_model, "");
    }

    #[test]
    fn settings_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let settings = EngineSettings {
            provider: "compatible".into(),
            model: "llama-3".into(),
            base_url: "http://localhost:11434/v1".into(),
            offline_model: "qwen3.5-4b".into(),
            setup_done: true,
        };
        save(dir.path(), &settings).unwrap();
        assert_eq!(load(dir.path()), settings);
    }

    #[test]
    fn a_missing_or_corrupt_file_falls_back_to_the_defaults() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(dir.path()), EngineSettings::default());
        fs::write(path_in(dir.path()), b"{ not json").unwrap();
        assert_eq!(load(dir.path()), EngineSettings::default());
    }

    /// The file is written to disk in plain text, so it must never be given a
    /// field that could hold a secret.
    #[test]
    fn the_settings_file_has_nowhere_to_put_a_key() {
        let json = serde_json::to_string(&EngineSettings::default()).unwrap();
        for forbidden in ["key", "token", "secret", "password"] {
            assert!(!json.contains(forbidden), "settings JSON mentions {forbidden}: {json}");
        }
    }
}
