//! The staged build.
//!
//! Every percent this reports is emitted *after* the work that earned it. There
//! is no interpolation, no easing toward 90%, and no minimum display time — on
//! the deterministic path the whole thing crosses in well under a second, and
//! that is the honest outcome rather than a bug to disguise.
//!
//! When a model tier arrives (M6) a `Rewriting wording` stage slots in after
//! `Reading structure` without renumbering the rest.

use crate::docx;
use crate::model::ResumeDoc;
use crate::render;
use crate::templates::{self, Template};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Pdf,
    Docx,
}

impl Format {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "pdf" => Ok(Format::Pdf),
            "docx" => Ok(Format::Docx),
            other => Err(format!(
                "{other:?} is not a format this app can write. Choose PDF or Word and try again."
            )),
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Format::Pdf => "pdf",
            Format::Docx => "docx",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub stage: String,
    pub percent: u8,
    /// What is doing the work, named on the build screen as soon as it is
    /// known — not only afterwards on the result. Empty until it is decided.
    pub engine: String,
}

fn progress(stage: &str, percent: u8) -> Progress {
    Progress {
        stage: stage.to_string(),
        percent,
        // Filled in by the caller, which is the only place that knows.
        engine: String::new(),
    }
}

pub struct Built {
    pub pages: Vec<String>,
    pub bytes: Vec<u8>,
    pub suggested_name: String,
    pub format: Format,
}

/// `Ada Lovelace` → `Ada-Lovelace-resume.pdf`. Anything that is not a letter,
/// a digit or a hyphen is dropped, so a name cannot smuggle a path separator
/// into the save dialog's default filename.
pub fn suggested_name(doc: &ResumeDoc, format: Format) -> String {
    let stem: String = doc
        .contact
        .name
        .split_whitespace()
        .map(|word| {
            word.chars()
                .filter(|c| c.is_alphanumeric())
                .collect::<String>()
        })
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if stem.is_empty() {
        format!("resume.{}", format.extension())
    } else {
        format!("{stem}-resume.{}", format.extension())
    }
}

pub fn build(
    doc: &ResumeDoc,
    template: &Template,
    format: Format,
    accent: &str,
    tighten: bool,
    report: impl Fn(Progress),
) -> Result<Built, String> {
    report(progress("Reading structure", 15));

    // The free tier's wording pass. When a model tier arrives it takes this same
    // slot and the same stage name, so the build screen's vocabulary does not
    // change under the user.
    let doc = &if tighten {
        crate::tighten::tighten_doc(doc)
    } else {
        doc.clone()
    };
    report(progress("Tightening wording", 25));

    let inputs = templates::inputs_for(doc, accent)?;
    let document = render::compile(templates::source_for(template), inputs)?;
    report(progress("Setting type", 60));

    let pages = render::document_to_svg_pages(&document);
    report(progress("Rendering pages", 85));

    let bytes = match format {
        Format::Pdf => render::document_to_pdf(&document)?,
        Format::Docx => docx::to_docx(doc, &template.docx, accent)?,
    };
    report(progress("Preparing the file", 100));

    Ok(Built {
        pages,
        bytes,
        suggested_name: suggested_name(doc, format),
        format,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn sample() -> ResumeDoc {
        crate::parse_text::parse_text(
            "Ada Lovelace\nada@example.com\n\nEXPERIENCE\nAnalyst, Admiralty\nJan 2021 - Present\n- Wrote the first algorithm\n",
        )
    }

    fn record(format: Format) -> (Built, Vec<Progress>) {
        let seen = Mutex::new(Vec::new());
        let built = build(
            &sample(),
            templates::find("column").unwrap(),
            format,
            "ink",
            true,
            |p| seen.lock().unwrap().push(p),
        )
        .unwrap();
        (built, seen.into_inner().unwrap())
    }

    #[test]
    fn a_pdf_build_returns_a_pdf() {
        let (built, _) = record(Format::Pdf);
        assert!(built.bytes.starts_with(b"%PDF-"));
        assert_eq!(built.pages.len(), 1);
        assert!(built.pages[0].starts_with("<svg"));
    }

    #[test]
    fn a_docx_build_returns_a_word_file_and_still_previews_as_typst() {
        let (built, _) = record(Format::Docx);
        assert_eq!(&built.bytes[..2], b"PK");
        // The preview is always the Typst render — only the file differs.
        assert!(built.pages[0].starts_with("<svg"));
    }

    #[test]
    fn progress_only_ever_goes_forward_and_ends_at_exactly_one_hundred() {
        let (_, seen) = record(Format::Pdf);
        assert!(!seen.is_empty(), "nothing was reported");
        assert_eq!(seen.last().unwrap().percent, 100);
        for pair in seen.windows(2) {
            assert!(
                pair[1].percent > pair[0].percent,
                "{} ({}) did not advance past {} ({})",
                pair[1].stage,
                pair[1].percent,
                pair[0].stage,
                pair[0].percent
            );
        }
    }

    #[test]
    fn every_stage_is_named_in_plain_words() {
        let (_, seen) = record(Format::Pdf);
        let stages: Vec<&str> = seen.iter().map(|p| p.stage.as_str()).collect();
        assert_eq!(
            stages,
            vec![
                "Reading structure",
                "Tightening wording",
                "Setting type",
                "Rendering pages",
                "Preparing the file"
            ]
        );
    }

    /// Turning tightening off has to actually reach the page, or the toggle is
    /// decoration.
    #[test]
    fn tightening_changes_the_document_and_turning_it_off_does_not() {
        let doc = crate::parse_text::parse_text(
            "Ada Lovelace\n\nEXPERIENCE\nAnalyst, Admiralty\n2021 - 2022\n- Responsible for writing the parser\n",
        );
        let template = templates::find("column").unwrap();
        let on = build(&doc, template, Format::Pdf, "ink", true, |_| {}).unwrap();
        let off = build(&doc, template, Format::Pdf, "ink", false, |_| {}).unwrap();
        assert_ne!(on.pages, off.pages, "the tighten flag reached nothing");
    }

    #[test]
    fn the_filename_comes_from_the_persons_name() {
        assert_eq!(
            suggested_name(&sample(), Format::Pdf),
            "Ada-Lovelace-resume.pdf"
        );
        assert_eq!(
            suggested_name(&ResumeDoc::empty(), Format::Docx),
            "resume.docx"
        );
    }

    /// A name is user input and it ends up in a filename, so it must not be
    /// able to carry a path separator anywhere.
    #[test]
    fn a_name_cannot_smuggle_a_path_into_the_filename() {
        let mut doc = ResumeDoc::empty();
        doc.contact.name = "../../etc/passwd".into();
        let name = suggested_name(&doc, Format::Pdf);
        assert!(!name.contains('/'), "got {name}");
        assert!(!name.contains(".."), "got {name}");
    }

    #[test]
    fn an_unknown_format_is_rejected_with_a_next_step() {
        let err = Format::parse("rtf").unwrap_err();
        assert!(err.contains("Choose PDF or Word"), "got {err}");
    }
}
