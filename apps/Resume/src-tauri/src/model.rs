//! The document every later milestone renders, exports, and diffs.
//!
//! Two rules hold this file together. Ids are stable and index-derived, so a
//! rewritten bullet can be matched back to its source. And every factual field
//! — organisation, title, dates, institution — is plain text the model tier is
//! never allowed to re-emit.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub name: String,
    pub email: String,
    pub phone: String,
    pub location: String,
    pub links: Vec<String>,
}

/// A date as written, plus what we managed to read out of it. `raw` is what the
/// user sees and edits; the parsed parts are for sorting and normalisation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DateMark {
    pub raw: String,
    pub year: Option<u16>,
    pub month: Option<u8>,
    pub present: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bullet {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    pub id: String,
    pub title: String,
    pub organization: String,
    pub location: String,
    pub start: DateMark,
    pub end: DateMark,
    pub bullets: Vec<Bullet>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct School {
    pub id: String,
    pub institution: String,
    pub credential: String,
    pub location: String,
    pub start: DateMark,
    pub end: DateMark,
    pub notes: Vec<Bullet>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResumeDoc {
    pub contact: Contact,
    pub summary: String,
    pub experience: Vec<Role>,
    pub education: Vec<School>,
    pub projects: Vec<Role>,
    pub skills: Vec<String>,
}

impl ResumeDoc {
    pub fn empty() -> Self {
        Self::default()
    }
}

/// The one place bullet ids are minted. `section` is `exp`, `proj` or `edu`.
pub fn bullet_id(section: &str, entry: usize, index: usize) -> String {
    format!("{section}-{entry}-b-{index}")
}

/// The one place entry ids are minted.
pub fn entry_id(section: &str, entry: usize) -> String {
    format!("{section}-{entry}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_doc_round_trips_through_json() {
        let doc = ResumeDoc::empty();
        let json = serde_json::to_string(&doc).unwrap();
        let back: ResumeDoc = serde_json::from_str(&json).unwrap();
        assert_eq!(doc, back);
    }

    #[test]
    fn fields_serialise_as_camel_case() {
        let doc = ResumeDoc::empty();
        let json = serde_json::to_string(&doc).unwrap();
        assert!(json.contains("\"experience\""), "got {json}");
        assert!(!json.contains('_'), "snake_case leaked into JSON: {json}");
    }
}
