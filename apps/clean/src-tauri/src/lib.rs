// Do not reintroduce `#![allow(dead_code)]`. A warning here means what it says.
mod analyze;
mod apps;
mod associate;
mod backups;
mod catalog;
mod catalog_clean;
mod commands;
mod escalate;
mod exclude;
mod health;
mod history;
mod license;
mod lipo;
mod optimize;
mod orphans;
mod paths;
mod permissions;
mod proc;
mod receipts;
mod remove;
mod scan;
mod sizing;
mod smoke;
mod startup;
mod volume;

// The updater plugin is registered at M7, not here. It reads
// plugins.updater.pubkey at init and panics without it, so it cannot be
// added before the signing key exists.
pub fn run() {
    // The smoke gate runs before any window exists and then exits. It is a
    // read-only pass over everything a release depends on being true of a
    // real Mac — see `smoke.rs`.
    if smoke::requested() {
        smoke::run();
        return;
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::clean_scan,
            commands::clean_execute,
            commands::uninstall_list,
            commands::uninstall_inspect,
            commands::uninstall_execute,
            commands::leftovers_scan,
            commands::leftovers_remove,
            analyze::analyze_children,
            analyze::analyze_root,
            analyze::reveal_in_finder,
            backups::backups_list,
            backups::backups_remove,
            lipo::lipo_candidates,
            lipo::lipo_strip,
            exclude::exclusions_list,
            exclude::exclusions_add,
            exclude::exclusions_remove,
            history::history_read,
            history::history_clear,
            receipts::receipts_list,
            health::health_report,
            optimize::optimize_plan,
            optimize::optimize_execute,
            startup::startup_list,
            startup::startup_set_enabled,
            startup::startup_remove,
            startup::open_login_items_settings,
            permissions::fda_status,
            permissions::open_privacy_settings,
            license::license_status,
            license::license_activate,
            license::license_ensure,
            license::license_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Spiral Clean");
}
