//! Where the resume lives between launches: one JSON file, in one folder, on
//! this machine. Nothing here talks to the network, and the path is shown to
//! the user in Settings verbatim.
//!
//! `save` writes to a temporary file and renames it, so a crash mid-write
//! leaves the previous document intact rather than a half-file. A file that
//! will not parse is treated as no document — losing a corrupt draft is
//! recoverable, refusing to start is not.

use crate::model::ResumeDoc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const FILE: &str = "resume.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredDoc {
    pub doc: ResumeDoc,
    pub saved_at: String,
    /// The template id chosen on the Style screen, or empty before one is.
    /// `default` so a file written before styles existed still loads.
    #[serde(default)]
    pub template: String,
    /// "pdf" or "docx", or empty before the Format step is reached.
    #[serde(default)]
    pub format: String,
    /// The accent name, resolved through a closed set before it is ever used.
    #[serde(default)]
    pub accent: String,
    /// Whether the free wording pass runs at build time. On unless turned off,
    /// including for a file written before the setting existed.
    #[serde(default = "yes")]
    pub tighten: bool,
}

fn yes() -> bool {
    true
}

pub struct Store {
    root: PathBuf,
}

impl Store {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn path(&self) -> &Path {
        &self.root
    }

    fn file(&self) -> PathBuf {
        self.root.join(FILE)
    }

    pub fn save(
        &self,
        doc: &ResumeDoc,
        template: &str,
        format: &str,
        accent: &str,
        tighten: bool,
        saved_at: &str,
    ) -> io::Result<()> {
        fs::create_dir_all(&self.root)?;
        let stored = StoredDoc {
            doc: doc.clone(),
            saved_at: saved_at.to_string(),
            template: template.to_string(),
            format: format.to_string(),
            accent: accent.to_string(),
            tighten,
        };
        let json = serde_json::to_vec_pretty(&stored)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        let temp = self.root.join("resume.json.tmp");
        fs::write(&temp, json)?;
        fs::rename(&temp, self.file())
    }

    pub fn load(&self) -> io::Result<Option<StoredDoc>> {
        let bytes = match fs::read(self.file()) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e),
        };
        Ok(serde_json::from_slice(&bytes).ok())
    }

    pub fn delete_all(&self) -> io::Result<()> {
        match fs::remove_dir_all(&self.root) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ResumeDoc;

    fn doc_named(name: &str) -> ResumeDoc {
        let mut doc = ResumeDoc::empty();
        doc.contact.name = name.to_string();
        doc
    }

    #[test]
    fn load_returns_none_before_anything_is_saved() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        assert!(store.load().unwrap().is_none());
    }

    #[test]
    fn a_saved_document_comes_back_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        store
            .save(&doc_named("Ada"), "column", "pdf", "ink", true, "2026-08-11T10:00:00Z")
            .unwrap();
        let stored = store.load().unwrap().unwrap();
        assert_eq!(stored.doc.contact.name, "Ada");
        assert_eq!(stored.saved_at, "2026-08-11T10:00:00Z");
    }

    #[test]
    fn saving_twice_keeps_only_the_newer_document() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        store
            .save(&doc_named("Ada"), "column", "pdf", "ink", true, "2026-08-11T10:00:00Z")
            .unwrap();
        store
            .save(&doc_named("Grace"), "", "", "", true, "2026-08-11T11:00:00Z")
            .unwrap();
        assert_eq!(store.load().unwrap().unwrap().doc.contact.name, "Grace");
    }

    #[test]
    fn delete_all_removes_the_folder_and_load_goes_back_to_none() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().join("resume"));
        store
            .save(&doc_named("Ada"), "column", "pdf", "ink", true, "2026-08-11T10:00:00Z")
            .unwrap();
        store.delete_all().unwrap();
        assert!(!store.path().exists());
        assert!(store.load().unwrap().is_none());
    }

    #[test]
    fn the_chosen_template_comes_back_with_the_document() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        store.save(&doc_named("Ada"), "ledger", "docx", "navy", false, "2026-08-11T10:00:00Z").unwrap();
        let stored = store.load().unwrap().unwrap();
        assert_eq!(stored.template, "ledger");
        assert_eq!(stored.format, "docx");
        assert_eq!(stored.accent, "navy");
        assert!(!stored.tighten);
    }

    /// A file written before the Style screen existed has no `template` key.
    /// It must still load, or M1's users lose their resume to a schema change.
    #[test]
    fn a_file_without_a_template_key_still_loads() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let legacy = r#"{"doc":{"contact":{"name":"Ada","email":"","phone":"","location":"","links":[]},"summary":"","experience":[],"education":[],"projects":[],"skills":[]},"savedAt":"2026-08-11T10:00:00Z"}"#;
        std::fs::write(dir.path().join("resume.json"), legacy).unwrap();
        let stored = store.load().unwrap().expect("legacy file should load");
        assert_eq!(stored.doc.contact.name, "Ada");
        assert_eq!(stored.template, "");
        assert_eq!(stored.format, "");
        assert!(stored.tighten, "a file from before the setting must default to on");
    }

    #[test]
    fn a_corrupt_file_reads_as_no_document_rather_than_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        std::fs::write(dir.path().join("resume.json"), b"{ not json").unwrap();
        assert!(store.load().unwrap().is_none());
    }
}
