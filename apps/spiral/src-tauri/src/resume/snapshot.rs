use std::path::Path;

use serde_json::{json, Value};

pub fn load(resume_dir: &Path) -> Result<Value, String> {
    let file = resume_dir.join("resume.json");
    let temp = resume_dir.join("resume.json.tmp");
    match read_json(&file) {
        Ok(Some(stored)) => Ok(json!({ "stored": stored })),
        Ok(None) => match read_json(&temp) {
            Ok(Some(stored)) => {
                if let Some(parent) = file.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                std::fs::rename(&temp, &file).map_err(|err| {
                    format!("Could not read the saved resume: {err}. The file was left in place.")
                })?;
                Ok(json!({ "stored": stored }))
            }
            Ok(None) => Ok(json!({ "stored": Value::Null })),
            Err(err) => Err(err),
        },
        Err(err) => Err(err),
    }
}

fn read_json(path: &Path) -> Result<Option<Value>, String> {
    match std::fs::read(path) {
        Ok(bytes) => {
            let value: Value = serde_json::from_slice(&bytes).map_err(|_| {
                format!(
                    "Could not read the saved resume: {} is not valid JSON. The file was left in place.",
                    path.display()
                )
            })?;
            resume_proto::normalize_stored(value).map(Some)
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!(
            "Could not read the saved resume: {err}. The file was left in place."
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_is_an_empty_resume() {
        let dir = std::env::temp_dir().join(format!("spiral-snapshot-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let value = load(&dir).unwrap();
        assert!(value["stored"].is_null());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_temp_file_is_recovered_and_corrupt_json_stays() {
        let dir = std::env::temp_dir().join(format!("spiral-snapshot-tmp-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("resume.json.tmp"),
            br#"{"doc":{"contact":{"name":"Ada"}}}"#,
        )
        .unwrap();
        let value = load(&dir).unwrap();
        assert_eq!(value["stored"]["doc"]["contact"]["name"], "Ada");
        assert_eq!(value["stored"]["doc"]["headline"], "");
        assert!(dir.join("resume.json").is_file());
        std::fs::write(dir.join("resume.json"), b"not json").unwrap();
        let err = load(&dir).unwrap_err();
        assert!(err.contains("left in place"), "{err}");
        assert!(std::fs::read(dir.join("resume.json")).unwrap() == b"not json");
        let _ = std::fs::remove_dir_all(dir);
    }
}
