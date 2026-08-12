//! The model tier's wording pass.
//!
//! What the model is given: bullet text, numbered. That is all. It never sees a
//! name, an employer, a title, a date, a school, or the document as a whole —
//! not because it would misuse them, but because a fact it never receives is a
//! fact it cannot change.
//!
//! What comes back goes through `gate::check` before it touches the document.
//! A rewrite that moved a number or a name is discarded and the original kept,
//! and the count is reported to the user. Rejections are a normal outcome, not
//! a failure.

use crate::gate::{self, Verdict};
use crate::model::ResumeDoc;
use serde::{Deserialize, Serialize};

const SYSTEM: &str = "\
You tighten the wording of resume bullet points. You are given a numbered list \
of bullets and you return the same number of rewritten bullets.

Rules, in order of importance:
1. Never change a fact. Every number, percentage, amount of money, date, \
company name, product name, place name and acronym must appear in your rewrite \
exactly as it appears in the original. Do not add a number that is not already \
there. Do not add a company or product that is not already there.
2. Lead with a strong past-tense verb describing what the person did.
3. Remove filler: 'responsible for', 'helped to', 'worked on', 'duties included'.
4. Keep it the same length or shorter. Never pad.
5. If a bullet is already tight, make one small improvement rather than none.

Reply with JSON only, in the form {\"bullets\": [{\"n\": 1, \"text\": \"...\"}]}. \
No commentary.";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub rewritten: usize,
    pub rejected: usize,
    /// One line per rejection, for the user to read. Never a stack trace.
    pub notes: Vec<String>,
}

#[derive(Deserialize)]
struct ReplyBullet {
    n: usize,
    #[serde(default)]
    text: String,
}

#[derive(Deserialize)]
struct Reply {
    #[serde(default)]
    bullets: Vec<ReplyBullet>,
}

/// Every bullet in the document, in a stable order, paired with its id.
fn bullets_of(doc: &ResumeDoc) -> Vec<(String, String)> {
    doc.experience
        .iter()
        .chain(doc.projects.iter())
        .chain(doc.leadership.iter())
        .flat_map(|role| role.bullets.iter())
        .filter(|bullet| !bullet.text.trim().is_empty())
        .map(|bullet| (bullet.id.clone(), bullet.text.clone()))
        .collect()
}

pub fn prompt_for(bullets: &[(String, String)]) -> String {
    bullets
        .iter()
        .enumerate()
        .map(|(index, (_, text))| format!("{}. {text}", index + 1))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn system_prompt() -> &'static str {
    SYSTEM
}

/// Apply a model reply to a document. Pure — no network — so the gate's
/// behaviour is testable without a key.
pub fn apply(doc: &ResumeDoc, bullets: &[(String, String)], raw: &str) -> (ResumeDoc, Outcome) {
    let mut out = doc.clone();
    let mut outcome = Outcome {
        rewritten: 0,
        rejected: 0,
        notes: Vec::new(),
    };

    let reply: Reply = match serde_json::from_str(raw) {
        Ok(reply) => reply,
        Err(_) => {
            // An unreadable reply changes nothing. The document is never left
            // half-rewritten.
            outcome.notes.push(
                "That service replied with something this app could not read — your wording is unchanged."
                    .to_string(),
            );
            return (out, outcome);
        }
    };

    for candidate in reply.bullets {
        let Some((id, source)) = bullets.get(candidate.n.wrapping_sub(1)) else {
            continue;
        };
        match gate::check(source, &candidate.text) {
            Verdict::Accepted(text) => {
                if set_bullet(&mut out, id, &text) {
                    outcome.rewritten += 1;
                }
            }
            Verdict::Rejected(why) => {
                outcome.rejected += 1;
                outcome
                    .notes
                    .push(format!("Kept your own wording for one bullet — the rewrite {why}."));
            }
        }
    }

    (out, outcome)
}

fn set_bullet(doc: &mut ResumeDoc, id: &str, text: &str) -> bool {
    for role in doc
        .experience
        .iter_mut()
        .chain(doc.projects.iter_mut())
        .chain(doc.leadership.iter_mut())
    {
        for bullet in role.bullets.iter_mut() {
            if bullet.id == id {
                bullet.text = text.to_string();
                return true;
            }
        }
    }
    false
}

/// The whole pass: collect bullets, ask the model, gate every answer.
pub async fn rewrite_doc(
    doc: &ResumeDoc,
    provider: &crate::provider::Provider,
    key: &str,
    model: &str,
) -> Result<(ResumeDoc, Outcome), String> {
    let bullets = bullets_of(doc);
    if bullets.is_empty() {
        return Ok((
            doc.clone(),
            Outcome {
                rewritten: 0,
                rejected: 0,
                notes: Vec::new(),
            },
        ));
    }
    let raw = crate::provider::send(provider, key, model, SYSTEM, &prompt_for(&bullets)).await?;
    Ok(apply(doc, &bullets, &raw))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> ResumeDoc {
        crate::parse_text::parse_text(
            "Ada Lovelace\n\nEXPERIENCE\nAnalyst, Admiralty\nJan 2021 - Present\n- Was responsible for managing a team of 6 engineers at Admiralty\n- Checked 400 tables of logarithms\n",
        )
    }

    #[test]
    fn the_model_is_never_shown_a_fact_beyond_the_bullet_text() {
        let doc = sample();
        let prompt = prompt_for(&bullets_of(&doc));
        for fact in ["Ada Lovelace", "Analyst", "Jan 2021", "Present"] {
            assert!(!prompt.contains(fact), "the prompt leaked {fact:?}:\n{prompt}");
        }
        assert!(prompt.contains("logarithms"));
    }

    #[test]
    fn a_good_rewrite_is_written_back() {
        let doc = sample();
        let bullets = bullets_of(&doc);
        let raw = r#"{"bullets":[{"n":1,"text":"Managed 6 engineers at Admiralty"}]}"#;
        let (out, outcome) = apply(&doc, &bullets, raw);
        assert_eq!(outcome.rewritten, 1);
        assert_eq!(outcome.rejected, 0);
        assert_eq!(out.experience[0].bullets[0].text, "Managed 6 engineers at Admiralty");
    }

    /// The milestone in one test: the model invents a number, and the user's
    /// own wording survives anyway.
    #[test]
    fn an_invented_number_is_discarded_and_the_original_kept() {
        let doc = sample();
        let bullets = bullets_of(&doc);
        let raw = r#"{"bullets":[{"n":2,"text":"Checked 400 tables of logarithms, cutting errors by 30%"}]}"#;
        let (out, outcome) = apply(&doc, &bullets, raw);

        assert_eq!(outcome.rewritten, 0);
        assert_eq!(outcome.rejected, 1);
        assert_eq!(out.experience[0].bullets[1].text, doc.experience[0].bullets[1].text);
        assert!(outcome.notes[0].contains("changed a number"), "{:?}", outcome.notes);
    }

    #[test]
    fn an_invented_employer_is_discarded() {
        let doc = sample();
        let bullets = bullets_of(&doc);
        let raw = r#"{"bullets":[{"n":2,"text":"Checked 400 tables of logarithms at Google"}]}"#;
        let (_, outcome) = apply(&doc, &bullets, raw);
        assert_eq!(outcome.rejected, 1);
        assert!(outcome.notes[0].contains("introduced a name"));
    }

    #[test]
    fn an_unreadable_reply_leaves_the_document_exactly_as_it_was() {
        let doc = sample();
        let bullets = bullets_of(&doc);
        let (out, outcome) = apply(&doc, &bullets, "sorry, I cannot do that");
        assert_eq!(out, doc);
        assert_eq!(outcome.rewritten, 0);
        assert!(outcome.notes[0].contains("could not read"));
    }

    #[test]
    fn an_answer_referring_to_a_bullet_that_does_not_exist_is_ignored() {
        let doc = sample();
        let bullets = bullets_of(&doc);
        let raw = r#"{"bullets":[{"n":99,"text":"Something"},{"n":0,"text":"Something else"}]}"#;
        let (out, outcome) = apply(&doc, &bullets, raw);
        assert_eq!(out, doc);
        assert_eq!(outcome.rewritten, 0);
        assert_eq!(outcome.rejected, 0);
    }

    #[test]
    fn bullets_are_collected_from_every_section_that_has_them() {
        let doc = crate::parse_text::parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty\n2021 - 2022\n- One\n\nLEADERSHIP & ACTIVITIES\nPresident, Chess Club\n2020 - 2021\n- Two\n",
        );
        let ids: Vec<String> = bullets_of(&doc).into_iter().map(|(id, _)| id).collect();
        assert_eq!(ids, vec!["exp-0-b-0", "lead-0-b-0"]);
    }

    #[test]
    fn the_system_prompt_forbids_inventing_facts_in_its_first_rule() {
        assert!(system_prompt().contains("Never change a fact"));
        assert!(system_prompt().contains("Do not add a number"));
    }
}
