use std::path::Path;

use resume_proto::cache_relative;
use serde_json::Value;

pub fn absolutize(resume_dir: &Path, value: &mut Value) {
    let Some(object) = value.as_object_mut() else {
        return;
    };
    if let Some(Value::Array(pages)) = object.get_mut("pages") {
        for page in pages {
            rewrite_cache(resume_dir, page);
        }
    }
    if let Some(file) = object.get_mut("file") {
        rewrite_cache(resume_dir, file);
    }
    if let Some(Value::Array(thumbs)) = object.get_mut("thumbs") {
        for thumb in thumbs {
            if let Some(file) = thumb.get_mut("file") {
                rewrite_cache(resume_dir, file);
            }
        }
    }
}

fn rewrite_cache(resume_dir: &Path, value: &mut Value) {
    let Value::String(text) = value else {
        return;
    };
    if cache_relative(text).is_err() {
        return;
    }
    *text = resume_dir.join(&*text).to_string_lossy().into_owned();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_real_cache_paths_become_absolute() {
        let dir = Path::new("/tmp/resume");
        let mut value = serde_json::json!({
            "pages": ["cache/preview/a.svg"],
            "file": "cache/build/a.pdf",
            "notes": ["cache/not-a-file"],
            "source": "cache/in-the-document",
            "path": "cache/should-stay",
            "thumbs": [{ "file": "cache/preview/t.svg", "name": "cache/name" }, { "file": "" }]
        });
        absolutize(dir, &mut value);
        assert_eq!(
            Path::new(value["pages"][0].as_str().unwrap()),
            dir.join("cache/preview/a.svg")
        );
        assert_eq!(
            Path::new(value["file"].as_str().unwrap()),
            dir.join("cache/build/a.pdf")
        );
        assert_eq!(
            Path::new(value["thumbs"][0]["file"].as_str().unwrap()),
            dir.join("cache/preview/t.svg")
        );
        assert_eq!(value["thumbs"][0]["name"], "cache/name");
        assert_eq!(value["thumbs"][1]["file"], "");
        assert_eq!(value["notes"][0], "cache/not-a-file");
        assert_eq!(value["source"], "cache/in-the-document");
        assert_eq!(value["path"], "cache/should-stay");

        let mut doc = serde_json::json!({
            "contact": { "name": "cache/Ada" },
            "roles": [{ "bullets": [{ "text": "cache/preview/secret" }] }]
        });
        absolutize(dir, &mut doc);
        assert_eq!(doc["contact"]["name"], "cache/Ada");
        assert_eq!(
            doc["roles"][0]["bullets"][0]["text"],
            "cache/preview/secret"
        );
    }
}
