use std::path::Path;

use serde_json::Value;

pub fn absolutize(resume_dir: &Path, value: &mut Value) {
    match value {
        Value::String(text) if text.starts_with("cache/") => {
            *text = resume_dir.join(&*text).to_string_lossy().into_owned();
        }
        Value::Array(items) => {
            for item in items {
                absolutize(resume_dir, item);
            }
        }
        Value::Object(map) => {
            for (key, item) in map {
                if key == "path" {
                    continue;
                }
                absolutize(resume_dir, item);
            }
        }
        _ => {}
    }
}
