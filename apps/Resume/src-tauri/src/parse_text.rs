//! Plain text in, `ResumeDoc` out. Pure — no I/O, no clock, no randomness, so
//! the same paste always produces the same document.
//!
//! This parser is deliberately conservative. Anything it is unsure about it
//! leaves in place rather than guessing, because the Check screen is where a
//! human resolves ambiguity and a confident wrong guess is worse than a blank.

use crate::model::{Contact, ResumeDoc};
use regex::Regex;
use std::sync::OnceLock;

fn email_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[\w.+-]+@[\w-]+\.[\w.-]+").unwrap())
}

fn phone_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\+?\d{0,2}\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}").unwrap())
}

fn link_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?:https?://)?(?:www\.)?[\w-]+\.[a-z]{2,}(?:/[\w./#?=&-]*)?").unwrap()
    })
}

/// Lines are the unit of everything below. Blank lines are dropped here so no
/// later stage has to keep checking for them.
fn lines_of(input: &str) -> Vec<String> {
    input
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

/// The contact block is whatever sits above the first section heading.
fn parse_contact(header: &[String]) -> Contact {
    let mut contact = Contact::default();
    if let Some(first) = header.first() {
        contact.name = first.clone();
    }
    for line in header {
        if contact.email.is_empty() {
            if let Some(m) = email_re().find(line) {
                contact.email = m.as_str().to_string();
            }
        }
        if contact.phone.is_empty() {
            if let Some(m) = phone_re().find(line) {
                contact.phone = m.as_str().trim().to_string();
            }
        }
        for m in link_re().find_iter(line) {
            let found = m.as_str();
            // An email contains a domain, so the link regex matches inside it.
            if contact.email.contains(found) || line.contains(&format!("@{found}")) {
                continue;
            }
            let owned = found.to_string();
            if !contact.links.contains(&owned) {
                contact.links.push(owned);
            }
        }
    }
    contact
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Section {
    Summary,
    Experience,
    Education,
    Projects,
    Skills,
}

/// Headings people actually type, lowercased. Anything not here is body text.
const HEADINGS: &[(&str, Section)] = &[
    ("summary", Section::Summary),
    ("professional summary", Section::Summary),
    ("profile", Section::Summary),
    ("objective", Section::Summary),
    ("about", Section::Summary),
    ("experience", Section::Experience),
    ("work experience", Section::Experience),
    ("professional experience", Section::Experience),
    ("employment", Section::Experience),
    ("employment history", Section::Experience),
    ("education", Section::Education),
    ("projects", Section::Projects),
    ("personal projects", Section::Projects),
    ("selected projects", Section::Projects),
    ("skills", Section::Skills),
    ("technical skills", Section::Skills),
    ("core skills", Section::Skills),
];

/// A heading is short, matches the list, and carries no sentence punctuation.
/// The length cap is what stops "Experience building distributed systems…"
/// from being read as a heading.
fn heading_of(line: &str) -> Option<Section> {
    if line.chars().count() > 32 {
        return None;
    }
    let key = line
        .trim_matches(|c: char| !c.is_alphanumeric() && !c.is_whitespace())
        .trim()
        .to_lowercase();
    HEADINGS
        .iter()
        .find(|(name, _)| *name == key)
        .map(|(_, section)| *section)
}

pub fn split_sections(lines: &[String]) -> (Vec<String>, Vec<(Section, Vec<String>)>) {
    let mut header = Vec::new();
    let mut sections: Vec<(Section, Vec<String>)> = Vec::new();
    for line in lines {
        match heading_of(line) {
            Some(section) => sections.push((section, Vec::new())),
            None => match sections.last_mut() {
                Some((_, body)) => body.push(line.clone()),
                None => header.push(line.clone()),
            },
        }
    }
    (header, sections)
}

/// Skills are written as one comma-separated line, several lines, or bullets.
/// All three collapse to the same list.
fn parse_skills(body: &[String]) -> Vec<String> {
    body.iter()
        .flat_map(|line| line.split([',', '·', '|']))
        .map(|s| s.trim_start_matches(['-', '•', '*', '–']).trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

pub fn parse_text(input: &str) -> ResumeDoc {
    let lines = lines_of(input);
    if lines.is_empty() {
        return ResumeDoc::empty();
    }
    let (header, sections) = split_sections(&lines);
    // A resume with no headings at all: treat every line as the contact block.
    let header = if header.is_empty() && sections.is_empty() {
        lines.clone()
    } else {
        header
    };
    let mut doc = ResumeDoc {
        contact: parse_contact(&header),
        ..ResumeDoc::empty()
    };
    for (section, body) in &sections {
        match section {
            Section::Summary => doc.summary = body.join(" "),
            Section::Skills => doc.skills = parse_skills(body),
            Section::Experience | Section::Education | Section::Projects => {}
        }
    }
    doc
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_name_from_the_first_line() {
        let doc = parse_text("Ada Lovelace\nada@example.com\n");
        assert_eq!(doc.contact.name, "Ada Lovelace");
    }

    #[test]
    fn finds_email_and_phone_anywhere_in_the_header() {
        let doc = parse_text("Ada Lovelace\nLondon · (555) 123-4567 · ada@example.com\n");
        assert_eq!(doc.contact.email, "ada@example.com");
        assert_eq!(doc.contact.phone, "(555) 123-4567");
    }

    #[test]
    fn collects_links_and_ignores_the_email_as_a_link() {
        let doc = parse_text("Ada Lovelace\nada@example.com\ngithub.com/ada\n");
        assert_eq!(doc.contact.links, vec!["github.com/ada".to_string()]);
    }

    #[test]
    fn empty_input_gives_an_empty_document() {
        assert_eq!(parse_text("   \n\n"), crate::model::ResumeDoc::empty());
    }

    const SAMPLE: &str = "\
Ada Lovelace
ada@example.com

SUMMARY
Analytical engine programmer.

EXPERIENCE
Analyst, Admiralty
Jan 2021 - Present
- Wrote the first algorithm

EDUCATION
University of London
BSc Mathematics, 2019

SKILLS
Rust, Analysis, Notation
";

    #[test]
    fn splits_into_the_sections_it_recognises() {
        let lines = lines_of(SAMPLE);
        let (header, sections) = split_sections(&lines);
        assert_eq!(header, vec!["Ada Lovelace", "ada@example.com"]);
        let kinds: Vec<Section> = sections.iter().map(|(k, _)| *k).collect();
        assert_eq!(
            kinds,
            vec![
                Section::Summary,
                Section::Experience,
                Section::Education,
                Section::Skills
            ]
        );
    }

    #[test]
    fn heading_matching_ignores_case_and_punctuation() {
        let lines = lines_of("Ada\n\nWork Experience:\nAnalyst\n");
        let (_, sections) = split_sections(&lines);
        assert_eq!(sections[0].0, Section::Experience);
    }

    #[test]
    fn a_long_line_is_body_text_not_a_heading() {
        let long = "Experience building distributed systems across three teams and two continents";
        let lines = lines_of(&format!("Ada\n\nSUMMARY\n{long}\n"));
        let (_, sections) = split_sections(&lines);
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].1, vec![long.to_string()]);
    }

    #[test]
    fn summary_and_skills_land_on_the_document() {
        let doc = parse_text(SAMPLE);
        assert_eq!(doc.summary, "Analytical engine programmer.");
        assert_eq!(doc.skills, vec!["Rust", "Analysis", "Notation"]);
        assert_eq!(doc.contact.name, "Ada Lovelace");
    }
}
