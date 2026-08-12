//! Plain text in, `ResumeDoc` out. Pure — no I/O, no clock, no randomness, so
//! the same paste always produces the same document.
//!
//! This parser is deliberately conservative. Anything it is unsure about it
//! leaves in place rather than guessing, because the Check screen is where a
//! human resolves ambiguity and a confident wrong guess is worse than a blank.

use crate::model::{
    bullet_id, entry_id, Bullet, Contact, DateMark, ResumeDoc, Role, School, SkillGroup,
};
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
/// Separators people put between contact details. Stripping them is what turns
/// a leftover "· ·  London ·" back into "London".
const CONTACT_SEPARATORS: [char; 6] = ['·', '|', ',', '-', '–', '•'];

/// Separators that can divide a name from the contact details beside it on one
/// line. A bare hyphen is deliberately absent: "Anne-Marie" must survive.
const NAME_SEPARATORS: [&str; 5] = ["·", "|", "•", " - ", " — "];

fn parse_contact(header: &[String]) -> Contact {
    let mut contact = Contact::default();
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
        if let Some(m) = phone_re().find(line) {
            if contact.phone.is_empty() {
                contact.phone = m.as_str().trim().to_string();
            }
            leftover = leftover.replace(m.as_str(), "");
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
            let mut remainder = leftover
                .trim_matches(|c: char| c.is_whitespace() || CONTACT_SEPARATORS.contains(&c))
                .trim()
                .to_string();
            for separator in NAME_SEPARATORS {
                if let Some((head, _)) = remainder.split_once(separator) {
                    remainder = head.trim().to_string();
                }
            }
            if !remainder.is_empty() {
                contact.name = remainder;
            }
        }

        // The name line is the name, never a location. Everything below it that
        // is not an email, a phone number or a link is text the user typed and
        // we would otherwise throw away.
        if index > 0 && contact.location.is_empty() {
            let remainder = leftover
                .trim_matches(|c: char| c.is_whitespace() || CONTACT_SEPARATORS.contains(&c))
                .trim()
                .to_string();
            if !remainder.is_empty() {
                contact.location = remainder;
            }
        }
    }
    contact
}

const MONTHS: &[&str] = &[
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

fn month_number(word: &str) -> Option<u8> {
    let w = word.trim_end_matches('.').to_lowercase();
    if w.len() < 3 {
        return None;
    }
    MONTHS
        .iter()
        .position(|m| *m == w || m.starts_with(&w))
        .map(|i| i as u8 + 1)
}

fn side_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    // Either "Present"/"Current"/"Now", or an optional month word plus a year.
    RE.get_or_init(|| {
        Regex::new(r"(?i)\b(present|current|now)\b|\b([A-Za-z]{3,9}\.?)?\s*(\d{4})\b").unwrap()
    })
}

fn separator_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\s+(?:-|–|—|to|until)\s+").unwrap())
}

fn parse_one_date(text: &str) -> Option<DateMark> {
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
    let year = caps.get(3)?.as_str().parse::<u16>().ok()?;
    let month = caps.get(2).and_then(|m| month_number(m.as_str()));
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
pub fn parse_date_range(line: &str) -> Option<(DateMark, DateMark)> {
    let split = separator_re().find(line)?;
    let left = &line[..split.start()];
    let right = &line[split.end()..];
    Some((parse_one_date(left)?, parse_one_date(right)?))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Section {
    Summary,
    Experience,
    Education,
    Projects,
    Skills,
    Leadership,
    Awards,
    Interests,
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
    ("skills & interests", Section::Skills),
    ("skills and interests", Section::Skills),
    ("skills & proficiencies", Section::Skills),
    ("top skills", Section::Skills),
    ("leadership", Section::Leadership),
    ("leadership & activities", Section::Leadership),
    ("leadership activities", Section::Leadership),
    ("activities", Section::Leadership),
    ("activities & extracurriculars", Section::Leadership),
    ("extracurriculars", Section::Leadership),
    ("volunteer experience", Section::Leadership),
    ("awards", Section::Awards),
    ("honors", Section::Awards),
    ("awards & accomplishments", Section::Awards),
    ("honors & awards", Section::Awards),
    ("interests", Section::Interests),
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

fn split_items(line: &str) -> Vec<String> {
    line.split([',', '·', '|', ';'])
        .map(|s| s.trim_start_matches(BULLET_MARKS).trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// A label is a short run of words before a colon — "Technical: Rust, Python".
/// The length cap stops a sentence containing a colon from becoming a label.
fn labelled(line: &str) -> Option<(String, &str)> {
    let stripped = line.trim_start_matches(BULLET_MARKS).trim();
    let (label, rest) = stripped.split_once(':')?;
    let label = label.trim();
    if label.is_empty() || label.chars().count() > 28 || label.contains('.') {
        return None;
    }
    Some((label.to_string(), rest))
}

/// Skills come as one comma-separated line, several lines, bullets, or the
/// labelled groups the university templates use. All four collapse to the same
/// shape: an unlabelled group is simply one with an empty label.
fn parse_skills(body: &[String]) -> Vec<SkillGroup> {
    let mut groups: Vec<SkillGroup> = Vec::new();
    let mut loose: Vec<String> = Vec::new();
    for line in body {
        match labelled(line) {
            Some((label, rest)) => groups.push(SkillGroup {
                label,
                items: split_items(rest),
            }),
            None => loose.extend(split_items(line)),
        }
    }
    if !loose.is_empty() {
        groups.insert(
            0,
            SkillGroup {
                label: String::new(),
                items: loose,
            },
        );
    }
    groups
}

/// Awards and interests are plain lines — one per entry, or one comma-separated
/// line. Nothing is inferred beyond that.
fn parse_lines(body: &[String]) -> Vec<String> {
    body.iter()
        .flat_map(|line| {
            let stripped = line.trim_start_matches(BULLET_MARKS).trim();
            if stripped.contains(',') && stripped.split(',').count() > 1 && stripped.len() < 120 {
                split_items(stripped)
            } else {
                vec![stripped.to_string()]
            }
        })
        .filter(|s| !s.is_empty())
        .collect()
}

const BULLET_MARKS: [char; 5] = ['-', '•', '*', '–', '▪'];

fn is_bullet(line: &str) -> bool {
    line.starts_with(BULLET_MARKS)
}

fn bullet_text(line: &str) -> String {
    line.trim_start_matches(BULLET_MARKS).trim().to_string()
}

/// "Analyst, Admiralty" · "Analyst at Admiralty" · "Analyst — Admiralty".
/// One separator only; a title containing a comma keeps everything after the
/// first one as the organisation, which the Check screen lets a human fix.
fn split_title_and_org(line: &str) -> (String, String) {
    for sep in [" — ", " – ", " - ", ", ", " at ", " | "] {
        if let Some((title, org)) = line.split_once(sep) {
            return (title.trim().to_string(), org.trim().to_string());
        }
    }
    (line.trim().to_string(), String::new())
}

/// A block is one entry: its heading lines, then its bullets. A new block
/// begins at the first non-bullet line after a bullet or a date has been seen.
fn blocks_of(body: &[String]) -> Vec<Vec<String>> {
    let mut blocks: Vec<Vec<String>> = Vec::new();
    let mut seen_detail = false;
    for line in body {
        let starts_new = !is_bullet(line) && seen_detail;
        if blocks.is_empty() || starts_new {
            blocks.push(Vec::new());
            seen_detail = false;
        }
        if is_bullet(line) || parse_date_range(line).is_some() {
            seen_detail = true;
        }
        blocks.last_mut().expect("just pushed").push(line.clone());
    }
    blocks
}

fn parse_role(block: &[String], section: &str, index: usize) -> Role {
    let mut role = Role {
        id: entry_id(section, index),
        ..Role::default()
    };
    let mut heading_taken = false;
    let mut bullet_index = 0usize;
    for line in block {
        if is_bullet(line) {
            role.bullets.push(Bullet {
                id: bullet_id(section, index, bullet_index),
                text: bullet_text(line),
            });
            bullet_index += 1;
            continue;
        }
        if let Some((start, end)) = parse_date_range(line) {
            role.start = start;
            role.end = end;
            // The date may share the line with the title: strip it, keep the rest.
            let rest = line.replace(&role.start.raw, "").replace(&role.end.raw, "");
            let rest = rest
                .trim_matches(|c: char| !c.is_alphanumeric())
                .trim()
                .to_string();
            if !heading_taken && !rest.is_empty() {
                let (title, org) = split_title_and_org(&rest);
                role.title = title;
                role.organization = org;
                heading_taken = true;
            }
            continue;
        }
        if !heading_taken {
            let (title, org) = split_title_and_org(line);
            role.title = title;
            role.organization = org;
            heading_taken = true;
        } else if role.location.is_empty() {
            role.location = line.clone();
        }
    }
    role
}

fn parse_school(block: &[String], index: usize) -> School {
    let mut school = School {
        id: entry_id("edu", index),
        ..School::default()
    };
    let mut note_index = 0usize;
    for line in block {
        if is_bullet(line) {
            school.notes.push(Bullet {
                id: bullet_id("edu", index, note_index),
                text: bullet_text(line),
            });
            note_index += 1;
        } else if let Some((start, end)) = parse_date_range(line) {
            school.start = start;
            school.end = end;
        } else if school.institution.is_empty() {
            school.institution = line.clone();
        } else if school.credential.is_empty() {
            school.credential = line.clone();
        } else if school.location.is_empty() {
            school.location = line.clone();
        }
    }
    school
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
            Section::Experience => {
                doc.experience = blocks_of(body)
                    .iter()
                    .enumerate()
                    .map(|(i, block)| parse_role(block, "exp", i))
                    .collect();
            }
            Section::Projects => {
                doc.projects = blocks_of(body)
                    .iter()
                    .enumerate()
                    .map(|(i, block)| parse_role(block, "proj", i))
                    .collect();
            }
            Section::Education => {
                doc.education = blocks_of(body)
                    .iter()
                    .enumerate()
                    .map(|(i, block)| parse_school(block, i))
                    .collect();
            }
            Section::Leadership => {
                doc.leadership = blocks_of(body)
                    .iter()
                    .enumerate()
                    .map(|(i, block)| parse_role(block, "lead", i))
                    .collect();
            }
            Section::Awards => doc.awards = parse_lines(body),
            Section::Interests => doc.interests = parse_lines(body),
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

    /// Whatever is left on a header line after the email, phone and links have
    /// been taken is almost always the place the person lives. Dropping it
    /// would lose text the user typed, which is the one thing this parser must
    /// never do.
    #[test]
    fn keeps_the_leftover_header_text_as_a_location() {
        let doc = parse_text("Ada Lovelace\nLondon · (555) 123-4567 · ada@example.com\n");
        assert_eq!(doc.contact.location, "London");
    }

    /// Templates that put the whole contact block on line one used to make the
    /// entire line the person's name.
    #[test]
    fn a_name_sharing_its_line_with_contact_details_is_read_alone() {
        let doc = parse_text("Ada Lovelace | 12 Acacia Ave | (555) 123-4567 | ada@example.com\n");
        assert_eq!(doc.contact.name, "Ada Lovelace");
        assert_eq!(doc.contact.email, "ada@example.com");
    }

    #[test]
    fn a_hyphenated_name_is_not_split() {
        let doc = parse_text("Anne-Marie Saint-Clair\nanne@example.com\n");
        assert_eq!(doc.contact.name, "Anne-Marie Saint-Clair");
    }

    #[test]
    fn a_name_with_a_spaced_dash_before_details_is_split_there() {
        let doc = parse_text("Ada Lovelace - ada@example.com\n");
        assert_eq!(doc.contact.name, "Ada Lovelace");
    }

    #[test]
    fn does_not_mistake_the_name_line_for_a_location() {
        let doc = parse_text("Ada Lovelace\nada@example.com\n");
        assert_eq!(doc.contact.location, "");
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
    fn summary_and_skills_land_on_the_document() {
        let doc = parse_text(SAMPLE);
        assert_eq!(doc.summary, "Analytical engine programmer.");
        assert_eq!(doc.skills.len(), 1);
        assert_eq!(doc.skills[0].label, "");
        assert_eq!(doc.skills[0].items, vec!["Rust", "Analysis", "Notation"]);
        assert_eq!(doc.contact.name, "Ada Lovelace");
    }

    #[test]
    fn builds_a_role_from_a_title_line_a_date_line_and_bullets() {
        let doc = parse_text(SAMPLE);
        assert_eq!(doc.experience.len(), 1);
        let role = &doc.experience[0];
        assert_eq!(role.title, "Analyst");
        assert_eq!(role.organization, "Admiralty");
        assert_eq!(role.start.year, Some(2021));
        assert!(role.end.present);
        assert_eq!(role.bullets.len(), 1);
        assert_eq!(role.bullets[0].text, "Wrote the first algorithm");
        assert_eq!(role.bullets[0].id, "exp-0-b-0");
        assert_eq!(role.id, "exp-0");
    }

    #[test]
    fn a_date_on_the_same_line_as_the_title_still_works() {
        let doc = parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty (Jan 2021 - Mar 2023)\n- Did the work\n",
        );
        let role = &doc.experience[0];
        assert_eq!(role.title, "Analyst");
        assert_eq!(role.organization, "Admiralty");
        assert_eq!(role.end.year, Some(2023));
        assert_eq!(role.bullets.len(), 1);
    }

    #[test]
    fn a_second_entry_starts_at_the_next_non_bullet_line() {
        let doc = parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty\n2021 - 2023\n- One\nIntern, Works\n2020 - 2021\n- Two\n",
        );
        assert_eq!(doc.experience.len(), 2);
        assert_eq!(doc.experience[1].title, "Intern");
        assert_eq!(doc.experience[1].bullets[0].id, "exp-1-b-0");
    }

    #[test]
    fn labelled_skill_lines_become_groups() {
        let doc = parse_text(
            "Ada\n\nSKILLS\nTechnical: Rust, Python\nLanguage: French, Latin\n",
        );
        assert_eq!(doc.skills.len(), 2);
        assert_eq!(doc.skills[0].label, "Technical");
        assert_eq!(doc.skills[0].items, vec!["Rust", "Python"]);
        assert_eq!(doc.skills[1].label, "Language");
    }

    /// A sentence that happens to contain a colon is not a category.
    #[test]
    fn a_long_phrase_before_a_colon_is_not_a_label() {
        let doc = parse_text(
            "Ada\n\nSKILLS\nThings I have used across many teams: Rust, Python\n",
        );
        assert_eq!(doc.skills.len(), 1);
        assert_eq!(doc.skills[0].label, "");
    }

    #[test]
    fn leadership_awards_and_interests_are_parsed() {
        let doc = parse_text(
            "Ada\n\nLEADERSHIP & ACTIVITIES\nPresident, Chess Club\n2021 - 2022\n- Ran the league\n\nAWARDS\nDean's List\nDe Morgan Medal\n\nINTERESTS\nWeaving, Number theory\n",
        );
        assert_eq!(doc.leadership.len(), 1);
        assert_eq!(doc.leadership[0].title, "President");
        assert_eq!(doc.leadership[0].id, "lead-0");
        assert_eq!(doc.leadership[0].bullets[0].id, "lead-0-b-0");
        assert_eq!(doc.awards, vec!["Dean's List", "De Morgan Medal"]);
        assert_eq!(doc.interests, vec!["Weaving", "Number theory"]);
    }

    #[test]
    fn education_keeps_institution_and_credential() {
        let doc = parse_text(SAMPLE);
        assert_eq!(doc.education.len(), 1);
        assert_eq!(doc.education[0].institution, "University of London");
        assert_eq!(doc.education[0].credential, "BSc Mathematics, 2019");
        assert_eq!(doc.education[0].id, "edu-0");
    }
}
