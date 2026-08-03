// The updater plugin is registered at M7, not here. It reads
// plugins.updater.pubkey at init and panics without it, so it cannot be
// added before the signing key exists.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running Spiral Clean");
}
