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
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

const FILE: &str = "resume.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredDoc {
    pub doc: ResumeDoc,
    pub saved_at: String,
    /// The template id chosen on the Style screen, or empty before one is.
    /// `default` here and below is not a compatibility layer for a shipped
    /// format — nothing has shipped. It is for the files this branch's own
    /// earlier commits already wrote into the app data folder: losing a real
    /// draft to a field that did not exist last week is not a trade worth
    /// making for four attributes.
    #[serde(default)]
    pub template: String,
    /// "pdf" or "docx", or empty before the Format step is reached.
    #[serde(default)]
    pub format: String,
    /// The accent name, resolved through a closed set before it is ever used.
    #[serde(default)]
    pub accent: String,
    /// Whether wording is tightened at build time. Off unless turned on: a
    /// style change restyles the page and leaves the sentences as written.
    #[serde(default)]
    pub tighten: bool,
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

    /// Takes the record itself, so a new field is one type to change rather
    /// than three signatures, and nothing is copied to assemble it.
    fn temp(&self) -> PathBuf {
        self.root.join("resume.json.tmp")
    }

    pub fn save(&self, stored: &StoredDoc) -> io::Result<()> {
        fs::create_dir_all(&self.root)?;
        let json = serde_json::to_vec_pretty(stored)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        let temp = self.temp();
        {
            let mut file = File::create(&temp)?;
            file.write_all(&json)?;
            file.sync_all()?;
        }
        Self::replace_file(&temp, &self.file())
    }

    pub fn load(&self) -> io::Result<Option<StoredDoc>> {
        match Self::read_doc(&self.file()) {
            Ok(Some(stored)) => Ok(Some(stored)),
            Ok(None) => match Self::read_doc(&self.temp()) {
                Ok(Some(stored)) => {
                    Self::replace_file(&self.temp(), &self.file())?;
                    Ok(Some(stored))
                }
                Ok(None) => Ok(None),
                Err(err) => Err(err),
            },
            Err(err) => Err(err),
        }
    }

    fn read_doc(path: &Path) -> io::Result<Option<StoredDoc>> {
        match fs::read(path) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map(Some)
                .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err)),
            Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(err) => Err(err),
        }
    }

    fn replace_file(from: &Path, to: &Path) -> io::Result<()> {
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            let wide = |path: &Path| {
                path.as_os_str()
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect::<Vec<u16>>()
            };
            let from_w = wide(from);
            let to_w = wide(to);
            extern "system" {
                fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> i32;
            }
            let rc = unsafe { MoveFileExW(from_w.as_ptr(), to_w.as_ptr(), 0x1 | 0x8) };
            if rc == 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(())
            }
        }
        #[cfg(not(windows))]
        {
            fs::rename(from, to)
        }
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

    fn record(
        doc: ResumeDoc,
        template: &str,
        format: &str,
        accent: &str,
        tighten: bool,
        saved_at: &str,
    ) -> StoredDoc {
        StoredDoc {
            doc,
            saved_at: saved_at.to_string(),
            template: template.to_string(),
            format: format.to_string(),
            accent: accent.to_string(),
            tighten,
        }
    }
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
            .save(&record(
                doc_named("Ada"),
                "column",
                "pdf",
                "ink",
                true,
                "2026-08-11T10:00:00Z",
            ))
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
            .save(&record(
                doc_named("Ada"),
                "column",
                "pdf",
                "ink",
                true,
                "2026-08-11T10:00:00Z",
            ))
            .unwrap();
        store
            .save(&record(
                doc_named("Grace"),
                "",
                "",
                "",
                true,
                "2026-08-11T11:00:00Z",
            ))
            .unwrap();
        assert_eq!(store.load().unwrap().unwrap().doc.contact.name, "Grace");
    }

    #[test]
    fn delete_all_removes_the_folder_and_load_goes_back_to_none() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().join("resume"));
        store
            .save(&record(
                doc_named("Ada"),
                "column",
                "pdf",
                "ink",
                true,
                "2026-08-11T10:00:00Z",
            ))
            .unwrap();
        store.delete_all().unwrap();
        assert!(!store.path().exists());
        assert!(store.load().unwrap().is_none());
    }

    #[test]
    fn the_chosen_template_comes_back_with_the_document() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        store
            .save(&record(
                doc_named("Ada"),
                "ledger",
                "docx",
                "navy",
                false,
                "2026-08-11T10:00:00Z",
            ))
            .unwrap();
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
        assert!(
            !stored.tighten,
            "a file from before the setting must default to off"
        );
    }

    /// The regression the review found: this file is what M1–M4 actually wrote,
    /// and before the compatibility shim it made `load` return `None` — the
    /// user's whole resume gone, silently, on first launch after upgrading.
    #[test]
    fn a_file_written_before_skills_had_labels_still_loads() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let legacy = r#"{"doc":{"contact":{"name":"Ada","email":"","phone":"","location":"","links":[]},"summary":"","experience":[],"education":[],"projects":[],"skills":["Rust","Analysis"]},"savedAt":"2026-08-11T10:00:00Z","template":"column"}"#;
        std::fs::write(dir.path().join("resume.json"), legacy).unwrap();

        let stored = store
            .load()
            .unwrap()
            .expect("an older resume must not be discarded");
        assert_eq!(stored.doc.contact.name, "Ada");
        assert_eq!(stored.doc.skills[0].items, vec!["Rust", "Analysis"]);
        assert_eq!(stored.template, "column");
    }

    #[test]
    fn a_corrupt_file_is_reported_and_left_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let path = dir.path().join("resume.json");
        std::fs::write(&path, b"{ not json").unwrap();
        let err = store.load().unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::InvalidData);
        assert_eq!(std::fs::read(&path).unwrap(), b"{ not json");
    }

    #[test]
    fn a_temp_file_does_not_replace_a_saved_document() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        store
            .save(&record(
                doc_named("Ada"),
                "column",
                "pdf",
                "ink",
                true,
                "2026-08-11T10:00:00Z",
            ))
            .unwrap();
        std::fs::write(
            dir.path().join("resume.json.tmp"),
            b"{\"doc\":{\"contact\":{\"name\":\"Grace\"}}}",
        )
        .unwrap();
        assert_eq!(store.load().unwrap().unwrap().doc.contact.name, "Ada");
        assert!(dir.path().join("resume.json").is_file());
    }

    #[test]
    fn a_missing_document_is_recovered_from_the_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let stored = record(
            doc_named("Grace"),
            "column",
            "pdf",
            "ink",
            true,
            "2026-08-11T10:00:00Z",
        );
        let json = serde_json::to_vec(&stored).unwrap();
        std::fs::create_dir_all(dir.path()).unwrap();
        std::fs::write(dir.path().join("resume.json.tmp"), json).unwrap();
        assert_eq!(store.load().unwrap().unwrap().doc.contact.name, "Grace");
        assert!(dir.path().join("resume.json").is_file());
        assert!(!dir.path().join("resume.json.tmp").exists());
    }

    #[test]
    fn a_document_over_64_kib_saves_and_loads() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let mut doc = ResumeDoc::empty();
        doc.contact.name = "Ada".into();
        doc.summary = "\"".repeat(40_000);
        store
            .save(&record(
                doc,
                "column",
                "pdf",
                "ink",
                false,
                "2026-08-11T10:00:00Z",
            ))
            .unwrap();
        let loaded = store.load().unwrap().unwrap();
        assert_eq!(loaded.doc.summary.len(), 40_000);
        let encoded = serde_json::to_vec(&loaded).unwrap();
        assert!(encoded.len() > 64 * 1024);
    }
}
