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
        .map_err(|_| damaged(bytes))?
        .map_err(|_| damaged(bytes))?;

    let text = tidy(&extracted);
    if text.trim().is_empty() {
        return Err(
            "That PDF has no text in it — it looks like a scan or a picture of a resume. Paste the text instead, or export a PDF from the original document."
                .to_string(),
        );
    }
    Ok(text)
}

/// A PDF that will not open reads as damaged, and for most files that is what
/// it is. An encrypted one is different: nothing is wrong with the file, the
/// user has a password for it, and "it may be damaged" would send them looking
/// for a problem that does not exist.
fn damaged(bytes: &[u8]) -> String {
    if bytes.windows(8).any(|window| window == b"/Encrypt") {
        return "That PDF is protected with a password, so its text cannot be read. Open it, save an unprotected copy, and choose that — or paste the text instead."
            .to_string();
    }
    "That PDF could not be read — it may be damaged. Try opening it and re-saving it as a PDF, or paste the text instead."
        .to_string()
}

/// Drops the blank lines an extractor leaves behind, and nothing else.
///
/// It used to collapse whitespace runs and repair letter-spacing too. Both of
/// those are things `parse_text` does to every source, and doing them here made
/// this importer the only door that got them: a letter-spaced heading survived
/// a PDF and vanished from a paste. Worse, the collapse ran *first* and erased
/// the wide gaps the repair depends on, so the knowledge could not simply move
/// — the whitespace has to arrive intact. It does now.
fn tidy(raw: &str) -> String {
    raw.lines()
        .filter(|line| !line.trim().is_empty())
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

    /// A password-protected PDF is not a broken one, and telling the user it
    /// might be damaged sends them hunting for a fault that is not there.
    #[test]
    fn a_password_protected_pdf_is_named_as_locked_not_broken() {
        let locked = b"%PDF-1.7\ntrailer\n<< /Encrypt 9 0 R >>\n".to_vec();
        let err = text_from_pdf(&locked).unwrap_err();
        assert!(err.contains("password"), "got {err}");
        assert!(err.contains("unprotected copy"), "no next step in: {err}");
    }

    /// `tidy` drops blank lines and touches nothing else. The wide gaps have to
    /// survive this function — `parse_text` reads them to undo letter-spacing,
    /// and it cannot do that on whitespace this importer already collapsed.
    /// The letter-spacing assertions themselves now live in `parse_text/lines`,
    /// where they cover a paste and a `.docx` too.
    #[test]
    fn tidy_drops_blank_lines_and_leaves_the_gaps_alone() {
        assert_eq!(tidy("A D A   L O V E L A C E"), "A D A   L O V E L A C E");
        assert_eq!(tidy("  Ada   Lovelace \n\n\n  Analyst  "), "  Ada   Lovelace \n  Analyst  ");
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

    /// Every template, read back. A two-column layout is the shape that breaks
    /// extraction — the columns interleave — and `column` and `card` are two
    /// columns. Whatever the layout, the facts have to come back.
    #[test]
    fn a_pdf_from_every_template_survives_a_round_trip() {
        let original = crate::parse_text::parse_text(
            "Ada Lovelace\nada@example.com · (555) 123-4567 · London\n\nSUMMARY\nAnalytical engine programmer.\n\nEXPERIENCE\nAnalyst, Admiralty\nPortsmouth\nJan 2021 - Present\n- Wrote the first published algorithm\n- Cut report turnaround from 9 days to 2\n\nEDUCATION\nUniversity of London\nBSc Mathematics\n2016 - 2019\n\nSKILLS\nRust, Analysis\n",
        );
        for template in crate::templates::all() {
            let bytes = crate::templates::to_pdf(template, &original, "ink").unwrap();
            let text = text_from_pdf(&bytes)
                .unwrap_or_else(|e| panic!("{} produced an unreadable PDF: {e}", template.id));
            // Case is a design decision — several templates set a name or a
            // degree in capitals — so only the letters have to survive.
            let squashed: String = text.split_whitespace().collect::<String>().to_lowercase();
            for fact in [
                "adalovelace",
                "ada@example.com",
                "admiralty",
                "portsmouth",
                "wrotethefirstpublishedalgorithm",
                "universityoflondon",
            ] {
                assert!(
                    squashed.contains(fact),
                    "{} lost {fact:?} on the way back in:\n{text}",
                    template.id
                );
            }
            let back = crate::parse_text::parse_text(&text);
            assert!(
                !back.experience.is_empty(),
                "{} read back with no experience:\n{text}",
                template.id
            );
        }
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
