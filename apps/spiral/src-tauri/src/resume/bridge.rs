use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use resume_proto::{
    cache_relative, decode_from, encode_to, Call, Event, FromEngine, ProviderId, ToEngine, PROTO,
};
use serde_json::Value;

pub const STOPPED: &str = "Resume's engine stopped. Try again.";
pub const MISMATCH: &str =
    "Resume's engine does not match this version of Spiral. Reinstall Spiral.";
pub const MISSING: &str = "Resume's engine is not in this build.";

const IDLE: Duration = Duration::from_secs(2);
const HELLO_LIMIT: Duration = Duration::from_secs(5);
const CRASH_WINDOW: Duration = Duration::from_secs(10);

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Phase {
    Stopped,
    Spawning,
    Idle,
    Busy { inflight: u32 },
    Draining { inflight: u32 },
    Crashed { at: Instant },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Effect {
    Spawn,
    Cancel,
    Shutdown { drain: bool },
    Kill,
    DropReply,
    Tell(&'static str),
}

pub trait Clock {
    fn now(&self) -> Instant;
}

#[derive(Clone, Copy, Debug)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> Instant {
        Instant::now()
    }
}

#[cfg(test)]
#[derive(Clone, Debug)]
pub struct ManualClock {
    origin: Instant,
    offset: Duration,
}

#[cfg(test)]
impl ManualClock {
    pub fn new() -> Self {
        Self {
            origin: Instant::now(),
            offset: Duration::ZERO,
        }
    }

    pub fn advance(&mut self, by: Duration) {
        self.offset += by;
    }
}

#[cfg(test)]
impl Clock for ManualClock {
    fn now(&self) -> Instant {
        self.origin + self.offset
    }
}

pub struct Machine<C> {
    clock: C,
    phase: Phase,
    epoch: u64,
    idle_at: Option<Instant>,
    spawn_at: Option<Instant>,
    crashes: Vec<Instant>,
    drain: bool,
    pending: Option<bool>,
    hard_stop: bool,
    expected: String,
}

impl<C: Clock> Machine<C> {
    pub fn new(clock: C, expected: impl Into<String>) -> Self {
        Self {
            clock,
            phase: Phase::Stopped,
            epoch: 0,
            idle_at: None,
            spawn_at: None,
            crashes: Vec::new(),
            drain: false,
            pending: None,
            hard_stop: false,
            expected: expected.into(),
        }
    }

    #[cfg(test)]
    pub fn phase(&self) -> &Phase {
        &self.phase
    }

    pub fn epoch(&self) -> u64 {
        self.epoch
    }

    #[cfg(test)]
    pub fn clock_mut(&mut self) -> &mut C {
        &mut self.clock
    }

    pub fn activate(&mut self) -> Vec<Effect> {
        self.epoch = self.epoch.saturating_add(1);
        self.pending = None;
        self.spawn()
    }

    pub fn hello(&mut self, version: &str, proto: u32) -> Vec<Effect> {
        if version != self.expected || proto != PROTO {
            self.phase = Phase::Stopped;
            self.pending = None;
            return vec![Effect::Kill, Effect::Tell(MISMATCH)];
        }
        if let Some(at) = self.spawn_at {
            if self.clock.now().saturating_duration_since(at) > HELLO_LIMIT {
                return self.note_crash();
            }
        }
        self.phase = Phase::Idle;
        self.idle_at = Some(self.clock.now());
        if let Some(keeps) = self.pending.take() {
            self.begin(keeps);
        }
        Vec::new()
    }

    pub fn call(&mut self, keeps_engine: bool) -> Vec<Effect> {
        if self.hard_stop {
            return vec![Effect::Tell(STOPPED)];
        }
        match self.phase {
            Phase::Stopped | Phase::Crashed { .. } => {
                self.pending = Some(keeps_engine);
                self.spawn()
            }
            Phase::Idle | Phase::Busy { .. } => {
                self.begin(keeps_engine);
                Vec::new()
            }
            Phase::Spawning => {
                self.pending = Some(keeps_engine);
                Vec::new()
            }
            Phase::Draining { .. } => vec![Effect::Tell(STOPPED)],
        }
    }

    pub fn reply(&mut self, epoch: u64) -> Vec<Effect> {
        if epoch < self.epoch {
            return vec![Effect::DropReply];
        }
        let inflight = match self.phase {
            Phase::Busy { inflight } | Phase::Draining { inflight } => inflight,
            _ => return Vec::new(),
        };
        let left = inflight.saturating_sub(1);
        if left == 0 {
            let draining = matches!(self.phase, Phase::Draining { .. });
            self.drain = false;
            if draining {
                self.phase = Phase::Stopped;
                self.idle_at = None;
            } else {
                self.phase = Phase::Idle;
                self.idle_at = Some(self.clock.now());
            }
            Vec::new()
        } else if matches!(self.phase, Phase::Draining { .. }) {
            self.phase = Phase::Draining { inflight: left };
            Vec::new()
        } else {
            self.phase = Phase::Busy { inflight: left };
            Vec::new()
        }
    }

    pub fn leave(&mut self) -> Vec<Effect> {
        match self.phase {
            Phase::Busy { .. } | Phase::Spawning if self.drain => {
                let inflight = match self.phase {
                    Phase::Busy { inflight } => inflight,
                    _ => 1,
                };
                self.phase = Phase::Draining { inflight };
                vec![Effect::Shutdown { drain: true }]
            }
            Phase::Busy { .. } | Phase::Spawning | Phase::Idle => {
                self.phase = Phase::Stopped;
                self.idle_at = None;
                self.drain = false;
                self.pending = None;
                vec![Effect::Cancel, Effect::Shutdown { drain: false }]
            }
            Phase::Draining { .. } | Phase::Stopped | Phase::Crashed { .. } => Vec::new(),
        }
    }

    pub fn child_exit(&mut self) -> Vec<Effect> {
        self.note_crash()
    }

    pub fn tick(&mut self) -> Vec<Effect> {
        let now = self.clock.now();
        if let Phase::Idle = self.phase {
            if let Some(since) = self.idle_at {
                if now.saturating_duration_since(since) >= IDLE {
                    self.phase = Phase::Stopped;
                    self.idle_at = None;
                    return vec![Effect::Shutdown { drain: false }];
                }
            }
        }
        if let Phase::Spawning = self.phase {
            if let Some(at) = self.spawn_at {
                if now.saturating_duration_since(at) >= HELLO_LIMIT {
                    let mut effects = vec![Effect::Kill];
                    effects.extend(self.note_crash());
                    return effects;
                }
            }
        }
        Vec::new()
    }

    fn spawn(&mut self) -> Vec<Effect> {
        if self.hard_stop {
            return vec![Effect::Tell(STOPPED)];
        }
        self.phase = Phase::Spawning;
        self.spawn_at = Some(self.clock.now());
        self.idle_at = None;
        self.drain = false;
        vec![Effect::Spawn]
    }

    fn begin(&mut self, keeps_engine: bool) {
        let inflight = match self.phase {
            Phase::Busy { inflight } => inflight,
            _ => 0,
        };
        self.phase = Phase::Busy {
            inflight: inflight + 1,
        };
        self.idle_at = None;
        if keeps_engine {
            self.drain = true;
        }
    }

    fn note_crash(&mut self) -> Vec<Effect> {
        let at = self.clock.now();
        self.phase = Phase::Crashed { at };
        self.crashes.push(at);
        self.drain = false;
        self.pending = None;
        if self.crashes.len() >= 2 {
            let previous = self.crashes[self.crashes.len() - 2];
            if at.saturating_duration_since(previous) <= CRASH_WINDOW {
                self.hard_stop = true;
                return vec![Effect::Tell(STOPPED)];
            }
        }
        Vec::new()
    }
}

pub fn accept_hello(line: &str, expected: &str) -> Result<(), String> {
    match decode_from(line.trim_end()).map_err(|err| err.message)? {
        FromEngine::Hello { version, proto } => {
            if version != expected || proto != PROTO {
                Err(MISMATCH.into())
            } else {
                Ok(())
            }
        }
        _ => Err(MISMATCH.into()),
    }
}

pub struct Exchange<'a> {
    pub id: u64,
    pub epoch: u64,
    pub licensed: bool,
    pub call: &'a Call,
}

pub fn exchange<R: BufRead, W: Write>(
    input: &mut R,
    output: &mut W,
    request: &Exchange<'_>,
    answer_key: &mut dyn FnMut(ProviderId) -> Result<Option<String>, String>,
    on_event: &mut dyn FnMut(Event),
) -> Result<Value, String> {
    write_frame(
        output,
        &ToEngine::Request {
            id: request.id,
            epoch: request.epoch,
            licensed: request.licensed,
            call: request.call.clone(),
        },
    )?;
    loop {
        let mut line = String::new();
        let read = input.read_line(&mut line).map_err(|err| err.to_string())?;
        if read == 0 {
            return Err(STOPPED.into());
        }
        match decode_from(line.trim_end()).map_err(|err| err.message)? {
            FromEngine::Event { event, .. } => on_event(event),
            FromEngine::Ask { ask, question, .. } => {
                let resume_proto::Ask::ProviderKey { provider } = question;
                let key = answer_key(provider)?;
                write_frame(
                    output,
                    &ToEngine::Answer {
                        id: request.id,
                        ask,
                        answer: resume_proto::Answer::ProviderKey { key },
                    },
                )?;
            }
            FromEngine::Reply {
                ok, body, message, ..
            } => {
                if !ok {
                    return Err(message.unwrap_or_else(|| STOPPED.into()));
                }
                let body = body.unwrap_or(Value::Null);
                check_cache_paths(&body)?;
                return Ok(body);
            }
            FromEngine::Hello { .. } => {
                return Err(MISMATCH.into());
            }
        }
    }
}

fn check_cache_paths(body: &Value) -> Result<(), String> {
    if let Some(pages) = body.get("pages").and_then(Value::as_array) {
        for page in pages {
            if let Some(path) = page.as_str() {
                cache_relative(path).map_err(|err| err.message)?;
            }
        }
    }
    if let Some(file) = body.get("file").and_then(Value::as_str) {
        cache_relative(file).map_err(|err| err.message)?;
    }
    Ok(())
}

fn write_frame(output: &mut impl Write, message: &ToEngine) -> Result<(), String> {
    let bytes = encode_to(message).map_err(|err| err.message)?;
    output
        .write_all(&bytes)
        .and_then(|_| output.write_all(b"\n"))
        .and_then(|_| output.flush())
        .map_err(|err| err.to_string())
}

pub struct Link {
    machine: Machine<SystemClock>,
    child: Option<EngineProcess>,
    next_id: u64,
}

struct EngineProcess {
    child: Child,
    stdin: std::process::ChildStdin,
    stdout: std::io::BufReader<std::process::ChildStdout>,
    resume_dir: PathBuf,
}

impl Link {
    pub fn new() -> Self {
        Self {
            machine: Machine::new(SystemClock, env!("CARGO_PKG_VERSION")),
            child: None,
            next_id: 1,
        }
    }

    pub fn activate(&mut self) -> Vec<Effect> {
        let effects = self.machine.activate();
        self.apply(&effects);
        effects
    }

    pub fn leave(&mut self) -> Vec<Effect> {
        let effects = self.machine.leave();
        self.apply(&effects);
        effects
    }

    pub fn poll(&mut self) {
        if self.child.is_none() {
            return;
        }
        let effects = self.machine.tick();
        if effects.is_empty() {
            return;
        }
        self.apply(&effects);
    }

    pub fn dispatch(
        &mut self,
        resume_dir: &Path,
        licensed: bool,
        call: &Call,
        mut answer_key: impl FnMut(ProviderId) -> Result<Option<String>, String>,
        mut on_event: impl FnMut(Event),
    ) -> Result<Value, String> {
        let crashed = self.poll_exit();
        if crashed
            .iter()
            .any(|effect| matches!(effect, Effect::Tell(STOPPED)))
        {
            return Err(STOPPED.into());
        }
        let tick = self.machine.tick();
        self.apply(&tick);
        if tick
            .iter()
            .any(|effect| matches!(effect, Effect::Tell(STOPPED)))
        {
            return Err(STOPPED.into());
        }
        let effects = self.machine.call(call.keeps_engine());
        if effects
            .iter()
            .any(|effect| matches!(effect, Effect::Tell(_)))
        {
            return Err(STOPPED.into());
        }
        self.ensure(resume_dir)?;
        let id = self.next_id;
        self.next_id = self.next_id.saturating_add(1);
        let epoch = self.machine.epoch().max(1);
        let request = Exchange {
            id,
            epoch,
            licensed,
            call,
        };
        let EngineProcess { stdin, stdout, .. } = self.child.as_mut().ok_or(MISSING)?;
        let body = exchange(stdout, stdin, &request, &mut answer_key, &mut on_event);
        let _ = self.machine.reply(epoch);
        body
    }

    fn ensure(&mut self, resume_dir: &Path) -> Result<(), String> {
        if self.child.is_some() {
            return Ok(());
        }
        if let Some(bundle) = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(Path::to_path_buf))
        {
            crate::resume::pidfile::reap_stale(&resume_dir.join("engine.pid"), &bundle);
        }
        let binary = engine_binary().ok_or_else(|| MISSING.to_string())?;
        std::fs::create_dir_all(resume_dir).map_err(|err| err.to_string())?;
        let mut command = Command::new(&binary);
        command
            .env("SPIRAL_RESUME_DIR", resume_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0000_0200);
        }
        let mut child = command.spawn().map_err(|err| err.to_string())?;
        let stdout = child.stdout.take().ok_or_else(|| MISSING.to_string())?;
        let stdin = child.stdin.take().ok_or_else(|| MISSING.to_string())?;
        let mut stdout = std::io::BufReader::new(stdout);
        let mut line = String::new();
        stdout.read_line(&mut line).map_err(|err| err.to_string())?;
        if let Err(err) = accept_hello(&line, env!("CARGO_PKG_VERSION")) {
            let _ = child.kill();
            return Err(err);
        }
        let hello = self.machine.hello(env!("CARGO_PKG_VERSION"), PROTO);
        if hello.iter().any(|effect| matches!(effect, Effect::Tell(_))) {
            let _ = child.kill();
            return Err(MISMATCH.into());
        }
        let _ = std::fs::write(
            resume_dir.join("engine.pid"),
            format!("{}\n{}\n", child.id(), binary.display()),
        );
        self.child = Some(EngineProcess {
            child,
            stdin,
            stdout,
            resume_dir: resume_dir.to_path_buf(),
        });
        Ok(())
    }

    fn apply(&mut self, effects: &[Effect]) {
        for effect in effects {
            match effect {
                Effect::Shutdown { drain } => {
                    if let Some(process) = self.child.as_mut() {
                        let _ = write_frame(
                            process.stdin.by_ref(),
                            &ToEngine::Shutdown { drain: *drain },
                        );
                    }
                    if !drain {
                        self.stop_child();
                    }
                }
                Effect::Cancel => {
                    if let Some(process) = self.child.as_mut() {
                        let _ = write_frame(
                            process.stdin.by_ref(),
                            &ToEngine::Cancel { id: self.next_id },
                        );
                    }
                }
                Effect::Kill => self.stop_child(),
                Effect::Spawn | Effect::DropReply | Effect::Tell(_) => {}
            }
        }
    }

    fn poll_exit(&mut self) -> Vec<Effect> {
        let exited = self
            .child
            .as_mut()
            .and_then(|process| process.child.try_wait().ok())
            .flatten()
            .is_some();
        if !exited {
            return Vec::new();
        }
        if let Some(process) = self.child.take() {
            let _ = std::fs::remove_file(process.resume_dir.join("engine.pid"));
        }
        self.machine.child_exit()
    }

    fn stop_child(&mut self) {
        let Some(mut process) = self.child.take() else {
            return;
        };
        let started = Instant::now();
        loop {
            match process.child.try_wait() {
                Ok(Some(_)) => {
                    let _ = std::fs::remove_file(process.resume_dir.join("engine.pid"));
                    return;
                }
                Ok(None) if started.elapsed() < Duration::from_millis(500) => {
                    std::thread::sleep(Duration::from_millis(20));
                }
                _ => break,
            }
        }
        let pid = process.child.id();
        let _ = process.child.kill();
        kill_group(pid);
        let _ = process.child.wait();
        let _ = std::fs::remove_file(process.resume_dir.join("engine.pid"));
    }
}

impl Drop for Link {
    fn drop(&mut self) {
        if self.child.is_some() {
            let effects = vec![Effect::Shutdown { drain: false }];
            self.apply(&effects);
        }
    }
}

fn engine_binary() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("SPIRAL_ENGINE") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Some(path);
        }
    }
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let name = format!("spiral-resume-engine{}", std::env::consts::EXE_SUFFIX);
    let candidate = dir.join(name);
    candidate.is_file().then_some(candidate)
}

fn kill_group(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc_kill(-(pid as i32), 9);
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
    }
}

#[cfg(unix)]
unsafe extern "C" {
    #[link_name = "kill"]
    fn libc_kill(pid: i32, sig: i32) -> i32;
}

#[cfg(test)]
mod tests {
    use std::io::BufReader;

    use resume_proto::{every_call, Answer, FromEngine};

    use super::*;

    fn ready() -> Machine<ManualClock> {
        let mut machine = Machine::new(ManualClock::new(), "2.0.0");
        machine.activate();
        assert!(machine.hello("2.0.0", PROTO).is_empty());
        machine
    }

    #[test]
    fn only_download_model_sets_drain() {
        for call in every_call() {
            let mut machine = ready();
            assert!(machine.call(call.keeps_engine()).is_empty());
            let effects = machine.leave();
            if call.keeps_engine() {
                assert!(
                    effects.contains(&Effect::Shutdown { drain: true }),
                    "{call:?}"
                );
                assert!(!effects.contains(&Effect::Cancel));
                assert!(matches!(machine.phase(), Phase::Draining { .. }));
            } else {
                assert!(effects.contains(&Effect::Shutdown { drain: false }));
                assert!(effects.contains(&Effect::Cancel));
                assert!(matches!(machine.phase(), Phase::Stopped));
            }
        }
    }

    #[test]
    fn idle_for_two_seconds_shuts_the_engine_down() {
        let mut machine = ready();
        machine.clock_mut().advance(Duration::from_millis(1_999));
        assert!(machine.tick().is_empty());
        assert!(matches!(machine.phase(), Phase::Idle));
        machine.clock_mut().advance(Duration::from_millis(1));
        assert_eq!(machine.tick(), vec![Effect::Shutdown { drain: false }]);
        assert!(matches!(machine.phase(), Phase::Stopped));
    }

    #[test]
    fn a_second_crash_within_ten_seconds_stops_the_engine() {
        let mut machine = ready();
        assert!(machine.child_exit().is_empty());
        let spawned = machine.call(false);
        assert_eq!(spawned, vec![Effect::Spawn]);
        let second = machine.child_exit();
        assert_eq!(second, vec![Effect::Tell(STOPPED)]);
        assert_eq!(machine.call(false), vec![Effect::Tell(STOPPED)]);
    }

    #[test]
    fn a_hello_mismatch_is_the_reinstall_sentence() {
        let mut machine = Machine::new(ManualClock::new(), "2.0.0");
        machine.activate();
        assert_eq!(
            machine.hello("1.0.0", PROTO),
            vec![Effect::Kill, Effect::Tell(MISMATCH)]
        );
        assert_eq!(
            accept_hello(
                r#"{"v":1,"type":"hello","version":"1.0.0","proto":1}"#,
                "2.0.0"
            )
            .unwrap_err(),
            MISMATCH
        );
    }

    #[test]
    fn an_old_epoch_is_dropped() {
        let mut machine = ready();
        let first = machine.epoch();
        machine.call(false);
        machine.activate();
        assert!(machine.epoch() > first);
        assert_eq!(machine.reply(first), vec![Effect::DropReply]);
    }

    #[test]
    fn a_provider_answer_goes_to_the_engine_and_a_cache_escape_is_rejected() {
        let (engine_read, mut shell_write) = std::io::pipe().unwrap();
        let (shell_read, mut engine_write) = std::io::pipe().unwrap();
        let call = Call::EngineInfo {};
        let worker = std::thread::spawn(move || {
            let mut engine_read = BufReader::new(engine_read);
            let mut line = String::new();
            engine_read.read_line(&mut line).unwrap();
            let request = resume_proto::decode_to(line.trim_end()).unwrap();
            let ToEngine::Request { id, licensed, .. } = request else {
                panic!("request");
            };
            assert!(licensed);
            send_from(
                &mut engine_write,
                &FromEngine::Ask {
                    id,
                    ask: 0,
                    question: resume_proto::Ask::ProviderKey {
                        provider: ProviderId::Anthropic,
                    },
                },
            );
            line.clear();
            engine_read.read_line(&mut line).unwrap();
            let answer = resume_proto::decode_to(line.trim_end()).unwrap();
            assert!(!format!("{answer:?}").contains("sk-test-secret"));
            let ToEngine::Answer {
                answer: Answer::ProviderKey { key },
                ..
            } = answer
            else {
                panic!("answer");
            };
            assert_eq!(key.as_deref(), Some("sk-test-secret"));
            send_from(
                &mut engine_write,
                &FromEngine::reply(id, Ok(serde_json::json!({ "hasKey": true }))),
            );
        });
        let mut shell_read = BufReader::new(shell_read);
        let body = exchange(
            &mut shell_read,
            &mut shell_write,
            &Exchange {
                id: 4,
                epoch: 1,
                licensed: true,
                call: &call,
            },
            &mut |_| Ok(Some("sk-test-secret".into())),
            &mut |_| {},
        )
        .unwrap();
        assert_eq!(body["hasKey"], true);
        worker.join().unwrap();

        let (engine_read, mut shell_write) = std::io::pipe().unwrap();
        let (shell_read, mut engine_write) = std::io::pipe().unwrap();
        let worker = std::thread::spawn(move || {
            let mut engine_read = BufReader::new(engine_read);
            let mut line = String::new();
            engine_read.read_line(&mut line).unwrap();
            send_from(
                &mut engine_write,
                &FromEngine::reply(
                    1,
                    Ok(serde_json::json!({ "pages": ["cache/../resume.json"] })),
                ),
            );
        });
        let mut shell_read = BufReader::new(shell_read);
        let call = Call::Preview {
            doc: Value::Null,
            look: "classic".into(),
            accent: String::new(),
        };
        let err = exchange(
            &mut shell_read,
            &mut shell_write,
            &Exchange {
                id: 1,
                epoch: 1,
                licensed: true,
                call: &call,
            },
            &mut |_| Ok(None),
            &mut |_| {},
        )
        .unwrap_err();
        assert!(err.contains("cache"), "{err}");
        worker.join().unwrap();
    }

    #[test]
    fn poll_does_not_stop_an_engine_that_has_not_started() {
        let mut link = Link::new();
        link.activate();
        link.poll();
        assert!(matches!(link.machine.phase(), Phase::Spawning));
        assert!(link.child.is_none());
    }

    #[test]
    fn poll_shuts_the_child_down_about_two_seconds_after_the_last_reply() {
        let mut link = Link::new();
        link.activate();
        assert!(link
            .machine
            .hello(env!("CARGO_PKG_VERSION"), PROTO)
            .is_empty());
        let dir = std::env::temp_dir().join(format!("spiral-resume-poll-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut child = Command::new("sleep")
            .arg("30")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let stdin = child.stdin.take().unwrap();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        link.child = Some(EngineProcess {
            child,
            stdin,
            stdout,
            resume_dir: dir.clone(),
        });
        let started = Instant::now();
        loop {
            link.poll();
            if link.child.is_none() {
                break;
            }
            if started.elapsed() > Duration::from_secs(4) {
                panic!("idle shutdown did not fire");
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let elapsed = started.elapsed();
        assert!(elapsed >= Duration::from_millis(1_500), "{elapsed:?}");
        assert!(elapsed < Duration::from_secs(4), "{elapsed:?}");
        let _ = std::fs::remove_dir_all(dir);
    }

    fn send_from(output: &mut impl std::io::Write, message: &FromEngine) {
        let bytes = resume_proto::encode_from(message).unwrap();
        output.write_all(&bytes).unwrap();
        output.write_all(b"\n").unwrap();
        output.flush().unwrap();
    }
}
