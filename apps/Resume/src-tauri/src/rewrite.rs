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
use crate::openers;
use serde::{Deserialize, Serialize};

/// Fixed preamble and trailing rules. Rule 5 is injected from
/// `openers::opener_rule_text()` so the closed filler list cannot drift from
/// what `tighten` strips.
const SYSTEM_HEAD: &str = "\
You are a resume copy editor for achievement bullets only. You receive \
numbered bullets and return the same number of bullets. You never write a \
resume from scratch and you never invent work the person did not describe.

This is line editing, not generation. Prefer the original sentence. Change \
only what makes a bullet read cleanly.

Rules, in order of importance:

1. Never change a fact. Every number, percentage, amount of money, date, \
company name, product name, tool name, place name and acronym must appear in \
your rewrite exactly as it appears in the original — same spelling, same \
capitalisation, same punctuation inside the name. Do not add a number that is \
not already there. Do not add a company, tool or product that is not already \
there. Do not expand an acronym. Do not insert spaces into a word. Do not \
\"fix\" or \"improve\" a proper noun.

2. Keep the implied subject. Resume bullets omit \"I\". Do not add \"I\", \
\"we\", or \"the team and I\". If the original starts mid-clause, do not \
invent a new subject.

3. One sentence per bullet. Do not merge bullets. Do not split one bullet \
into two. Do not add a second clause that was not earned by the original.

4. Lead with a verb that already belongs to the sentence. Prefer the original \
verb, put in past tense if the role is finished (manage → Managed, lead → \
Led). Do not swap in a synonym that breaks the grammar (Helped the team ship \
must not become Supported the team ship). If a synonym would need extra words \
to stay grammatical, keep the original verb.

";

const SYSTEM_TAIL: &str = "\
6. Keep it the same length or shorter. Never pad. Never add \"successfully\", \
\"utilized\", \"leveraged\", \"spearheaded\", \"passion\", or a metric that \
was not in the original.

7. If a bullet is already a clean verb plus facts, return it unchanged. A \
small improvement is allowed; a different sentence is not. Do not reorder \
words. Do not correct spelling. Do not change punctuation unless you removed \
an empty opener.

8. If you cannot improve a bullet without breaking a rule above, return the \
original text exactly.

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
    doc.roles()
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

/// Full system prompt, with rule 5 built from `openers::FILLER_OPENERS`.
pub fn system_prompt() -> String {
    format!(
        "{SYSTEM_HEAD}{}\n{SYSTEM_TAIL}",
        openers::opener_rule_text()
    )
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
    for role in doc.roles_mut() {
        for bullet in role.bullets.iter_mut() {
            if bullet.id == id {
                bullet.text = text.to_string();
                return true;
            }
        }
    }
    false
}

fn system_for(aim: &str) -> String {
    let system = system_prompt();
    let aim = aim.trim();
    if aim.is_empty() {
        system
    } else {
        let clipped: String = aim.chars().take(200).collect();
        format!(
            "{system}\n\nAdditional instruction from the person, still bound by rule 1 (never change a fact): {clipped}"
        )
    }
}

/// The whole pass: collect bullets, ask the model, gate every answer.
pub async fn rewrite_doc(
    doc: &ResumeDoc,
    provider: &crate::provider::Provider,
    key: &str,
    model: &str,
    aim: &str,
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
    // Sent in batches. One request for the whole document meant a long resume
    // overflowed the model's context, the reply came back cut in half, and the
    // JSON would not parse — so *every* bullet was discarded and the user was
    // told the service replied with something unreadable. Measured: 64 bullets
    // in one request lost all 64. In batches the cost of a long resume is more
    // requests, not less resume.
    let system = system_for(aim);
    let mut out = doc.clone();
    let mut outcome = Outcome {
        rewritten: 0,
        rejected: 0,
        notes: Vec::new(),
    };
    for batch in bullets.chunks(BATCH) {
        let raw = crate::provider::send(provider, key, model, &system, &prompt_for(batch)).await?;
        let (next, part) = apply(&out, batch, &raw);
        out = next;
        outcome.rewritten += part.rewritten;
        outcome.rejected += part.rejected;
        outcome.notes.extend(part.notes);
    }
    outcome.notes = summarise(outcome.notes);
    Ok((out, outcome))
}

/// How many bullets go in one request. Twenty is roughly 1,600 tokens of
/// prompt and reply against the offline engine's 8,192 — comfortable for even
/// unusually long bullets, and few enough requests that a long resume is not
/// noticeably slower.
const BATCH: usize = 20;

/// The same rejection repeated once per bullet is noise, and identical strings
/// collide as React keys on the result screen. One line, with a count.
fn summarise(notes: Vec<String>) -> Vec<String> {
    let mut seen: Vec<(String, usize)> = Vec::new();
    for note in notes {
        match seen.iter_mut().find(|(text, _)| *text == note) {
            Some((_, count)) => *count += 1,
            None => seen.push((note, 1)),
        }
    }
    seen.into_iter()
        .map(|(note, count)| if count == 1 { note } else { format!("{note} (×{count})") })
        .collect()
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
        assert!(outcome.notes[0].contains("changed a name"), "{:?}", outcome.notes);
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

    /// FILLER_OPENERS lives in `openers` and is shared with `tighten`. The
    /// prompt must name that closed list — otherwise the model tier and the
    /// free tier would strip different phrases.
    #[test]
    fn the_system_prompt_names_every_shared_filler_opener() {
        let prompt = system_prompt();
        assert!(prompt.contains("closed list"));
        for opener in openers::FILLER_OPENERS {
            assert!(
                prompt.contains(opener),
                "system prompt missing shared opener {opener:?}"
            );
        }
    }
}
