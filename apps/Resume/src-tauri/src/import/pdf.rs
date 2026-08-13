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

/// Extractors leave ragged whitespace and stray blank lines. Collapsing them
/// here means `parse_text` sees the same shape it would from a paste.
fn tidy(raw: &str) -> String {
    raw.lines()
        .map(untrack)
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// "A D A   L O V E L A C E" back into "ADA LOVELACE".
///
/// Designers letter-space names and section headings, and a PDF stores the
/// tracking as real space between the glyphs — so the extractor reads every
/// letter as a word. Whole sections disappear this way, because a heading like
/// "E D U C A T I O N" matches nothing.
///
/// The word boundary is the wider gap, which is why this runs before the
/// whitespace collapse above and never after it.
fn untrack(line: &str) -> String {
    let words: Vec<String> = split_on_wide_gaps(line)
        .into_iter()
        .map(|segment| {
            let letters: Vec<&str> = segment.split_whitespace().collect();
            // Three or more, all single characters: this was one word, spread.
            if letters.len() >= 3 && letters.iter().all(|l| l.chars().count() == 1) {
                letters.concat()
            } else {
                segment
            }
        })
        .collect();
    words.join(" ")
}

fn split_on_wide_gaps(line: &str) -> Vec<String> {
    let mut segments = Vec::new();
    let mut current = String::new();
    let mut spaces = 0usize;
    for c in line.chars() {
        if c.is_whitespace() {
            spaces += 1;
            continue;
        }
        if spaces >= 2 && !current.is_empty() {
            segments.push(std::mem::take(&mut current));
        } else if spaces == 1 && !current.is_empty() {
            current.push(' ');
        }
        spaces = 0;
        current.push(c);
    }
    if !current.is_empty() {
        segments.push(current);
    }
    segments
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

    /// Letter-spaced headings and names are how a designed resume loses whole
    /// sections on the way in.
    /// A password-protected PDF is not a broken one, and telling the user it
    /// might be damaged sends them hunting for a fault that is not there.
    #[test]
    fn a_password_protected_pdf_is_named_as_locked_not_broken() {
        let locked = b"%PDF-1.7\ntrailer\n<< /Encrypt 9 0 R >>\n".to_vec();
        let err = text_from_pdf(&locked).unwrap_err();
        assert!(err.contains("password"), "got {err}");
        assert!(err.contains("unprotected copy"), "no next step in: {err}");
    }

    #[test]
    fn tracking_is_read_back_as_words() {
        assert_eq!(tidy("A D A   L O V E L A C E"), "ADA LOVELACE");
        assert_eq!(tidy("E D U C A T I O N"), "EDUCATION");
    }

    /// And an ordinary line is left exactly as it was. Two initials are not a
    /// letter-spaced word, and neither is a line with real words in it.
    #[test]
    fn ordinary_lines_are_not_squeezed_together() {
        assert_eq!(tidy("J. R. R. Tolkien"), "J. R. R. Tolkien");
        assert_eq!(tidy("R  C  Python"), "R C Python");
        assert_eq!(
            tidy("ANALYST | Admiralty 2021 — 2023"),
            "ANALYST | Admiralty 2021 — 2023"
        );
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
