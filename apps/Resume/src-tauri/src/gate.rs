//! The fact-freeze gate.
//!
//! This is the module the whole product promise rests on: *Spiral Resume never
//! invents anything on your resume.* A model rewrite is not trusted — it is
//! checked, and discarded if it fails. A discarded rewrite is not an error; the
//! original bullet is kept and the user is told how many were rejected.
//!
//! The gate is deliberately strict and deliberately dumb. It does not try to
//! understand the sentence. It compares the things a resume is judged on —
//! numbers and proper nouns — and refuses anything that moved one.

/// Why a rewrite was refused. `&'static str` because these are shown to the
/// user verbatim and there is a closed set of them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verdict {
    Accepted(String),
    /// The model returned the source. That is following the prompt, not a
    /// refused change — `apply` keeps the original and says nothing.
    Unchanged,
    Rejected(&'static str),
}

/// A rewrite longer than this multiple of the source is padding, not
/// tightening — the one job of the paid tier is to make bullets sharper.
const MAX_GROWTH: f32 = 1.6;

/// Numbers **in the order they appear**. Order is the point: a sorted multiset
/// cannot tell "6 engineers over 18 months" from "18 engineers over 6 months",
/// because both sort to the same pair — and that swap is exactly the kind of
/// fabrication this gate exists to stop.
///
/// The cost is that a rewrite which legitimately reorders two number-bearing
/// clauses is refused. That is the safe direction to fail: the user keeps their
/// own wording, and nothing false reaches the page.
pub(crate) fn digit_runs(text: &str) -> Vec<String> {
    let mut runs = Vec::new();
    let mut current = String::new();
    for c in text.chars() {
        if c.is_ascii_digit() {
            current.push(c);
        } else if !current.is_empty() {
            runs.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        runs.push(current);
    }
    runs
}

/// Words that start with a capital. Order is preserved — the same reason
/// digit runs keep order. Sorted/deduped lists cannot tell "Oracle then
/// PostgreSQL" from the reverse, and that swap is a changed fact.
///
/// Ordinary sentence case ("Managed six people") must not invent a proper
/// noun from the leading verb, so a plain Title Case word at the start of a
/// sentence is still skipped. Acronyms and mixed-capitals at that position
/// (`AWS`, `PostgreSQL`) are kept — dropping them would let a rewrite erase
/// the only name in the bullet.
fn proper_nouns(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut sentence_start = true;
    for word in text.split_whitespace() {
        let cleaned: String = word
            .trim_matches(|c: char| !c.is_alphanumeric())
            .to_string();
        let ends_sentence = word.ends_with(['.', '!', '?', ':', ';']);
        if !cleaned.is_empty()
            && cleaned.chars().next().is_some_and(char::is_uppercase)
            && (!sentence_start || looks_like_name_not_verb(cleaned.as_str()))
        {
            out.push(cleaned);
        }
        sentence_start = ends_sentence;
    }
    out
}

/// True when a capitalized word is unlikely to be an English sentence opener.
/// Two or more uppercase letters → acronym or camel brand (`AWS`, `PostgreSQL`).
fn looks_like_name_not_verb(word: &str) -> bool {
    word.chars().filter(|c| c.is_ascii_uppercase()).count() >= 2
}

pub fn check(source: &str, rewrite: &str) -> Verdict {
    let rewrite = rewrite.trim();
    if rewrite.is_empty() {
        return Verdict::Rejected("came back empty");
    }
    if rewrite == source.trim() {
        return Verdict::Unchanged;
    }

    let source_digits = digit_runs(source);
    let rewrite_digits = digit_runs(rewrite);
    if source_digits != rewrite_digits {
        // One message for both directions on purpose: from the user's side,
        // "the numbers changed" is the whole story.
        return Verdict::Rejected("changed a number");
    }

    let source_nouns = proper_nouns(source);
    let rewrite_nouns = proper_nouns(rewrite);
    if source_nouns != rewrite_nouns {
        // One message for drop, invent, or reorder — from the user's side the
        // names moved, and that is enough.
        return Verdict::Rejected("changed a name");
    }

    if rewrite.chars().count() as f32 > source.chars().count() as f32 * MAX_GROWTH {
        return Verdict::Rejected("padded the bullet out");
    }

    Verdict::Accepted(rewrite.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn accepted(source: &str, rewrite: &str) -> String {
        match check(source, rewrite) {
            Verdict::Accepted(text) => text,
            Verdict::Rejected(why) => panic!("unexpectedly rejected ({why}): {rewrite}"),
            Verdict::Unchanged => panic!("unexpectedly unchanged: {rewrite}"),
        }
    }

    fn rejected(source: &str, rewrite: &str) -> &'static str {
        match check(source, rewrite) {
            Verdict::Rejected(why) => why,
            Verdict::Accepted(text) => panic!("unexpectedly accepted: {text}"),
            Verdict::Unchanged => panic!("unexpectedly unchanged: {rewrite}"),
        }
    }

    #[test]
    fn a_genuine_tightening_is_accepted() {
        assert_eq!(
            accepted(
                "Was responsible for managing a team of 6 engineers at Admiralty",
                "Managed 6 engineers at Admiralty",
            ),
            "Managed 6 engineers at Admiralty"
        );
    }

    // --- The hostile set -------------------------------------------------

    /// The failure this whole app exists to prevent.
    ///
    /// **Mutation proof:** delete the "introduces a digit" half of the digit
    /// comparison — for example compare only that every source run survives —
    /// and this test fails, because 40 appears in the rewrite and nowhere in
    /// the source.
    #[test]
    fn rejects_an_invented_number() {
        assert_eq!(
            rejected(
                "Cut report turnaround substantially",
                "Cut report turnaround by 40%",
            ),
            "changed a number"
        );
    }

    /// Both sides contain a 6 and an 18, so a sorted-multiset comparison calls
    /// this rewrite faithful — while it claims the person managed three times
    /// the people for a third of the time.
    ///
    /// **Mutation proof:** re-add `runs.sort_unstable()` to `digit_runs` and
    /// this test fails; every other test in this module still passes, which is
    /// why the bug survived the original suite.
    #[test]
    fn rejects_two_numbers_swapped_between_facts() {
        assert_eq!(
            rejected(
                "Managed 6 engineers over 18 months",
                "Managed 18 engineers over 6 months",
            ),
            "changed a number"
        );
    }

    #[test]
    fn rejects_a_changed_number() {
        assert_eq!(
            rejected("Managed 6 engineers", "Managed 16 engineers"),
            "changed a number"
        );
    }

    #[test]
    fn rejects_a_dropped_number() {
        assert_eq!(
            rejected("Cut cost by 22% over 18 months", "Cut cost by 22%"),
            "changed a number"
        );
    }

    #[test]
    fn rejects_a_dropped_employer() {
        assert_eq!(
            rejected(
                "Wrote the first algorithm at Admiralty",
                "Wrote the first algorithm",
            ),
            "changed a name"
        );
    }

    #[test]
    fn rejects_an_invented_employer() {
        assert_eq!(
            rejected("Wrote the first algorithm", "Wrote the first algorithm at Google"),
            "changed a name"
        );
    }

    /// Order is load-bearing the same way digit runs are. A sorted set would
    /// accept swapping two employers while reversing the claim.
    #[test]
    fn rejects_two_names_swapped_between_facts() {
        assert_eq!(
            rejected(
                "Migrated Oracle to PostgreSQL",
                "Migrated PostgreSQL to Oracle",
            ),
            "changed a name"
        );
    }

    /// A bullet that opens on an acronym used to lose that name to the
    /// sentence-start skip, so dropping `AWS` looked like a faithful rewrite.
    #[test]
    fn rejects_a_dropped_leading_acronym() {
        assert_eq!(
            rejected("AWS Lambda cut cold starts by 40%", "Cut cold starts by 40%"),
            "changed a name"
        );
    }

    #[test]
    fn rejects_a_dropped_leading_mixed_capitals() {
        assert_eq!(
            rejected("PostgreSQL queries stayed under 12ms", "Queries stayed under 12ms"),
            "changed a name"
        );
    }

    #[test]
    fn still_accepts_a_tightening_that_opens_on_a_verb() {
        assert_eq!(
            accepted(
                "Was responsible for managing a team of 6 engineers at Admiralty",
                "Managed 6 engineers at Admiralty",
            ),
            "Managed 6 engineers at Admiralty"
        );
    }

    #[test]
    fn rejects_an_entirely_fabricated_bullet() {
        assert_eq!(
            rejected(
                "Checked tables of logarithms",
                "Led a team of 12 at Cambridge, raising $4M",
            ),
            "changed a number"
        );
    }

    #[test]
    fn rejects_padding() {
        assert_eq!(
            rejected(
                "Wrote the parser",
                "Wrote the parser, which was a significant undertaking requiring careful attention",
            ),
            "padded the bullet out"
        );
    }

    #[test]
    fn rejects_an_empty_or_unchanged_answer() {
        assert_eq!(rejected("Wrote the parser", "   "), "came back empty");
        assert_eq!(
            check("Wrote the parser", "Wrote the parser"),
            Verdict::Unchanged
        );
    }

    // --- Things that must NOT be rejected --------------------------------

    /// The first word of a sentence is capitalised by grammar, not because it
    /// is a name. Treating it as a proper noun would reject almost every real
    /// rewrite, which would make the gate useless rather than strict.
    #[test]
    fn a_changed_opening_word_is_not_treated_as_a_name() {
        assert_eq!(
            accepted("Helped the team ship features", "Shipped features with the team"),
            "Shipped features with the team"
        );
    }

    #[test]
    fn reordering_facts_is_allowed() {
        assert_eq!(
            accepted(
                "At Admiralty, cut turnaround from 9 days to 2",
                "Cut turnaround from 9 days to 2 at Admiralty",
            ),
            "Cut turnaround from 9 days to 2 at Admiralty"
        );
    }

    /// Written first as `"Migrated the SQL database off Oracle"`, which the gate
    /// rejected — correctly. Oracle is a company that was never on the resume,
    /// and inventing an employer is exactly the failure this exists to stop.
    /// The test was wrong, not the gate.
    #[test]
    fn an_acronym_survives_and_is_required_to() {
        assert!(accepted("Migrated the SQL database", "Migrated the SQL database off tape")
            .contains("SQL"));
        assert_eq!(
            rejected("Migrated the SQL database", "Migrated the database"),
            "changed a name"
        );
    }

    #[test]
    fn a_number_written_with_a_currency_or_percent_still_counts() {
        assert_eq!(
            accepted("Raised $2.4M across 3 rounds", "Raised $2.4M in 3 rounds"),
            "Raised $2.4M in 3 rounds"
        );
        assert_eq!(
            rejected("Raised $2.4M across 3 rounds", "Raised $2.5M in 3 rounds"),
            "changed a number"
        );
    }
}

