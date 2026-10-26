use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

mod document;
mod pid;

pub use document::normalize_stored;
pub use pid::{format_pid, live_matches, may_signal, parse_pid, PidRecord};

pub const PROTO: u32 = 1;
pub const CONTROL_MAX: usize = 64 * 1024;
pub const DOCUMENT_MAX: usize = 2 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Life {
    Cancel,
    Drain,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Gate {
    Free,
    Licensed,
}

macro_rules! resume_calls {
    ($($name:ident { $($field:ident : $ty:ty),* $(,)? } => $gate:ident, $life:ident);* $(;)?) => {
        #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
        #[serde(tag = "type", rename_all = "snake_case")]
        pub enum Call {
            $($name { $($field: $ty),* }),*
        }

        impl Call {
            pub fn keeps_engine(&self) -> bool {
                match self {
                    $(Call::$name { .. } => matches!(Life::$life, Life::Drain),)*
                }
            }

            pub fn needs_license(&self) -> bool {
                match self {
                    $(Call::$name { .. } => matches!(Gate::$gate, Gate::Licensed),)*
                }
            }
        }

        pub fn every_call() -> Vec<Call> {
            vec![
                $(Call::$name { $($field: Default::default()),* }),*
            ]
        }
    };
}

resume_calls! {
    ImportFile { path: String } => Licensed, Cancel;
    ParseText { text: String } => Licensed, Cancel;
    Preview { doc: Value, look: String, accent: String } => Licensed, Cancel;
    Thumbnails { doc: Value, accent: String } => Licensed, Cancel;
    Build {
        doc: Value,
        look: String,
        accent: String,
        aim: String,
        tighten: bool,
        format: String
    } => Licensed, Cancel;
    Check { doc: Value, text: String } => Free, Cancel;
    ReviewWording { doc: Value } => Licensed, Cancel;
    SaveBuilt { path: String } => Licensed, Cancel;
    ExportBoth {
        doc: Value,
        look: String,
        accent: String,
        aim: String,
        tighten: bool,
        dir: String,
        replace: bool
    } => Licensed, Cancel;
    SaveDocument { stored: Value } => Licensed, Cancel;
    LoadDocument {} => Free, Cancel;
    StorageInfo {} => Free, Cancel;
    DeleteStoredData {} => Free, Cancel;
    EngineInfo {} => Free, Cancel;
    SaveEngine {
        provider: String,
        model: String,
        base_url: String,
        offline_model: String,
        rules_only: bool
    } => Licensed, Cancel;
    OfflineModels {} => Free, Cancel;
    DownloadModel { id: String } => Licensed, Drain;
    RemoveModel { id: String } => Free, Cancel;
    ListAccents {} => Free, Cancel;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderId {
    Anthropic,
    #[serde(rename = "openai")]
    OpenAi,
    Compatible,
}

impl ProviderId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::OpenAi => "openai",
            Self::Compatible => "compatible",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "anthropic" => Some(Self::Anthropic),
            "openai" => Some(Self::OpenAi),
            "compatible" => Some(Self::Compatible),
            _ => None,
        }
    }
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Answer {
    ProviderKey { key: Option<String> },
}

impl std::fmt::Debug for Answer {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ProviderKey { key } => formatter
                .debug_struct("ProviderKey")
                .field("key", &key.as_ref().map(|_| "present"))
                .finish(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Ask {
    ProviderKey { provider: ProviderId },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Event {
    Progress { done: u32, total: u32 },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UserError {
    pub message: String,
}

impl UserError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ToEngine {
    Request {
        id: u64,
        epoch: u64,
        licensed: bool,
        call: Call,
    },
    Answer {
        id: u64,
        ask: u32,
        answer: Answer,
    },
    Cancel {
        id: u64,
    },
    Shutdown {
        drain: bool,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum FromEngine {
    Hello {
        version: String,
        proto: u32,
    },
    Event {
        id: u64,
        event: Event,
    },
    Reply {
        id: u64,
        ok: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        body: Option<Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },
    Ask {
        id: u64,
        ask: u32,
        question: Ask,
    },
}

impl FromEngine {
    pub fn reply(id: u64, result: Result<Value, UserError>) -> Self {
        match result {
            Ok(body) => Self::Reply {
                id,
                ok: true,
                body: Some(body),
                message: None,
            },
            Err(err) => Self::Reply {
                id,
                ok: false,
                body: None,
                message: Some(err.message),
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProtocolError {
    pub message: String,
}

impl ProtocolError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelRef {
    pub id: String,
    pub path: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct ModelRefs {
    pub models: Vec<ModelRef>,
}

pub fn cache_relative(path: &str) -> Result<(), ProtocolError> {
    if path.is_empty()
        || path.starts_with('/')
        || path.starts_with('\\')
        || !path.starts_with("cache/")
        || path
            .split(['/', '\\'])
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(ProtocolError::new(
            "Resume's engine returned a file outside its cache.",
        ));
    }
    Ok(())
}

pub fn encode_to(message: &ToEngine) -> Result<Vec<u8>, ProtocolError> {
    encode(message)
}

pub fn encode_from(message: &FromEngine) -> Result<Vec<u8>, ProtocolError> {
    encode(message)
}

pub fn decode_to(line: &str) -> Result<ToEngine, ProtocolError> {
    decode(line)
}

pub fn decode_from(line: &str) -> Result<FromEngine, ProtocolError> {
    decode(line)
}

fn encode<T: Serialize>(message: &T) -> Result<Vec<u8>, ProtocolError> {
    let mut value = serde_json::to_value(message)
        .map_err(|err| ProtocolError::new(format!("could not encode a frame: {err}")))?;
    let object = value
        .as_object_mut()
        .ok_or_else(|| ProtocolError::new("a frame is an object"))?;
    object.insert("v".into(), json!(PROTO));
    let kind = object
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let bytes = serde_json::to_vec(&value)
        .map_err(|err| ProtocolError::new(format!("could not encode a frame: {err}")))?;
    check_len(&kind, bytes.len())?;
    Ok(bytes)
}

fn decode<T: DeserializeOwned>(line: &str) -> Result<T, ProtocolError> {
    if line.len() > DOCUMENT_MAX {
        return Err(ProtocolError::new(
            "Resume's engine sent a message that is too large.",
        ));
    }
    let value: Value = serde_json::from_str(line)
        .map_err(|_| ProtocolError::new("Resume's engine sent a message Spiral could not read."))?;
    let kind = value.get("type").and_then(Value::as_str).ok_or_else(|| {
        ProtocolError::new("Resume's engine sent a message Spiral could not read.")
    })?;
    check_len(kind, line.len())?;
    let version = value.get("v").and_then(Value::as_u64);
    if version != Some(u64::from(PROTO)) {
        return Err(ProtocolError::new(
            "Resume's engine does not match this version of Spiral. Reinstall Spiral.",
        ));
    }
    serde_json::from_value(value)
        .map_err(|_| ProtocolError::new("Resume's engine sent a message Spiral could not read."))
}

fn check_len(kind: &str, len: usize) -> Result<(), ProtocolError> {
    let max = match kind {
        "request" | "reply" => DOCUMENT_MAX,
        _ => CONTROL_MAX,
    };
    if len > max {
        return Err(ProtocolError::new(match kind {
            "request" | "reply" => "that resume is larger than Spiral can transfer",
            _ => "Resume's engine sent a control message that is too large",
        }));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_download_model_keeps_the_engine() {
        let draining: Vec<_> = every_call()
            .into_iter()
            .filter(Call::keeps_engine)
            .collect();
        assert_eq!(draining.len(), 1);
        assert!(matches!(draining[0], Call::DownloadModel { .. }));
        assert!(every_call().iter().any(Call::needs_license));
        assert!(every_call().iter().any(|call| !call.needs_license()));
    }

    #[test]
    fn a_document_reply_over_64_kib_round_trips_and_a_control_frame_does_not() {
        let quotes = "\"".repeat(40_000);
        let reply = FromEngine::reply(
            1,
            Ok(json!({
                "summary": quotes,
            })),
        );
        let bytes = encode_from(&reply).expect("document reply");
        assert!(bytes.len() > CONTROL_MAX, "escaping did not grow the frame");
        assert!(bytes.len() <= DOCUMENT_MAX);
        let back = decode_from(std::str::from_utf8(&bytes).unwrap()).unwrap();
        match back {
            FromEngine::Reply { ok: true, body, .. } => {
                assert_eq!(body.unwrap()["summary"], quotes);
            }
            other => panic!("unexpected {other:?}"),
        }

        let hello = FromEngine::Hello {
            version: "x".repeat(CONTROL_MAX),
            proto: PROTO,
        };
        let err = encode_from(&hello).expect_err("control frame");
        assert!(err.message.contains("control"));
    }

    #[test]
    fn a_request_carries_the_version_byte_and_rejects_a_foreign_one() {
        let call = Call::LoadDocument {};
        let frame = ToEngine::Request {
            id: 7,
            epoch: 2,
            licensed: false,
            call,
        };
        let bytes = encode_to(&frame).unwrap();
        let text = std::str::from_utf8(&bytes).unwrap();
        assert!(text.contains("\"v\":1"));
        let back = decode_to(text).unwrap();
        assert_eq!(back, frame);
        let bad = text.replacen("\"v\":1", "\"v\":2", 1);
        assert!(decode_to(&bad).is_err());
    }

    #[test]
    fn a_path_outside_the_cache_is_rejected() {
        assert!(cache_relative("cache/preview/ab-p1.svg").is_ok());
        assert!(cache_relative("cache/../resume.json").is_err());
        assert!(cache_relative("/tmp/x.svg").is_err());
        assert!(cache_relative("resume.json").is_err());
        assert!(cache_relative("cache/preview/../build/x.pdf").is_err());
    }
}
