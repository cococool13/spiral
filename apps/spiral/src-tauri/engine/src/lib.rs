mod dispatch;

use std::io::{BufRead, Write};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;
use std::time::Duration;

use resume_core::engine_run::ProviderKey;
use resume_proto::{
    decode_to, encode_from, Answer, Ask, Event, FromEngine, ProviderId, ToEngine, UserError,
    DOCUMENT_MAX, PROTO,
};

pub use dispatch::{Events, Session};

pub fn run() -> Result<(), String> {
    let root = std::env::var_os("SPIRAL_RESUME_DIR")
        .map(PathBuf::from)
        .ok_or_else(|| "SPIRAL_RESUME_DIR is not set.".to_string())?;
    let cancel = Arc::new(AtomicBool::new(false));
    let current = Arc::new(AtomicU64::new(0));
    let (tx, rx) = mpsc::channel();
    let cancel_reader = Arc::clone(&cancel);
    let current_reader = Arc::clone(&current);
    std::thread::spawn(move || {
        read_stdin(std::io::stdin().lock(), tx, cancel_reader, current_reader);
    });
    serve_lines(&root, rx, std::io::stdout().lock(), cancel, current).map_err(|err| err.message)
}

pub fn serve<R: BufRead + Send + 'static, W: Write>(
    root: &Path,
    input: R,
    output: W,
) -> Result<(), UserError> {
    let cancel = Arc::new(AtomicBool::new(false));
    let current = Arc::new(AtomicU64::new(0));
    let (tx, rx) = mpsc::channel();
    let cancel_reader = Arc::clone(&cancel);
    let current_reader = Arc::clone(&current);
    std::thread::spawn(move || read_stdin(input, tx, cancel_reader, current_reader));
    serve_lines(root, rx, output, cancel, current)
}

fn serve_lines<W: Write>(
    root: &Path,
    incoming: Receiver<String>,
    output: W,
    cancel: Arc<AtomicBool>,
    current: Arc<AtomicU64>,
) -> Result<(), UserError> {
    let mut port = Port {
        incoming,
        output,
        ask: 0,
        cancel: Arc::clone(&cancel),
        current: Arc::clone(&current),
    };
    port.write(&FromEngine::Hello {
        version: env!("CARGO_PKG_VERSION").to_string(),
        proto: PROTO,
    })?;
    let mut session = Session::open(root);
    session.watch(Arc::clone(&cancel));
    while let Some(line) = port.next_line()? {
        if line.is_empty() {
            continue;
        }
        let message = decode_to(&line).map_err(|err| UserError::new(err.message))?;
        match message {
            ToEngine::Shutdown { .. } => break,
            ToEngine::Cancel { .. } => session.cancel(),
            ToEngine::Answer { .. } => {
                return Err(UserError::new(
                    "Resume's engine received a key before it asked.",
                ));
            }
            ToEngine::Request {
                id, licensed, call, ..
            } => {
                cancel.store(false, Ordering::SeqCst);
                current.store(id, Ordering::SeqCst);
                let result = catch_unwind(AssertUnwindSafe(|| {
                    session.handle(id, licensed, call, &mut port)
                }));
                let reply = match result {
                    Ok(body) => FromEngine::reply(id, body),
                    Err(_) => FromEngine::reply(
                        id,
                        Err(UserError::new(
                            "That file could not be read. Paste the text instead.",
                        )),
                    ),
                };
                port.write(&reply)?;
            }
        }
    }
    Ok(())
}

fn read_stdin<R: BufRead>(
    input: R,
    tx: mpsc::Sender<String>,
    cancel: Arc<AtomicBool>,
    current: Arc<AtomicU64>,
) {
    for line in input.lines() {
        let Ok(line) = line else {
            break;
        };
        if line.len() > DOCUMENT_MAX {
            break;
        }
        if let Ok(ToEngine::Cancel { id, .. }) = decode_to(&line) {
            if id == current.load(Ordering::SeqCst) && id != 0 {
                cancel.store(true, Ordering::SeqCst);
            }
            continue;
        }
        if tx.send(line).is_err() {
            break;
        }
    }
}

struct Port<W> {
    incoming: Receiver<String>,
    output: W,
    ask: u32,
    cancel: Arc<AtomicBool>,
    current: Arc<AtomicU64>,
}

impl<W: Write> Port<W> {
    fn next_line(&mut self) -> Result<Option<String>, UserError> {
        match self.incoming.recv() {
            Ok(line) => Ok(Some(line)),
            Err(_) => Ok(None),
        }
    }

    fn write(&mut self, message: &FromEngine) -> Result<(), UserError> {
        let bytes = encode_from(message).map_err(|err| UserError::new(err.message))?;
        self.output
            .write_all(&bytes)
            .and_then(|_| self.output.write_all(b"\n"))
            .and_then(|_| self.output.flush())
            .map_err(|err| UserError::new(err.to_string()))
    }
}

impl<W: Write> ProviderKey for Port<W> {
    fn key(&mut self, provider: &str) -> Result<Option<String>, String> {
        let Some(provider) = ProviderId::parse(provider) else {
            return Ok(None);
        };
        let ask = self.ask;
        self.ask = self.ask.wrapping_add(1);
        self.write(&FromEngine::Ask {
            id: self.current.load(Ordering::SeqCst),
            ask,
            question: Ask::ProviderKey { provider },
        })
        .map_err(|err| err.message)?;
        loop {
            if self.cancel.load(Ordering::SeqCst) {
                return Err("Cancelled.".into());
            }
            match self.incoming.recv_timeout(Duration::from_millis(50)) {
                Ok(line) => {
                    return match decode_to(&line).map_err(|err| err.message)? {
                        ToEngine::Answer {
                            id,
                            answer: Answer::ProviderKey { key },
                            ..
                        } if id == self.current.load(Ordering::SeqCst) => Ok(key),
                        ToEngine::Cancel { id, .. }
                            if id == self.current.load(Ordering::SeqCst) =>
                        {
                            self.cancel.store(true, Ordering::SeqCst);
                            Err("Cancelled.".into())
                        }
                        _ => Err("Spiral answered a key request with something else.".into()),
                    };
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err("Spiral closed the key request.".into());
                }
            }
        }
    }
}

impl<W: Write> dispatch::Events for Port<W> {
    fn emit(&mut self, id: u64, event: Event) {
        let _ = self.write(&FromEngine::Event { id, event });
    }
}
