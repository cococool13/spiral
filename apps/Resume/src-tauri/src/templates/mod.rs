//! The template registry.
//!
//! A template is a Typst source compiled into the binary. It never receives the
//! resume as text — `source_for` hands the document to Typst as JSON on
//! `sys.inputs.resume`, and `prelude.typ` decodes it. That is why this file
//! contains no escaping: there is no string to escape into.

use crate::model::ResumeDoc;
use typst::foundations::{Dict, IntoValue, Str};

pub struct Template {
    pub id: &'static str,
    pub name: &'static str,
    pub source: &'static str,
}

const PRELUDE: &str = include_str!("prelude.typ");

const TEMPLATES: &[Template] = &[
    Template {
        id: "column",
        name: "Column",
        source: include_str!("column.typ"),
    },
    Template {
        id: "ledger",
        name: "Ledger",
        source: include_str!("ledger.typ"),
    },
    Template {
        id: "sheet",
        name: "Sheet",
        source: include_str!("sheet.typ"),
    },
    Template {
        id: "rule",
        name: "Rule",
        source: include_str!("rule.typ"),
    },
    Template {
        id: "card",
        name: "Card",
        source: include_str!("card.typ"),
    },
];

pub fn all() -> &'static [Template] {
    TEMPLATES
}

pub fn find(id: &str) -> Option<&'static Template> {
    TEMPLATES.iter().find(|template| template.id == id)
}

/// The source a template compiles from: the shared prelude, then the template.
pub fn source_for(template: &Template) -> String {
    format!("{PRELUDE}\n{}", template.source)
}

/// The document, as Typst sees it. One key, one JSON string.
pub fn inputs_for(doc: &ResumeDoc) -> Result<Dict, String> {
    let json = serde_json::to_string(doc)
        .map_err(|e| format!("Could not prepare the resume for typesetting: {e}."))?;
    let mut inputs = Dict::new();
    inputs.insert(Str::from("resume"), json.into_value());
    Ok(inputs)
}

/// One page of SVG per page of resume, for a given template.
pub fn to_svg_pages(template: &Template, doc: &ResumeDoc) -> Result<Vec<String>, String> {
    crate::render::svg_pages_with_inputs(source_for(template), inputs_for(doc)?)
}

/// The finished PDF for a given template.
pub fn to_pdf(template: &Template, doc: &ResumeDoc) -> Result<Vec<u8>, String> {
    crate::render::pdf_with_inputs(source_for(template), inputs_for(doc)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ResumeDoc;

    pub(super) const SAMPLE_RESUME: &str = "\
Ada Lovelace
ada@example.com · (555) 123-4567 · London

SUMMARY
Analytical engine programmer with a bias for provable results.

EXPERIENCE
Analyst, Admiralty
Jan 2021 - Present
- Wrote the first published algorithm
- Cut report turnaround from 9 days to 2

Intern, Difference Works
Jun 2020 - Dec 2020
- Checked 400 tables of logarithms

EDUCATION
University of London
BSc Mathematics
2016 - 2019

SKILLS
Rust, Analysis, Notation
";

    #[test]
    fn there_are_five_templates_and_their_ids_are_unique() {
        let ids: Vec<&str> = all().iter().map(|t| t.id).collect();
        assert_eq!(ids.len(), 5);
        let mut sorted = ids.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), 5, "duplicate id in {ids:?}");
    }

    #[test]
    fn find_resolves_a_known_id_and_rejects_an_unknown_one() {
        assert_eq!(find("column").map(|t| t.name), Some("Column"));
        assert!(find("nonesuch").is_none());
    }

    #[test]
    fn every_registered_template_compiles_with_an_empty_document() {
        for template in all() {
            to_svg_pages(template, &ResumeDoc::empty())
                .unwrap_or_else(|e| panic!("template {} failed on an empty doc: {e}", template.id));
        }
    }

    #[test]
    fn a_filled_resume_renders_one_page_in_every_template() {
        let doc = crate::parse_text::parse_text(SAMPLE_RESUME);
        for template in all() {
            let pages = to_svg_pages(template, &doc)
                .unwrap_or_else(|e| panic!("template {} failed: {e}", template.id));
            assert_eq!(pages.len(), 1, "{} paginated unexpectedly", template.id);
        }
    }

    #[test]
    fn a_name_full_of_quotes_survives_the_round_trip() {
        let mut doc = ResumeDoc::empty();
        doc.contact.name = "Ada \"The Enchantress\" O'Byron \\ Lovelace".into();
        let svg = to_svg_pages(&all()[0], &doc).unwrap().remove(0);
        assert!(svg.starts_with("<svg"), "a quoted name broke the render");
    }

    #[test]
    fn no_template_reaches_for_a_face_we_do_not_ship() {
        for template in all() {
            for line in template.source.lines().filter(|l| l.contains("font:")) {
                assert!(
                    line.contains("Liberation Serif") || line.contains("Liberation Sans"),
                    "{} sets a font we do not bundle: {line}",
                    template.id
                );
            }
        }
    }

    #[test]
    fn a_template_produces_a_real_pdf() {
        let doc = crate::parse_text::parse_text(SAMPLE_RESUME);
        let pdf = to_pdf(find("column").unwrap(), &doc).unwrap();
        assert!(pdf.starts_with(b"%PDF-"));
    }
}

#[cfg(test)]
mod dump {
    /// Not a test of behaviour — a way to look at the output. Run with:
    /// `cargo test --lib templates::dump -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn write_every_template_to_the_scratchpad() {
        let doc = crate::parse_text::parse_text(super::tests::SAMPLE_RESUME);
        let dir = std::env::var("SPIRAL_RESUME_DUMP_DIR")
            .expect("set SPIRAL_RESUME_DUMP_DIR to the folder to write the previews into");
        let out = std::path::Path::new(&dir);
        std::fs::create_dir_all(out).unwrap();
        for template in super::all() {
            let svg = super::to_svg_pages(template, &doc).unwrap().remove(0);
            let path = out.join(format!("{}.svg", template.id));
            std::fs::write(&path, svg).unwrap();
            println!("wrote {}", path.display());
        }
    }
}
