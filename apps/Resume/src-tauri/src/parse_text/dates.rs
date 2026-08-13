//! Dates as people write them, kept exactly as written.

use crate::model::DateMark;
use regex::Regex;
use std::sync::OnceLock;

pub(super) const MONTHS: &[&str] = &[
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];

pub(super) fn month_number(word: &str) -> Option<u8> {
    let w = word.trim_end_matches('.').to_lowercase();
    if w.len() < 3 {
        return None;
    }
    MONTHS
        .iter()
        .position(|m| *m == w || m.starts_with(&w))
        .map(|i| i as u8 + 1)
}

pub(super) fn side_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    // Either a word for an open end, or an optional month word plus a year.
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b(present|current|currently|now|ongoing|today|date)\b|\b([A-Za-z]{3,9}\.?)?\s*(\d{4})\b",
        )
        .unwrap()
    })
}

/// The dash between two dates is written every way there is: spaced, unspaced,
/// hyphen, en dash, or a word. An unspaced hyphen also appears inside words and
/// phone numbers, so this regex is deliberately over-eager and
/// `parse_date_range` decides which match is real.
pub(super) fn separator_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\s*(?:–|—)\s*|\s+(?:to|until|through)\s+|\s*-\s*").unwrap())
}

pub(super) fn parse_one_date(text: &str) -> Option<DateMark> {
    let caps = side_re().captures(text)?;
    let raw = caps.get(0)?.as_str().trim().to_string();
    if caps.get(1).is_some() {
        return Some(DateMark {
            raw,
            year: None,
            month: None,
            present: true,
        });
    }
    let year_match = caps.get(3)?;
    let year = year_match.as_str().parse::<u16>().ok()?;
    let month = caps.get(2).and_then(|m| month_number(m.as_str()));
    // The regex takes any word in front of the year, because it cannot know a
    // month from an employer. If it was not a month, it is not part of the date
    // — and leaving it in `raw` deletes it from the line it was written on.
    let raw = match month {
        Some(_) => raw,
        None => year_match.as_str().to_string(),
    };
    Some(DateMark {
        raw,
        year: Some(year),
        month,
        present: false,
    })
}

/// A date range needs two sides and a separator. One lone year is a date on a
/// degree line, not a range, and returning `None` for it keeps the entry
/// splitter from mistaking an education line for the start of a new role.
///
/// Every candidate separator is tried, not just the first. "Full-Stack
/// Engineer, Acme 2021 - 2023" offers the hyphen inside the job title before it
/// offers the real one, and one lone year on the left of it is not a range.
pub fn parse_date_range(line: &str) -> Option<(DateMark, DateMark)> {
    // Two guards against input that is not a resume. A date line is short, and
    // the separator it needs is one of the first few: without the cap, a line
    // of ten thousand hyphens is scanned once per hyphen.
    if line.len() > 1_000 {
        return None;
    }
    separator_re().find_iter(line).take(8).find_map(|split| {
        let left = parse_one_date(&line[..split.start()])?;
        let right = parse_one_date(&line[split.end()..])?;
        Some((left, right))
    })
}

/// The heading line with its dates taken out. Empty means the line was nothing
/// but dates, which is the signal the entry splitter reads.
pub(super) fn without_dates(line: &str, start: &DateMark, end: &DateMark) -> String {
    line.replace(&start.raw, "")
        .replace(&end.raw, "")
        .trim_matches(|c: char| !c.is_alphanumeric())
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_month_year_range() {
        let (start, end) = parse_date_range("Jan 2021 - Mar 2023").unwrap();
        assert_eq!(start.year, Some(2021));
        assert_eq!(start.month, Some(1));
        assert_eq!(end.year, Some(2023));
        assert_eq!(end.month, Some(3));
        assert!(!end.present);
    }

    #[test]
    fn reads_present_as_an_open_end() {
        let (_, end) = parse_date_range("2021 – Present").unwrap();
        assert!(end.present);
        assert_eq!(end.year, None);
    }

    #[test]
    fn keeps_the_raw_text_exactly_as_written() {
        let (start, _) = parse_date_range("September 2019 to May 2023").unwrap();
        assert_eq!(start.raw, "September 2019");
    }

    #[test]
    fn a_line_without_a_range_is_not_a_date_line() {
        assert!(parse_date_range("Analyst, Admiralty").is_none());
        assert!(parse_date_range("Graduated 2019").is_none());
    }

    #[test]
    fn a_dash_without_spaces_around_it_is_still_a_date_range() {
        let (start, end) = parse_date_range("Jan 2021–Mar 2023").unwrap();
        assert_eq!(start.month, Some(1));
        assert_eq!(end.year, Some(2023));
        let (start, end) = parse_date_range("2019-2021").unwrap();
        assert_eq!(start.year, Some(2019));
        assert_eq!(end.year, Some(2021));
    }

    /// A hyphen inside a word is not a separator; the range beside it is.
    #[test]
    fn a_hyphenated_title_does_not_hide_the_date_beside_it() {
        let (start, end) = parse_date_range("Full-Stack Engineer, Acme 2021 - 2023").unwrap();
        assert_eq!(start.year, Some(2021));
        assert_eq!(end.year, Some(2023));
    }

    /// Allowing an unspaced dash must not turn a phone number into a range.
    #[test]
    fn a_phone_number_is_never_read_as_a_date_range() {
        assert!(parse_date_range("Call 555-123-4567").is_none());
    }

    #[test]
    fn to_date_reads_as_an_open_end() {
        let (_, end) = parse_date_range("2021 to date").unwrap();
        assert!(end.present);
    }
}
