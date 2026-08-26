//! `.docx` → plain text.
//!
//! A Word file is a zip with an XML document inside, so reading one needs no
//! library — and reading it by hand is what lets us restore the two things the
//! parser depends on and Word does not store as characters:
//!
//! 1. **Line structure.** One `<w:p>` is one line. Runs (`<w:t>`) inside a
//!    paragraph concatenate with nothing between them, because Word splits runs
//!    for its own reasons — spell-check state, formatting — and inserting a
//!    space would break words in half.
//! 2. **Bullets.** A bullet in Word is a `<w:numPr>` property, not a character.
//!    Without putting a marker back, every achievement arrives as an ordinary
//!    line and `parse_text` reads a role's bullets as its location.

use regex::Regex;
use std::io::{Cursor, Read};
use std::sync::OnceLock;

const DOCUMENT: &str = "word/document.xml";

pub fn text_from_docx(bytes: &[u8]) -> Result<String, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes.to_vec()))
        .map_err(|_| "That file is not a Word document. Choose a .docx file.".to_string())?;
    let mut xml = String::new();
    // Read the names first: naming what the file actually is needs the whole
    // archive, and `by_name` holds a borrow of it while it fails.
    let names: Vec<String> = archive.file_names().map(str::to_string).collect();
    archive
        .by_name(DOCUMENT)
        .map_err(|_| other_zip(&names))?
        .read_to_string(&mut xml)
        .map_err(|e| format!("That Word file could not be read: {e}. Try saving it again."))?;
    Ok(text_from_document_xml(&xml))
}

/// Every modern document format is a zip, so "this is not a .docx" is not a
/// useful thing to tell someone holding a file that plainly is a document. The
/// names inside say which one it is, and each one has a different next step.
fn other_zip(names: &[String]) -> String {
    let has = |needle: &str| names.iter().any(|name| name.starts_with(needle));
    if has("content.xml") {
        return "That is an OpenDocument file (.odt), not a Word file. Save it as .docx or PDF, or paste the text instead.".to_string();
    }
    if has("Index/") || has("index.xml") || has("QuickLook/") {
        return "That is a Pages document. Open it in Pages and use Export To → Word or PDF, or paste the text instead.".to_string();
    }
    if has("ppt/") || has("xl/") {
        return "That is a slide deck or a spreadsheet, not a resume document. Choose a PDF or a Word file, or paste the text instead.".to_string();
    }
    "That Word file has no document inside it. Open it in Word, save it again, and retry.".to_string()
}

/// Walk the body as paragraphs and tables. A two-column table that is a date
/// rail (title | date) stays row-wise; a two-column *page* is read left column
/// then right, so the columns do not interleave.
pub fn text_from_document_xml(xml: &str) -> String {
    walk_blocks(xml)
        .into_iter()
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

enum Block {
    Para,
    Table,
}

fn walk_blocks(xml: &str) -> Vec<String> {
    let mut lines = Vec::new();
    let mut from = 0usize;
    while let Some((kind, start, end)) = next_block(xml, from) {
        match kind {
            Block::Para => lines.push(paragraph_text(&xml[start..end])),
            Block::Table => lines.extend(table_lines(&xml[start..end])),
        }
        from = end;
    }
    lines
}

fn next_block(xml: &str, from: usize) -> Option<(Block, usize, usize)> {
    let para = find_open(xml, from, "<w:p");
    let table = find_open(xml, from, "<w:tbl");
    match (para, table) {
        (None, None) => None,
        (Some(i), None) => Some((Block::Para, i, para_end(xml, i))),
        (None, Some(i)) => Some((Block::Table, i, match_end(xml, i, "<w:tbl", "</w:tbl>"))),
        (Some(p), Some(t)) if t <= p => {
            Some((Block::Table, t, match_end(xml, t, "<w:tbl", "</w:tbl>")))
        }
        (Some(p), Some(_)) => Some((Block::Para, p, para_end(xml, p))),
    }
}

fn find_open(xml: &str, from: usize, name: &str) -> Option<usize> {
    let mut search = from;
    while let Some(rel) = xml[search..].find(name) {
        let at = search + rel;
        if is_named_open(&xml[at..], name) {
            return Some(at);
        }
        search = at + name.len();
    }
    None
}

/// The name must be followed by `>`, space, or `/` so `<w:t` does not match
/// `<w:tab`, `<w:tbl`, or `<w:tc`. Matching on the prefix alone used to paste
/// raw XML onto the page.
fn is_named_open(s: &str, name: &str) -> bool {
    s.get(name.len()..)
        .and_then(|rest| rest.chars().next())
        .is_some_and(|c| matches!(c, '>' | ' ' | '/' | '\n' | '\r' | '\t'))
}

fn para_end(xml: &str, start: usize) -> usize {
    let rest = &xml[start..];
    if rest.starts_with("<w:p/>") || rest.starts_with("<w:p /") {
        return start + rest.find('>').unwrap_or(0) + 1;
    }
    match rest.find("</w:p>") {
        Some(rel) => start + rel + "</w:p>".len(),
        None => xml.len(),
    }
}

fn match_end(xml: &str, start: usize, open: &str, close: &str) -> usize {
    let mut depth: usize = 0;
    let mut from = start;
    while from < xml.len() {
        let next_open = xml[from..].find(open).map(|i| from + i);
        let next_close = xml[from..].find(close).map(|i| from + i);
        match (next_open, next_close) {
            (_, None) => return xml.len(),
            (Some(o), Some(c)) if o < c && is_named_open(&xml[o..], open) => {
                depth += 1;
                from = o + open.len();
            }
            (Some(o), Some(c)) if o < c => from = o + open.len(),
            (_, Some(c)) => {
                depth = depth.saturating_sub(1);
                let end = c + close.len();
                if depth == 0 {
                    return end;
                }
                from = end;
            }
        }
    }
    xml.len()
}

fn children<'a>(xml: &'a str, open: &str, close: &str) -> Vec<&'a str> {
    let mut out = Vec::new();
    let mut from = 0usize;
    while let Some(at) = find_open(xml, from, open) {
        let end = match_end(xml, at, open, close);
        out.push(&xml[at..end]);
        from = end;
    }
    out
}

fn table_lines(table: &str) -> Vec<String> {
    let grid = table_grid(table);
    if grid.is_empty() {
        return Vec::new();
    }
    let cols = grid.iter().map(|row| row.len()).max().unwrap_or(0);
    if cols >= 2 && grid.len() >= 2 && !right_column_is_dates(&grid) {
        return (0..cols)
            .flat_map(|col| {
                grid.iter()
                    .filter_map(move |row| row.get(col))
                    .flatten()
                    .cloned()
            })
            .collect();
    }
    grid.into_iter().flatten().flatten().collect()
}

fn table_grid(table: &str) -> Vec<Vec<Vec<String>>> {
    children(table, "<w:tr", "</w:tr>")
        .into_iter()
        .map(row_cells)
        .collect()
}

fn row_cells(row: &str) -> Vec<Vec<String>> {
    children(row, "<w:tc", "</w:tc>")
        .into_iter()
        .map(|cell| {
            walk_blocks(cell)
                .into_iter()
                .filter(|line| !line.is_empty())
                .collect()
        })
        .collect()
}

fn right_column_is_dates(grid: &[Vec<Vec<String>>]) -> bool {
    let cells: Vec<String> = grid
        .iter()
        .filter_map(|row| row.get(1))
        .map(|cell| cell.join(" "))
        .filter(|text| !text.trim().is_empty())
        .collect();
    if cells.is_empty() {
        return true;
    }
    let dates = cells.iter().filter(|text| looks_like_date_aside(text)).count();
    dates * 2 >= cells.len()
}

fn looks_like_date_aside(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.chars().count() > 36 {
        return false;
    }
    trimmed.chars().filter(|c| c.is_ascii_digit()).count() >= 2
}

/// Tabs and line breaks are elements, not characters. A tab is how Word puts a
/// date on the right of a heading, so dropping it welds "EDUCATION" to "2019"
/// and hides both from the parser; a break is a real new line.
///
/// A tab *character* is `<w:tab/>` with nothing in it. `<w:tab w:pos="4320"/>`
/// is a tab stop inside the paragraph's properties — a ruler setting, not
/// content — so the empty form is the only one matched.
fn layout_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"<w:tab\s*/>|<w:br\b[^>]*>").unwrap())
}

fn with_layout_characters(body: &str) -> String {
    layout_re()
        .replace_all(body, |caps: &regex::Captures| {
            if caps[0].starts_with("<w:br") {
                "<w:t>\n</w:t>"
            } else {
                "<w:t> </w:t>"
            }
        })
        .into_owned()
}

fn paragraph_text(paragraph: &str) -> String {
    let body = paragraph.split("</w:p>").next().unwrap_or(paragraph);
    let body = with_layout_characters(body);
    let mut text = String::new();
    let mut from = 0usize;
    while let Some(start) = find_open(&body, from, "<w:t") {
        let after = &body[start..];
        let Some(gt) = after.find('>') else { break };
        let content = &after[gt + 1..];
        let Some(end) = content.find("</w:t>") else {
            break;
        };
        text.push_str(&unescape(&content[..end]));
        from = start + gt + 1 + end + "</w:t>".len();
    }
    let text = text.trim().to_string();
    if text.is_empty() {
        return text;
    }
    // A `<w:numPr>` paragraph is a bullet Word draws itself, so it arrives with
    // no mark in the text and one has to be added. Whether a mark is already
    // there is `parse_text`'s question, not this importer's: asking it here
    // with a hand-written `['-', '•', '*']` missed nine of the twelve marks in
    // `BULLET_MARKS`, so a paragraph already starting "▪" came out as "- ▪ …"
    // and the glyph survived into the bullet.
    if body.contains("<w:numPr") && !crate::parse_text::looks_bulleted(&text) {
        return format!("- {text}");
    }
    text
}

fn unescape(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ResumeDoc;

    #[test]
    fn a_paragraph_is_a_line_and_runs_join_without_a_space() {
        let xml = r#"<w:p><w:r><w:t>Ada </w:t></w:r><w:r><w:t>Lovelace</w:t></w:r></w:p>"#;
        assert_eq!(text_from_document_xml(xml), "Ada Lovelace");
    }

    #[test]
    fn a_numbered_paragraph_comes_back_with_a_bullet_marker() {
        let xml = r#"<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Wrote it</w:t></w:r></w:p>"#;
        assert_eq!(text_from_document_xml(xml), "- Wrote it");
    }

    #[test]
    fn a_bullet_that_already_has_a_marker_does_not_get_a_second_one() {
        let xml = r#"<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>• Wrote it</w:t></w:r></w:p>"#;
        assert_eq!(text_from_document_xml(xml), "• Wrote it");
    }

    /// The bug this catches: `<w:t` is a prefix of `<w:tab/>`, so a tab inside
    /// a heading was read as the start of a text run and every tag up to the
    /// next `</w:t>` was pasted onto the page as literal XML. Real templates
    /// are full of tabs, so this affected most imported headings.
    ///
    /// And a tab is a space, not nothing: Word writes "Analyst<tab>Jan 2021"
    /// where a paste would have a run of spaces, and welding the two together
    /// hides the date from the parser.
    #[test]
    fn a_tab_element_becomes_a_space_rather_than_raw_xml() {
        let xml = r#"<w:p><w:r><w:t>EDUCATION</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>2019</w:t></w:r></w:p>"#;
        assert_eq!(text_from_document_xml(xml), "EDUCATION 2019");
    }

    /// A tab stop is a ruler setting in the paragraph's properties. It is not a
    /// character, and reading it as one puts spaces inside the line.
    #[test]
    fn a_tab_stop_definition_is_not_a_tab_character() {
        let xml = r#"<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs></w:pPr><w:r><w:t>Ada</w:t></w:r></w:p>"#;
        assert_eq!(text_from_document_xml(xml), "Ada");
    }

    /// A soft break inside a paragraph is a line, and the parser works in lines.
    #[test]
    fn a_line_break_inside_a_paragraph_starts_a_new_line() {
        let xml = r#"<w:p><w:r><w:t>Ada Lovelace</w:t><w:br/><w:t>London</w:t></w:r></w:p>"#;
        assert_eq!(text_from_document_xml(xml), "Ada Lovelace\nLondon");
    }

    #[test]
    fn a_table_element_inside_a_paragraph_is_not_read_as_text() {
        let xml = r#"<w:p><w:r><w:t>Skills</w:t></w:r><w:tbl><w:tc/></w:tbl></w:p>"#;
        assert_eq!(text_from_document_xml(xml), "Skills");
    }

    #[test]
    fn xml_entities_come_back_as_characters() {
        let xml = r#"<w:p><w:r><w:t>Ada &amp; Charles &lt;3</w:t></w:r></w:p>"#;
        assert_eq!(text_from_document_xml(xml), "Ada & Charles <3");
    }

    #[test]
    fn empty_paragraphs_do_not_become_blank_lines() {
        let xml = r#"<w:p/><w:p><w:r><w:t>Ada</w:t></w:r></w:p><w:p></w:p>"#;
        assert_eq!(text_from_document_xml(xml), "Ada");
    }

    #[test]
    fn a_heading_row_table_keeps_the_date_on_the_role() {
        let xml = r#"<w:tbl>
<w:tr>
<w:tc><w:p><w:r><w:t>Analyst, Admiralty</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>Jan 2021 - Present</w:t></w:r></w:p></w:tc>
</w:tr>
<w:tr>
<w:tc><w:p><w:r><w:t>Mathematician, Royal Society</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>2016 - 2019</w:t></w:r></w:p></w:tc>
</w:tr>
</w:tbl>"#;
        let text = text_from_document_xml(xml);
        let analyst = text.find("Analyst, Admiralty").unwrap();
        let present = text.find("Jan 2021 - Present").unwrap();
        let mathematician = text.find("Mathematician").unwrap();
        assert!(
            analyst < present && present < mathematician,
            "date rail was read as columns:\n{text}"
        );
    }

    #[test]
    fn a_two_column_body_table_reads_left_then_right() {
        let xml = r#"<w:tbl>
<w:tr>
<w:tc><w:p><w:r><w:t>EXPERIENCE</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>SKILLS</w:t></w:r></w:p></w:tc>
</w:tr>
<w:tr>
<w:tc><w:p><w:r><w:t>Analyst, Admiralty</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>Rust, Analysis</w:t></w:r></w:p></w:tc>
</w:tr>
<w:tr>
<w:tc><w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Wrote the first algorithm</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>Python</w:t></w:r></w:p></w:tc>
</w:tr>
</w:tbl>"#;
        let text = text_from_document_xml(xml);
        let experience = text.find("EXPERIENCE").unwrap();
        let algorithm = text.find("Wrote the first algorithm").unwrap();
        let skills = text.find("SKILLS").unwrap();
        let rust = text.find("Rust").unwrap();
        assert!(
            experience < algorithm && algorithm < skills && skills < rust,
            "columns interleaved:\n{text}"
        );
    }

    #[test]
    fn bytes_that_are_not_a_zip_read_as_a_sentence() {
        let err = text_from_docx(b"not a docx at all").unwrap_err();
        assert!(err.starts_with("That file is not a Word document"), "got {err}");
    }

    /// The strongest test available: export a document with the exporter this
    /// app ships, read it back with the importer this app ships, and require
    /// the facts to survive the round trip.
    #[test]
    fn a_document_this_app_wrote_survives_a_round_trip() {
        let original = crate::parse_text::parse_text(
            "Ada Lovelace\nada@example.com · London\n\nEXPERIENCE\nAnalyst, Admiralty\nJan 2021 - Present\n- Wrote the first algorithm\n- Cut turnaround to 2 days\n\nEDUCATION\nUniversity of London\nBSc Mathematics\n\nSKILLS\nRust, Analysis\n",
        );
        let template = crate::templates::find("column").unwrap();
        let bytes = crate::docx::to_docx(&original, &template.docx, template.sections, "ink").unwrap();

        let text = text_from_docx(&bytes).unwrap();
        let back: ResumeDoc = crate::parse_text::parse_text(&text);

        assert_eq!(back.contact.name, "Ada Lovelace");
        assert_eq!(back.contact.email, "ada@example.com");
        assert_eq!(back.experience.len(), 1, "the role did not survive: {text}");
        assert_eq!(back.experience[0].organization, "Admiralty");
        assert_eq!(back.experience[0].bullets.len(), 2);
        assert_eq!(back.experience[0].bullets[0].text, "Wrote the first algorithm");
        assert_eq!(back.education[0].institution, "University of London");
    }
}
