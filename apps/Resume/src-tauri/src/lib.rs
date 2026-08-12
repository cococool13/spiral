pub mod commands;
pub mod docx;
pub mod model;
pub mod parse_text;
pub mod render;
pub mod store;
pub mod templates;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::parse_pasted_text,
            commands::render_thumbnails,
            commands::save_document,
            commands::load_document,
            commands::storage_info,
            commands::delete_stored_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Spiral Resume");
}
