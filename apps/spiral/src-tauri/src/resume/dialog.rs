use std::path::Path;
use std::sync::Mutex;

use tauri::AppHandle;

/// The types the import parser reads. The picker offers the same list.
const RESUME_TYPES: [&str; 4] = ["pdf", "docx", "txt", "md"];
/// A resume is a few pages. Anything larger is not one, and reading it would
/// stall the engine for nothing.
const DROP_MAX_BYTES: u64 = 20 * 1024 * 1024;

pub fn pick_open(app: &AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let picked = rfd::FileDialog::new()
            .set_title("Open a resume")
            .add_filter("Resume", &RESUME_TYPES)
            .pick_file();
        let _ = tx.send(picked.map(|path| path.display().to_string()));
    })
    .map_err(|err| err.to_string())?;
    rx.recv().map_err(|err| err.to_string())
}

/// Checks a path that arrived from a drop on the window before the engine
/// reads it: a real file, a type the parser reads, and a resume-sized file.
/// Errors are the sentence the person sees.
pub fn dropped(raw: &str) -> Result<String, String> {
    let path = Path::new(raw);
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| raw.to_string());
    if !path.is_absolute() {
        return Err(format!(
            "Spiral could not find {name}. Drop the file again."
        ));
    }
    let meta = std::fs::metadata(path)
        .map_err(|_| format!("Spiral could not find {name}. Drop the file again."))?;
    if !meta.is_file() {
        return Err(format!(
            "{name} is a folder. Drop one PDF, Word or text file instead."
        ));
    }
    let ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    if !RESUME_TYPES.contains(&ext.as_str()) {
        return Err(format!(
            "Spiral reads PDF, Word (.docx) and text files, and {name} is none of these. Save it as a PDF or paste the text instead."
        ));
    }
    if meta.len() > DROP_MAX_BYTES {
        return Err(format!(
            "{name} is over 20 MB, which is too large for a resume. Save a smaller copy or paste the text instead."
        ));
    }
    Ok(path.display().to_string())
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

/// The folder the person last chose for an export. The webview may name a
/// folder only to repeat an export into it (after "Replace"); any other
/// folder has to come from the picker.
static EXPORT_DIR: Mutex<Option<String>> = Mutex::new(None);

/// Empty `asked` opens the folder picker; `None` means the person cancelled.
pub fn export_dir(app: &AppHandle, asked: &str) -> Result<Option<String>, String> {
    if asked.is_empty() {
        let picked = pick_folder(app)?;
        if let Some(dir) = &picked {
            *EXPORT_DIR.lock().unwrap_or_else(|e| e.into_inner()) = Some(dir.clone());
        }
        return Ok(picked);
    }
    confirm_export_dir(asked).map(Some)
}

fn confirm_export_dir(asked: &str) -> Result<String, String> {
    let chosen = EXPORT_DIR.lock().unwrap_or_else(|e| e.into_inner()).clone();
    match chosen {
        Some(dir) if dir == asked => Ok(dir),
        _ => Err(
            "Spiral can only save into the folder you chose. Export again and choose it.".into(),
        ),
    }
}

/// One folder for both exported files. The name stem comes from the resume.
fn pick_folder(app: &AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let picked = rfd::FileDialog::new()
            .set_title("Choose a folder for the PDF and the Word file")
            .pick_folder();
        let _ = tx.send(picked.map(|path| path.display().to_string()));
    })
    .map_err(|err| err.to_string())?;
    rx.recv().map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("spiral-drop-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_dropped_resume_passes_and_its_type_is_read_from_any_case() {
        let dir = scratch("ok");
        for name in ["ada.pdf", "ada.DOCX", "ada.txt", "ada.md"] {
            let path = dir.join(name);
            std::fs::write(&path, b"Ada Lovelace").unwrap();
            assert_eq!(
                dropped(&path.display().to_string()).unwrap(),
                path.display().to_string()
            );
        }
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_webview_can_only_repeat_an_export_into_the_chosen_folder() {
        assert!(confirm_export_dir("/Users/ada/Desktop").is_err());
        *EXPORT_DIR.lock().unwrap() = Some("/Users/ada/Desktop".into());
        assert_eq!(
            confirm_export_dir("/Users/ada/Desktop").unwrap(),
            "/Users/ada/Desktop"
        );
        let err = confirm_export_dir("/etc").unwrap_err();
        assert!(err.contains("folder you chose"), "{err}");
    }

    #[test]
    fn a_dropped_file_the_parser_cannot_read_is_refused_with_a_next_step() {
        let dir = scratch("bad");
        let image = dir.join("photo.png");
        std::fs::write(&image, b"png").unwrap();
        let err = dropped(&image.display().to_string()).unwrap_err();
        assert!(
            err.contains("photo.png") && err.contains("paste the text"),
            "{err}"
        );

        let err = dropped(&dir.display().to_string()).unwrap_err();
        assert!(err.contains("is a folder"), "{err}");

        let err = dropped(&dir.join("gone.pdf").display().to_string()).unwrap_err();
        assert!(err.contains("Drop the file again"), "{err}");

        assert!(dropped("relative/ada.pdf").is_err());

        let big = dir.join("big.pdf");
        let file = std::fs::File::create(&big).unwrap();
        file.set_len(DROP_MAX_BYTES + 1).unwrap();
        let err = dropped(&big.display().to_string()).unwrap_err();
        assert!(err.contains("over 20 MB"), "{err}");
        let _ = std::fs::remove_dir_all(dir);
    }
}
