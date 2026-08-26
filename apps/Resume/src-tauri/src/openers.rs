//! Closed opener lists for `tighten` and `rewrite`. One list — they cannot drift.

/// Empty leading phrases. Longest first so "Was responsible for" wins over
/// "Responsible", and "duties included:" wins over "duties included".
pub const FILLER_OPENERS: &[&str] = &[
    "was responsible for",
    "were responsible for",
    "responsible for",
    "was accountable for",
    "were accountable for",
    "accountable for",
    "responsibilities included:",
    "responsibilities included",
    "duties included:",
    "duties included",
    "was tasked with",
    "were tasked with",
    "tasked with",
    "was involved in",
    "were involved in",
    "involved in",
    "was charged with",
    "charged with",
    "helped to",
    "helped with",
    "assisted with",
    "assisted in",
    "worked on",
    "worked with",
    "in charge of",
];

/// Leading pronouns. A resume bullet is not a sentence about "I".
pub const PRONOUN_OPENERS: &[&str] = &["i ", "i've ", "i have ", "my ", "we ", "we've "];

/// Model prompt rule built from `FILLER_OPENERS`.
pub fn opener_rule_text() -> String {
    let quoted: Vec<String> = FILLER_OPENERS
        .iter()
        .map(|opener| format!("\"{opener}\""))
        .collect();
    format!(
        "5. Remove only empty openers from this closed list: {}. \
Then capitalise the next word. Do not rewrite the rest of the sentence just \
because you removed the opener. Do not remove any other leading phrase.",
        quoted.join(", ")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opener_rule_text_lists_every_filler() {
        let text = opener_rule_text();
        for opener in FILLER_OPENERS {
            assert!(
                text.contains(opener),
                "opener_rule_text missing {opener:?}:\n{text}"
            );
        }
    }

    /// `strip_opener` takes the first match. A shorter phrase listed before a
    /// longer one that starts with it would steal the match and leave a colon
    /// or a dangling word.
    #[test]
    fn fillers_are_longest_first() {
        for (index, earlier) in FILLER_OPENERS.iter().enumerate() {
            for later in FILLER_OPENERS.iter().skip(index + 1) {
                assert!(
                    !later.starts_with(earlier),
                    "{earlier:?} is listed before {later:?} and would match first"
                );
            }
        }
    }

    #[test]
    fn every_opener_is_ascii() {
        for opener in FILLER_OPENERS.iter().chain(PRONOUN_OPENERS) {
            assert!(opener.is_ascii(), "non-ASCII opener {opener:?} cannot be sliced by byte length");
        }
    }
}
