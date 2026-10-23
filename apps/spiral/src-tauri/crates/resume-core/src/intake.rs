use std::path::Path;

use crate::model::ResumeDoc;
use crate::parse_text;

pub fn import_file(path: &Path) -> Result<ResumeDoc, String> {
    Ok(import_with_text(path)?.0)
}

pub fn import_with_text(path: &Path) -> Result<(ResumeDoc, String), String> {
    let text = crate::import::from_path(path)?;
    let doc = parse_text::parse_text(&text);
    if doc.contact.name.is_empty() && doc.experience.is_empty() && doc.education.is_empty() {
        return Err(format!(
            "Nothing could be read out of {}. Open it, copy the text, and paste it instead.",
            path.display()
        ));
    }
    Ok((doc, text))
}

pub fn parse_pasted(text: &str) -> ResumeDoc {
    parse_text::parse_text(text)
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
            crate::docx::to_docx(&doc, &template.docx, template.sections, "ink").unwrap(),
        )
        .unwrap();
        let err = import_file(&path).unwrap_err();
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
            crate::docx::to_docx(&original, &template.docx, template.sections, "ink").unwrap(),
        )
        .unwrap();
        let back = import_file(&path).unwrap();
        assert_eq!(back.contact.name, "Ada Lovelace");
        assert_eq!(back.experience[0].organization, "Admiralty");
    }

    #[test]
    fn an_import_over_64_kib_keeps_the_summary_including_quotes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("long.txt");
        let quotes = "\"a".repeat(25_000);
        let text = format!(
            "Ada Lovelace\nada@example.com\n\nEXPERIENCE\nAnalyst, Admiralty\nJan 2021 - Present\n- Kept {quotes}\n"
        );
        std::fs::write(&path, &text).unwrap();
        let doc = import_file(&path).unwrap();
        assert_eq!(doc.contact.name, "Ada Lovelace");
        let bullet = &doc.experience[0].bullets[0].text;
        assert!(bullet.contains('"'), "bullet was {bullet}");
        let encoded = serde_json::to_vec(&doc).unwrap();
        assert!(
            encoded.len() > 64 * 1024,
            "escaped document was {} bytes",
            encoded.len()
        );
    }
}
