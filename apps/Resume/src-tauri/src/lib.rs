pub mod accent;
pub mod build;
pub mod engine_bench;
pub mod engine_run;
pub mod export_cards;
pub mod commands;
pub mod docx;
pub mod fixtures;
pub mod gate;
pub mod import;
pub mod model;
pub mod keys;
pub mod license;
pub mod local;
pub mod openers;
pub mod parse_text;
pub mod present;
pub mod provider;
pub mod render;
pub mod rewrite;
pub mod settings;
pub mod sidecar;
pub mod store;
pub mod tighten;
pub mod templates;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(commands::BuiltFile::default())
        .invoke_handler(tauri::generate_handler![
            commands::editing::parse_pasted_text,
            commands::editing::import_resume_file,
            commands::editing::import_dropped_file,
            commands::editing::list_accents,
            commands::engine::engine_info,
            commands::engine::save_engine,
            commands::engine::complete_setup,
            commands::engine::save_api_key,
            commands::engine::clear_api_key,
            commands::engine::offline_model_status,
            commands::engine::choose_offline_model,
            commands::engine::download_offline_model,
            commands::engine::remove_offline_model,
            commands::building::render_thumbnails,
            commands::editing::review_wording,
            commands::building::build_document,
            commands::building::save_built_document,
            commands::save_document,
            commands::load_document,
            commands::storage_info,
            commands::delete_stored_data,
            license::license_status,
            license::license_activate,
            license::license_ensure,
            license::license_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Spiral Resume");
}
