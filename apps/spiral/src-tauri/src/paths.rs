use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Root {
    dir: PathBuf,
}

impl Root {
    pub fn at(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn resolve(app_data: PathBuf) -> Self {
        match std::env::var("SPIRAL_ROOT") {
            Ok(value) if !value.is_empty() => Self::at(value),
            _ => Self::at(app_data),
        }
    }

    pub fn spiral_json(&self) -> PathBuf {
        self.dir.join("spiral.json")
    }

    pub fn spiral_json_bad(&self) -> PathBuf {
        self.dir.join("spiral.json.bad")
    }

    pub fn spiral_json_tmp(&self) -> PathBuf {
        self.dir.join("spiral.json.tmp")
    }

    pub fn settings_json(&self) -> PathBuf {
        self.dir.join("settings.json")
    }

    pub fn thumbs(&self) -> PathBuf {
        self.dir.join("thumbs")
    }

    pub fn wallpapers(&self) -> PathBuf {
        self.dir.join("wallpapers")
    }

    pub fn staging(&self) -> PathBuf {
        self.dir.join("staging")
    }

    pub fn last_page(&self) -> PathBuf {
        self.dir.join("last_page.json")
    }

    pub fn last_page_tmp(&self) -> PathBuf {
        self.dir.join("last_page.json.tmp")
    }

    pub fn thumb_ledger(&self) -> PathBuf {
        self.thumbs().join("ledger.json")
    }

    pub fn has_wallpaper_files(&self) -> bool {
        self.settings_json().is_file() || self.thumbs().is_dir() || self.wallpapers().is_dir()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LegacyRoots {
    resume: PathBuf,
}

impl LegacyRoots {
    pub fn at(resume: impl Into<PathBuf>) -> Self {
        Self {
            resume: resume.into(),
        }
    }

    pub fn detect() -> Self {
        Self::at(data_dir().join("app.spiral.resume"))
    }

    pub fn resume_json(&self) -> PathBuf {
        self.resume.join("resume.json")
    }

    pub fn engine_json(&self) -> PathBuf {
        self.resume.join("engine.json")
    }

    pub fn models(&self) -> PathBuf {
        self.resume.join("models")
    }

    pub fn has_data(&self) -> bool {
        self.resume_json().is_file() || self.engine_json().is_file() || self.models().is_dir()
    }
}

fn data_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_default()
            .join("Library/Application Support")
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::env::var_os("HOME")
            .map(|home| PathBuf::from(home).join(".local/share"))
            .unwrap_or_else(std::env::temp_dir)
    }
}

pub fn replace_file(from: &Path, to: &Path) -> std::io::Result<()> {
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
        const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
        const MOVEFILE_WRITE_THROUGH: u32 = 0x8;
        extern "system" {
            fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> i32;
        }
        // SAFETY: both pointers are NUL-terminated wide paths that live until the call returns.
        let rc = unsafe {
            MoveFileExW(
                from_w.as_ptr(),
                to_w.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if rc == 0 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(())
        }
    }
    #[cfg(not(windows))]
    {
        std::fs::rename(from, to)
    }
}
