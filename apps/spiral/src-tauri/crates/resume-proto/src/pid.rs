use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PidRecord {
    pub pid: u64,
    pub exe: PathBuf,
    pub started: u64,
}

pub fn may_signal(pid: u64) -> bool {
    pid > 1 && pid <= i32::MAX as u64
}

pub fn format_pid(pid: u32, exe: &Path) -> String {
    let started = live_start(pid).unwrap_or(0);
    format!("{pid}\n{}\n{started}\n", exe.display())
}

pub fn parse_pid(text: &str) -> Option<PidRecord> {
    let mut lines = text.lines();
    let pid = lines.next()?.trim().parse::<u64>().ok()?;
    let exe = PathBuf::from(lines.next()?.trim());
    if exe.as_os_str().is_empty() {
        return None;
    }
    let started = lines.next()?.trim().parse::<u64>().ok()?;
    Some(PidRecord { pid, exe, started })
}

pub fn live_matches(pid: u32, expected: &Path, started: u64) -> bool {
    if !may_signal(u64::from(pid)) || started == 0 || expected.as_os_str().is_empty() {
        return false;
    }
    let Some(live) = live_process(pid) else {
        return false;
    };
    live.started == started && same_file(&live.exe, expected)
}

fn same_file(live: &Path, expected: &Path) -> bool {
    if live == expected {
        return true;
    }
    match (live.canonicalize(), expected.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

struct Live {
    exe: PathBuf,
    started: u64,
}

fn live_start(pid: u32) -> Option<u64> {
    live_process(pid).map(|live| live.started)
}

#[cfg(target_os = "macos")]
fn live_process(pid: u32) -> Option<Live> {
    let exe = pid_path(pid)?;
    let started = pid_start(pid)?;
    (started > 0).then_some(Live { exe, started })
}

#[cfg(target_os = "macos")]
fn pid_path(pid: u32) -> Option<PathBuf> {
    let mut buf = vec![0u8; 4096];
    let wrote = unsafe { proc_pidpath(pid as i32, buf.as_mut_ptr().cast(), buf.len() as u32) };
    if wrote <= 0 {
        return None;
    }
    let end = buf
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(wrote as usize);
    let bytes = &buf[..end.min(buf.len())];
    if bytes.is_empty() {
        return None;
    }
    Some(PathBuf::from(
        <std::ffi::OsStr as std::os::unix::ffi::OsStrExt>::from_bytes(bytes),
    ))
}

#[cfg(target_os = "macos")]
fn pid_start(pid: u32) -> Option<u64> {
    let mut info = std::mem::MaybeUninit::<ProcBsdInfo>::zeroed();
    let wrote = unsafe {
        proc_pidinfo(
            pid as i32,
            3,
            0,
            info.as_mut_ptr().cast(),
            std::mem::size_of::<ProcBsdInfo>() as i32,
        )
    };
    if wrote != std::mem::size_of::<ProcBsdInfo>() as i32 {
        return None;
    }
    let info = unsafe { info.assume_init() };
    (info.start_sec > 0).then_some(info.start_sec)
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct ProcBsdInfo {
    flags: u32,
    status: u32,
    xstatus: u32,
    pid: u32,
    ppid: u32,
    uid: u32,
    gid: u32,
    ruid: u32,
    rgid: u32,
    svuid: u32,
    svgid: u32,
    reserved: u32,
    comm: [u8; 16],
    name: [u8; 32],
    nfiles: u32,
    pgid: u32,
    pjobc: u32,
    tdev: u32,
    tpgid: u32,
    nice: i32,
    start_sec: u64,
    start_usec: u64,
}

#[cfg(target_os = "macos")]
#[link(name = "proc")]
unsafe extern "C" {
    fn proc_pidpath(pid: i32, buffer: *mut core::ffi::c_void, buffersize: u32) -> i32;
    fn proc_pidinfo(
        pid: i32,
        flavor: i32,
        arg: u64,
        buffer: *mut core::ffi::c_void,
        buffersize: i32,
    ) -> i32;
}

#[cfg(target_os = "windows")]
fn live_process(pid: u32) -> Option<Live> {
    const QUERY: u32 = 0x1000;
    let handle = unsafe { OpenProcess(QUERY, 0, pid) };
    if handle.is_null() {
        return None;
    }
    let exe = query_image(handle);
    let started = query_start(handle);
    unsafe { CloseHandle(handle) };
    let exe = exe?;
    let started = started?;
    (started > 0).then_some(Live { exe, started })
}

#[cfg(target_os = "windows")]
fn query_image(handle: *mut core::ffi::c_void) -> Option<PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    let mut words = vec![0u16; 1024];
    let mut len = words.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(handle, 0, words.as_mut_ptr(), &mut len) };
    if ok == 0 {
        return None;
    }
    Some(PathBuf::from(std::ffi::OsString::from_wide(
        &words[..len as usize],
    )))
}

#[cfg(target_os = "windows")]
fn query_start(handle: *mut core::ffi::c_void) -> Option<u64> {
    let mut create = FileTime { low: 0, high: 0 };
    let mut exit = FileTime { low: 0, high: 0 };
    let mut kernel = FileTime { low: 0, high: 0 };
    let mut user = FileTime { low: 0, high: 0 };
    let ok = unsafe { GetProcessTimes(handle, &mut create, &mut exit, &mut kernel, &mut user) };
    if ok == 0 {
        return None;
    }
    let ticks = (u64::from(create.high) << 32) | u64::from(create.low);
    ticks
        .checked_sub(116_444_736_000_000_000)
        .map(|value| value / 10_000_000)
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct FileTime {
    low: u32,
    high: u32,
}

#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
unsafe extern "system" {
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut core::ffi::c_void;
    fn CloseHandle(handle: *mut core::ffi::c_void) -> i32;
    fn QueryFullProcessImageNameW(
        process: *mut core::ffi::c_void,
        flags: u32,
        buffer: *mut u16,
        size: *mut u32,
    ) -> i32;
    fn GetProcessTimes(
        process: *mut core::ffi::c_void,
        create: *mut FileTime,
        exit: *mut FileTime,
        kernel: *mut FileTime,
        user: *mut FileTime,
    ) -> i32;
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn live_process(_pid: u32) -> Option<Live> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pid_file_round_trips_and_rejects_a_group_or_broadcast_pid() {
        let text = "42\n/Applications/Spiral.app/Contents/MacOS/spiral-resume-engine\n1700000000\n";
        let record = parse_pid(text).unwrap();
        assert_eq!(record.pid, 42);
        assert_eq!(record.started, 1_700_000_000);
        assert!(may_signal(42));
        assert!(!may_signal(0));
        assert!(!may_signal(1));
        assert!(!may_signal(i32::MAX as u64 + 1));
        assert!(parse_pid("0\n/bin/sleep\n1\n").is_some());
        assert!(parse_pid("nope\n/bin/sleep\n1\n").is_none());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn this_process_reports_its_own_executable_and_start() {
        let pid = std::process::id();
        let live = live_process(pid).expect("this process has an identity");
        let exe = std::env::current_exe().unwrap();
        assert!(same_file(&live.exe, &exe), "{:?} vs {exe:?}", live.exe);
        assert!(live.started > 1_500_000_000, "{}", live.started);
        let text = format_pid(pid, &exe);
        let record = parse_pid(&text).unwrap();
        assert!(live_matches(pid, &exe, record.started));
        assert!(!live_matches(
            pid,
            Path::new("/usr/bin/false"),
            record.started
        ));
        assert!(!live_matches(pid, &exe, record.started.wrapping_add(1)));
    }
}
