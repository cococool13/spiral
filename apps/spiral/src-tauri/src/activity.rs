//! `<root>/activity.jsonl`: the local, append-only log of network and
//! background actions (spec 2026-10-26 §11). Structure, not sentences. The
//! app (`actor: "app"`) and Spiral Live (`actor: "live"`) both append with
//! O_APPEND, one line under 4 KB; it rotates at 1 MB to one `.1` file and is
//! never sent anywhere.

use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::paths::Root;

const ROTATE_AT: u64 = 1_048_576;
const MAX_LINE: usize = 4096;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Entry {
    pub v: u32,
    pub at: String,
    pub actor: &'static str,
    pub kind: &'static str,
    pub action: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub result: &'static str,
    pub code: Option<String>,
}

impl Entry {
    pub fn app(kind: &'static str, action: &'static str) -> Self {
        Self {
            v: 1,
            at: rfc3339(SystemTime::now()),
            actor: "app",
            kind,
            action,
            reason: None,
            result: "ok",
            code: None,
        }
    }
}

pub fn append(root: &Root, entry: &Entry) {
    let path = root.dir().join("activity.jsonl");
    let Ok(mut line) = serde_json::to_vec(entry) else {
        return;
    };
    line.push(b'\n');
    if line.len() >= MAX_LINE {
        return;
    }
    let _ = std::fs::create_dir_all(root.dir());
    if std::fs::metadata(&path).is_ok_and(|meta| meta.len() >= ROTATE_AT) {
        let _ = std::fs::rename(&path, root.dir().join("activity.jsonl.1"));
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = file.write_all(&line);
    }
}

/// UTC, whole seconds, `Z`, matching the helper's ISO8601DateFormatter.
pub fn rfc3339(time: SystemTime) -> String {
    let secs = time
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // Civil-from-days (Howard Hinnant), proleptic Gregorian.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{h:02}:{m:02}:{s:02}Z")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn timestamps_are_utc_seconds() {
        assert_eq!(rfc3339(UNIX_EPOCH), "1970-01-01T00:00:00Z");
        assert_eq!(
            rfc3339(UNIX_EPOCH + Duration::from_secs(1_761_487_391)),
            "2025-10-26T14:03:11Z"
        );
        assert_eq!(
            rfc3339(UNIX_EPOCH + Duration::from_secs(951_782_400)),
            "2000-02-29T00:00:00Z"
        );
    }

    #[test]
    fn entries_append_as_one_json_line_each_and_rotate() {
        let dir = std::env::temp_dir().join(format!("spiral-activity-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let root = Root::at(&dir);
        append(&root, &Entry::app("apply", "pin"));
        append(&root, &Entry::app("apply", "unpin"));
        let text = std::fs::read_to_string(dir.join("activity.jsonl")).unwrap();
        let lines: Vec<serde_json::Value> = text
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0]["actor"], "app");
        assert_eq!(lines[1]["action"], "unpin");
        assert!(lines[0]["code"].is_null());

        std::fs::write(dir.join("activity.jsonl"), vec![b'x'; ROTATE_AT as usize]).unwrap();
        append(&root, &Entry::app("apply", "pin"));
        assert!(dir.join("activity.jsonl.1").exists());
        assert_eq!(
            std::fs::read_to_string(dir.join("activity.jsonl"))
                .unwrap()
                .lines()
                .count(),
            1
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
