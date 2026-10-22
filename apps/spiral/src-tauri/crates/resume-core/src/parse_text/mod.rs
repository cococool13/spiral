//! Plain text in, `ResumeDoc` out. Pure — no I/O, no clock, no randomness, so
//! the same paste always produces the same document.
//!
//! This parser is deliberately conservative. Anything it is unsure about it
//! leaves in place rather than guessing, because the Check screen is where a
//! human resolves ambiguity and a confident wrong guess is worse than a blank.
//!
//! The work splits into five stages, one module each: `lines` repairs how the
//! text arrived, `headings` decides which section a line names, `contact` reads
//! the block at the top, `dates` reads a range as written, and `entries` builds
//! the roles and schools. This file is only the order they run in. Behaviour
//! tests live in `tests.rs`.

mod contact;
mod dates;
mod entries;
mod headings;
mod lines;

use crate::model::ResumeDoc;
use contact::{fill_missing_contact, parse_contact};

/// Whether a line already carries a bullet mark.
///
/// The one thing an importer is allowed to ask this module before handing over
/// its lines. `import/docx` needs it because a Word bullet is a paragraph
/// property rather than a character, so it has to add a mark — but only when
/// there is not one there already, and which characters count is a fact that
/// belongs here with the other eleven.
pub fn looks_bulleted(line: &str) -> bool {
    lines::is_bullet(line.trim())
}

use dates::{parse_date_range, without_dates};
use entries::{parse_lines, parse_skills, roles_of, schools_of};
use headings::{merge_repeats, split_sections, Section};
use lines::{bullet_text, is_bullet, lines_of};

/// Where the contact block stops and the first job starts, in a resume that
/// names no sections at all. The first entry is the line above the first date
/// range or bullet — nobody's address has either in it.
fn first_entry_line(lines: &[String]) -> Option<usize> {
    let detail = lines
        .iter()
        .position(|line| is_bullet(line) || parse_date_range(line).is_some())?;
    // A date on the heading line itself means the entry starts there.
    Some(match parse_date_range(&lines[detail]) {
        Some((start, end)) if !without_dates(&lines[detail], &start, &end).is_empty() => detail,
        _ => detail.saturating_sub(1),
    })
}

/// Join summary lines into sentences. A bare space glued "analysis" onto
/// "Led"; a full stop between them is what a reader expects.
fn join_prose(parts: impl IntoIterator<Item = String>) -> String {
    let parts: Vec<String> = parts.into_iter().collect();
    if parts.is_empty() {
        return String::new();
    }
    if parts.len() == 1 {
        return parts[0].clone();
    }
    let mut out = String::new();
    for part in &parts {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if out.is_empty() {
            out.push_str(part);
            continue;
        }
        if out.ends_with(['.', '!', '?']) {
            out.push(' ');
        } else {
            out.push_str(". ");
        }
        out.push_str(part.trim_start_matches(|c: char| c == '.' || c.is_whitespace()));
    }
    if !out.is_empty() && !out.ends_with(['.', '!', '?']) {
        out.push('.');
    }
    out
}

pub fn parse_text(input: &str) -> ResumeDoc {
    let lines = lines_of(input);
    if lines.is_empty() {
        return ResumeDoc::empty();
    }
    let (mut header, mut sections) = split_sections(&lines);
    // No headings anywhere. Everything from the first job down is experience;
    // reading the whole page as a contact block would lose every role on it.
    if sections.is_empty() {
        match first_entry_line(&header) {
            Some(at) => {
                let body = header.split_off(at);
                sections.push((Section::Experience, body));
            }
            None => header = lines.clone(),
        }
    }
    let header = parse_contact(&header);
    let mut doc = ResumeDoc {
        contact: header.contact,
        // A paragraph above the first heading is the summary nobody labelled.
        // A labelled one, if the resume has one, replaces it below.
        summary: header.prose.join(" "),
        ..ResumeDoc::empty()
    };
    for (section, body) in &merge_repeats(sections) {
        match section {
            Section::Summary => {
                doc.summary = join_prose(
                    body.iter()
                        .map(|line| bullet_text(line))
                        .filter(|line| !line.is_empty()),
                )
            }
            Section::Skills => doc.skills = parse_skills(body),
            Section::Experience => doc.experience = roles_of(body, "exp"),
            Section::Projects => doc.projects = roles_of(body, "proj"),
            Section::Leadership => doc.leadership = roles_of(body, "lead"),
            Section::Education => doc.education = schools_of(body),
            Section::Awards => doc.awards = parse_lines(body),
            Section::Interests => doc.interests = parse_lines(body),
        }
    }
    fill_missing_contact(&mut doc.contact, &lines);
    doc
}

#[cfg(test)]
mod tests;
