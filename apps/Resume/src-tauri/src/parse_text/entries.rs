//! Blocks of lines into roles, schools, skills and lists.

use super::dates::{parse_date_range, without_dates};
use super::lines::{is_bullet, bullet_text, BULLET_MARKS};
use crate::model::{bullet_id, entry_id, Bullet, Role, School, SkillGroup};

pub(super) fn split_items(line: &str) -> Vec<String> {
    line.split([',', '·', '|', ';'])
        .map(|s| s.trim_start_matches(BULLET_MARKS).trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// A label is a short run of words before a colon — "Technical: Rust, Python".
/// The length cap stops a sentence containing a colon from becoming a label.
pub(super) fn labelled(line: &str) -> Option<(String, &str)> {
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
pub(super) fn parse_skills(body: &[String]) -> Vec<SkillGroup> {
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
///
/// The comma only divides when the whole section is that one line. A list
/// written one item per line is already divided, and "Dean's List, Fall 2021"
/// is one award with a comma in it, not two awards.
pub(super) fn parse_lines(body: &[String]) -> Vec<String> {
    let one_line = body.len() == 1;
    body.iter()
        .flat_map(|line| {
            let stripped = line.trim_start_matches(BULLET_MARKS).trim();
            if one_line && stripped.contains(',') && stripped.len() < 120 {
                split_items(stripped)
            } else {
                vec![stripped.to_string()]
            }
        })
        .filter(|s| !s.is_empty())
        .collect()
}

/// "Analyst, Admiralty" · "Analyst at Admiralty" · "Analyst — Admiralty".
/// One separator only; a title containing a comma keeps everything after the
/// first one as the organisation, which the Check screen lets a human fix.
pub(super) fn split_title_and_org(line: &str) -> (String, String) {
    // A pipe divides before a comma does: "Job Title | Company, Location" is a
    // title and a company, not a title-with-a-pipe-in-it and a city.
    for sep in [" — ", " – ", " - ", " | ", " • ", " · ", ", ", " at "] {
        if let Some((title, org)) = line.split_once(sep) {
            return (title.trim().to_string(), org.trim().to_string());
        }
    }
    (line.trim().to_string(), String::new())
}

/// One entry per block, ids minted from `section`. Experience, Projects and
/// Leadership are the same shape and differ only in that prefix.
pub(super) fn roles_of(body: &[String], section: &str) -> Vec<Role> {
    blocks_of(body)
        .iter()
        .enumerate()
        .map(|(i, block)| parse_role(block, section, i))
        .collect()
}

/// A plain line begins a new entry once the current one has bullets, once a
/// line of nothing but dates has closed its heading, or when it carries dates
/// of its own and the current entry already has some.
///
/// The case this rule exists for: "Analyst, Admiralty — Jan 2021 to Present"
/// followed by "London, UK". Treating any line after a date as a new entry made
/// that office into a phantom role and gave it the real role's bullets. A line
/// holding *only* dates is different — it closes a heading, so what follows it
/// is the next entry.
/// A heading line is short. Anything this long with no dates in it is a
/// sentence about the job, which is how the resumes that use paragraphs instead
/// of bullets are written.
pub(super) const PROSE_LENGTH: usize = 90;

pub(super) fn blocks_of(body: &[String]) -> Vec<Vec<String>> {
    let mut blocks: Vec<Vec<String>> = Vec::new();
    let mut seen_bullet = false;
    let mut seen_prose = false;
    let mut seen_date = false;
    let mut date_closed_the_heading = false;
    for line in body {
        let dates = parse_date_range(line);
        let bare_date = dates
            .as_ref()
            .is_some_and(|(start, end)| without_dates(line, start, end).is_empty());
        let prose =
            !is_bullet(line) && dates.is_none() && line.chars().count() > PROSE_LENGTH;
        let starts_new = !is_bullet(line)
            && !prose
            && (seen_bullet
                || seen_prose
                || date_closed_the_heading
                || (seen_date && dates.is_some()));
        if blocks.is_empty() || starts_new {
            blocks.push(Vec::new());
            seen_bullet = false;
            seen_prose = false;
            seen_date = false;
            date_closed_the_heading = false;
        }
        seen_bullet |= is_bullet(line);
        seen_prose |= prose;
        seen_date |= dates.is_some();
        date_closed_the_heading |= bare_date;
        blocks.last_mut().expect("just pushed").push(line.clone());
    }
    blocks
}

/// An employer and a city are a few words with no full stop after them. This is
/// what keeps "Reporting to the Astronomer Royal on numerical methods." out of
/// the location field of a role that happens not to name a city.
pub(super) fn is_a_detail(text: &str) -> bool {
    text.split_whitespace().count() <= 6 && !text.ends_with('.')
}

pub(super) fn parse_role(block: &[String], section: &str, index: usize) -> Role {
    let mut role = Role {
        id: entry_id(section, index),
        ..Role::default()
    };
    let mut heading_taken = false;
    let mut bullet_index = 0usize;
    let keep = |role: &mut Role, text: String, bullet_index: &mut usize| {
        role.bullets.push(Bullet {
            id: bullet_id(section, index, *bullet_index),
            text,
        });
        *bullet_index += 1;
    };
    for line in block {
        if is_bullet(line) {
            keep(&mut role, bullet_text(line), &mut bullet_index);
            continue;
        }
        // The date may share the line with the title: take it, keep the rest.
        let text = match parse_date_range(line) {
            Some((start, end)) => {
                let rest = without_dates(line, &start, &end);
                role.start = start;
                role.end = end;
                rest
            }
            None => line.clone(),
        };
        if text.is_empty() {
            continue;
        }
        if !heading_taken {
            let (title, org) = split_title_and_org(&text);
            role.title = title;
            role.organization = org;
            heading_taken = true;
        } else if !is_a_detail(&text) {
            // A sentence is never an employer or a city, however empty the
            // field is. It is something the person did in the job.
            keep(&mut role, text, &mut bullet_index);
        } else if role.organization.is_empty() {
            // "Analyst" on one line and "Admiralty" on the next is as common as
            // the two of them sharing a line.
            role.organization = text;
        } else if role.location.is_empty() {
            role.location = text;
        } else {
            // Anything further is a sentence about the job written without a
            // marker. It becomes a bullet rather than being thrown away.
            keep(&mut role, text, &mut bullet_index);
        }
    }
    role
}

/// A thesis title or a line of coursework written under a degree's dates looks
/// exactly like the start of the next school: one plain line after a line of
/// nothing but dates. It is told apart afterwards — a school with no dates, no
/// credential and no notes of its own, sitting under one that has dates, is a
/// note on that one.
pub(super) fn schools_of(body: &[String]) -> Vec<School> {
    let mut schools: Vec<School> = Vec::new();
    for block in blocks_of(body) {
        let school = parse_school(&block, schools.len());
        let is_a_stray_line = school.credential.is_empty()
            && school.notes.is_empty()
            && school.start.raw.is_empty()
            && school.end.raw.is_empty();
        let index = schools.len().saturating_sub(1);
        match schools.last_mut() {
            Some(previous) if is_a_stray_line && !previous.end.raw.is_empty() => {
                let note = bullet_id("edu", index, previous.notes.len());
                previous.notes.push(Bullet {
                    id: note,
                    text: school.institution,
                });
            }
            _ => schools.push(school),
        }
    }
    schools
}

pub(super) fn parse_school(block: &[String], index: usize) -> School {
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
        } else {
            // A thesis title, a GPA, a line of coursework. Kept as a note; the
            // alternative was dropping it.
            school.notes.push(Bullet {
                id: bullet_id("edu", index, note_index),
                text: line.clone(),
            });
            note_index += 1;
        }
    }
    school
}
