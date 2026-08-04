use std::io::Write;
use std::path::Path;

const FILE: &str = "history.json";

/// Kept small deliberately. The log answers "what did Spiral Clean do", not
/// "what is on this disk" — an unbounded record of a user's filesystem is not
/// something this app should accumulate.
pub const MAX_RUNS: usize = 200;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RunRecord {
    pub started_at: String,
    pub screen: String,
    pub removed: usize,
    /// `remove_dir_all` is not atomic: a run that fails partway can leave
    /// items already destroyed while the overall outcome reports failure.
    /// Counted separately from `removed` so the log can say what actually
    /// happened rather than collapsing it into either "succeeded" or
    /// "nothing happened".
    pub partially_removed: usize,
    /// Logical size of what was selected.
    pub estimated_bytes: u64,
    /// Actual volume free-space delta after the run.
    pub measured_bytes: u64,
    /// True when the user quit mid-removal.
    pub interrupted: bool,
}

/// A missing log file is the normal first run, not an error.
pub fn read(dir: &Path) -> Vec<RunRecord> {
    std::fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Append one run to the log, atomically.
///
/// This reads the existing log, pushes the new record, truncates to
/// `MAX_RUNS`, and writes the result back — but the write itself goes to a
/// temp file in the same directory and is renamed over the real log only
/// after its contents are durable on disk. `exclude.rs` faced the identical
/// problem (a plain `fs::write` truncates before it writes, so a crash
/// mid-write leaves a half-written file) and fixed it the same way:
/// `rename(2)` is atomic within a directory, so a crash here leaves either
/// the old log or the new one, never a truncated one that silently drops
/// existing history.
pub fn append(dir: &Path, record: RunRecord) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let mut runs = read(dir);
    runs.push(record);
    if runs.len() > MAX_RUNS {
        runs.drain(0..runs.len() - MAX_RUNS);
    }
    let json = serde_json::to_string_pretty(&runs)?;

    // Same directory as the destination, or the rename would cross a
    // filesystem boundary and stop being atomic.
    let temp = dir.join(format!("{FILE}.{}.tmp", std::process::id()));
    let write_then_rename = || -> std::io::Result<()> {
        let mut file = std::fs::File::create(&temp)?;
        file.write_all(json.as_bytes())?;
        // Before the rename, not after: the rename is only worth anything
        // if the contents are already durable.
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temp, dir.join(FILE))
    };

    write_then_rename().inspect_err(|_| {
        // Leaving a stray temp file behind would be its own small mess.
        let _ = std::fs::remove_file(&temp);
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(n: usize) -> RunRecord {
        RunRecord {
            started_at: format!("2026-08-03T10:{n:02}:00Z"),
            screen: "clean".into(),
            removed: n,
            partially_removed: 0,
            estimated_bytes: 100,
            measured_bytes: 80,
            interrupted: false,
        }
    }

    #[test]
    fn appends_and_reads_back() {
        let dir = tempfile::tempdir().unwrap();
        append(dir.path(), record(1)).unwrap();
        append(dir.path(), record(2)).unwrap();
        let runs = read(dir.path());
        assert_eq!(runs.len(), 2);
        assert_eq!(runs[1].removed, 2);
    }

    #[test]
    fn oldest_records_roll_off_at_the_cap() {
        let dir = tempfile::tempdir().unwrap();
        for n in 0..MAX_RUNS + 10 {
            append(dir.path(), record(n)).unwrap();
        }
        let runs = read(dir.path());
        assert_eq!(runs.len(), MAX_RUNS);
        assert_eq!(runs[0].removed, 10, "the ten oldest should have rolled off");
    }

    #[test]
    fn missing_log_reads_as_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read(dir.path()).is_empty());
    }

    #[test]
    fn records_an_interrupted_run() {
        let dir = tempfile::tempdir().unwrap();
        let mut r = record(3);
        r.interrupted = true;
        append(dir.path(), r).unwrap();
        assert!(read(dir.path())[0].interrupted);
    }

    #[test]
    fn records_partially_removed_counts() {
        let dir = tempfile::tempdir().unwrap();
        let mut r = record(4);
        r.partially_removed = 2;
        append(dir.path(), r).unwrap();
        assert_eq!(read(dir.path())[0].partially_removed, 2);
    }
}
