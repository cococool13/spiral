//! Files in, plain text out.
//!
//! Neither importer understands resumes. They reduce a file to lines and hand
//! it to `parse_text`, which stays the only thing in this app that knows what a
//! resume is. That is what keeps a PDF and a paste behaving identically.

pub mod docx;
pub mod pdf;

use std::path::Path;

pub fn from_path(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path)
        .map_err(|e| format!("Could not open {}: {e}. Check the file is still there.", path.display()))?;
    from_bytes(&bytes, extension_of(path).as_deref())
}

fn extension_of(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
}

/// What a file *is*, read from its first bytes rather than its name.
///
/// An extension is a claim, not a fact: a PDF saved as `resume.docx`, a file
/// with no extension at all, and a Word file renamed by a recruiter's portal
/// all reach this function, and all of them are readable. Trusting the name
/// meant refusing a file the app could read perfectly well.
enum Shape {
    Pdf,
    Zip,
    OldWord,
    Rtf,
    Text,
    Unknown,
}

fn shape_of(bytes: &[u8]) -> Shape {
    const OLE2: &[u8] = &[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    if bytes.starts_with(b"%PDF-") {
        return Shape::Pdf;
    }
    if bytes.starts_with(b"PK\x03\x04") {
        return Shape::Zip;
    }
    if bytes.starts_with(OLE2) {
        return Shape::OldWord;
    }
    if bytes.starts_with(b"{\\rtf") {
        return Shape::Rtf;
    }
    match decode_text(bytes) {
        Some(_) => Shape::Text,
        None => Shape::Unknown,
    }
}

/// Plain text in whatever encoding it was saved in. Notepad still writes
/// UTF-16 with a byte-order mark, and a file that is mostly control bytes is
/// not text at all however it decodes.
fn decode_text(bytes: &[u8]) -> Option<String> {
    let text = match bytes {
        [0xFF, 0xFE, rest @ ..] => utf16(rest, u16::from_le_bytes),
        [0xFE, 0xFF, rest @ ..] => utf16(rest, u16::from_be_bytes),
        [0xEF, 0xBB, 0xBF, rest @ ..] => String::from_utf8_lossy(rest).into_owned(),
        _ => String::from_utf8_lossy(bytes).into_owned(),
    };
    if text.trim().is_empty() {
        return None;
    }
    let odd = text
        .chars()
        .filter(|c| c.is_control() && !c.is_whitespace() || *c == char::REPLACEMENT_CHARACTER)
        .count();
    // A tenth of the file being undecodable means this is a binary format we
    // do not know, not a resume with a few odd characters in it.
    (odd * 10 < text.chars().count().max(1)).then_some(text)
}

fn utf16(bytes: &[u8], read: fn([u8; 2]) -> u16) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| read([pair[0], pair[1]]))
        .collect();
    String::from_utf16_lossy(&units)
}

pub fn from_bytes(bytes: &[u8], extension: Option<&str>) -> Result<String, String> {
    match shape_of(bytes) {
        Shape::Pdf => pdf::text_from_pdf(bytes),
        Shape::Zip => docx::text_from_docx(bytes),
        Shape::OldWord => Err(
            "That is an older Word file (.doc). Open it in Word and use Save As to make a .docx, or paste the text instead."
                .to_string(),
        ),
        Shape::Rtf => Err(
            "That is a Rich Text file (.rtf). Open it and save it as a .docx or a PDF, or paste the text instead."
                .to_string(),
        ),
        // A resume kept as .txt or .md is a resume. The parser reads pasted
        // text already, and this is the same text arriving by a different door.
        Shape::Text => decode_text(bytes).ok_or_else(|| unreadable(extension)),
        Shape::Unknown => Err(unreadable(extension)),
    }
}

fn unreadable(extension: Option<&str>) -> String {
    let named = match extension {
        Some(e) => format!("A .{e} file is not something Spiral Resume can read. "),
        None => String::new(),
    };
    format!(
        "{named}It reads PDF, Word (.docx) and plain text. For anything else, copy the text and paste it instead."
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unreadable_format_names_what_it_can_read_and_what_to_do() {
        let noise: Vec<u8> = (0u8..64).cycle().take(4096).collect();
        let err = from_bytes(&noise, Some("pages")).unwrap_err();
        assert!(err.contains("PDF, Word"), "got {err}");
        assert!(err.contains("paste"), "no next step in: {err}");
        assert!(err.contains(".pages"), "the file is not named in: {err}");
    }

    /// The name on a file is a claim about it. A PDF called `.docx` — which is
    /// what a recruiting portal hands back — is still a PDF, and refusing it
    /// helps nobody.
    #[test]
    fn a_file_is_read_by_what_it_is_not_by_what_it_is_called() {
        let doc = crate::parse_text::parse_text("Ada Lovelace\nada@example.com\n");
        let template = crate::templates::find("sheet").unwrap();
        let pdf = crate::templates::to_pdf(template, &doc, "ink").unwrap();
        let text = from_bytes(&pdf, Some("docx")).expect("a PDF named .docx is still a PDF");
        assert!(text.contains("Ada Lovelace"), "got {text}");

        let word = crate::docx::to_docx(&doc, &template.docx, "ink").unwrap();
        let text = from_bytes(&word, None).expect("a Word file with no extension is still readable");
        assert!(text.contains("Ada Lovelace"), "got {text}");
    }

    /// A resume kept as a text file is a resume.
    #[test]
    fn plain_text_files_are_read_rather_than_refused() {
        let resume = "Ada Lovelace\nada@example.com\n\nEXPERIENCE\nAnalyst, Admiralty\n2021 - 2023\n- Wrote it\n";
        for extension in [Some("txt"), Some("md"), None] {
            let text = from_bytes(resume.as_bytes(), extension).unwrap();
            assert!(text.contains("Admiralty"), "got {text}");
        }
    }

    /// Notepad writes UTF-16 with a byte-order mark, and a resume saved from it
    /// is otherwise a page of interleaved nulls.
    #[test]
    fn a_utf16_text_file_is_decoded() {
        let mut bytes = vec![0xFF, 0xFE];
        for unit in "Ada Lovelace\nAnalyst".encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        let text = from_bytes(&bytes, Some("txt")).unwrap();
        assert!(text.starts_with("Ada Lovelace"), "got {text:?}");
    }

    /// Formats this app cannot read still get a sentence naming the format and
    /// the one action that fixes it.
    #[test]
    fn a_format_it_cannot_read_says_which_one_it_is_and_what_to_do() {
        let old_word = [0xD0u8, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0];
        let err = from_bytes(&old_word, Some("doc")).unwrap_err();
        assert!(err.contains("older Word file"), "got {err}");
        assert!(err.contains("Save As"), "no next step in: {err}");

        let err = from_bytes(br"{\rtf1\ansi Ada}", Some("rtf")).unwrap_err();
        assert!(err.contains("Rich Text"), "got {err}");
    }

    #[test]
    fn the_extension_is_matched_regardless_of_case() {
        assert_eq!(
            extension_of(Path::new("/tmp/Resume.DOCX")).as_deref(),
            Some("docx")
        );
    }
}

#[cfg(test)]
mod real_files {
    /// Not a behaviour test — a way to point the importer at real resumes and
    /// see what it makes of them. Run with:
    /// `SPIRAL_RESUME_SAMPLES=<dir> cargo test --lib import::real_files -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn report_what_each_sample_parses_into() {
        let dir = std::env::var("SPIRAL_RESUME_SAMPLES")
            .expect("set SPIRAL_RESUME_SAMPLES to a folder of .docx/.pdf resumes");
        let mut entries: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| {
                matches!(
                    p.extension().and_then(|e| e.to_str()).map(str::to_lowercase).as_deref(),
                    Some("docx") | Some("pdf")
                )
            })
            .collect();
        entries.sort();
        for path in entries {
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            match super::from_path(&path) {
                Err(e) => println!("{name}: ERROR {e}"),
                Ok(text) => {
                    // The counts say a file parsed badly; only the text says why.
                    if std::env::var("SPIRAL_RESUME_DUMP").is_ok() {
                        println!("----- {name} -----\n{text}\n----- end -----");
                    }
                    let doc = crate::parse_text::parse_text(&text);
                    println!(
                        "{name}: name={:?} roles={} school={} leadership={} skills={} awards={}",
                        doc.contact.name,
                        doc.experience.len(),
                        doc.education.len(),
                        doc.leadership.len(),
                        doc.skills.len(),
                        doc.awards.len(),
                    );
                }
            }
        }
    }
}
