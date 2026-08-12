//! The one colour the user chooses for their own document.
//!
//! A fixed set, not a colour picker. Two reasons: a resume with a badly chosen
//! accent is worse than one without, and — more importantly — this value is read
//! from a file on disk and handed to a typesetting engine. A closed set means a
//! tampered or corrupted stored file cannot inject anything into a template.

/// Hex values without the leading `#`, so both Typst and Word can take them
/// directly. Ink is first and is the default.
pub const ACCENTS: &[(&str, &str)] = &[
    ("ink", "111111"),
    ("slate", "44515c"),
    ("navy", "1f3352"),
    ("forest", "27452f"),
    ("oxblood", "5e1f1f"),
    ("plum", "4a2545"),
];

pub const INK: &str = "111111";

/// Resolve a stored accent name to its hex value. Anything unrecognised — an
/// empty string, an old name, or a hex value someone typed into the file by
/// hand — becomes ink rather than an error, because a resume must still open.
pub fn resolve(name: &str) -> &'static str {
    ACCENTS
        .iter()
        .find(|(id, _)| *id == name)
        .map(|(_, hex)| *hex)
        .unwrap_or(INK)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_accent_resolves_to_its_own_hex() {
        for (name, hex) in ACCENTS {
            assert_eq!(resolve(name), *hex);
        }
    }

    #[test]
    fn the_names_are_unique() {
        let mut names: Vec<&str> = ACCENTS.iter().map(|(n, _)| *n).collect();
        let count = names.len();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), count);
    }

    /// The value reaches a template. A closed set is the whole defence.
    #[test]
    fn anything_outside_the_set_falls_back_to_ink() {
        for hostile in ["", "hotpink", "111111", "#fff\") ; #panic(\"", "../../etc"] {
            assert_eq!(resolve(hostile), INK, "{hostile:?} was not rejected");
        }
    }

    #[test]
    fn every_value_is_six_hex_digits_with_no_hash() {
        for (name, hex) in ACCENTS {
            assert_eq!(hex.len(), 6, "{name} is not six digits");
            assert!(
                hex.chars().all(|c| c.is_ascii_hexdigit()),
                "{name} is not hex"
            );
        }
    }
}
