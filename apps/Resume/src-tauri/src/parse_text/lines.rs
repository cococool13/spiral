//! Raw text into the lines the rest of the parser works on.
//!
//! Everything here repairs how the text arrived rather than reading what it
//! says: markdown markers, bullet glyphs stranded on their own line, headings
//! welded to the entry beside them, and the furniture a page prints.

use super::headings::heading_of;
use regex::Regex;
use std::sync::OnceLock;

/// Lines are the unit of everything below. Blank lines are dropped here so no
/// later stage has to keep checking for them.
///
/// One repair happens at this level: PDF extraction often puts the bullet glyph
/// on a line of its own and the sentence on the next one. Left alone that is an
/// empty bullet followed by a line the entry splitter reads as a new role, so
/// the glyph is folded onto the line it belongs to. Only the glyphs that are
/// unambiguously bullets do this — a row of dashes is a rule, not a marker.
pub(super) const LONE_MARKS: [char; 8] = ['•', '▪', '▫', '◦', '●', '‣', '∙', '\u{f0b7}'];

/// Glyphs that are a bullet wherever they appear. A PDF laid out in columns
/// hands back "Analyst • Wrote the first algorithm• Cut turnaround to 2 days"
/// as one line, because the two columns share a baseline. Cutting at these
/// puts the bullets back. A hyphen and an interpunct are deliberately absent:
/// both appear inside ordinary sentences.
pub(super) const INLINE_MARKS: [char; 5] = ['•', '▪', '‣', '●', '\u{f0b7}'];

pub(super) fn split_inline_bullets(line: &str) -> Vec<String> {
    if !line.chars().skip(1).any(|c| INLINE_MARKS.contains(&c)) {
        return vec![line.to_string()];
    }
    let mut out: Vec<String> = Vec::new();
    let mut current = String::new();
    for (index, c) in line.chars().enumerate() {
        if index > 0 && INLINE_MARKS.contains(&c) {
            let head = current.trim().to_string();
            if !head.is_empty() {
                out.push(head);
            }
            current = String::new();
        }
        current.push(c);
    }
    let tail = current.trim().to_string();
    if !tail.is_empty() {
        out.push(tail);
    }
    out
}

/// "EDUCATIONUniversity of London" — a heading in a left rail, extracted onto
/// the same line as the entry beside it, with no space at the join. Nobody
/// types that, so a heading immediately followed by a capital is always the
/// artifact and never the text.
pub(super) fn split_glued_heading(line: &str) -> Option<(String, String)> {
    let mut previous = '\0';
    for (index, c) in line.char_indices() {
        // No heading is longer than this, and the cap is what keeps a very long
        // line from being normalised once per character.
        if index > 48 {
            return None;
        }
        if index > 0
            && previous.is_alphabetic()
            && (c.is_uppercase() || c.is_numeric())
            && heading_of(&line[..index]).is_some()
        {
            return Some((line[..index].to_string(), line[index..].to_string()));
        }
        previous = c;
    }
    None
}

/// A resume kept in a text editor is kept in markdown. The emphasis markers
/// are formatting, not content — and `*` is also a bullet, so "**Analyst**,
/// Admiralty" was read as a bullet and the role heading disappeared.
///
/// Numbered lists become bullets for the same reason: "1. Wrote it" is an
/// achievement, and read as a plain line it would be an employer's name.
pub(super) fn number_marker_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\(?\d{1,2}[.)]\s+").unwrap())
}

pub(super) fn unmarkdown(line: &str) -> String {
    let line = line.replace("**", "").replace("__", "");
    // "# Ada Lovelace" is a name with a markdown heading marker in front of it.
    let line = line
        .trim_start_matches('>')
        .trim_start()
        .trim_start_matches('#')
        .trim();
    // A whole line in italics — "*Jan 2021 - Present*" — is one pair of marks
    // around content, not a bullet followed by a stray asterisk.
    let italic = line.len() > 2
        && ((line.starts_with('*') && line.ends_with('*'))
            || (line.starts_with('_') && line.ends_with('_')))
        && !line[1..].starts_with(' ');
    let line = if italic {
        line[1..line.len() - 1].trim()
    } else {
        line
    };
    match number_marker_re().find(line) {
        Some(marker) => format!("- {}", &line[marker.end()..]),
        None => line.to_string(),
    }
}

/// Furniture printed by the page rather than written by the person: a page
/// number in a footer, or a rule drawn out of underscores. Both arrive as lines
/// in the middle of a section, where an empty bullet or a nameless entry is
/// what they turn into.
///
/// A bare number is deliberately not matched — "2019" on a line of its own is a
/// date on a degree, and dropping it would delete a fact.
pub(super) fn furniture_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)^(page\s+\d{1,3}(\s*(of|/)\s*\d{1,3})?|\d{1,2}\s*(of|/)\s*\d{1,2}|[-–—]\s*\d{1,3}\s*[-–—])$")
            .unwrap()
    })
}

pub(super) fn is_furniture(line: &str) -> bool {
    // A line with no letter and no digit in it draws something; it says nothing.
    !line.chars().any(char::is_alphanumeric) || furniture_re().is_match(line)
}

pub(super) fn lines_of(input: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    let mut pending: Option<char> = None;
    for line in input.lines().flat_map(split_inline_bullets) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // Letter-spacing repair runs first, because the wide gap between words
        // is the only thing that tells "A D A   L O V E L A C E" from three
        // separate words — and the collapse on the next line destroys it.
        let line = untrack(line);
        // Word and PDF alike pad a line out with tabs to push a date to the
        // right margin. Those runs arrive as whitespace, and a line's length is
        // how the parser tells a heading from a sentence — so one space it is.
        let mut line = unmarkdown(&line.split_whitespace().collect::<Vec<_>>().join(" "));
        if let Some(mark) = pending.take() {
            line = format!("{mark} {line}");
        }
        let mut chars = line.chars();
        if let (Some(mark), None) = (chars.next(), chars.next()) {
            if LONE_MARKS.contains(&mark) {
                pending = Some(mark);
                continue;
            }
        }
        if is_furniture(&line) {
            continue;
        }
        match split_glued_heading(&line) {
            Some((heading, rest)) => {
                lines.push(heading);
                lines.push(rest.trim().to_string());
            }
            None => lines.push(line),
        }
    }
    // A glyph with nothing under it is still text the user had on the page.
    if let Some(mark) = pending {
        lines.push(mark.to_string());
    }
    lines
}

/// "A D A   L O V E L A C E" back into "ADA LOVELACE".
///
/// Designers letter-space names and section headings, and both a PDF extractor
/// and a Word export store the tracking as real space between the glyphs — so
/// every letter reads as a word. Whole sections disappear this way, because a
/// heading like "E D U C A T I O N" matches nothing.
///
/// This lived in `import/pdf.rs`, which meant the same heading survived a PDF
/// and was lost from a paste or a `.docx`. It belongs here, where all three
/// doors reach it, and it must run before the whitespace collapse — the wider
/// gap is the word boundary, and the collapse is what erases it.
fn untrack(line: &str) -> String {
    split_on_wide_gaps(line)
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
        .collect::<Vec<_>>()
        .join(" ")
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

/// Every character a resume uses to mark a bullet. `\u{f0b7}` is the one Word
/// writes: its bullets are a Symbol-font glyph in the private-use area, and
/// both Word export and PDF extraction hand it over unchanged.
pub(super) const BULLET_MARKS: [char; 12] = [
    '-', '•', '*', '–', '—', '▪', '▫', '◦', '●', '‣', '∙', '\u{f0b7}',
];

/// Word's second bullet level is a lowercase o set in Courier, so a sub-bullet
/// arrives as the letter itself. "o " in front of a capital is that marker;
/// "of the team" is not, and the capital is what tells them apart.
pub(super) fn is_sub_bullet(line: &str) -> bool {
    let mut chars = line.chars();
    chars.next() == Some('o')
        && chars.next() == Some(' ')
        && chars.next().is_some_and(char::is_uppercase)
}

pub(super) fn is_bullet(line: &str) -> bool {
    line.starts_with(BULLET_MARKS) || is_sub_bullet(line)
}

pub(super) fn bullet_text(line: &str) -> String {
    if is_sub_bullet(line) {
        return line[1..].trim().to_string();
    }
    line.trim_start_matches(BULLET_MARKS).trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one(input: &str) -> String {
        lines_of(input).join("\n")
    }

    /// Letter-spaced headings and names are how a designed resume loses whole
    /// sections on the way in. These assertions used to sit in `import/pdf`,
    /// which is exactly why a paste and a `.docx` did not get the repair.
    #[test]
    fn tracking_is_read_back_as_words() {
        assert_eq!(one("A D A   L O V E L A C E"), "ADA LOVELACE");
        assert_eq!(one("E D U C A T I O N"), "EDUCATION");
    }

    /// An ordinary line is left exactly as it was. Two initials are not a
    /// letter-spaced word, and neither is a line with real words in it.
    #[test]
    fn ordinary_lines_are_not_squeezed_together() {
        assert_eq!(one("J. R. R. Tolkien"), "J. R. R. Tolkien");
        assert_eq!(one("R  C  Python"), "R C Python");
        assert_eq!(
            one("ANALYST | Admiralty 2021 — 2023"),
            "ANALYST | Admiralty 2021 — 2023"
        );
    }

    #[test]
    fn ragged_whitespace_collapses_without_joining_lines() {
        assert_eq!(one("  Ada   Lovelace \n\n\n  Analyst  "), "Ada Lovelace\nAnalyst");
    }

    /// Every mark in `BULLET_MARKS` is a bullet, and the mark is stripped from
    /// the text. The `.docx` importer used to know three of these twelve.
    #[test]
    fn every_bullet_mark_is_recognised_and_stripped() {
        for mark in BULLET_MARKS {
            let line = format!("{mark} Wrote the parser");
            assert!(is_bullet(&line), "{mark:?} is not read as a bullet");
            assert_eq!(bullet_text(&line), "Wrote the parser", "mark {mark:?} survived");
        }
    }

    #[test]
    fn a_lone_mark_is_joined_to_the_line_under_it() {
        assert_eq!(one("•\nWrote the parser"), "• Wrote the parser");
    }

    #[test]
    fn furniture_is_dropped_and_a_bare_year_is_not_furniture() {
        assert_eq!(one("Page 2 of 3"), "");
        assert_eq!(one("_______"), "");
        assert_eq!(one("2019"), "2019");
    }
}
