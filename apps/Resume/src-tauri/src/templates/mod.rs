//! The template registry.
//!
//! A template is a Typst source compiled into the binary. It never receives the
//! resume as text — `source_for` hands the document to Typst as JSON on
//! `sys.inputs.resume`, and `prelude.typ` decodes it. That is why this file
//! contains no escaping: there is no string to escape into.

use crate::docx::{DocxStyle, Part, SectionSpec};
use crate::model::ResumeDoc;
use typst::foundations::{Dict, IntoValue, Str};

pub struct Template {
    pub id: &'static str,
    pub name: &'static str,
    pub source: &'static str,
    /// The same design expressed in Word's terms. Declared here, beside the
    /// Typst source, so the two halves of a template cannot drift apart.
    pub docx: DocxStyle,
    /// The sections this template prints, in order, under the names it gives
    /// them. Read by the DOCX half; checked against the Typst half by
    /// `sections_match_the_typst_source`, so the declaration cannot go stale.
    pub sections: &'static [SectionSpec],
}

const SERIF: &str = "Times New Roman";
const SANS: &str = "Arial";

use Part::{Awards, Education, Experience, Interests, Leadership, Projects, Skills, Summary};

/// The order eight of the twelve templates use. Named so the five that share it
/// say so, and the seven that do not are visibly different rather than
/// accidentally so.
const CLASSIC: &[SectionSpec] = &[
    SectionSpec { title: "Summary", parts: &[Summary] },
    SectionSpec { title: "Experience", parts: &[Experience] },
    SectionSpec { title: "Projects", parts: &[Projects] },
    SectionSpec { title: "Education", parts: &[Education] },
    SectionSpec { title: "Leadership & Activities", parts: &[Leadership] },
    SectionSpec { title: "Awards", parts: &[Awards] },
    SectionSpec { title: "Skills", parts: &[Skills] },
    SectionSpec { title: "Interests", parts: &[Interests] },
];

const BULLET_SECTIONS: &[SectionSpec] = &[
    SectionSpec { title: "Summary", parts: &[Summary] },
    SectionSpec { title: "Education", parts: &[Education] },
    SectionSpec { title: "Experience", parts: &[Experience] },
    SectionSpec { title: "Leadership & Activities", parts: &[Leadership] },
    SectionSpec { title: "Projects", parts: &[Projects] },
    SectionSpec { title: "Awards", parts: &[Awards] },
    SectionSpec { title: "Skills & Interests", parts: &[Skills, Interests] },
];

const BRIEF_SECTIONS: &[SectionSpec] = &[
    SectionSpec { title: "", parts: &[Summary] },
    SectionSpec { title: "Education", parts: &[Education] },
    SectionSpec { title: "Work Experience", parts: &[Experience] },
    SectionSpec { title: "Leadership Activities", parts: &[Leadership] },
    SectionSpec { title: "Projects", parts: &[Projects] },
    SectionSpec { title: "Additional", parts: &[Skills, Awards, Interests] },
];

const CHRONICLE_SECTIONS: &[SectionSpec] = &[
    SectionSpec { title: "Summary", parts: &[Summary] },
    SectionSpec { title: "Education", parts: &[Education] },
    SectionSpec { title: "Experience", parts: &[Experience] },
    SectionSpec { title: "Projects", parts: &[Projects] },
    SectionSpec { title: "Activities & Extracurriculars", parts: &[Leadership] },
    SectionSpec { title: "Awards & Accomplishments", parts: &[Awards] },
    SectionSpec { title: "Skills & Interests", parts: &[Skills, Interests] },
];

const INDEX_SECTIONS: &[SectionSpec] = &[
    SectionSpec { title: "Summary", parts: &[Summary] },
    SectionSpec { title: "Education", parts: &[Education] },
    SectionSpec { title: "Skills & Proficiencies", parts: &[Skills] },
    SectionSpec { title: "Professional Experience", parts: &[Experience] },
    SectionSpec { title: "Projects", parts: &[Projects] },
    SectionSpec { title: "Leadership Experience", parts: &[Leadership] },
    SectionSpec { title: "Awards", parts: &[Awards] },
    SectionSpec { title: "Interests", parts: &[Interests] },
];

const TIMELINE_SECTIONS: &[SectionSpec] = &[
    SectionSpec { title: "Summary", parts: &[Summary] },
    SectionSpec { title: "Top Skills", parts: &[Skills] },
    SectionSpec { title: "Work Experience", parts: &[Experience] },
    SectionSpec { title: "Projects", parts: &[Projects] },
    SectionSpec { title: "Education", parts: &[Education] },
    SectionSpec { title: "Leadership & Activities", parts: &[Leadership] },
    SectionSpec { title: "Awards", parts: &[Awards] },
    SectionSpec { title: "Interests", parts: &[Interests] },
];

const BLEND_SECTIONS: &[SectionSpec] = &[
    SectionSpec { title: "", parts: &[Summary] },
    SectionSpec { title: "Skills and Accomplishments", parts: &[Skills] },
    SectionSpec { title: "Work Experience", parts: &[Experience] },
    SectionSpec { title: "Projects", parts: &[Projects] },
    SectionSpec { title: "Education", parts: &[Education] },
    SectionSpec { title: "Leadership & Activities", parts: &[Leadership] },
    SectionSpec { title: "Awards", parts: &[Awards] },
    SectionSpec { title: "Interests", parts: &[Interests] },
];

const LEAD_SECTIONS: &[SectionSpec] = &[
    SectionSpec { title: "", parts: &[Summary] },
    SectionSpec { title: "Core Competencies", parts: &[Skills] },
    SectionSpec { title: "Professional Experience", parts: &[Experience] },
    SectionSpec { title: "Selected Projects", parts: &[Projects] },
    SectionSpec { title: "Board & Leadership", parts: &[Leadership] },
    SectionSpec { title: "Education", parts: &[Education] },
    SectionSpec { title: "Awards", parts: &[Awards] },
    SectionSpec { title: "Interests", parts: &[Interests] },
];

const PRELUDE: &str = include_str!("prelude.typ");

const TEMPLATES: &[Template] = &[
    Template {
        id: "column",
        name: "Column",
        source: include_str!("column.typ"),
        docx: DocxStyle {
            font: SERIF,
            name_size: 38,
            body_size: 21,
            name_centered: true,
            section_rule: false,
            header_shading: None,
            date_rail: false,
        },
        sections: CLASSIC,
    },
    Template {
        id: "ledger",
        name: "Ledger",
        source: include_str!("ledger.typ"),
        docx: DocxStyle {
            font: SERIF,
            name_size: 36,
            body_size: 21,
            name_centered: false,
            section_rule: false,
            header_shading: None,
            date_rail: true,
        },
        sections: CLASSIC,
    },
    Template {
        id: "sheet",
        name: "Sheet",
        source: include_str!("sheet.typ"),
        docx: DocxStyle {
            font: SANS,
            name_size: 32,
            body_size: 20,
            name_centered: false,
            section_rule: false,
            header_shading: None,
            date_rail: false,
        },
        sections: CLASSIC,
    },
    Template {
        id: "rule",
        name: "Rule",
        source: include_str!("rule.typ"),
        docx: DocxStyle {
            font: SERIF,
            name_size: 40,
            body_size: 21,
            name_centered: false,
            section_rule: true,
            header_shading: None,
            date_rail: false,
        },
        sections: CLASSIC,
    },
    Template {
        id: "card",
        name: "Card",
        source: include_str!("card.typ"),
        docx: DocxStyle {
            font: SANS,
            name_size: 40,
            body_size: 20,
            name_centered: false,
            section_rule: false,
            header_shading: Some(crate::accent::SHADING),
            date_rail: false,
        },
        sections: CLASSIC,
    },
    Template {
        id: "bullet",
        name: "Bullet",
        source: include_str!("bullet.typ"),
        docx: DocxStyle {
            font: SERIF,
            name_size: 24,
            body_size: 21,
            name_centered: true,
            section_rule: true,
            header_shading: None,
            date_rail: false,
        },
        sections: BULLET_SECTIONS,
    },
    Template {
        id: "brief",
        name: "Brief",
        source: include_str!("brief.typ"),
        docx: DocxStyle {
            font: SANS,
            name_size: 30,
            body_size: 20,
            name_centered: true,
            section_rule: true,
            header_shading: None,
            date_rail: false,
        },
        sections: BRIEF_SECTIONS,
    },
    Template {
        id: "chronicle",
        name: "Chronicle",
        source: include_str!("chronicle.typ"),
        docx: DocxStyle {
            font: SERIF,
            name_size: 28,
            body_size: 21,
            name_centered: true,
            section_rule: true,
            header_shading: None,
            date_rail: false,
        },
        sections: CHRONICLE_SECTIONS,
    },
    Template {
        id: "index",
        name: "Index",
        source: include_str!("index.typ"),
        docx: DocxStyle {
            font: SERIF,
            name_size: 28,
            body_size: 21,
            name_centered: false,
            section_rule: true,
            header_shading: None,
            date_rail: false,
        },
        sections: INDEX_SECTIONS,
    },
    Template {
        id: "timeline",
        name: "Timeline",
        source: include_str!("timeline.typ"),
        docx: DocxStyle {
            font: SERIF,
            name_size: 34,
            body_size: 21,
            name_centered: false,
            section_rule: false,
            header_shading: None,
            date_rail: false,
        },
        sections: TIMELINE_SECTIONS,
    },
    Template {
        id: "blend",
        name: "Blend",
        source: include_str!("blend.typ"),
        docx: DocxStyle {
            font: SANS,
            name_size: 40,
            body_size: 19,
            name_centered: false,
            section_rule: false,
            header_shading: None,
            date_rail: false,
        },
        sections: BLEND_SECTIONS,
    },
    Template {
        id: "lead",
        name: "Lead",
        source: include_str!("lead.typ"),
        docx: DocxStyle {
            font: SERIF,
            name_size: 36,
            body_size: 20,
            name_centered: true,
            section_rule: true,
            header_shading: None,
            date_rail: false,
        },
        sections: LEAD_SECTIONS,
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

/// The document and the chosen accent, as Typst sees them. The accent is
/// resolved through the closed set first, so a template can never receive a
/// value the user did not pick from the closed swatch set.
pub fn inputs_for(doc: &ResumeDoc, accent: &str) -> Result<Dict, String> {
    let json = serde_json::to_string(doc)
        .map_err(|e| format!("Could not prepare the resume for typesetting: {e}."))?;
    let mut inputs = Dict::new();
    inputs.insert(Str::from("resume"), json.into_value());
    inputs.insert(Str::from("accent"), crate::accent::resolve(accent).into_value());
    // The rest of the palette, so no template writes a colour of its own and
    // the Word twin cannot drift from the PDF.
    inputs.insert(Str::from("ink"), crate::accent::INK.into_value());
    inputs.insert(Str::from("quiet"), crate::accent::QUIET.into_value());
    inputs.insert(Str::from("shading"), crate::accent::SHADING.into_value());
    Ok(inputs)
}

/// One page of SVG per page of resume, for a given template.
pub fn to_svg_pages(
    template: &Template,
    doc: &ResumeDoc,
    accent: &str,
) -> Result<Vec<String>, String> {
    crate::render::svg_pages_with_inputs(source_for(template), inputs_for(doc, accent)?)
}

/// The standard library every template of one document shares. The resume and
/// the accent are the only things in it, so twelve style cards need one.
pub fn std_for(doc: &ResumeDoc, accent: &str) -> Result<crate::render::Std, String> {
    Ok(crate::render::Std::with_inputs(inputs_for(doc, accent)?))
}

/// The style card: page one only, from a library shared with every other card.
pub fn to_card(template: &Template, library: crate::render::Std) -> Result<Option<String>, String> {
    let document = crate::render::compile_with(source_for(template), library)?;
    Ok(crate::render::document_to_first_svg_page(&document))
}

/// The finished PDF for a given template. The build path goes through
/// `render::compile` directly, because it needs the compiled document for the
/// preview pages too — so this is the tests' way in, and nothing else's.
#[cfg(test)]
pub fn to_pdf(template: &Template, doc: &ResumeDoc, accent: &str) -> Result<Vec<u8>, String> {
    crate::render::pdf_with_inputs(source_for(template), inputs_for(doc, accent)?)
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
Portsmouth
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
- GPA 3.9
- Coursework: analysis, number theory

LEADERSHIP & ACTIVITIES
President, Mathematical Society
2018 - 2019
- Ran a weekly seminar for 60 members

AWARDS
De Morgan Medal
Dean's List

SKILLS
Technical: Rust, Analysis, Notation
Language: French, Latin

INTERESTS
Weaving, Music
";

    #[test]
    fn there_are_twelve_templates_and_their_ids_are_unique() {
        let ids: Vec<&str> = all().iter().map(|t| t.id).collect();
        assert_eq!(ids.len(), 12);
        let mut sorted = ids.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), 12, "duplicate id in {ids:?}");
    }

    #[test]
    fn find_resolves_a_known_id_and_rejects_an_unknown_one() {
        assert_eq!(find("column").map(|t| t.name), Some("Column"));
        assert!(find("nonesuch").is_none());
    }

    /// The declaration and the Typst source have to say the same thing, or the
    /// Word file goes back to being a different document from the PDF.
    ///
    /// The `.typ` file is the design; `sections` is the machine-readable copy
    /// the DOCX half reads. This pulls every `#section("…")` out of the source
    /// in order and holds the two side by side. Reorder a template, rename one
    /// of its headings, or add a section, and this fails by name.
    ///
    /// Unlabelled parts — the three templates that open on the summary with no
    /// heading — carry an empty title and are skipped here, because the source
    /// has no `#section` call to match them against.
    #[test]
    fn sections_match_the_typst_source() {
        for template in TEMPLATES {
            let in_source: Vec<&str> = template
                .source
                .match_indices("#section(\"")
                .map(|(at, marker)| {
                    let rest = &template.source[at + marker.len()..];
                    &rest[..rest.find('"').expect("unterminated #section title")]
                })
                .collect();
            let declared: Vec<&str> = template
                .sections
                .iter()
                .map(|s| s.title)
                .filter(|title| !title.is_empty())
                .collect();
            assert_eq!(
                declared, in_source,
                "template `{}`: `sections` and {}.typ disagree",
                template.id, template.id
            );
        }
    }

    /// Every part of the document reaches Word in some section. A part left out
    /// of a template's declaration is content silently dropped from the .docx.
    #[test]
    fn every_template_carries_every_part() {
        use crate::docx::Part::*;
        for template in TEMPLATES {
            for part in [
                Summary,
                Experience,
                Projects,
                Education,
                Leadership,
                Awards,
                Skills,
                Interests,
            ] {
                assert!(
                    template.sections.iter().any(|s| s.parts.contains(&part)),
                    "template `{}` never prints {part:?}",
                    template.id
                );
            }
        }
    }

    #[test]
    fn every_registered_template_compiles_with_an_empty_document() {
        for template in all() {
            to_svg_pages(template, &ResumeDoc::empty(), "ink")
                .unwrap_or_else(|e| panic!("template {} failed on an empty doc: {e}", template.id));
        }
    }

    #[test]
    fn a_filled_resume_renders_one_page_in_every_template() {
        let doc = crate::parse_text::parse_text(SAMPLE_RESUME);
        for template in all() {
            let pages = to_svg_pages(template, &doc, "ink")
                .unwrap_or_else(|e| panic!("template {} failed: {e}", template.id));
            assert_eq!(pages.len(), 1, "{} paginated unexpectedly", template.id);
        }
    }

    /// The bug this catches, found by looking at a rendered page rather than by
    /// any test: in Typst's *markup* context `#text[Interests: ] + doc.x.join(", ")`
    /// does not concatenate — the `+ doc.x.join(", ")` is printed literally, onto
    /// someone's resume. Typst reports nothing, because it is valid markup.
    ///
    /// It cannot be caught in the output: Typst renders text as glyph outlines
    /// with no text layer, so the SVG cannot be read back. So this is a lint on
    /// the source, which is where the mistake actually lives.
    #[test]
    fn no_template_concatenates_in_markup_context() {
        for template in all() {
            for (number, line) in template.source.lines().enumerate() {
                assert!(
                    !line.contains("] + "),
                    "{}:{} concatenates in markup context, which prints the code:\n  {line}",
                    template.id,
                    number + 1
                );
            }
        }
    }

    /// The drift guard. A raw hex in a `.typ` file is a colour the Word half
    /// knows nothing about, and nothing else fails when the two disagree — the
    /// PDF and the .docx just quietly stop matching. Every colour must come
    /// from `accent.rs` through the prelude's `accent`, `ink`, `quiet` and
    /// `shading`.
    ///
    /// Mutation proof: put `rgb("#111111")` back into any template and only
    /// this test fails.
    #[test]
    fn no_template_writes_its_own_colour() {
        for template in all() {
            for (number, line) in template.source.lines().enumerate() {
                assert!(
                    !line.contains("rgb("),
                    "{}:{} writes its own colour; use the prelude's palette:\n  {line}",
                    template.id,
                    number + 1
                );
            }
        }
    }

    /// The prelude is the one file allowed to build a colour, and only from
    /// what Rust sent it — never from a literal of its own.
    #[test]
    fn the_prelude_takes_every_colour_from_rust() {
        for (number, line) in PRELUDE.lines().enumerate() {
            if !line.contains("rgb(") {
                continue;
            }
            assert!(
                line.contains("sys.inputs."),
                "prelude.typ:{} builds a colour from a literal:\n  {line}",
                number + 1
            );
        }
    }

    #[test]
    fn a_name_full_of_quotes_survives_the_round_trip() {
        let mut doc = ResumeDoc::empty();
        doc.contact.name = "Ada \"The Enchantress\" O'Byron \\ Lovelace".into();
        let svg = to_svg_pages(&all()[0], &doc, "ink").unwrap().remove(0);
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

    /// A heading that sits alone at the bottom of a page is a spacing failure.
    /// `sticky` keeps it with the entry under it. Mutation proof: drop
    /// `sticky: true` from any template's `section` and only this fails.
    #[test]
    fn every_section_heading_stays_with_the_entry_under_it() {
        for template in all() {
            assert!(
                template.source.contains("sticky: true"),
                "{}: section headings can sit alone at the bottom of a page",
                template.id
            );
        }
    }

    /// The accent has to actually reach the page, in every template — a
    /// swatch that changes nothing is worse than no swatch.
    #[test]
    fn choosing_an_accent_changes_every_template() {
        let doc = crate::parse_text::parse_text(SAMPLE_RESUME);
        for template in all() {
            let ink = to_svg_pages(template, &doc, "ink").unwrap();
            let navy = to_svg_pages(template, &doc, "navy").unwrap();
            assert_ne!(ink, navy, "{} ignores the accent", template.id);
        }
    }

    /// And an accent the user could not have chosen must change nothing at all.
    #[test]
    fn an_invented_accent_renders_exactly_like_ink() {
        let doc = crate::parse_text::parse_text(SAMPLE_RESUME);
        let ink = to_svg_pages(&all()[0], &doc, "ink").unwrap();
        let hostile = to_svg_pages(&all()[0], &doc, "hotpink").unwrap();
        assert_eq!(ink, hostile);
    }

    #[test]
    fn a_template_produces_a_real_pdf() {
        let doc = crate::parse_text::parse_text(SAMPLE_RESUME);
        let pdf = to_pdf(find("column").unwrap(), &doc, "ink").unwrap();
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
            let svg = super::to_svg_pages(template, &doc, "ink").unwrap().remove(0);
            let path = out.join(format!("{}.svg", template.id));
            std::fs::write(&path, svg).unwrap();
            // The PDF is what the user sends to an employer, and it is the only
            // one of the three that shows how the pages actually break.
            let pdf = super::to_pdf(template, &doc, "ink").unwrap();
            std::fs::write(out.join(format!("{}.pdf", template.id)), pdf).unwrap();
            let docx = crate::docx::to_docx(&doc, &template.docx, template.sections, "ink").unwrap();
            let docx_path = out.join(format!("{}.docx", template.id));
            std::fs::write(&docx_path, docx).unwrap();
            println!("wrote {} and {}", path.display(), docx_path.display());
        }
    }
}
