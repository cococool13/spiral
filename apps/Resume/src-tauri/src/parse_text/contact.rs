//! The contact block, and finding the details wherever they were put.

use super::headings::heading_key;
use crate::model::Contact;
use regex::Regex;
use std::sync::OnceLock;

pub(super) fn email_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[\w.+-]+@[\w-]+\.[\w.-]+").unwrap())
}

/// A run of digits and the punctuation people put between them. The shape
/// alone cannot tell a phone number from a street number, so `find_phone`
/// counts the digits afterwards — that is what separates "+44 20 7946 0958"
/// from "12 Acacia Avenue".
pub(super) fn phone_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\+?\(?\d[\d\s().-]{6,}\d").unwrap())
}

/// Every national format that reaches this app carries between 9 and 15 digits
/// — the E.164 ceiling. Anything shorter is a house number or a year.
pub(super) fn find_phone(line: &str) -> Option<&str> {
    phone_re().find_iter(line).map(|m| m.as_str()).find(|found| {
        let digits = found.chars().filter(char::is_ascii_digit).count();
        (9..=15).contains(&digits)
    })
}

pub(super) fn link_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?:https?://)?(?:www\.)?[\w-]+\.[a-z]{2,}(?:/[\w./#?=&-]*)?").unwrap()
    })
}

/// What a page calls itself, rather than what the person is called.
pub(super) const DOCUMENT_TITLES: [&str; 5] = ["resume", "résumé", "curriculum vitae", "cv", "resumé"];

/// The contact block is whatever sits above the first section heading.
/// Separators people put between contact details. Stripping them is what turns
/// a leftover "· ·  London ·" back into "London".
pub(super) const CONTACT_SEPARATORS: [char; 6] = ['·', '|', ',', '-', '–', '•'];

/// Separators that can divide a name from the contact details beside it on one
/// line. A bare hyphen is deliberately absent: "Anne-Marie" must survive.
pub(super) const NAME_SEPARATORS: [&str; 5] = ["·", "|", "•", " - ", " — "];

/// What sat above the first heading: the contact details, plus any prose that
/// was too long to be one. That prose is almost always an unlabelled summary,
/// and it is never an address.
pub(super) struct Header {
    pub(super) contact: Contact,
    pub(super) prose: Vec<String>,
}

/// A contact detail is short. Past this, the line is a sentence.
pub(super) const CONTACT_LENGTH: usize = 80;

pub(super) fn parse_contact(header: &[String]) -> Header {
    let mut prose: Vec<String> = Vec::new();
    let mut contact = Contact::default();
    // "RESUME" over the top of the page is a label, not a person.
    let header: Vec<String> = match header.split_first() {
        Some((first, rest)) if DOCUMENT_TITLES.contains(&heading_key(first).as_str()) => {
            rest.to_vec()
        }
        _ => header.to_vec(),
    };
    let header = &header;
    if let Some(first) = header.first() {
        contact.name = first.clone();
    }
    for (index, line) in header.iter().enumerate() {
        let mut leftover = line.clone();
        if let Some(m) = email_re().find(line) {
            if contact.email.is_empty() {
                contact.email = m.as_str().to_string();
            }
            leftover = leftover.replace(m.as_str(), "");
        }
        if let Some(found) = find_phone(line) {
            if contact.phone.is_empty() {
                contact.phone = found.trim().to_string();
            }
            leftover = leftover.replace(found, "");
        }
        for m in link_re().find_iter(line) {
            let found = m.as_str();
            // An email contains a domain, so the link regex matches inside it.
            if contact.email.contains(found) || line.contains(&format!("@{found}")) {
                continue;
            }
            leftover = leftover.replace(found, "");
            let owned = found.to_string();
            if !contact.links.contains(&owned) {
                contact.links.push(owned);
            }
        }

        // Many templates put everything on line one: "Ada Lovelace | Address |
        // Phone | Email". The details have already been lifted out above, so
        // what remains before the first separator is the name.
        if index == 0 {
            let remainder = strip_separators(&leftover).to_string();
            let mut name = remainder.clone();
            // Whatever follows the name on line one is still text the user
            // typed — a job title, a city. Splitting the name off and throwing
            // the rest away is the same data loss the location fix addressed
            // for the lines below it.
            let mut rest = String::new();
            for separator in NAME_SEPARATORS {
                if let Some((head, tail)) = name.clone().split_once(separator) {
                    name = head.trim().to_string();
                    rest = tail.trim().to_string();
                }
            }
            if !name.is_empty() {
                contact.name = name;
            }
            let rest = strip_separators(&rest);
            if !rest.is_empty() && contact.location.is_empty() {
                contact.location = rest.to_string();
            }
        }

        // The name line is the name, never a location. Everything below it that
        // is not an email, a phone number or a link is text the user typed and
        // we would otherwise throw away — including the third and fourth such
        // line, which used to be dropped once `location` was filled.
        if index > 0 {
            let remainder = strip_separators(&leftover);
            if remainder.is_empty() {
                continue;
            }
            if remainder.chars().count() > CONTACT_LENGTH {
                prose.push(remainder.to_string());
            } else if contact.location.is_empty() {
                contact.location = remainder.to_string();
            } else {
                contact.location.push_str(" · ");
                contact.location.push_str(remainder);
            }
        }
    }
    Header { contact, prose }
}

/// A block is one entry: its heading lines, then its bullets. A new block
/// begins at the first non-bullet line after a bullet or a date has been seen.
/// Contact lines arrive wrapped in the separators that divided them.
pub(super) fn strip_separators(text: &str) -> &str {
    text.trim_matches(|c: char| c.is_whitespace() || CONTACT_SEPARATORS.contains(&c))
        .trim()
}

/// An email address or a phone number is worth finding wherever it was put —
/// several templates set the contact block in the footer, and one below the
/// first heading used to be lost entirely.
pub(super) fn fill_missing_contact(contact: &mut Contact, lines: &[String]) {
    for line in lines {
        if contact.email.is_empty() {
            if let Some(found) = email_re().find(line) {
                contact.email = found.as_str().to_string();
            }
        }
        if contact.phone.is_empty() {
            if let Some(found) = find_phone(line) {
                contact.phone = found.trim().to_string();
            }
        }
        if contact.links.is_empty() {
            for found in link_re().find_iter(line) {
                let found = found.as_str();
                if contact.email.contains(found) || line.contains(&format!("@{found}")) {
                    continue;
                }
                contact.links.push(found.to_string());
            }
        }
    }
}
