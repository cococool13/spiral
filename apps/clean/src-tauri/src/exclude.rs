use std::path::{Path, PathBuf};

const FILE: &str = "exclusions.json";

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct ExclusionList {
    paths: Vec<PathBuf>,
}

pub fn new(paths: Vec<PathBuf>) -> ExclusionList {
    ExclusionList { paths }
}

impl ExclusionList {
    /// True when `candidate` is an excluded path or lives beneath one.
    /// `starts_with` compares whole path components, so `/tmp/keep` does not
    /// match `/tmp/keepsake.txt`.
    pub fn covers(&self, candidate: &Path) -> bool {
        self.paths.iter().any(|p| candidate.starts_with(p))
    }

    pub fn save(&self, dir: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(dir)?;
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(dir.join(FILE), json)
    }
}

/// A missing or unreadable list loads as empty rather than failing. The list
/// only ever *prevents* removal, so an empty one is the safe-to-read state —
/// it protects nothing, but it destroys nothing either.
pub fn load(dir: &Path) -> ExclusionList {
    std::fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn covers_an_exact_path() {
        let list = new(vec![PathBuf::from("/tmp/keep.txt")]);
        assert!(list.covers(Path::new("/tmp/keep.txt")));
    }

    #[test]
    fn covers_everything_beneath_an_excluded_directory() {
        // Excluding a folder whose contents remain deletable is not an
        // exclusion. This is the test that makes the guarantee real.
        let list = new(vec![PathBuf::from("/tmp/keep")]);
        assert!(list.covers(Path::new("/tmp/keep/nested/deep.txt")));
    }

    #[test]
    fn does_not_cover_a_sibling_with_a_shared_prefix() {
        let list = new(vec![PathBuf::from("/tmp/keep")]);
        assert!(!list.covers(Path::new("/tmp/keepsake.txt")));
    }

    #[test]
    fn empty_list_covers_nothing() {
        let list = new(vec![]);
        assert!(!list.covers(Path::new("/tmp/anything")));
    }

    #[test]
    fn round_trips_through_disk() {
        let dir = tempfile::tempdir().unwrap();
        let list = new(vec![PathBuf::from("/tmp/keep")]);
        list.save(dir.path()).unwrap();
        assert!(load(dir.path()).covers(Path::new("/tmp/keep/inner")));
    }

    #[test]
    fn missing_file_loads_as_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!load(dir.path()).covers(Path::new("/tmp/anything")));
    }
}
