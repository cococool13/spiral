use std::path::{Path, PathBuf};

pub fn should_reap(exe: &Path, bundle_macos: &Path) -> bool {
    let exe = exe.components().collect::<Vec<_>>();
    let bundle = bundle_macos.components().collect::<Vec<_>>();
    !bundle.is_empty() && exe.starts_with(&bundle)
}

pub fn reap(pid: u32, exe: &Path, bundle_macos: &Path) -> bool {
    if !should_reap(exe, bundle_macos) {
        return false;
    }
    kill_pid(pid)
}

pub fn reap_stale(pidfile: &Path, bundle_macos: &Path) -> bool {
    let Ok(text) = std::fs::read_to_string(pidfile) else {
        return false;
    };
    let mut lines = text.lines();
    let Some(pid) = lines
        .next()
        .and_then(|line| line.trim().parse::<u32>().ok())
    else {
        return false;
    };
    let Some(exe) = lines.next().map(PathBuf::from) else {
        return false;
    };
    reap(pid, &exe, bundle_macos)
}

fn kill_pid(pid: u32) -> bool {
    #[cfg(unix)]
    {
        let rc = unsafe { libc_kill(pid as i32, 9) };
        rc == 0
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        false
    }
}

#[cfg(unix)]
unsafe extern "C" {
    #[link_name = "kill"]
    fn libc_kill(pid: i32, sig: i32) -> i32;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reap_ignores_a_pid_outside_the_bundle() {
        let pid = std::process::id();
        let exe = Path::new("/usr/bin/true");
        let bundle = Path::new("/Applications/Spiral.app/Contents/MacOS");
        assert!(!should_reap(exe, bundle));
        assert!(!reap(pid, exe, bundle));
        assert_eq!(std::process::id(), pid);
    }

    #[test]
    fn reap_accepts_an_executable_inside_the_bundle() {
        let bundle = Path::new("/Applications/Spiral.app/Contents/MacOS");
        let exe = bundle.join("spiral-resume-engine");
        assert!(should_reap(&exe, bundle));
    }
}
