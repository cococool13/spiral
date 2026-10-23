use std::io::{BufRead, BufReader, Write};
use std::thread;

use resume_core::model_host::spawn_count;
use resume_proto::{decode_from, encode_to, Call, FromEngine, ToEngine};
use spiral_resume_engine::{serve, Events, Session};

#[test]
fn a_panicking_pdf_returns_an_error_and_the_next_call_still_runs() {
    let root = tempfile::tempdir().unwrap();
    let pdf = root.path().join("broken.pdf");
    std::fs::write(&pdf, b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog").unwrap();
    let (engine_read, mut shell_write) = std::io::pipe().unwrap();
    let (shell_read, engine_write) = std::io::pipe().unwrap();
    let resume = root.path().to_path_buf();
    let engine = thread::spawn(move || {
        serve(&resume, BufReader::new(engine_read), engine_write).unwrap();
    });
    let mut shell_read = BufReader::new(shell_read);

    let hello = read_frame(&mut shell_read);
    assert!(matches!(hello, FromEngine::Hello { proto: 1, .. }));

    let before = spawn_count();
    send(
        &mut shell_write,
        &ToEngine::Request {
            id: 1,
            epoch: 1,
            licensed: true,
            call: Call::ImportFile {
                path: pdf.display().to_string(),
            },
        },
    );
    match read_frame(&mut shell_read) {
        FromEngine::Reply {
            id: 1,
            ok: false,
            message,
            ..
        } => {
            let message = message.unwrap_or_default();
            assert!(
                message.contains("paste the text") || message.contains("could not be read"),
                "{message}"
            );
        }
        other => panic!("expected an error reply, got {other:?}"),
    }
    assert_eq!(spawn_count(), before, "import started llama");

    send(
        &mut shell_write,
        &ToEngine::Request {
            id: 2,
            epoch: 1,
            licensed: false,
            call: Call::ListAccents {},
        },
    );
    match read_frame(&mut shell_read) {
        FromEngine::Reply {
            id: 2,
            ok: true,
            body,
            ..
        } => {
            assert!(body.unwrap().as_array().unwrap().len() >= 2);
        }
        other => panic!("the engine died after the bad PDF: {other:?}"),
    }

    send(&mut shell_write, &ToEngine::Shutdown { drain: false });
    engine.join().unwrap();
}

#[test]
fn import_file_does_not_spawn_llama() {
    let root = tempfile::tempdir().unwrap();
    let file = root.path().join("ada.txt");
    std::fs::write(
        &file,
        "Ada Lovelace\nada@example.com\n\nEXPERIENCE\nAnalyst, Admiralty\nJan 2021 - Present\n- Wrote it\n",
    )
    .unwrap();
    let before = spawn_count();
    let mut session = Session::open(root.path());
    let mut host = Recording::default();
    let doc = session
        .handle(
            1,
            true,
            Call::ImportFile {
                path: file.display().to_string(),
            },
            &mut host,
        )
        .unwrap();
    assert_eq!(doc["contact"]["name"], "Ada Lovelace");
    assert_eq!(spawn_count(), before);
    assert!(host.events.is_empty());
}

#[test]
fn engine_info_reports_a_key_without_returning_it() {
    let root = tempfile::tempdir().unwrap();
    let mut session = Session::open(root.path());
    let mut host = SecretHost {
        key: "sk-test-secret".into(),
        events: Vec::new(),
    };
    let info = session
        .handle(1, false, Call::EngineInfo {}, &mut host)
        .unwrap();
    let json = info.to_string();
    assert!(json.contains("\"hasKey\":true"), "{json}");
    assert!(!json.contains("sk-test-secret"), "{json}");
}

struct SecretHost {
    key: String,
    events: Vec<resume_proto::Event>,
}

impl resume_core::engine_run::ProviderKey for SecretHost {
    fn key(&mut self, _: &str) -> Result<Option<String>, String> {
        Ok(Some(self.key.clone()))
    }
}

impl Events for SecretHost {
    fn emit(&mut self, _: u64, event: resume_proto::Event) {
        self.events.push(event);
    }
}

#[derive(Default)]
struct Recording {
    events: Vec<resume_proto::Event>,
}

impl resume_core::engine_run::ProviderKey for Recording {
    fn key(&mut self, _: &str) -> Result<Option<String>, String> {
        Ok(None)
    }
}

impl Events for Recording {
    fn emit(&mut self, _: u64, event: resume_proto::Event) {
        self.events.push(event);
    }
}

fn send(shell_write: &mut impl Write, message: &ToEngine) {
    let bytes = encode_to(message).unwrap();
    shell_write.write_all(&bytes).unwrap();
    shell_write.write_all(b"\n").unwrap();
    shell_write.flush().unwrap();
}

fn read_frame(shell_read: &mut impl BufRead) -> FromEngine {
    let mut line = String::new();
    shell_read.read_line(&mut line).unwrap();
    decode_from(line.trim_end()).unwrap()
}
