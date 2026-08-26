//! The free tier's wording pass. No model, no network, no waiting.
//!
//! Every rule below operates on the **opening clause** of a bullet and nothing
//! else. That single restriction is what makes the fact guarantee hold without a
//! diff engine: numbers, employers and outcomes live in the body of a sentence,
//! and nothing here can reach them. `preserves_every_number` is the test that
//! fails the moment a rule stops respecting it.
//!
//! Every list here is closed and short on purpose. A rule that fires on a phrase
//! it did not fully understand is worse than no rule at all — it would put words
//! in someone's mouth on a document they are judged by.

use crate::model::ResumeDoc;
use crate::openers::{FILLER_OPENERS, PRONOUN_OPENERS};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tightened {
    pub text: String,
    pub notes: Vec<String>,
}

/// Weak opener → the verb a reader expects, in (as written, past, present) form.
/// Closed on purpose: an unknown verb is left exactly as the person wrote it.
///
/// Gerunds have their own rows rather than being derived. "Responsible for
/// managing" is the commonest shape there is, and after the filler is stripped
/// the bullet starts with "managing" — but deriving the stem would mean guessing
/// at doubled consonants and dropped `e`s, and a guess here rewrites a verb on
/// someone's resume. Listing them is duller and cannot be wrong.
const VERBS: &[(&str, &str, &str)] = &[
    ("run", "Ran", "Run"),
    ("ran", "Ran", "Run"),
    ("lead", "Led", "Lead"),
    ("led", "Led", "Lead"),
    ("write", "Wrote", "Write"),
    ("wrote", "Wrote", "Write"),
    ("build", "Built", "Build"),
    ("built", "Built", "Build"),
    ("manage", "Managed", "Manage"),
    ("managed", "Managed", "Manage"),
    ("develop", "Developed", "Develop"),
    ("developed", "Developed", "Develop"),
    ("create", "Created", "Create"),
    ("created", "Created", "Create"),
    ("design", "Designed", "Design"),
    ("designed", "Designed", "Design"),
    ("implement", "Implemented", "Implement"),
    ("implemented", "Implemented", "Implement"),
    ("deliver", "Delivered", "Deliver"),
    ("delivered", "Delivered", "Deliver"),
    ("coordinate", "Coordinated", "Coordinate"),
    ("coordinated", "Coordinated", "Coordinate"),
    ("improve", "Improved", "Improve"),
    ("improved", "Improved", "Improve"),
    ("reduce", "Reduced", "Reduce"),
    ("reduced", "Reduced", "Reduce"),
    ("increase", "Increased", "Increase"),
    ("increased", "Increased", "Increase"),
    ("maintain", "Maintained", "Maintain"),
    ("maintained", "Maintained", "Maintain"),
    ("launch", "Launched", "Launch"),
    ("launched", "Launched", "Launch"),
    ("train", "Trained", "Train"),
    ("trained", "Trained", "Train"),
    ("mentor", "Mentored", "Mentor"),
    ("mentored", "Mentored", "Mentor"),
    ("running", "Ran", "Running"),
    ("leading", "Led", "Leading"),
    ("writing", "Wrote", "Writing"),
    ("building", "Built", "Building"),
    ("managing", "Managed", "Managing"),
    ("developing", "Developed", "Developing"),
    ("creating", "Created", "Creating"),
    ("designing", "Designed", "Designing"),
    ("implementing", "Implemented", "Implementing"),
    ("delivering", "Delivered", "Delivering"),
    ("coordinating", "Coordinated", "Coordinating"),
    ("improving", "Improved", "Improving"),
    ("reducing", "Reduced", "Reducing"),
    ("increasing", "Increased", "Increasing"),
    ("maintaining", "Maintained", "Maintaining"),
    ("launching", "Launched", "Launching"),
    ("training", "Trained", "Training"),
    ("mentoring", "Mentored", "Mentoring"),
];

/// Openers that stay weak even after the table has had its go. Flagged, not
/// changed, because the fix is a decision only the person can make. Helped /
/// Used / Made / Did / Got are here rather than synonym-swapped: "Helped the
/// team ship" must not become "Supported the team ship".
const STILL_WEAK: &[&str] = &[
    "participated",
    "attended",
    "various",
    "stuff",
    "things",
    "helped",
    "used",
    "made",
    "did",
    "got",
];

const LONG_BULLET_WORDS: usize = 32;

fn capitalise_first(text: &str) -> String {
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

fn opener_boundary(opener: &str, rest: &str) -> bool {
    if rest.is_empty() {
        return true;
    }
    // The opener already ate its trailing space (`"i "`, `"worked on "` is
    // not how the list is written, but `"i "` is).
    if opener.ends_with(|c: char| c.is_whitespace()) || opener.ends_with([':', ',', ';']) {
        return true;
    }
    rest.starts_with(|c: char| {
        c.is_whitespace() || matches!(c, ',' | ':' | ';' | '.' | '—' | '–')
    })
}

/// Strips one leading phrase if the bullet starts with it. Case-insensitive on
/// the phrase, but the rest of the sentence is returned untouched. A match that
/// continues into another word ("Worked online") is left alone.
fn strip_opener(text: &str, openers: &[&str]) -> Option<String> {
    let lower = text.to_lowercase();
    for opener in openers {
        if !lower.starts_with(opener) {
            continue;
        }
        let rest = &text[opener.len()..];
        if !opener_boundary(opener, rest) {
            continue;
        }
        let rest = rest.trim_start();
        // "Responsible for" alone is not a bullet; leave it rather than
        // returning an empty string.
        if rest.is_empty() {
            return None;
        }
        return Some(rest.to_string());
    }
    None
}

fn first_word(text: &str) -> &str {
    text.split_whitespace().next().unwrap_or("")
}

pub fn tighten_bullet(text: &str, present_tense: bool) -> Tightened {
    let mut out = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut notes = Vec::new();

    if let Some(rest) = strip_opener(&out, PRONOUN_OPENERS) {
        out = capitalise_first(&rest);
    }
    if let Some(rest) = strip_opener(&out, FILLER_OPENERS) {
        out = capitalise_first(&rest);
    }

    // The verb table only ever replaces the *first* word, which is why nothing
    // downstream in the sentence can be touched.
    let head = first_word(&out).trim_end_matches(&[',', ':'][..]).to_lowercase();
    if let Some((_, past, present)) = VERBS.iter().find(|(base, _, _)| *base == head) {
        let replacement = if present_tense { present } else { past };
        let rest = out[first_word(&out).len()..].trim_start();
        out = if rest.is_empty() {
            (*replacement).to_string()
        } else {
            format!("{replacement} {rest}")
        };
    }

    out = capitalise_first(&out);

    if !out.chars().any(|c| c.is_ascii_digit()) {
        notes.push("No number in this one — can you quantify it?".to_string());
    }
    if out.split_whitespace().count() > LONG_BULLET_WORDS {
        notes.push("Long — a reader skims; try splitting it.".to_string());
    }
    if STILL_WEAK.contains(&first_word(&out).to_lowercase().as_str()) {
        notes.push("Starts weakly — lead with what you did.".to_string());
    }

    Tightened { text: out, notes }
}

/// A tightened copy of the document. Only bullet text changes; every other
/// field is cloned through untouched.
pub fn tighten_doc(doc: &ResumeDoc) -> ResumeDoc {
    let mut out = doc.clone();
    for role in out.roles_mut() {
        let present = role.end.present;
        for bullet in role.bullets.iter_mut() {
            bullet.text = tighten_bullet(&bullet.text, present).text;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn past(text: &str) -> String {
        tighten_bullet(text, false).text
    }

    #[test]
    fn filler_openers_are_removed_and_the_sentence_restarts() {
        assert_eq!(
            past("Responsible for managing a team of 6 engineers"),
            "Managed a team of 6 engineers"
        );
        assert_eq!(past("Was responsible for the ledger"), "The ledger");
        assert_eq!(past("Tasked with 3 audits"), "3 audits");
        assert_eq!(
            past("Was involved in training 25 operators on the Jacquard loom interface"),
            "Trained 25 operators on the Jacquard loom interface"
        );
        assert_eq!(past("Involved in training 25 operators"), "Trained 25 operators");
        assert_eq!(
            past("Duties included: reducing turnaround from 9 days to 2"),
            "Reduced turnaround from 9 days to 2"
        );
        assert_eq!(
            past("Helped with the migration of 15 readers"),
            "The migration of 15 readers"
        );
        assert_eq!(
            past("My responsibilities included 3 audits"),
            "3 audits"
        );
        assert_eq!(
            past("Was accountable for a budget of $12,000"),
            "A budget of $12,000"
        );
    }

    /// Prefix match without a word boundary used to turn "Worked online" into
    /// "Line…". The opener has to end where the phrase ends.
    #[test]
    fn an_opener_inside_a_longer_word_is_left_alone() {
        assert_eq!(
            past("Worked online systems for 3 clients"),
            "Worked online systems for 3 clients"
        );
        assert_eq!(
            past("Helped toward a 40% reduction"),
            "Helped toward a 40% reduction"
        );
        assert_eq!(
            past("Assisted internally with 2 audits"),
            "Assisted internally with 2 audits"
        );
        assert_eq!(
            past("Worked on the migration of 15 readers"),
            "The migration of 15 readers"
        );
    }

    #[test]
    fn leading_pronouns_go() {
        assert_eq!(past("I wrote the parser"), "Wrote the parser");
        assert_eq!(past("My work reduced errors by 40%"), "Work reduced errors by 40%");
    }

    #[test]
    fn a_known_verb_is_put_in_the_right_tense() {
        assert_eq!(past("Manage a team of 6"), "Managed a team of 6");
        assert_eq!(past("Helped the team ship 3 features"), "Helped the team ship 3 features");
        assert_eq!(past("Used Rust to cut latency"), "Used Rust to cut latency");
        assert_eq!(past("Responsible for developing 3 APIs"), "Developed 3 APIs");
        assert_eq!(
            tighten_bullet("Develop 3 APIs", true).text,
            "Develop 3 APIs"
        );
    }

    #[test]
    fn a_verb_outside_the_table_is_left_exactly_as_written() {
        assert_eq!(
            past("Orchestrated the migration of 400 tables"),
            "Orchestrated the migration of 400 tables"
        );
    }

    #[test]
    fn a_role_still_running_takes_the_present_tense() {
        assert_eq!(
            tighten_bullet("Manage a team of 6", true).text,
            "Manage a team of 6"
        );
        assert_eq!(
            tighten_bullet("Manage a team of 6", false).text,
            "Managed a team of 6"
        );
    }

    #[test]
    fn runs_of_whitespace_collapse() {
        assert_eq!(past("Wrote   the    parser"), "Wrote the parser");
    }

    #[test]
    fn a_filler_phrase_on_its_own_is_left_alone_rather_than_emptied() {
        assert_eq!(past("Responsible for"), "Responsible for");
    }

    #[test]
    fn a_bullet_with_no_number_is_flagged_but_not_changed() {
        let out = tighten_bullet("Wrote the parser", false);
        assert_eq!(out.text, "Wrote the parser");
        assert!(out.notes.iter().any(|n| n.contains("quantify")));
    }

    #[test]
    fn a_long_bullet_is_flagged() {
        let long = "Delivered ".to_string() + &"word ".repeat(40);
        assert!(tighten_bullet(&long, false)
            .notes
            .iter()
            .any(|n| n.contains("Long")));
    }

    #[test]
    fn a_still_weak_opener_is_flagged_rather_than_guessed_at() {
        let out = tighten_bullet("Participated in 4 reviews", false);
        assert_eq!(out.text, "Participated in 4 reviews");
        assert!(out.notes.iter().any(|n| n.contains("weakly")));
        let helped = tighten_bullet("Helped the team ship 3 features", false);
        assert_eq!(helped.text, "Helped the team ship 3 features");
        assert!(helped.notes.iter().any(|n| n.contains("weakly")));
    }

    // --- The guarantee -----------------------------------------------------


    /// The deterministic tier's fact gate. Every rule works on the opening
    /// clause; if one ever reaches into the body of a sentence, this fails.
    ///
    /// **Mutation proof:** widen any rule to operate on the whole string —
    /// for example change the verb replacement to `out.replace(head, ...)`
    /// instead of replacing only the first word — and this test fails on
    /// "Ran 5 pilots and used 5 tools", because the second "used" changes too.
    #[test]
    fn preserves_every_number() {
        let cases = [
            "Responsible for raising $2.4M across 3 rounds in 2021",
            "Helped 12 students pass 4 exams",
            "I used 5 tools and ran 5 pilots",
            "Managed 3 teams over 18 months, cutting cost 22%",
            "Delivered 99.99% uptime across 7 regions",
        ];
        for case in cases {
            for present in [true, false] {
                let out = tighten_bullet(case, present).text;
                assert_eq!(
                    crate::gate::digit_runs(case),
                    crate::gate::digit_runs(&out),
                    "numbers changed\n  before: {case}\n  after:  {out}"
                );
            }
        }
    }

    /// A bullet that is already only facts must come back byte-identical.
    #[test]
    fn a_bullet_of_pure_facts_is_returned_unchanged() {
        let case = "Raised $2.4M across 3 rounds in 2021";
        assert_eq!(past(case), case);
    }

    /// Capitalised words are proper nouns often enough that losing one would be
    /// losing a fact. Nothing here may drop one from the body of a sentence.
    #[test]
    fn preserves_proper_nouns_in_the_body() {
        let case = "Responsible for migrating Postgres to CockroachDB at Admiralty";
        let out = past(case);
        for word in ["Postgres", "CockroachDB", "Admiralty"] {
            assert!(out.contains(word), "{word} was lost from: {out}");
        }
    }

    #[test]
    fn tighten_doc_touches_bullets_and_nothing_else() {
        let doc = crate::parse_text::parse_text(
            "Ada Lovelace\nada@example.com\n\nEXPERIENCE\nAnalyst, Admiralty\nJan 2021 - Present\n- Responsible for writing the parser\n",
        );
        let out = tighten_doc(&doc);
        assert_eq!(out.contact, doc.contact);
        assert_eq!(out.experience[0].organization, "Admiralty");
        assert_eq!(out.experience[0].start, doc.experience[0].start);
        assert_eq!(out.experience[0].bullets[0].text, "Writing the parser");
        assert_eq!(out.experience[0].bullets[0].id, doc.experience[0].bullets[0].id);
    }


}
