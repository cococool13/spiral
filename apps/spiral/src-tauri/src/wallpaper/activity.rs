//! `$APPDATA/activity.jsonl`: one line per network request (spec §11). Local
//! only, never sent. Entries carry structure, not sentences; the UI writes
//! the words.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const ROTATE_AT: u64 = 1024 * 1024;
const MAX_LINE: usize = 4000;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    pub v: u32,
    pub at: String,
    pub actor: String,
    pub kind: String,
    pub action: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bytes: Option<u64>,
    pub result: String,
    #[serde(default)]
    pub code: Option<String>,
    /// The credit line of the picture an `apply` entry set.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credit: Option<String>,
}

impl Entry {
    pub fn network(action: &str, source: &str, host: &str, item: Option<&str>) -> Self {
        Self {
            v: 1,
            at: iso_now(),
            actor: "app".into(),
            kind: "network".into(),
            action: action.into(),
            source: Some(source.into()),
            host: Some(host.into()),
            item: item.map(str::to_string),
            bytes: None,
            result: "ok".into(),
            code: None,
            credit: None,
        }
    }

    /// A wallpaper was set: names the picture and who made it.
    pub fn applied(source: &str, item: &str, credit: Option<String>) -> Self {
        Self {
            kind: "wallpaper".into(),
            action: "apply".into(),
            actor: "user".into(),
            host: None,
            credit,
            ..Self::network("apply", source, "", Some(item))
        }
    }
}

pub struct ActivityLog {
    path: PathBuf,
    lock: Mutex<()>,
}

impl ActivityLog {
    pub fn at(dir: &Path) -> Self {
        Self {
            path: dir.join("activity.jsonl"),
            lock: Mutex::new(()),
        }
    }

    pub fn append(&self, entry: &Entry) {
        let Ok(mut line) = serde_json::to_string(entry) else {
            return;
        };
        if line.len() > MAX_LINE {
            return;
        }
        line.push('\n');
        let _guard = self.lock.lock().expect("activity");
        if let Some(dir) = self.path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if fs::metadata(&self.path).map(|meta| meta.len()).unwrap_or(0) >= ROTATE_AT {
            let _ = fs::rename(&self.path, self.path.with_extension("jsonl.1"));
        }
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        {
            let _ = file.write_all(line.as_bytes());
        }
    }

    /// Newest first, at most `limit`, from the live file only.
    pub fn list(&self, limit: usize) -> Vec<Entry> {
        let _guard = self.lock.lock().expect("activity");
        let Ok(text) = fs::read_to_string(&self.path) else {
            return Vec::new();
        };
        text.lines()
            .rev()
            .filter_map(|line| serde_json::from_str(line).ok())
            .take(limit)
            .collect()
    }

    pub fn clear(&self) {
        let _guard = self.lock.lock().expect("activity");
        let _ = fs::remove_file(&self.path);
        let _ = fs::remove_file(self.path.with_extension("jsonl.1"));
    }
}

pub fn iso_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    iso(secs)
}

/// UTC, `YYYY-MM-DDTHH:MM:SSZ`, from Unix seconds (Howard Hinnant's
/// days-to-civil algorithm, so no date crate is needed).
pub fn iso(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "spiral-activity-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn iso_formats_known_instants() {
        assert_eq!(iso(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso(1_792_850_591), "2026-10-24T14:03:11Z");
        assert_eq!(iso(951_782_400), "2000-02-29T00:00:00Z");
    }

    #[test]
    fn entries_append_list_newest_first_and_follow_the_schema() {
        let dir = scratch("append");
        let log = ActivityLog::at(&dir);
        log.append(&Entry::network(
            "search",
            "nasa",
            "images-api.nasa.gov",
            None,
        ));
        let mut second = Entry::network(
            "download",
            "nasa",
            "images-assets.nasa.gov",
            Some("n-PIA12345"),
        );
        second.bytes = Some(4_821_331);
        log.append(&second);
        let list = log.list(10);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].action, "download");
        assert_eq!(list[1].action, "search");
        let line = fs::read_to_string(dir.join("activity.jsonl")).unwrap();
        let last = line.lines().last().unwrap();
        let value: serde_json::Value = serde_json::from_str(last).unwrap();
        for key in [
            "v", "at", "actor", "kind", "action", "source", "host", "item", "bytes", "result",
            "code",
        ] {
            assert!(value.get(key).is_some(), "missing {key}");
        }
        assert!(!last.contains("http"));
        log.clear();
        assert!(log.list(10).is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn the_log_rotates_to_one_old_file_at_one_megabyte() {
        let dir = scratch("rotate");
        let log = ActivityLog::at(&dir);
        fs::write(dir.join("activity.jsonl"), vec![b'x'; ROTATE_AT as usize]).unwrap();
        log.append(&Entry::network("search", "bing", "www.bing.com", None));
        assert!(dir.join("activity.jsonl.1").is_file());
        assert_eq!(log.list(5).len(), 1);
        let _ = fs::remove_dir_all(dir);
    }
}
