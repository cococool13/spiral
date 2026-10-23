use tauri::AppHandle;

pub fn pick_open(app: &AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let picked = rfd::FileDialog::new()
            .set_title("Open a resume")
            .add_filter("Resume", &["pdf", "docx", "txt", "md"])
            .pick_file();
        let _ = tx.send(picked.map(|path| path.display().to_string()));
    })
    .map_err(|err| err.to_string())?;
    rx.recv().map_err(|err| err.to_string())
}

pub fn pick_save(app: &AppHandle, name: &str) -> Result<Option<String>, String> {
    let name = name.to_string();
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let picked = rfd::FileDialog::new()
            .set_title("Save the resume")
            .set_file_name(&name)
            .save_file();
        let _ = tx.send(picked.map(|path| path.display().to_string()));
    })
    .map_err(|err| err.to_string())?;
    rx.recv().map_err(|err| err.to_string())
}
