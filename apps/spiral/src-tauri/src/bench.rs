use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

static ENABLED: AtomicBool = AtomicBool::new(false);
static OUT: Mutex<Option<File>> = Mutex::new(None);

pub fn init_from_env() {
    if std::env::var("SPIRAL_BENCH").ok().as_deref() != Some("1") {
        return;
    }
    ENABLED.store(true, Ordering::Relaxed);
    let Ok(path) = std::env::var("SPIRAL_BENCH_OUT") else {
        return;
    };
    if path.is_empty() {
        return;
    }
    let path = Path::new(&path);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(parent);
        }
    }
    match OpenOptions::new().create(true).append(true).open(path) {
        Ok(file) => *OUT.lock().expect("bench lock") = Some(file),
        Err(err) => eprintln!("bench: could not open the mark file: {err}"),
    }
}

pub fn enabled() -> bool {
    ENABLED.load(Ordering::Relaxed)
}

pub fn known(name: &str) -> bool {
    matches!(
        name,
        "process_start"
            | "window_visible"
            | "first_paint"
            | "picker_ready"
            | "module_ready:wallpaper"
            | "module_ready:resume"
            | "first_useful_action:wallpaper"
            | "first_useful_action:resume"
            | "engine_spawn"
            | "engine_exit"
            | "sidecar_spawn"
            | "sidecar_exit"
            | "apply_done"
    )
}

pub fn mark(name: &str) {
    if !enabled() {
        return;
    }
    write_line(name, clock::now_ns());
}

pub fn mark_process_start() {
    if !enabled() {
        return;
    }
    write_line("process_start", clock::process_start_ns());
}

fn write_line(name: &str, uptime_ns: u64) {
    let line = serde_json::json!({
        "v": 1,
        "mark": name,
        "uptime_ns": uptime_ns,
        "pid": std::process::id(),
    });
    let mut guard = OUT.lock().expect("bench lock");
    let Some(file) = guard.as_mut() else {
        return;
    };
    let _ = writeln!(file, "{line}");
    let _ = file.flush();
}

#[cfg(target_os = "macos")]
mod clock {
    use std::ffi::c_void;

    #[link(name = "c")]
    extern "C" {
        fn mach_continuous_time() -> u64;
        fn mach_timebase_info(info: *mut Timebase) -> i32;
    }

    #[repr(C)]
    struct Timebase {
        numer: u32,
        denom: u32,
    }

    pub fn now_ns() -> u64 {
        // SAFETY: mach_continuous_time takes no state. The timebase pointer is a live stack value.
        let ticks = unsafe { mach_continuous_time() };
        let mut info = Timebase { numer: 0, denom: 0 };
        let rc = unsafe { mach_timebase_info(&mut info) };
        if rc != 0 || info.denom == 0 {
            return 0;
        }
        ticks.saturating_mul(u64::from(info.numer)) / u64::from(info.denom)
    }

    #[link(name = "proc")]
    extern "C" {
        fn proc_pidinfo(
            pid: i32,
            flavor: i32,
            arg: u64,
            buffer: *mut c_void,
            buffersize: i32,
        ) -> i32;
    }

    const PROC_PIDTBSDINFO: i32 = 3;
    const PROC_BSDINFO_SIZE: i32 = 136;

    #[repr(C)]
    #[allow(dead_code)]
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

    const _: () = assert!(std::mem::size_of::<ProcBsdInfo>() == PROC_BSDINFO_SIZE as usize);

    pub fn process_start_ns() -> u64 {
        let mut info = std::mem::MaybeUninit::<ProcBsdInfo>::zeroed();
        // SAFETY: PROC_PIDTBSDINFO writes one proc_bsdinfo into a buffer of that size.
        let wrote = unsafe {
            proc_pidinfo(
                std::process::id() as i32,
                PROC_PIDTBSDINFO,
                0,
                info.as_mut_ptr().cast(),
                PROC_BSDINFO_SIZE,
            )
        };
        if wrote != PROC_BSDINFO_SIZE {
            return now_ns();
        }
        // SAFETY: proc_pidinfo reported a full write into the zeroed struct.
        let info = unsafe { info.assume_init() };
        let start_ns = info
            .start_sec
            .saturating_mul(1_000_000_000)
            .saturating_add(info.start_usec.saturating_mul(1_000));
        let unix_ns = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos() as u64)
            .unwrap_or(0);
        now_ns().saturating_sub(unix_ns.saturating_sub(start_ns))
    }
}

#[cfg(target_os = "windows")]
mod clock {
    extern "system" {
        fn QueryPerformanceCounter(count: *mut i64) -> i32;
        fn QueryPerformanceFrequency(frequency: *mut i64) -> i32;
        fn GetProcessTimes(
            process: isize,
            created: *mut u64,
            exited: *mut u64,
            kernel: *mut u64,
            user: *mut u64,
        ) -> i32;
        fn GetCurrentProcess() -> isize;
    }

    pub fn now_ns() -> u64 {
        let mut count = 0i64;
        let mut frequency = 0i64;
        // SAFETY: both pointers are live stack values. The calls do not retain them.
        let ok = unsafe {
            QueryPerformanceCounter(&mut count) != 0
                && QueryPerformanceFrequency(&mut frequency) != 0
        };
        if !ok || frequency <= 0 {
            return 0;
        }
        (count as u128 * 1_000_000_000 / frequency as u128) as u64
    }

    pub fn process_start_ns() -> u64 {
        let mut created = 0u64;
        let mut exited = 0u64;
        let mut kernel = 0u64;
        let mut user = 0u64;
        // SAFETY: GetCurrentProcess returns a pseudo-handle. The FILETIME pointers are live stack values.
        let ok = unsafe {
            GetProcessTimes(
                GetCurrentProcess(),
                &mut created,
                &mut exited,
                &mut kernel,
                &mut user,
            ) != 0
        };
        if !ok {
            return now_ns();
        }
        let unix_100ns = created.saturating_sub(11_644_473_600_000_000);
        let start_ns = unix_100ns.saturating_mul(100);
        let unix_ns = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos() as u64)
            .unwrap_or(0);
        now_ns().saturating_sub(unix_ns.saturating_sub(start_ns))
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod clock {
    pub fn now_ns() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos() as u64)
            .unwrap_or(0)
    }

    pub fn process_start_ns() -> u64 {
        now_ns()
    }
}
