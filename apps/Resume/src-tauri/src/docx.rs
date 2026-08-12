//! The Word half of every template.
//!
//! One writer, parameterised by a small `DocxStyle` that each template declares
//! beside its Typst source. Five hand-written builders would have drifted from
//! their PDF twins the first time a template changed; this way a template and
//! its Word version are one decision in one place.
//!
//! What this can promise: the same text, in the same order, in a metrically
//! identical face — so lines break where the PDF breaks them and the page count
//! matches. What it cannot promise is pixel identity. Word's spacing model is
//! its own, and the UI must not claim otherwise.

use crate::model::{ResumeDoc, Role, School};
use docx_rs::*;
use std::io::Cursor;

/// Everything that differs between the five templates, in Word's terms.
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

const QUIET: &str = "555555";

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
fn section(title: &str, style: &DocxStyle) -> Vec<DocumentChild> {
    let heading = Paragraph::new().add_run(
        Run::new()
            .add_text(title.to_uppercase())
            .fonts(RunFonts::new().ascii(style.font).hi_ansi(style.font))
            .size(style.body_size)
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

/// "Jan 2021 — Present", matching `prelude.typ`'s `date-range` exactly. The two
/// must agree or the PDF and the DOCX would describe the same job differently.
fn date_range(role_start: &str, role_end: &str, present: bool) -> String {
    let end = if present && role_end.is_empty() {
        "Present"
    } else {
        role_end
    };
    match (role_start.is_empty(), end.is_empty()) {
        (true, true) => String::new(),
        (true, false) => end.to_string(),
        (false, true) => role_start.to_string(),
        (false, false) => format!("{role_start} — {end}"),
    }
}

fn role_heading(role: &Role) -> String {
    [role.title.as_str(), role.organization.as_str()]
        .iter()
        .filter(|part| !part.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join(", ")
}

fn contact_line(doc: &ResumeDoc) -> String {
    let mut parts = vec![
        doc.contact.email.clone(),
        doc.contact.phone.clone(),
        doc.contact.location.clone(),
    ];
    parts.extend(doc.contact.links.iter().cloned());
    parts
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
}

fn role_block(role: &Role, style: &DocxStyle) -> Vec<Paragraph> {
    let mut out = Vec::new();
    let dates = date_range(&role.start.raw, &role.end.raw, role.end.present);
    let heading = role_heading(role);

    if style.date_rail && !dates.is_empty() {
        out.push(spaced(quiet(&dates, style), ENTRY_BEFORE, 0));
        out.push(bold(&heading, style));
    } else {
        out.push(spaced(bold(&heading, style), ENTRY_BEFORE, 0));
        if !dates.is_empty() {
            out.push(quiet(&dates, style));
        }
    }
    for bullet in role.bullets.iter().filter(|b| !b.text.is_empty()) {
        out.push(body(&format!("• {}", bullet.text), style).indent(Some(240), None, None, None));
    }
    out
}

fn school_block(school: &School, style: &DocxStyle) -> Vec<Paragraph> {
    let mut out = vec![spaced(bold(&school.institution, style), ENTRY_BEFORE, 0)];
    if !school.credential.is_empty() {
        out.push(body(&school.credential, style));
    }
    let dates = date_range(&school.start.raw, &school.end.raw, school.end.present);
    if !dates.is_empty() {
        out.push(quiet(&dates, style));
    }
    out
}

pub fn to_docx(doc: &ResumeDoc, style: &DocxStyle) -> Result<Vec<u8>, String> {
    let mut file = Docx::new();

    // The name block.
    let mut name = Paragraph::new().add_run(
        Run::new()
            .add_text(&doc.contact.name)
            .fonts(RunFonts::new().ascii(style.font).hi_ansi(style.font))
            .size(style.name_size)
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
        for child in section(title, style) {
            file = match child {
                DocumentChild::Table(table) => file.add_table(*table),
                DocumentChild::Paragraph(paragraph) => file.add_paragraph(*paragraph),
                _ => file,
            };
        }
        file
    };

    if !doc.summary.is_empty() {
        file = push_section(file, "Summary");
        file = file.add_paragraph(body(&doc.summary, style));
    }

    if !doc.experience.is_empty() {
        file = push_section(file, "Experience");
        for role in &doc.experience {
            for paragraph in role_block(role, style) {
                file = file.add_paragraph(paragraph);
            }
        }
    }

    if !doc.projects.is_empty() {
        file = push_section(file, "Projects");
        for role in &doc.projects {
            for paragraph in role_block(role, style) {
                file = file.add_paragraph(paragraph);
            }
        }
    }

    if !doc.education.is_empty() {
        file = push_section(file, "Education");
        for school in &doc.education {
            for paragraph in school_block(school, style) {
                file = file.add_paragraph(paragraph);
            }
        }
    }

    if !doc.skills.is_empty() {
        file = push_section(file, "Skills");
        file = file.add_paragraph(body(&doc.skills.join(" · "), style));
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

    fn sample() -> ResumeDoc {
        crate::parse_text::parse_text(
            "Ada Lovelace\nada@example.com · London\n\nEXPERIENCE\nAnalyst, Admiralty\nJan 2021 - Present\n- Wrote the first algorithm\n\nEDUCATION\nUniversity of London\nBSc Mathematics\n\nSKILLS\nRust, Analysis\n",
        )
    }

    /// A .docx is a zip, and every zip starts "PK".
    #[test]
    fn produces_a_file_word_would_recognise() {
        let bytes = to_docx(&sample(), &SERIF).unwrap();
        assert_eq!(&bytes[..2], b"PK", "not a zip archive");
        assert!(bytes.len() > 2000, "suspiciously small: {}", bytes.len());
    }

    #[test]
    fn an_empty_document_still_produces_a_valid_file() {
        let bytes = to_docx(&ResumeDoc::empty(), &SERIF).unwrap();
        assert_eq!(&bytes[..2], b"PK");
    }

    /// The point of the whole exporter: nothing the user typed may be lost on
    /// the way to Word. The document XML is inside the zip, so read it back.
    #[test]
    fn every_fact_reaches_the_word_file() {
        let bytes = to_docx(&sample(), &SERIF).unwrap();
        let text = document_xml(&bytes);
        for expected in [
            "Ada Lovelace",
            "ada@example.com",
            "London",
            "Analyst",
            "Admiralty",
            "Jan 2021",
            "Present",
            "Wrote the first algorithm",
            "University of London",
            "BSc Mathematics",
            "Rust",
        ] {
            assert!(text.contains(expected), "Word file is missing {expected:?}");
        }
    }

    #[test]
    fn every_template_declares_a_word_twin_that_builds() {
        for template in templates::all() {
            let bytes = to_docx(&sample(), &template.docx)
                .unwrap_or_else(|e| panic!("{} has no working Word twin: {e}", template.id));
            assert_eq!(&bytes[..2], b"PK", "{} produced no zip", template.id);
        }
    }

    #[test]
    fn the_declared_font_is_the_one_written_into_the_file() {
        let bytes = to_docx(&sample(), &SERIF).unwrap();
        assert!(document_xml(&bytes).contains("Times New Roman"));
    }

    /// Dates must read identically to `prelude.typ`, or the PDF and the DOCX
    /// would describe the same job differently.
    #[test]
    fn dates_read_the_same_as_the_typst_prelude() {
        assert_eq!(date_range("Jan 2021", "", true), "Jan 2021 — Present");
        assert_eq!(date_range("2016", "2019", false), "2016 — 2019");
        assert_eq!(date_range("", "", false), "");
        assert_eq!(date_range("2019", "", false), "2019");
    }

    fn document_xml(bytes: &[u8]) -> String {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes.to_vec())).unwrap();
        let mut file = archive.by_name("word/document.xml").unwrap();
        let mut text = String::new();
        std::io::Read::read_to_string(&mut file, &mut text).unwrap();
        text
    }
}
