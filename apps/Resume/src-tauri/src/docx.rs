//! The Word half of every template.
//!
//! One writer, parameterised by a small `DocxStyle` that each template declares
//! beside its Typst source. Twelve hand-written builders would have drifted from
//! their PDF twins the first time a template changed; this way a template and
//! its Word version are one decision in one place.
//!
//! What this can promise: the same text, in the same order, in a metrically
//! identical face — so lines break where the PDF breaks them and the page count
//! matches. What it cannot promise is pixel identity. Word's spacing model is
//! its own, and the UI must not claim otherwise.

use crate::accent::{INK, QUIET};
use crate::model::{ResumeDoc, Role, School};
use crate::present::{contact_line, date_range, role_heading};
use docx_rs::*;
use std::io::Cursor;

/// One part of the document a section can carry.
///
/// A section is not one-to-one with a field: `brief` prints skills, awards and
/// interests together under "Additional", and `bullet` folds skills and
/// interests into "Skills & Interests".
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Part {
    Summary,
    Experience,
    Projects,
    Education,
    Leadership,
    Awards,
    Skills,
    Interests,
}

/// One section of the finished document: what it is called and what it holds.
///
/// An empty title prints the part with no heading, which is how `blend`,
/// `brief` and `lead` open with the summary.
pub struct SectionSpec {
    pub title: &'static str,
    pub parts: &'static [Part],
}

/// Everything that differs between the twelve templates, in Word's terms.
#[derive(Debug, Clone, Copy)]
pub struct DocxStyle {
    /// Metric twin of the Liberation face the PDF uses.
    pub font: &'static str,
    /// Half-points, which is what Word counts in.
    pub name_size: usize,
    pub body_size: usize,
    pub name_centered: bool,
    /// A hairline under each section heading, as in the `rule` template.
    pub section_rule: bool,
    /// A shaded block behind the name, as in the `card` template.
    pub header_shading: Option<&'static str>,
    /// Dates in a left rail rather than flush right, as in `ledger`.
    pub date_rail: bool,
}

/// Word measures paragraph spacing in twentieths of a point. It defaults to
/// none, which is why an unstyled .docx reads as a text dump rather than a
/// document — every gap below is one we chose.
const SECTION_BEFORE: u32 = 220;
const ENTRY_BEFORE: u32 = 120;

fn spaced(paragraph: Paragraph, before: u32, after: u32) -> Paragraph {
    paragraph.line_spacing(LineSpacing::new().before(before).after(after))
}

fn run(text: &str, style: &DocxStyle) -> Run {
    Run::new()
        .add_text(text)
        .fonts(RunFonts::new().ascii(style.font).hi_ansi(style.font))
        .size(style.body_size)
        // Stated, not left to Word. Its automatic black is not the PDF's ink,
        // and the difference only shows once the two files sit side by side.
        .color(INK)
}

fn body(text: &str, style: &DocxStyle) -> Paragraph {
    Paragraph::new().add_run(run(text, style))
}

fn bold(text: &str, style: &DocxStyle) -> Paragraph {
    Paragraph::new().add_run(run(text, style).bold())
}

fn quiet(text: &str, style: &DocxStyle) -> Paragraph {
    Paragraph::new().add_run(run(text, style).color(QUIET))
}

/// A section heading, with the hairline underneath when the style asks for one.
/// Word has no paragraph border in this writer's vocabulary, so the rule is a
/// one-cell borderless table carrying a bottom edge — which is also exactly how
/// Word itself draws a heading rule.
fn section(title: &str, style: &DocxStyle, accent: &str) -> Vec<DocumentChild> {
    let heading = Paragraph::new().add_run(
        Run::new()
            .add_text(title.to_uppercase())
            .fonts(RunFonts::new().ascii(style.font).hi_ansi(style.font))
            .size(style.body_size)
            .color(accent)
            .bold(),
    );
    let heading = spaced(heading, SECTION_BEFORE, 40);
    if !style.section_rule {
        return vec![DocumentChild::Paragraph(Box::new(heading))];
    }
    // `Table::new` draws a full box. The rule is one edge, so the table itself
    // must carry no borders and the cell supplies the single bottom line.
    let ruled = Table::without_borders(vec![TableRow::new(vec![TableCell::new()
        .add_paragraph(heading)
        .set_borders(
            TableCellBorders::with_empty().set(
                TableCellBorder::new(TableCellBorderPosition::Bottom)
                    .size(4)
                    .color(QUIET.to_string()),
            ),
        )])])
    .width(9350, WidthType::Dxa);
    vec![DocumentChild::Table(Box::new(ruled))]
}

fn para(paragraph: Paragraph) -> DocumentChild {
    DocumentChild::Paragraph(Box::new(paragraph))
}

fn add_child(file: Docx, child: DocumentChild) -> Docx {
    match child {
        DocumentChild::Table(table) => file.add_table(*table),
        DocumentChild::Paragraph(paragraph) => file.add_paragraph(*paragraph),
        _ => file,
    }
}

/// Title flush left, dates flush right — the same row the Typst half draws.
/// Word has no grid, so this is a two-cell borderless table. Location is a
/// different field and sits on the next line, not in the date cell; putting
/// both on the right is what used to crush a long heading into a dump.
fn heading_and_dates(heading: Paragraph, dates: &str, style: &DocxStyle) -> Vec<DocumentChild> {
    if dates.is_empty() {
        return vec![para(heading)];
    }
    let dates_cell = quiet(dates, style).align(AlignmentType::Right);
    let table = Table::without_borders(vec![TableRow::new(vec![
        TableCell::new()
            .add_paragraph(heading)
            .width(6800, WidthType::Dxa)
            .set_borders(TableCellBorders::with_empty()),
        TableCell::new()
            .add_paragraph(dates_cell)
            .width(2550, WidthType::Dxa)
            .set_borders(TableCellBorders::with_empty()),
    ])])
    .width(9350, WidthType::Dxa);
    vec![DocumentChild::Table(Box::new(table))]
}

fn role_block(role: &Role, style: &DocxStyle) -> Vec<DocumentChild> {
    let mut out = Vec::new();
    let dates = date_range(&role.start.raw, &role.end.raw, role.end.present);
    let heading = role_heading(role);

    if style.date_rail {
        if !dates.is_empty() {
            out.push(para(spaced(quiet(&dates, style), ENTRY_BEFORE, 0)));
        }
        out.push(para(bold(&heading, style)));
        if !role.location.is_empty() {
            out.push(para(quiet(&role.location, style)));
        }
    } else {
        out.extend(heading_and_dates(
            spaced(bold(&heading, style), ENTRY_BEFORE, 0),
            &dates,
            style,
        ));
        if !role.location.is_empty() {
            out.push(para(quiet(&role.location, style)));
        }
    }
    for bullet in role.bullets.iter().filter(|b| !b.text.is_empty()) {
        out.push(para(
            body(&format!("• {}", bullet.text), style).indent(Some(240), None, None, None),
        ));
    }
    out
}

fn school_block(school: &School, style: &DocxStyle) -> Vec<DocumentChild> {
    let dates = date_range(&school.start.raw, &school.end.raw, school.end.present);
    let mut out = if style.date_rail {
        let mut rail = Vec::new();
        if !dates.is_empty() {
            rail.push(para(spaced(quiet(&dates, style), ENTRY_BEFORE, 0)));
        }
        rail.push(para(bold(&school.institution, style)));
        rail
    } else {
        heading_and_dates(
            spaced(bold(&school.institution, style), ENTRY_BEFORE, 0),
            &dates,
            style,
        )
    };
    if !school.credential.is_empty() {
        out.push(para(body(&school.credential, style)));
    }
    if !school.location.is_empty() {
        out.push(para(quiet(&school.location, style)));
    }
    // A thesis, a GPA, a line of coursework: the Typst half has always shown
    // these, and the Word half used to drop them on the floor.
    for note in school.notes.iter().filter(|note| !note.text.is_empty()) {
        out.push(para(
            body(&format!("• {}", note.text), style).indent(Some(240), None, None, None),
        ));
    }
    out
}

/// Every block one part of the document contributes, already styled.
fn children_for(part: Part, doc: &ResumeDoc, style: &DocxStyle) -> Vec<DocumentChild> {
    match part {
        Part::Summary if doc.summary.is_empty() => Vec::new(),
        Part::Summary => vec![para(body(&doc.summary, style))],
        Part::Experience => doc.experience.iter().flat_map(|r| role_block(r, style)).collect(),
        Part::Projects => doc.projects.iter().flat_map(|r| role_block(r, style)).collect(),
        Part::Leadership => doc.leadership.iter().flat_map(|r| role_block(r, style)).collect(),
        Part::Education => doc.education.iter().flat_map(|s| school_block(s, style)).collect(),
        Part::Awards => doc.awards.iter().map(|a| para(body(a, style))).collect(),
        Part::Skills => doc
            .skills
            .iter()
            .map(|group| {
                let line = if group.label.is_empty() {
                    group.items.join(" · ")
                } else {
                    format!("{}: {}", group.label, group.items.join(", "))
                };
                para(body(&line, style))
            })
            .collect(),
        Part::Interests if doc.interests.is_empty() => Vec::new(),
        Part::Interests => vec![para(body(&doc.interests.join(" · "), style))],
    }
}

pub fn to_docx(
    doc: &ResumeDoc,
    style: &DocxStyle,
    sections: &[SectionSpec],
    accent: &str,
) -> Result<Vec<u8>, String> {
    let accent = crate::accent::resolve(accent);
    let mut file = Docx::new();

    // The name block.
    let mut name = Paragraph::new().add_run(
        Run::new()
            .add_text(&doc.contact.name)
            .fonts(RunFonts::new().ascii(style.font).hi_ansi(style.font))
            .size(style.name_size)
            .color(INK)
            .bold(),
    );
    let mut contact = spaced(quiet(&contact_line(doc), style), 0, 60);
    if style.name_centered {
        name = name.align(AlignmentType::Center);
        contact = contact.align(AlignmentType::Center);
    }

    match style.header_shading {
        Some(fill) => {
            let block = Table::without_borders(vec![TableRow::new(vec![TableCell::new()
                .add_paragraph(name)
                .add_paragraph(contact)
                .shading(Shading::new().fill(fill))
                .set_borders(TableCellBorders::with_empty())])])
            .width(9350, WidthType::Dxa);
            file = file.add_table(block);
        }
        None => {
            file = file.add_paragraph(name).add_paragraph(contact);
        }
    }

    let push_section = |mut file: Docx, title: &str| -> Docx {
        for child in section(title, style, accent) {
            file = add_child(file, child);
        }
        file
    };

    if !doc.headline.is_empty() {
        file = file.add_paragraph(spaced(bold(&doc.headline, style), ENTRY_BEFORE, 40));
    }

    // The sections, in the order this template puts them, under the names this
    // template gives them. Both come from the template's own declaration, which
    // `templates::sections_match_the_typst_source` binds to the `.typ` file.
    //
    // This used to be one hardcoded order with one set of headings, run for all
    // twelve. Seven of them order their sections differently — `brief` leads
    // with Education and calls Experience "Work Experience"; `lead` opens on
    // "Core Competencies" — so for those seven the Word file was a different
    // document from the PDF, and the FACTS test could not see it because it
    // asserts membership rather than sequence.
    for spec in sections {
        let children: Vec<DocumentChild> = spec
            .parts
            .iter()
            .flat_map(|part| children_for(*part, doc, style))
            .collect();
        if children.is_empty() {
            continue;
        }
        if !spec.title.is_empty() {
            file = push_section(file, spec.title);
        }
        for child in children {
            file = add_child(file, child);
        }
    }

    let mut buffer = Cursor::new(Vec::new());
    file.build()
        .pack(&mut buffer)
        .map_err(|e| format!("Could not write the Word file: {e}."))?;
    Ok(buffer.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixtures::{sample_resume, FACTS};
    use crate::templates;

    const SERIF: DocxStyle = DocxStyle {
        font: "Times New Roman",
        name_size: 38,
        body_size: 21,
        name_centered: true,
        section_rule: false,
        header_shading: None,
        date_rail: false,
    };

    /// The order the five plainest templates use. Tests that are about the
    /// writer rather than about one template's layout run against this.
    const CLASSIC_FOR_TESTS: &[SectionSpec] = &[
        SectionSpec { title: "Summary", parts: &[Part::Summary] },
        SectionSpec { title: "Experience", parts: &[Part::Experience] },
        SectionSpec { title: "Projects", parts: &[Part::Projects] },
        SectionSpec { title: "Education", parts: &[Part::Education] },
        SectionSpec { title: "Leadership & Activities", parts: &[Part::Leadership] },
        SectionSpec { title: "Awards", parts: &[Part::Awards] },
        SectionSpec { title: "Skills", parts: &[Part::Skills] },
        SectionSpec { title: "Interests", parts: &[Part::Interests] },
    ];

    fn sample() -> ResumeDoc {
        sample_resume()
    }

    /// A .docx is a zip, and every zip starts "PK".
    #[test]
    fn produces_a_file_word_would_recognise() {
        let bytes = to_docx(&sample(), &SERIF, CLASSIC_FOR_TESTS, "ink").unwrap();
        assert_eq!(&bytes[..2], b"PK", "not a zip archive");
        assert!(bytes.len() > 2000, "suspiciously small: {}", bytes.len());
    }

    #[test]
    fn an_empty_document_still_produces_a_valid_file() {
        let bytes = to_docx(&ResumeDoc::empty(), &SERIF, CLASSIC_FOR_TESTS, "ink").unwrap();
        assert_eq!(&bytes[..2], b"PK");
    }

    /// Line breaks and capitals are layout decisions, not content ones — a
    /// narrow template may split "Wrote the first algorithm" across two lines,
    /// and several set headings and names in `upper()`. Folding both away asks
    /// the question that matters: is the fact there at all?
    fn squashed(text: &str) -> String {
        text.chars()
            .filter(|c| !c.is_whitespace())
            .flat_map(char::to_lowercase)
            .collect()
    }

    /// The point of the whole exporter: nothing the user typed may be lost on
    /// the way to Word. The document XML is inside the zip, so read it back.
    #[test]
    fn every_fact_reaches_the_word_file() {
        let bytes = to_docx(&sample(), &SERIF, CLASSIC_FOR_TESTS, "ink").unwrap();
        let text = squashed(&document_xml(&bytes));
        for expected in FACTS {
            assert!(
                text.contains(&squashed(expected)),
                "Word file is missing {expected:?}"
            );
        }
    }

    /// The headings, in the order the template puts them, actually reach the
    /// Word file.
    ///
    /// `FACTS` asserts membership after squashing case and whitespace, so
    /// it could never see order — which is how seven templates came to write a
    /// Word file whose sections ran in a different order, under different
    /// names, from their own PDF. This reads the headings back out of the .docx
    /// and holds them against the declaration.
    #[test]
    fn the_word_file_follows_the_template_order() {
        let doc = sample();
        for template in templates::all() {
            let xml = document_xml(
                &to_docx(&doc, &template.docx, template.sections, "ink").unwrap(),
            );
            // A section with nothing in it prints no heading — the sample
            // carries no summary, so "SUMMARY" is legitimately absent. What is
            // asserted is the order of the headings that are there.
            let mut at = 0usize;
            let mut seen: Vec<&str> = Vec::new();
            for spec in template.sections.iter().filter(|s| !s.title.is_empty()) {
                // The heading is written into XML, where "&" is "&amp;" — half
                // these titles contain one.
                let title = spec.title.to_uppercase().replace('&', "&amp;");
                let Some(found) = xml[at..].find(&title) else {
                    assert!(
                        !xml.contains(&title),
                        "{}: heading {title:?} appears out of order — expected it after {seen:?}",
                        template.id
                    );
                    continue;
                };
                at += found + title.len();
                seen.push(spec.title);
            }
            assert!(
                seen.len() >= 5,
                "{}: only {} headings found, so this asserted almost nothing",
                template.id,
                seen.len()
            );
        }
    }

    /// Risk 1 in the spec: every template is built twice, by two engines, and
    /// "a test asserting the two carry the same content" is the only thing
    /// stopping them drifting. Until this existed each half was only ever
    /// checked against itself, so a template could drop a whole section from
    /// one of them and stay green.
    ///
    /// Mutation proof: delete the education block from any `.typ` template and
    /// only this test fails.
    #[test]
    fn every_template_carries_the_same_facts_in_both_halves() {
        let doc = sample();
        for template in templates::all() {
            let pdf = crate::templates::to_pdf(template, &doc, "ink")
                .unwrap_or_else(|e| panic!("{} produced no PDF: {e}", template.id));
            let from_pdf = squashed(
                &crate::import::pdf::text_from_pdf(&pdf)
                    .unwrap_or_else(|e| panic!("{} produced an unreadable PDF: {e}", template.id)),
            );
            let from_word = squashed(&document_xml(
                &to_docx(&doc, &template.docx, template.sections, "ink").unwrap(),
            ));

            for fact in FACTS {
                let fact = squashed(fact);
                assert!(
                    from_pdf.contains(&fact),
                    "{} PDF is missing {fact:?}",
                    template.id
                );
                assert!(
                    from_word.contains(&fact),
                    "{} Word file is missing {fact:?}",
                    template.id
                );
            }
        }
    }

    #[test]
    fn every_template_declares_a_word_twin_that_builds() {
        for template in templates::all() {
            let bytes = to_docx(&sample(), &template.docx, template.sections, "ink")
                .unwrap_or_else(|e| panic!("{} has no working Word twin: {e}", template.id));
            assert_eq!(&bytes[..2], b"PK", "{} produced no zip", template.id);
        }
    }

    /// Word's automatic black is not the PDF's ink. Nothing failed while the
    /// two halves disagreed — the difference only appears with both files open
    /// side by side, which is exactly when a user notices it.
    ///
    /// The invariant is "no run is left to Word", not "the ink appears
    /// somewhere" — the name and the section headings carry colours of their
    /// own, so merely finding `111111` in the file proves nothing about body
    /// text. Every run's properties must name a colour.
    ///
    /// Mutation proof: drop `.color(INK)` from `run` and only this test fails.
    #[test]
    fn no_run_leaves_its_colour_to_word() {
        let xml = document_xml(&to_docx(&sample(), &SERIF, CLASSIC_FOR_TESTS, "navy").unwrap());
        for (index, block) in xml.split("<w:rPr>").skip(1).enumerate() {
            let properties = block.split("</w:rPr>").next().unwrap_or("");
            assert!(
                properties.contains("<w:color"),
                "run {index} sets no colour, so Word picks its own:\n  {properties}"
            );
        }
    }

    /// And the colour it names for body text is the PDF's ink, not something
    /// close to it.
    #[test]
    fn body_text_is_set_in_the_same_ink_as_the_pdf() {
        let xml = document_xml(&to_docx(&sample(), &SERIF, CLASSIC_FOR_TESTS, "navy").unwrap());
        assert!(
            xml.contains(&format!(r#"<w:color w:val="{INK}""#)),
            "body text is not set in the PDF's ink"
        );
    }

    /// The shaded name block in `card` is declared in Rust and drawn in Typst.
    /// One constant reaches both, or the two halves shade differently.
    #[test]
    fn the_shaded_header_uses_the_shared_value() {
        let card = templates::find("card").unwrap();
        assert_eq!(card.docx.header_shading, Some(crate::accent::SHADING));
    }

    #[test]
    fn the_declared_font_is_the_one_written_into_the_file() {
        let bytes = to_docx(&sample(), &SERIF, CLASSIC_FOR_TESTS, "ink").unwrap();
        assert!(document_xml(&bytes).contains("Times New Roman"));
    }

    /// Mutation proof: stack dates under the heading again (plain paragraphs,
    /// no right-aligned cell) and only this fails. The dump that produced was
    /// why a Word export looked like a different document from the PDF.
    #[test]
    fn dates_sit_flush_right_of_the_heading() {
        let xml = document_xml(&to_docx(&sample(), &SERIF, CLASSIC_FOR_TESTS, "ink").unwrap());
        assert!(
            xml.contains(r#"<w:jc w:val="right""#) || xml.contains(r#"w:val="right""#),
            "dates are not aligned to the right of the heading"
        );
        assert!(
            xml.matches("<w:tc").count() >= 4,
            "heading rows are not two-cell tables"
        );
    }

    fn document_xml(bytes: &[u8]) -> String {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes.to_vec())).unwrap();
        let mut file = archive.by_name("word/document.xml").unwrap();
        let mut text = String::new();
        std::io::Read::read_to_string(&mut file, &mut text).unwrap();
        text
    }
}
