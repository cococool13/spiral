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

pub fn from_bytes(bytes: &[u8], extension: Option<&str>) -> Result<String, String> {
    match extension {
        Some("docx") => docx::text_from_docx(bytes),
        Some("pdf") => pdf::text_from_pdf(bytes),
        _ => Err(
            "Spiral Resume reads PDF and Word (.docx) files. For anything else, copy the text and paste it instead."
                .to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unreadable_format_names_what_it_can_read_and_what_to_do() {
        let err = from_bytes(b"x", Some("pages")).unwrap_err();
        assert!(err.contains("PDF and Word"), "got {err}");
        assert!(err.contains("paste"), "no next step in: {err}");
    }

    #[test]
    fn a_file_with_no_extension_is_not_guessed_at() {
        assert!(from_bytes(b"x", None).is_err());
    }

    #[test]
    fn the_extension_is_matched_regardless_of_case() {
        // .DOCX from a Windows machine must take the Word path, and therefore
        // fail as a Word file rather than as an unknown format.
        let err = from_bytes(b"nope", Some("docx")).unwrap_err();
        assert!(err.contains("not a Word document"), "got {err}");
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
