mod dispatch;

use std::io::{BufRead, Write};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};

use resume_core::engine_run::ProviderKey;
use resume_proto::{
    decode_to, encode_from, Answer, Ask, Event, FromEngine, ProviderId, ToEngine, UserError, PROTO,
};

pub use dispatch::{Events, Session};

pub fn run() -> Result<(), String> {
    let root = std::env::var_os("SPIRAL_RESUME_DIR")
        .map(PathBuf::from)
        .ok_or_else(|| "SPIRAL_RESUME_DIR is not set.".to_string())?;
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    serve(&root, stdin.lock(), stdout.lock()).map_err(|err| err.message)
}

pub fn serve<R: BufRead, W: Write>(root: &Path, input: R, output: W) -> Result<(), UserError> {
    let mut port = Port {
        lines: input.lines(),
        output,
        ask: 0,
    };
    port.write(&FromEngine::Hello {
        version: env!("CARGO_PKG_VERSION").to_string(),
        proto: PROTO,
    })?;
    let mut session = Session::open(root);
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

struct Port<R, W> {
    lines: std::io::Lines<R>,
    output: W,
    ask: u32,
}

impl<R: BufRead, W: Write> Port<R, W> {
    fn next_line(&mut self) -> Result<Option<String>, UserError> {
        match self.lines.next() {
            Some(Ok(line)) => Ok(Some(line)),
            Some(Err(err)) => Err(UserError::new(err.to_string())),
            None => Ok(None),
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

impl<R: BufRead, W: Write> ProviderKey for Port<R, W> {
    fn key(&mut self, provider: &str) -> Result<Option<String>, String> {
        let Some(provider) = ProviderId::parse(provider) else {
            return Ok(None);
        };
        let ask = self.ask;
        self.ask = self.ask.wrapping_add(1);
        self.write(&FromEngine::Ask {
            id: 0,
            ask,
            question: Ask::ProviderKey { provider },
        })
        .map_err(|err| err.message)?;
        let line = self
            .next_line()
            .map_err(|err| err.message)?
            .ok_or_else(|| "Spiral closed the key request.".to_string())?;
        match decode_to(&line).map_err(|err| err.message)? {
            ToEngine::Answer {
                answer: Answer::ProviderKey { key },
                ..
            } => Ok(key),
            _ => Err("Spiral answered a key request with something else.".into()),
        }
    }
}

impl<R: BufRead, W: Write> dispatch::Events for Port<R, W> {
    fn emit(&mut self, id: u64, event: Event) {
        let _ = self.write(&FromEngine::Event { id, event });
    }
}
