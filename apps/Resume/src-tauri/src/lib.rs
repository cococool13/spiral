pub mod accent;
pub mod build;
pub mod commands;
pub mod docx;
pub mod gate;
pub mod import;
pub mod model;
pub mod keys;
pub mod local;
pub mod parse_text;
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
            commands::parse_pasted_text,
            commands::import_resume_file,
            commands::import_dropped_file,
            commands::list_accents,
            commands::engine_info,
            commands::save_engine,
            commands::save_api_key,
            commands::clear_api_key,
            commands::offline_model_status,
            commands::download_offline_model,
            commands::remove_offline_model,
            commands::render_thumbnails,
            commands::review_wording,
            commands::build_document,
            commands::save_built_document,
            commands::save_document,
            commands::load_document,
            commands::storage_info,
            commands::delete_stored_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Spiral Resume");
}
