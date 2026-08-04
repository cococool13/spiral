mod catalog;
mod exclude;
mod paths;
mod permissions;
mod remove;
mod scan;

// The updater plugin is registered at M7, not here. It reads
// plugins.updater.pubkey at init and panics without it, so it cannot be
// added before the signing key exists.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            permissions::fda_status,
            permissions::open_privacy_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running Spiral Clean");
}
