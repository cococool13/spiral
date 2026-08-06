// This crate carried a blanket `#![allow(dead_code)]` through M2, when the
// safety core existed before any screen could reach it and the lib target
// produced 49 expected `dead_code` warnings. It was removed at M3, when the
// Clean screen wired `scan` and `remove` to real commands.
//
// Removing it immediately surfaced a real finding the noise had been hiding —
// a `Candidate` field written as a constant zero and read by nobody — which is
// precisely what the blanket allow was predicted to cost. **Do not reintroduce
// one.** The few items that genuinely have no caller yet carry their own
// narrowly scoped `#[allow(dead_code)]` naming the milestone that consumes
// them, so a warning here now means what it says.
mod apps;
mod associate;
mod catalog;
mod commands;
mod escalate;
mod exclude;
mod health;
mod history;
mod optimize;
mod orphans;
mod paths;
mod permissions;
mod remove;
mod scan;
mod startup;
mod volume;

// The updater plugin is registered at M7, not here. It reads
// plugins.updater.pubkey at init and panics without it, so it cannot be
// added before the signing key exists.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::clean_categories,
            commands::clean_scan,
            commands::clean_execute,
            commands::uninstall_list,
            commands::uninstall_inspect,
            commands::uninstall_execute,
            commands::leftovers_scan,
            commands::leftovers_remove,
            health::health_report,
            optimize::optimize_plan,
            optimize::optimize_execute,
            startup::startup_list,
            startup::startup_set_enabled,
            startup::startup_remove,
            startup::open_login_items_settings,
            permissions::fda_status,
            permissions::open_privacy_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running Spiral Clean");
}
