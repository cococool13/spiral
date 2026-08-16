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

/// Skills as the university templates present them: either one flat list, or
/// labelled groups — "Technical: Rust, Python". An unlabelled group is the flat
/// case, so there is one representation rather than two.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillGroup {
    pub label: String,
    pub items: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResumeDoc {
    pub contact: Contact,
    /// The one-line positioning statement the mid-career templates lead with.
    /// Never parsed — a heading like this is a claim, and the app does not
    /// invent claims. The Check screen offers the field; it stays empty unless
    /// the person writes one.
    #[serde(default)]
    pub headline: String,
    pub summary: String,
    pub experience: Vec<Role>,
    pub education: Vec<School>,
    pub projects: Vec<Role>,
    /// Clubs, societies, volunteering — the section every university template
    /// has and no commercial one does.
    #[serde(default)]
    pub leadership: Vec<Role>,
    #[serde(default)]
    pub awards: Vec<String>,
    #[serde(default)]
    pub interests: Vec<String>,
    /// Read through a compatibility shim: files written before skills gained
    /// labels stored a flat `["Rust", "Analysis"]`. Without this, such a file
    /// fails to deserialize, `Store::load` maps the failure to "no document",
    /// and the user's entire saved resume disappears on upgrade.
    #[serde(default, deserialize_with = "skills_from_either_shape")]
    pub skills: Vec<SkillGroup>,
}

/// Accepts both the current shape (labelled groups) and the original one (a
/// flat list of strings), so no stored resume is ever discarded for being old.
fn skills_from_either_shape<'de, D>(deserializer: D) -> Result<Vec<SkillGroup>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Either {
        Groups(Vec<SkillGroup>),
        Flat(Vec<String>),
    }

    Ok(match Either::deserialize(deserializer)? {
        Either::Groups(groups) => groups,
        // An unlabelled list is one group with no label — the same
        // representation the parser produces today.
        Either::Flat(items) if items.is_empty() => Vec::new(),
        Either::Flat(items) => vec![SkillGroup {
            label: String::new(),
            items,
        }],
    })
}

impl ResumeDoc {
    pub fn empty() -> Self {
        Self::default()
    }

    /// Every section that holds bullets, in the order a reader meets them.
    /// A new bullet-bearing section is added here and nowhere else. The caller
    /// that matters most is the one writing rewrites back: a section missing
    /// from this walk drops the model's improvements silently.
    pub fn roles(&self) -> impl Iterator<Item = &Role> {
        self.experience
            .iter()
            .chain(self.projects.iter())
            .chain(self.leadership.iter())
    }

    pub fn roles_mut(&mut self) -> impl Iterator<Item = &mut Role> {
        self.experience
            .iter_mut()
            .chain(self.projects.iter_mut())
            .chain(self.leadership.iter_mut())
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

    /// `Store::load` treats an unparseable file as "no document", so a shape
    /// this deserializer rejects is not an error the user sees — it is their
    /// resume disappearing. Both skill shapes must keep loading.
    #[test]
    fn a_document_saved_with_flat_skills_still_loads() {
        let legacy = r#"{"contact":{"name":"Ada","email":"","phone":"","location":"","links":[]},"summary":"","experience":[],"education":[],"projects":[],"skills":["Rust","Analysis"]}"#;
        let doc: ResumeDoc = serde_json::from_str(legacy).expect("an older resume must still load");
        assert_eq!(doc.contact.name, "Ada");
        assert_eq!(doc.skills.len(), 1);
        assert_eq!(doc.skills[0].label, "");
        assert_eq!(doc.skills[0].items, vec!["Rust", "Analysis"]);
    }

    #[test]
    fn the_current_grouped_shape_still_loads() {
        let current = r#"{"contact":{"name":"Ada","email":"","phone":"","location":"","links":[]},"summary":"","experience":[],"education":[],"projects":[],"skills":[{"label":"Technical","items":["Rust"]}]}"#;
        let doc: ResumeDoc = serde_json::from_str(current).unwrap();
        assert_eq!(doc.skills[0].label, "Technical");
    }

    #[test]
    fn fields_serialise_as_camel_case() {
        let doc = ResumeDoc::empty();
        let json = serde_json::to_string(&doc).unwrap();
        assert!(json.contains("\"experience\""), "got {json}");
        assert!(!json.contains('_'), "snake_case leaked into JSON: {json}");
    }
}
