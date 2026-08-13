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
use docx_rs::*;
use std::io::Cursor;

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

/// The twin of the prelude's `when-and-where`. The two halves have to agree,
/// and a location shown in the PDF and absent from the .docx is the same bug as
/// a template that never rendered it at all.
fn when_and_where(dates: &str, location: &str) -> String {
    [dates, location]
        .iter()
        .filter(|part| !part.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join(" · ")
}

fn role_block(role: &Role, style: &DocxStyle) -> Vec<Paragraph> {
    let mut out = Vec::new();
    let dates = date_range(&role.start.raw, &role.end.raw, role.end.present);
    let dates = when_and_where(&dates, &role.location);
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
    let dates = when_and_where(&dates, &school.location);
    if !dates.is_empty() {
        out.push(quiet(&dates, style));
    }
    // A thesis, a GPA, a line of coursework: the Typst half has always shown
    // these, and the Word half used to drop them on the floor.
    for note in school.notes.iter().filter(|note| !note.text.is_empty()) {
        out.push(body(&format!("• {}", note.text), style).indent(Some(240), None, None, None));
    }
    out
}

pub fn to_docx(doc: &ResumeDoc, style: &DocxStyle, accent: &str) -> Result<Vec<u8>, String> {
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
            file = match child {
                DocumentChild::Table(table) => file.add_table(*table),
                DocumentChild::Paragraph(paragraph) => file.add_paragraph(*paragraph),
                _ => file,
            };
        }
        file
    };

    if !doc.headline.is_empty() {
        file = file.add_paragraph(spaced(bold(&doc.headline, style), ENTRY_BEFORE, 40));
    }

    if !doc.summary.is_empty() {
        file = push_section(file, "Summary");
        file = file.add_paragraph(body(&doc.summary, style));
    }

    // The order a reader meets the entry sections, written once. Each is
    // already a list of paragraphs by the time it gets here, so the walk does
    // not care whether it holds roles or schools.
    for (title, paragraphs) in [
        (
            "Experience",
            doc.experience.iter().flat_map(|r| role_block(r, style)).collect::<Vec<_>>(),
        ),
        (
            "Projects",
            doc.projects.iter().flat_map(|r| role_block(r, style)).collect(),
        ),
        (
            "Education",
            doc.education.iter().flat_map(|s| school_block(s, style)).collect(),
        ),
        (
            "Leadership & Activities",
            doc.leadership.iter().flat_map(|r| role_block(r, style)).collect(),
        ),
    ] {
        if paragraphs.is_empty() {
            continue;
        }
        file = push_section(file, title);
        for paragraph in paragraphs {
            file = file.add_paragraph(paragraph);
        }
    }

    if !doc.awards.is_empty() {
        file = push_section(file, "Awards");
        for award in &doc.awards {
            file = file.add_paragraph(body(award, style));
        }
    }

    if !doc.skills.is_empty() {
        file = push_section(file, "Skills");
        for group in &doc.skills {
            let line = if group.label.is_empty() {
                group.items.join(" · ")
            } else {
                format!("{}: {}", group.label, group.items.join(", "))
            };
            file = file.add_paragraph(body(&line, style));
        }
    }

    if !doc.interests.is_empty() {
        file = push_section(file, "Interests");
        file = file.add_paragraph(body(&doc.interests.join(" · "), style));
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
            "Ada Lovelace\nada@example.com · London\n\nEXPERIENCE\nAnalyst, Admiralty\nPortsmouth\nJan 2021 - Present\n- Wrote the first algorithm\n\nPROJECTS\nDifference Engine\n- Drafted the notes\n\nEDUCATION\nUniversity of London\nBSc Mathematics\nCambridge\n2016 - 2019\n- GPA 3.9\n\nLEADERSHIP & ACTIVITIES\nPresident, Mathematical Society\n- Ran a weekly seminar\n\nAWARDS\nDe Morgan Medal\n\nSKILLS\nRust, Analysis\n\nINTERESTS\nWeaving\n",
        )
    }

    /// A .docx is a zip, and every zip starts "PK".
    #[test]
    fn produces_a_file_word_would_recognise() {
        let bytes = to_docx(&sample(), &SERIF, "ink").unwrap();
        assert_eq!(&bytes[..2], b"PK", "not a zip archive");
        assert!(bytes.len() > 2000, "suspiciously small: {}", bytes.len());
    }

    #[test]
    fn an_empty_document_still_produces_a_valid_file() {
        let bytes = to_docx(&ResumeDoc::empty(), &SERIF, "ink").unwrap();
        assert_eq!(&bytes[..2], b"PK");
    }

    /// One fact from every section, in one list, so the Word check and the
    /// PDF/Word twin check below cannot test different things. A section
    /// missing from here is a section a template may silently stop rendering.
    const FACTS: [&str; 21] = [
        "Ada Lovelace",
        "ada@example.com",
        "London",
        "Analyst",
        "Admiralty",
        "Portsmouth",
        "Jan 2021",
        "Present",
        "Wrote the first algorithm",
        "Difference Engine",
        "Drafted the notes",
        "University of London",
        "BSc Mathematics",
        "Cambridge",
        "GPA 3.9",
        "President",
        "Mathematical Society",
        "Ran a weekly seminar",
        "De Morgan Medal",
        "Rust",
        "Weaving",
    ];

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
        let bytes = to_docx(&sample(), &SERIF, "ink").unwrap();
        let text = squashed(&document_xml(&bytes));
        for expected in FACTS {
            assert!(
                text.contains(&squashed(expected)),
                "Word file is missing {expected:?}"
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
                &to_docx(&doc, &template.docx, "ink").unwrap(),
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
            let bytes = to_docx(&sample(), &template.docx, "ink")
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
        let xml = document_xml(&to_docx(&sample(), &SERIF, "navy").unwrap());
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
        let xml = document_xml(&to_docx(&sample(), &SERIF, "navy").unwrap());
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
        let bytes = to_docx(&sample(), &SERIF, "ink").unwrap();
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
