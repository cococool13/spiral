//! `.pdf` → plain text.
//!
//! Two things make this the riskiest input in the app.
//!
//! A resume PDF is a file the user downloaded from somewhere, and the extractor
//! panics on malformed input rather than returning an error. So every call runs
//! inside `catch_unwind`, and the release profile deliberately unwinds rather
//! than aborting — see the comment in `Cargo.toml`.
//!
//! And a scanned resume is a picture of a document, with no text in it at all.
//! That is not a parse failure and must not be reported as one: the user's next
//! step is completely different.

use std::panic::{catch_unwind, AssertUnwindSafe};

const NOT_A_PDF: &str = "That file is not a PDF. Choose a .pdf file, or paste the text instead.";

pub fn text_from_pdf(bytes: &[u8]) -> Result<String, String> {
    if !bytes.starts_with(b"%PDF-") {
        return Err(NOT_A_PDF.to_string());
    }

    // The extractor prints its own diagnostics to stderr and panics on some
    // real-world files; neither is allowed to reach the user or the window.
    let extracted = catch_unwind(AssertUnwindSafe(|| pdf_extract::extract_text_from_mem(bytes)))
        .map_err(|_| {
            "That PDF could not be read — it may be damaged. Try opening it and re-saving it as a PDF, or paste the text instead."
                .to_string()
        })?
        .map_err(|_| {
            "That PDF could not be read. Try re-saving it, or paste the text instead.".to_string()
        })?;

    let text = tidy(&extracted);
    if text.trim().is_empty() {
        return Err(
            "That PDF has no text in it — it looks like a scan or a picture of a resume. Paste the text instead, or export a PDF from the original document."
                .to_string(),
        );
    }
    Ok(text)
}

/// Extractors leave ragged whitespace and stray blank lines. Collapsing them
/// here means `parse_text` sees the same shape it would from a paste.
fn tidy(raw: &str) -> String {
    raw.lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bytes_that_are_not_a_pdf_read_as_a_sentence() {
        let err = text_from_pdf(b"just some text").unwrap_err();
        assert_eq!(err, NOT_A_PDF);
    }

    /// A file that starts like a PDF and then stops is the shape that makes
    /// extractors panic. It must produce a sentence, not a dead process.
    #[test]
    fn a_truncated_pdf_does_not_take_the_app_down() {
        let err = text_from_pdf(b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog").unwrap_err();
        assert!(err.contains("paste the text instead"), "got {err}");
    }

    #[test]
    fn tidy_collapses_ragged_whitespace_without_joining_lines() {
        assert_eq!(tidy("  Ada   Lovelace \n\n\n  Analyst  "), "Ada Lovelace\nAnalyst");
    }

    /// The round trip that matters: a PDF this app produced, read back by this
    /// app, still contains the person.
    #[test]
    fn a_pdf_this_app_wrote_survives_a_round_trip() {
        let original = crate::parse_text::parse_text(
            "Ada Lovelace\nada@example.com\n\nEXPERIENCE\nAnalyst, Admiralty\nJan 2021 - Present\n- Wrote the first algorithm\n",
        );
        let template = crate::templates::find("sheet").unwrap();
        let bytes = crate::templates::to_pdf(template, &original, "ink").unwrap();

        let text = text_from_pdf(&bytes).unwrap();
        assert!(text.contains("Ada Lovelace"), "name missing from: {text}");
        assert!(text.contains("Admiralty"), "employer missing from: {text}");
        assert!(
            text.contains("Wrote the first algorithm"),
            "bullet missing from: {text}"
        );
    }

    /// A PDF with a page and no text on it is a scan. The message has to say so,
    /// because "paste it instead" is useless advice if the user thinks the file
    /// is merely broken.
    #[test]
    fn a_pdf_with_no_text_layer_is_named_as_a_scan() {
        let blank = crate::render::to_pdf("#set page(width: 200pt, height: 100pt)".to_string())
            .unwrap();
        let err = text_from_pdf(&blank).unwrap_err();
        assert!(err.contains("looks like a scan"), "got {err}");
    }
}
