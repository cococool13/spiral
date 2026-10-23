use serde::{Deserialize, Serialize};

use crate::model::{DateMark, ResumeDoc};
use crate::parse_text;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ContactField {
    Name,
    Email,
    Phone,
    Location,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum Finding {
    HiddenText { page: u32, sample: String },
    UnknownHeading { raw: String },
    UnparsedDate { raw: String },
    MissingContact { field: ContactField },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HiddenRun {
    pub page: u32,
    pub sample: String,
}

pub fn check(text: &str, doc: &ResumeDoc, hidden: &[HiddenRun]) -> Vec<Finding> {
    let mut findings = Vec::new();
    for run in hidden {
        let sample: String = run.sample.chars().take(80).collect();
        if sample.trim().is_empty() {
            continue;
        }
        findings.push(Finding::HiddenText {
            page: run.page,
            sample,
        });
    }
    for line in text.lines() {
        if unknown_heading(line) {
            findings.push(Finding::UnknownHeading {
                raw: line.trim().to_string(),
            });
        }
    }
    for role in doc.roles() {
        date_finding(&role.start, &mut findings);
        date_finding(&role.end, &mut findings);
    }
    for school in &doc.education {
        date_finding(&school.start, &mut findings);
        date_finding(&school.end, &mut findings);
    }
    if doc.contact.name.trim().is_empty() {
        findings.push(Finding::MissingContact {
            field: ContactField::Name,
        });
    }
    if doc.contact.email.trim().is_empty() {
        findings.push(Finding::MissingContact {
            field: ContactField::Email,
        });
    }
    if doc.contact.phone.trim().is_empty() {
        findings.push(Finding::MissingContact {
            field: ContactField::Phone,
        });
    }
    if doc.contact.location.trim().is_empty() {
        findings.push(Finding::MissingContact {
            field: ContactField::Location,
        });
    }
    findings
}

fn date_finding(mark: &DateMark, findings: &mut Vec<Finding>) {
    if mark.raw.trim().is_empty() || mark.year.is_some() || mark.present {
        return;
    }
    findings.push(Finding::UnparsedDate {
        raw: mark.raw.clone(),
    });
}

fn unknown_heading(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.len() < 3 || trimmed.len() > 40 {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    if trimmed.contains('@') || lower.contains("http") {
        return false;
    }
    if parse_text::looks_bulleted(trimmed) || parse_text::known_heading(trimmed) {
        return false;
    }
    let words = trimmed.split_whitespace().count();
    if words == 0 || words > 4 {
        return false;
    }
    let letters: String = trimmed
        .chars()
        .filter(|ch| ch.is_ascii_alphabetic())
        .collect();
    if letters.is_empty() {
        return false;
    }
    let caps = letters.chars().all(|ch| ch.is_ascii_uppercase());
    caps || trimmed.ends_with(':')
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse_text::parse_text;

    fn two_page_text() -> String {
        let mut lines = vec![
            "Ada Lovelace".to_string(),
            "ada@example.com".to_string(),
            "555-0100".to_string(),
            "London".to_string(),
            String::new(),
            "EXPERIENCE".to_string(),
        ];
        for role in 0..6 {
            lines.push(format!("Analyst {role}, Office {role}"));
            lines.push("Jan 2020 - Dec 2021".to_string());
            for bullet in 0..8 {
                lines.push(format!(
                    "- Wrote report {role}-{bullet} for the board and filed the numbers the same week."
                ));
            }
        }
        lines.push(String::new());
        lines.push("SIDE QUESTS".to_string());
        lines.push("Kept a private index of the papers.".to_string());
        lines.join("\n")
    }

    #[test]
    fn two_page_check_finishes_within_100ms() {
        let text = two_page_text();
        let doc = parse_text(&text);
        assert!(text.len() > 2000, "fixture was {} bytes", text.len());
        let _ = check(&text, &doc, &[]);
        let started = std::time::Instant::now();
        let findings = check(&text, &doc, &[]);
        let elapsed = started.elapsed();
        assert!(
            elapsed.as_millis() < 100,
            "ats check took {elapsed:?} with {} findings",
            findings.len()
        );
        assert!(findings.iter().any(|finding| matches!(
            finding,
            Finding::UnknownHeading { raw } if raw == "SIDE QUESTS"
        )));
    }

    #[test]
    fn a_name_and_a_known_heading_are_not_findings() {
        let text = "Ada Lovelace\nada@example.com\n\nEXPERIENCE\nAnalyst, Admiralty\nJan 2021 - Present\n- Wrote it\n";
        let doc = parse_text(text);
        let findings = check(text, &doc, &[]);
        assert!(findings.iter().all(|finding| !matches!(
            finding,
            Finding::UnknownHeading { raw } if raw == "Ada Lovelace" || raw == "EXPERIENCE"
        )));
    }

    #[test]
    fn missing_contact_and_an_unparsed_date_are_named() {
        let mut doc = ResumeDoc::empty();
        doc.experience.push(crate::model::Role {
            id: "exp-0".into(),
            title: "Analyst".into(),
            organization: "Admiralty".into(),
            end: DateMark {
                raw: "last spring".into(),
                ..DateMark::default()
            },
            ..crate::model::Role::default()
        });
        let findings = check("", &doc, &[]);
        assert!(findings.contains(&Finding::MissingContact {
            field: ContactField::Name
        }));
        assert!(findings.contains(&Finding::UnparsedDate {
            raw: "last spring".into()
        }));
    }

    #[test]
    fn hidden_text_is_reported_when_the_importer_found_it() {
        let doc = ResumeDoc::empty();
        let findings = check(
            "",
            &doc,
            &[HiddenRun {
                page: 2,
                sample: "white text".into(),
            }],
        );
        assert!(findings.contains(&Finding::HiddenText {
            page: 2,
            sample: "white text".into(),
        }));
    }
}
