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

pub fn parse_text(input: &str) -> ResumeDoc {
    let lines = lines_of(input);
    if lines.is_empty() {
        return ResumeDoc::empty();
    }
    let header_end = lines.len().min(6);
    ResumeDoc {
        contact: parse_contact(&lines[..header_end]),
        ..ResumeDoc::empty()
    }
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
}
