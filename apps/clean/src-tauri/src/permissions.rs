use std::path::PathBuf;

/// The TCC database is unreadable without Full Disk Access on every supported
/// macOS version. Reading it is the only reliable way to detect the grant —
/// there is no API that answers the question directly.
fn probe_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join("Library/Application Support/com.apple.TCC/TCC.db"))
}

pub fn has_full_disk_access() -> bool {
    match probe_path() {
        Some(path) => std::fs::File::open(path).is_ok(),
        None => false,
    }
}

pub fn settings_deep_link() -> &'static str {
    "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
}

#[tauri::command]
pub fn fda_status() -> bool {
    has_full_disk_access()
}

#[tauri::command]
pub fn open_privacy_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg(settings_deep_link())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open System Settings: {e}. Open it manually and choose Privacy & Security → Full Disk Access."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deep_link_targets_the_all_files_pane() {
        assert_eq!(
            settings_deep_link(),
            "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
        );
    }

    #[test]
    fn probe_path_is_under_the_user_library() {
        let path = probe_path().expect("home directory should resolve in tests");
        assert!(path.ends_with("Library/Application Support/com.apple.TCC/TCC.db"));
    }
}
