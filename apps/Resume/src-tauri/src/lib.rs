pub mod model;
pub mod parse_text;
pub mod store;

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Spiral Resume");
}
