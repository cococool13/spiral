//! The commands behind the Input and Check screens: what the user brings in,
//! and what the app offers back about it. Nothing here builds a file.

use crate::model::ResumeDoc;
use crate::parse_text;
use serde::Serialize;
use tauri_plugin_dialog::DialogExt;

/// The six swatches, served from Rust because the hex values may not live in
/// the frontend — `check-hex` allows colours only in the brand token file, and
/// these are the user's document colours, not Spiral's.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Accent {
    pub id: String,
    pub hex: String,
}

#[tauri::command]
pub fn list_accents() -> Vec<Accent> {
    crate::accent::ACCENTS
        .iter()
        .map(|(id, hex)| Accent {
            id: id.to_string(),
            hex: format!("#{hex}"),
        })
        .collect()
}

/// Reads a resume the user pointed at. `Ok(None)` means they dismissed the
/// picker, which is not a failure.
#[tauri::command]
pub async fn import_resume_file(app: tauri::AppHandle) -> Result<Option<ResumeDoc>, String> {
    let Some(chosen) = app
        .dialog()
        .file()
        .add_filter("Resume", &["pdf", "docx", "txt", "md", "text"])
        // The reader works from the file's first bytes, not its name, so a
        // resume with the wrong extension on it is still readable — and a
        // filter that hides it would be the only thing stopping the user.
        .add_filter("Any file", &["*"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = chosen
        .into_path()
        .map_err(|e| format!("That file cannot be opened: {e}. Choose another one."))?;
    Ok(Some(import_from(&path)?))
}

/// The drag-and-drop path. The path comes from the window's own drop event, so
/// it is a file the user physically dropped — but it is still read through the
/// same extension check as everything else.
#[tauri::command]
pub fn import_dropped_file(path: String) -> Result<ResumeDoc, String> {
    import_from(std::path::Path::new(&path))
}

fn import_from(path: &std::path::Path) -> Result<ResumeDoc, String> {
    let text = crate::import::from_path(path)?;
    let doc = parse_text::parse_text(&text);
    if doc.contact.name.is_empty() && doc.experience.is_empty() && doc.education.is_empty() {
        return Err(format!(
            "Nothing could be read out of {}. Open it, copy the text, and paste it instead.",
            path.display()
        ));
    }
    Ok(doc)
}

/// What the Check screen shows beside each bullet: the tightened wording, and
/// any advice. Advice is never a change.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulletReview {
    pub bullet_id: String,
    pub tightened: String,
    pub notes: Vec<String>,
}

#[tauri::command]
pub fn review_wording(doc: ResumeDoc) -> Vec<BulletReview> {
    let mut out = Vec::new();
    for role in doc.roles() {
        for bullet in &role.bullets {
            if bullet.text.trim().is_empty() {
                continue;
            }
            let result = crate::tighten::tighten_bullet(&bullet.text, role.end.present);
            // Only worth showing when there is something to say.
            if result.text != bullet.text || !result.notes.is_empty() {
                out.push(BulletReview {
                    bullet_id: bullet.id.clone(),
                    tightened: result.text,
                    notes: result.notes,
                });
            }
        }
    }
    out
}

#[tauri::command]
pub fn parse_pasted_text(text: String) -> ResumeDoc {
    parse_text::parse_text(&text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::templates;
    #[test]
    fn a_file_that_parses_to_nothing_is_reported_rather_than_shown_as_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("empty.docx");
        let doc = ResumeDoc::empty();
        let template = templates::find("column").unwrap();
        std::fs::write(
            &path,
            crate::docx::to_docx(&doc, &template.docx, "ink").unwrap(),
        )
        .unwrap();
        let err = import_from(&path).unwrap_err();
        assert!(err.contains("paste it instead"), "got {err}");
    }
    #[test]
    fn a_real_file_imports_into_a_document() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ada.docx");
        let original = parse_text::parse_text(
            "Ada Lovelace\nada@example.com\n\nEXPERIENCE\nAnalyst, Admiralty\nJan 2021 - Present\n- Wrote it\n",
        );
        let template = templates::find("column").unwrap();
        std::fs::write(
            &path,
            crate::docx::to_docx(&original, &template.docx, "ink").unwrap(),
        )
        .unwrap();
        let back = import_from(&path).unwrap();
        assert_eq!(back.contact.name, "Ada Lovelace");
        assert_eq!(back.experience[0].organization, "Admiralty");
    }
    #[test]
    fn parsing_is_reachable_through_the_command_layer() {
        let doc = parse_pasted_text("Ada Lovelace\nada@example.com\n".to_string());
        assert_eq!(doc.contact.name, "Ada Lovelace");
    }
}
