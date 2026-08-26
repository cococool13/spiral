//! Reading order from glyph positions, not from the content stream.
//!
//! A PDF stores characters in whatever order the writer emitted them. Two
//! columns often interleave — a line from the left, a line from the right —
//! and `extract_text` prints that stream. This module collects each character
//! with its page position and rebuilds the order a person would read: top to
//! bottom, and when the page is two independent columns, the left column then
//! the right. Dates sitting on the same line as a title stay on that line.

use pdf_extract::{output_doc, Document, MediaBox, OutputDev, OutputError, Transform};

/// A second column starts near the middle of the page. Dates and a
/// right-aligned contact sit past this, on the same row as the heading.
const FLUSH_RIGHT: f64 = 0.62;
const COLUMN_LEFT: f64 = 0.42;
const COLUMN_RIGHT: f64 = 0.48;
/// Fraction of font size. Farther in y than this is a new line.
const LINE_Y: f64 = 0.65;
/// Fraction of font size. Close enough in y to still be the same row.
const SAME_ROW_Y: f64 = 0.4;
/// A jump this many font-sizes right, still on the row, is the other column.
const COLUMN_GAP: f64 = 4.5;
const MIN_ADVANCE: f64 = 8.0;
/// Header lines sit this many page points above both columns.
const HEADER_GAP: f64 = 4.0;
const MIN_PAGE_FOR_COLUMNS: f64 = 80.0;
const MIN_GUTTER: f64 = 18.0;
/// Gap between glyph boxes that inserts a space.
const LETTER_GAP: f64 = 0.1;

#[derive(Debug)]
struct Glyph {
    x: f64,
    y: f64,
    w: f64,
    size: f64,
    ch: String,
}

#[derive(Debug)]
struct Line {
    y: f64,
    x0: f64,
    text: String,
}

struct Page {
    width: f64,
    glyphs: Vec<Glyph>,
}

struct Collector {
    pages: Vec<Page>,
    flip: Transform,
}

impl Collector {
    fn new() -> Self {
        Self {
            pages: Vec::new(),
            flip: Transform::identity(),
        }
    }
}

impl OutputDev for Collector {
    fn begin_page(
        &mut self,
        _page_num: u32,
        media_box: &MediaBox,
        _: Option<(f64, f64, f64, f64)>,
    ) -> Result<(), OutputError> {
        self.flip = Transform::row_major(1., 0., 0., -1., 0., media_box.ury - media_box.lly);
        self.pages.push(Page {
            width: (media_box.urx - media_box.llx).max(1.0),
            glyphs: Vec::new(),
        });
        Ok(())
    }

    fn end_page(&mut self) -> Result<(), OutputError> {
        Ok(())
    }

    fn output_character(
        &mut self,
        trm: &Transform,
        width: f64,
        _spacing: f64,
        font_size: f64,
        ch: &str,
    ) -> Result<(), OutputError> {
        if ch.is_empty() || ch == "\n" || ch == "\r" {
            return Ok(());
        }
        let Some(page) = self.pages.last_mut() else {
            return Ok(());
        };
        let position = trm.post_transform(&self.flip);
        let vx = trm.m11 * font_size + trm.m21 * font_size;
        let vy = trm.m12 * font_size + trm.m22 * font_size;
        let size = (vx * vy).abs().sqrt().max(font_size.abs()).max(1.0);
        page.glyphs.push(Glyph {
            x: position.m31,
            y: position.m32,
            w: (width * size).abs(),
            size,
            ch: ch.to_string(),
        });
        Ok(())
    }

    fn begin_word(&mut self) -> Result<(), OutputError> {
        Ok(())
    }

    fn end_word(&mut self) -> Result<(), OutputError> {
        Ok(())
    }

    fn end_line(&mut self) -> Result<(), OutputError> {
        Ok(())
    }
}

pub fn text_from_positions(bytes: &[u8]) -> Result<String, OutputError> {
    let mut collector = Collector::new();
    let doc = Document::load_mem(bytes)?;
    output_doc(&doc, &mut collector)?;
    Ok(pages_to_text(&collector.pages))
}

fn pages_to_text(pages: &[Page]) -> String {
    pages
        .iter()
        .map(|page| reading_order(&cluster_lines(&page.glyphs, page.width), page.width))
        .filter(|page| !page.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn cluster_lines(glyphs: &[Glyph], page_width: f64) -> Vec<Line> {
    if glyphs.is_empty() {
        return Vec::new();
    }
    let mut lines: Vec<Line> = Vec::new();
    let mut current: Vec<&Glyph> = Vec::new();
    let mut last_end = f64::NEG_INFINITY;
    let mut last_y = f64::NAN;
    for glyph in glyphs {
        if !current.is_empty() && starts_new_line(glyph, last_end, last_y, page_width) {
            lines.push(line_from_stream(&current));
            current.clear();
        }
        current.push(glyph);
        last_end = glyph.x + glyph.w;
        last_y = glyph.y;
    }
    if !current.is_empty() {
        lines.push(line_from_stream(&current));
    }
    lines
}

fn starts_new_line(glyph: &Glyph, last_end: f64, last_y: f64, page_width: f64) -> bool {
    let size = glyph.size.max(1.0);
    let y_jump = (glyph.y - last_y).abs();
    if y_jump > size * LINE_Y {
        return true;
    }
    if glyph.x < last_end && y_jump > size * SAME_ROW_Y {
        return true;
    }
    let jumped_right = glyph.x - last_end > size.max(MIN_ADVANCE) * COLUMN_GAP
        && y_jump <= size * SAME_ROW_Y;
    jumped_right && glyph.x <= page_width * FLUSH_RIGHT
}

fn line_from_stream(glyphs: &[&Glyph]) -> Line {
    let mut text = String::new();
    for (i, glyph) in glyphs.iter().enumerate() {
        if i > 0 && !glyph.ch.chars().all(char::is_whitespace) {
            let prev = glyphs[i - 1];
            if !prev.ch.chars().all(char::is_whitespace)
                && box_gap(prev, glyph) > glyph.size * LETTER_GAP
            {
                text.push(' ');
            }
        }
        if glyph.ch.chars().all(char::is_whitespace) {
            if !text.ends_with(' ') {
                text.push(' ');
            }
        } else {
            text.push_str(&glyph.ch);
        }
    }
    Line {
        y: glyphs.iter().map(|g| g.y).sum::<f64>() / glyphs.len() as f64,
        x0: glyphs
            .iter()
            .map(|g| g.x.min(g.x + g.w))
            .fold(f64::INFINITY, f64::min),
        text: text.trim().to_string(),
    }
}

fn box_gap(a: &Glyph, b: &Glyph) -> f64 {
    let a0 = a.x.min(a.x + a.w);
    let a1 = a.x.max(a.x + a.w);
    let b0 = b.x.min(b.x + b.w);
    let b1 = b.x.max(b.x + b.w);
    if b0 >= a1 {
        b0 - a1
    } else if a0 >= b1 {
        a0 - b1
    } else {
        0.0
    }
}

fn reading_order(lines: &[Line], page_width: f64) -> String {
    let lines: Vec<&Line> = lines.iter().filter(|line| !line.text.is_empty()).collect();
    if lines.is_empty() {
        return String::new();
    }
    let Some(gutter) = gutter_between_columns(&lines, page_width) else {
        return join_by_y(&lines);
    };
    let left: Vec<&Line> = lines.iter().copied().filter(|line| line.x0 < gutter).collect();
    let right: Vec<&Line> = lines.iter().copied().filter(|line| line.x0 >= gutter).collect();
    if left.is_empty() || right.is_empty() {
        return join_by_y(&lines);
    }
    let body_y = first_y(&left).min(first_y(&right));
    let mut header = Vec::new();
    let mut rest_left = Vec::new();
    let mut rest_right = Vec::new();
    for line in &lines {
        if line.y < body_y - HEADER_GAP {
            header.push(*line);
        } else if line.x0 < gutter {
            rest_left.push(*line);
        } else {
            rest_right.push(*line);
        }
    }
    [join_by_y(&header), join_by_y(&rest_left), join_by_y(&rest_right)]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn gutter_between_columns(lines: &[&Line], page_width: f64) -> Option<f64> {
    if lines.len() < 4 || page_width < MIN_PAGE_FOR_COLUMNS {
        return None;
    }
    let left: Vec<f64> = lines
        .iter()
        .map(|line| line.x0)
        .filter(|&x| x < page_width * COLUMN_LEFT)
        .collect();
    let right: Vec<f64> = lines
        .iter()
        .map(|line| line.x0)
        .filter(|&x| x > page_width * COLUMN_RIGHT)
        .collect();
    if left.len() < 2 || right.len() < 2 {
        return None;
    }
    let left_max = left.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let right_min = right.iter().copied().fold(f64::INFINITY, f64::min);
    if right_min - left_max < MIN_GUTTER {
        return None;
    }
    if right_min > page_width * FLUSH_RIGHT {
        return None;
    }
    Some((left_max + right_min) / 2.0)
}

fn first_y(lines: &[&Line]) -> f64 {
    lines
        .iter()
        .map(|line| line.y)
        .fold(f64::INFINITY, f64::min)
}

fn join_by_y(lines: &[&Line]) -> String {
    let mut ordered = lines.to_vec();
    ordered.sort_by(|a, b| {
        y_cmp(a.y, b.y).then(a.x0.partial_cmp(&b.x0).unwrap_or(std::cmp::Ordering::Equal))
    });
    ordered
        .into_iter()
        .map(|line| line.text.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

fn y_cmp(a: f64, b: f64) -> std::cmp::Ordering {
    a.partial_cmp(&b).unwrap_or(std::cmp::Ordering::Equal)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(y: f64, x0: f64, text: &str) -> Line {
        Line {
            y,
            x0,
            text: text.to_string(),
        }
    }

    fn glyph(x: f64, y: f64, ch: &str) -> Glyph {
        Glyph {
            x,
            y,
            w: 6.0,
            size: 11.0,
            ch: ch.to_string(),
        }
    }

    #[test]
    fn a_single_column_reads_top_to_bottom() {
        let lines = [
            line(10.0, 50.0, "Ada Lovelace"),
            line(30.0, 50.0, "EXPERIENCE"),
            line(50.0, 50.0, "Analyst, Admiralty Jan 2021"),
        ];
        let refs: Vec<&Line> = lines.iter().collect();
        let text = reading_order(&lines, 612.0);
        assert_eq!(
            text,
            "Ada Lovelace\nEXPERIENCE\nAnalyst, Admiralty Jan 2021"
        );
        assert!(gutter_between_columns(&refs, 612.0).is_none());
    }

    #[test]
    fn two_independent_columns_read_left_then_right() {
        let lines = [
            line(10.0, 40.0, "Ada Lovelace"),
            line(40.0, 40.0, "EXPERIENCE"),
            line(40.0, 320.0, "SKILLS"),
            line(60.0, 40.0, "Analyst, Admiralty"),
            line(60.0, 320.0, "Rust, Analysis"),
            line(80.0, 40.0, "Wrote the first algorithm"),
            line(80.0, 320.0, "Python"),
        ];
        let text = reading_order(&lines, 612.0);
        let experience = text.find("EXPERIENCE").unwrap();
        let algorithm = text.find("Wrote the first algorithm").unwrap();
        let skills = text.find("SKILLS").unwrap();
        let rust = text.find("Rust").unwrap();
        assert!(
            experience < algorithm && algorithm < skills && skills < rust,
            "interleaved:\n{text}"
        );
        assert!(text.contains("Ada Lovelace"));
    }

    #[test]
    fn a_date_on_the_same_line_does_not_become_a_second_column() {
        let lines = [
            line(10.0, 50.0, "Ada Lovelace"),
            line(30.0, 50.0, "EXPERIENCE"),
            line(50.0, 50.0, "Analyst, Admiralty"),
            line(70.0, 50.0, "Wrote the first algorithm"),
        ];
        let refs: Vec<&Line> = lines.iter().collect();
        assert!(gutter_between_columns(&refs, 612.0).is_none());
    }

    #[test]
    fn a_flush_right_date_stays_on_the_heading_line() {
        let glyphs = [
            glyph(50.0, 100.0, "A"),
            glyph(56.0, 100.0, "n"),
            glyph(430.0, 100.0, "2"),
            glyph(436.0, 100.0, "0"),
        ];
        let lines = cluster_lines(&glyphs, 612.0);
        assert_eq!(
            lines.len(),
            1,
            "flush-right date split off: {:?}",
            lines.iter().map(|l| &l.text).collect::<Vec<_>>()
        );
        assert!(lines[0].text.contains('A') && lines[0].text.contains('2'));
    }

    #[test]
    fn a_mid_page_jump_starts_the_other_column() {
        let glyphs = [
            glyph(50.0, 100.0, "L"),
            glyph(56.0, 100.0, "e"),
            glyph(62.0, 100.0, "f"),
            glyph(68.0, 100.0, "t"),
            glyph(320.0, 100.0, "R"),
            glyph(326.0, 100.0, "t"),
        ];
        let lines = cluster_lines(&glyphs, 612.0);
        assert_eq!(
            lines.len(),
            2,
            "mid-page jump stayed one line: {:?}",
            lines.iter().map(|l| &l.text).collect::<Vec<_>>()
        );
    }
}
