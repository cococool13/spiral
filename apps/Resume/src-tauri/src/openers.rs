//! Closed opener lists for `tighten` and `rewrite`. One list — they cannot drift.

/// Empty leading phrases. Longest first so "Was responsible for" wins over "Responsible".
pub const FILLER_OPENERS: &[&str] = &[
    "was responsible for",
    "were responsible for",
    "responsible for",
    "duties included",
    "duties included:",
    "tasked with",
    "was tasked with",
    "helped to",
    "assisted with",
    "assisted in",
    "worked on",
    "worked with",
    "involved in",
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
}
