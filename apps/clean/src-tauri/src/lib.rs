// M2 built the safety core — `catalog`, `scan`, `remove`, `exclude`,
// `history` — before any screen that reaches it exists. That is deliberate
// (the design spec calls M2 "a full milestone with no user-visible output"),
// and the cost is that almost none of it has a caller yet: the lib target
// currently produces 49 `dead_code` warnings, all of them expected.
//
// 49 warnings is not a background hum, it is a wall. Anyone reading `cargo
// build` output learns to skip it, and the moment a *genuinely* dead function
// appears — a guard that stopped being reachable, which this module has
// already shipped once — it arrives as warning 50 and nobody sees it.
// Silencing the expected noise is what keeps the unexpected kind legible.
//
// **Remove this attribute at M3**, when the Clean screen wires `scan` and
// `remove` to real commands. From that point a `dead_code` warning means what
// it says, and leaving the allow in place would hide it.
#![allow(dead_code)]

mod catalog;
mod commands;
mod exclude;
mod history;
mod paths;
mod permissions;
mod remove;
mod scan;
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
            permissions::fda_status,
            permissions::open_privacy_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running Spiral Clean");
}
