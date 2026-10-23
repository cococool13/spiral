use std::path::Path;

use resume_proto::{live_matches, may_signal, parse_pid};

pub fn reap_stale(pidfile: &Path, expected: &Path) -> bool {
    let Ok(text) = std::fs::read_to_string(pidfile) else {
        return false;
    };
    let Some(record) = parse_pid(&text) else {
        let _ = std::fs::remove_file(pidfile);
        return false;
    };
    if !may_signal(record.pid) || !live_matches(record.pid as u32, expected, record.started) {
        let _ = std::fs::remove_file(pidfile);
        return false;
    }
    let killed = kill_pid(record.pid as i32);
    if killed {
        let _ = std::fs::remove_file(pidfile);
    }
    killed
}

fn kill_pid(pid: i32) -> bool {
    #[cfg(unix)]
    {
        let rc = unsafe { libc_kill(pid, 9) };
        rc == 0
    }
    #[cfg(windows)]
    {
        const TERMINATE: u32 = 0x0001;
        let handle = unsafe { OpenProcess(TERMINATE, 0, pid as u32) };
        if handle.is_null() {
            return false;
        }
        let ok = unsafe { TerminateProcess(handle, 1) } != 0;
        unsafe { CloseHandle(handle) };
        ok
    }
    #[cfg(not(any(unix, windows)))]
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

#[cfg(windows)]
#[link(name = "kernel32")]
unsafe extern "system" {
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut core::ffi::c_void;
    fn TerminateProcess(handle: *mut core::ffi::c_void, code: u32) -> i32;
    fn CloseHandle(handle: *mut core::ffi::c_void) -> i32;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reap_rejects_a_pid_outside_the_signal_range() {
        let dir = std::env::temp_dir().join(format!("spiral-pid-range-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("engine.pid");
        let expected = dir.join("spiral-resume-engine");
        std::fs::write(&file, "0\n/bin/sleep\n1\n").unwrap();
        assert!(!reap_stale(&file, &expected));
        std::fs::write(&file, "1\n/bin/sleep\n1\n").unwrap();
        assert!(!reap_stale(&file, &expected));
        std::fs::write(&file, format!("{}\n/bin/sleep\n1\n", i32::MAX as u64 + 1)).unwrap();
        assert!(!reap_stale(&file, &expected));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reap_does_not_signal_a_process_whose_executable_differs() {
        let mut child = std::process::Command::new("/bin/sleep")
            .arg("30")
            .spawn()
            .unwrap();
        let dir = std::env::temp_dir().join(format!("spiral-pid-sleep-{}", child.id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let expected = dir.join("spiral-resume-engine");
        let record = resume_proto::format_pid(child.id(), &expected);
        let file = dir.join("engine.pid");
        std::fs::write(&file, record).unwrap();
        assert!(!reap_stale(&file, &expected));
        assert!(child.try_wait().unwrap().is_none());
        let _ = child.kill();
        let _ = child.wait();
        let _ = std::fs::remove_dir_all(dir);
    }
}
