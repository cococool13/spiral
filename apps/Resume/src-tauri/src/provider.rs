//! The three request shapes, and nothing else.
//!
//! Rust has no official Anthropic SDK, so this is raw HTTP. Three facts about
//! the current Messages API shape this module and are easy to get wrong from
//! memory:
//!
//! * `temperature`, `top_p` and `top_k` are **rejected with a 400** on the
//!   current Opus generation. Determinism has to come from the prompt.
//! * Thinking is **on by default**, and `max_tokens` caps thinking *plus* the
//!   answer — so the budget needs headroom or the reply truncates mid-sentence.
//! * An assistant-turn prefill (the old way to force a JSON shape) also 400s.
//!   `output_config.format` replaces it.
//!
//! Nothing here knows what a resume is. It sends a system prompt and a user
//! message, and returns the model's text.

use serde::Deserialize;
use serde_json::{json, Value};

/// Headroom over the answer itself, because thinking is billed against the same
/// budget. A dozen tightened bullets is a few hundred tokens; the rest is slack.
const MAX_TOKENS: u32 = 8192;

pub const ANTHROPIC_DEFAULT_MODEL: &str = "claude-opus-5";
pub const OPENAI_DEFAULT_MODEL: &str = "gpt-5";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Provider {
    Anthropic,
    OpenAi,
    /// Any OpenAI-compatible endpoint: OpenRouter, Groq, Together, or a local
    /// Ollama or LM Studio server.
    Compatible { base_url: String },
    /// The bundled offline engine. A distinct variant rather than a
    /// `Compatible` with a loopback URL, because it has its own identity: it
    /// needs no credential, and sharing `Compatible`'s keychain account meant
    /// a key saved for one silently became the other's.
    Local { base_url: String },
}

impl Provider {
    pub fn parse(id: &str, base_url: &str) -> Result<Self, String> {
        match id {
            "anthropic" => Ok(Provider::Anthropic),
            "openai" => Ok(Provider::OpenAi),
            // The offline engine speaks the same OpenAI-compatible shape, so
            // it needs no new request code — only a different destination,
            // filled in when the sidecar starts.
            "local" => Ok(Provider::Local {
                base_url: String::new(),
            }),
            "compatible" => {
                let trimmed = base_url.trim().trim_end_matches('/');
                if trimmed.is_empty() {
                    return Err("Enter the base URL of the service you want to use.".to_string());
                }
                // `reqwest` is already here and already carries `url`; hand-rolled
                // scheme checks and host splitting disagreed about what a base URL
                // is depending on which of the two you asked.
                let parsed = reqwest::Url::parse(trimmed)
                    .map_err(|_| "That base URL could not be read. Check it and try again.".to_string())?;
                if !matches!(parsed.scheme(), "http" | "https") {
                    return Err(
                        "That base URL needs to start with http:// or https://.".to_string()
                    );
                }
                // Plain http is for loopback Ollama / LM Studio only. A remote
                // http endpoint would send the keychain key in cleartext.
                if parsed.scheme() == "http" {
                    let host = parsed.host_str().unwrap_or("");
                    let loopback = matches!(host, "127.0.0.1" | "localhost" | "::1");
                    if !loopback {
                        return Err(
                            "Remote endpoints need https://. Use http:// only for a local server on this computer."
                                .to_string(),
                        );
                    }
                }
                Ok(Provider::Compatible {
                    base_url: trimmed.to_string(),
                })
            }
            other => Err(format!(
                "{other:?} is not a provider this app knows. Choose Anthropic, OpenAI, or a custom endpoint."
            )),
        }
    }

    pub fn id(&self) -> &'static str {
        match self {
            Provider::Anthropic => "anthropic",
            Provider::OpenAi => "openai",
            Provider::Compatible { .. } => "compatible",
            Provider::Local { .. } => "local",
        }
    }

    pub fn default_model(&self) -> &'static str {
        match self {
            Provider::Anthropic => ANTHROPIC_DEFAULT_MODEL,
            _ => OPENAI_DEFAULT_MODEL,
        }
    }

    /// The exact hostname the key will be sent to. Shown in Settings before
    /// anything is sent, because "state every material network action" is not
    /// optional in this collection.
    pub fn host(&self) -> String {
        match self {
            Provider::Anthropic => "api.anthropic.com".to_string(),
            Provider::OpenAi => "api.openai.com".to_string(),
            Provider::Compatible { base_url } => reqwest::Url::parse(base_url)
                .ok()
                .and_then(|url| {
                    url.host_str().map(|host| match url.port() {
                        Some(port) => format!("{host}:{port}"),
                        None => host.to_string(),
                    })
                })
                // `parse` already accepted this URL, so this is unreachable in
                // practice — showing the raw value beats showing nothing.
                .unwrap_or_else(|| base_url.clone()),
            // Never a remote name, whatever port it lands on.
            Provider::Local { .. } => "127.0.0.1".to_string(),
        }
    }

    /// True when this engine authenticates. The offline one does not, and
    /// asking for a key it will never use is a question with no answer.
    pub fn needs_key(&self) -> bool {
        !matches!(self, Provider::Local { .. })
    }

    /// Where this provider issues keys. Empty when there is nowhere to send
    /// someone: a custom endpoint is the user's own service, and the offline
    /// engine has no console at all.
    pub fn key_url(&self) -> &'static str {
        match self {
            Provider::Anthropic => "https://console.anthropic.com/settings/keys",
            Provider::OpenAi => "https://platform.openai.com/api-keys",
            Provider::Compatible { .. } | Provider::Local { .. } => "",
        }
    }

    fn endpoint(&self) -> String {
        match self {
            Provider::Anthropic => "https://api.anthropic.com/v1/messages".to_string(),
            Provider::OpenAi => "https://api.openai.com/v1/chat/completions".to_string(),
            Provider::Compatible { base_url } | Provider::Local { base_url } => {
                format!("{base_url}/chat/completions")
            }
        }
    }

    pub fn body(&self, model: &str, system: &str, user: &str) -> Value {
        match self {
            Provider::Anthropic => json!({
                "model": model,
                "max_tokens": MAX_TOKENS,
                // No temperature: the current Opus generation rejects sampling
                // parameters outright. Steer with the prompt instead.
                "output_config": { "effort": "low" },
                "system": system,
                "messages": [{ "role": "user", "content": user }],
            }),
            // The offline engine gets a schema, not just "some JSON". llama.cpp
            // compiles it into a grammar, so a malformed reply is not merely
            // unlikely — it cannot be generated. Measured without it: a batch of
            // twenty bullets came back missing its final brace, and every bullet
            // in that batch was discarded. Hosted providers keep `json_object`,
            // which is what they are tested against.
            Provider::Local { .. } => json!({
                "model": model,
                "max_completion_tokens": MAX_TOKENS,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": { "name": "bullets", "strict": true, "schema": reply_schema() },
                },
                "messages": [
                    { "role": "system", "content": system },
                    { "role": "user", "content": user },
                ],
            }),
            _ => json!({
                "model": model,
                "max_completion_tokens": MAX_TOKENS,
                "response_format": { "type": "json_object" },
                "messages": [
                    { "role": "system", "content": system },
                    { "role": "user", "content": user },
                ],
            }),
        }
    }
}

/// The exact shape `rewrite::Reply` deserialises. Kept beside the request that
/// asks for it so the two cannot drift.
fn reply_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "bullets": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": { "n": { "type": "integer" }, "text": { "type": "string" } },
                    "required": ["n", "text"],
                    "additionalProperties": false,
                },
            },
        },
        "required": ["bullets"],
        "additionalProperties": false,
    })
}

#[derive(Deserialize)]
struct AnthropicBlock {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: String,
}

#[derive(Deserialize)]
struct AnthropicReply {
    #[serde(default)]
    content: Vec<AnthropicBlock>,
}

#[derive(Deserialize)]
struct OpenAiMessage {
    #[serde(default)]
    content: String,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessage,
}

#[derive(Deserialize)]
struct OpenAiReply {
    #[serde(default)]
    choices: Vec<OpenAiChoice>,
}

/// Pull the answer text out of a reply. On the Anthropic shape the response can
/// carry thinking blocks before the text block — take the text, skip the rest.
pub fn text_of(provider: &Provider, raw: &str) -> Result<String, String> {
    let missing = "That service replied with something this app could not read. Try again.";
    match provider {
        Provider::Anthropic => {
            let reply: AnthropicReply = serde_json::from_str(raw).map_err(|_| missing)?;
            reply
                .content
                .into_iter()
                .find(|block| block.kind == "text")
                .map(|block| block.text)
                .ok_or_else(|| missing.to_string())
        }
        _ => {
            let reply: OpenAiReply = serde_json::from_str(raw).map_err(|_| missing)?;
            reply
                .choices
                .into_iter()
                .next()
                .map(|choice| choice.message.content)
                .ok_or_else(|| missing.to_string())
        }
    }
}

/// Turn a failed request into a sentence. **The response body is never
/// included** — provider errors sometimes echo the submitted key back, and a
/// key that reaches an error message reaches a screenshot.
pub fn error_for(provider: &Provider, status: u16) -> String {
    let host = provider.host();
    match status {
        401 | 403 => format!(
            "{host} refused that key. Check it in Settings, and that it is an API key rather than a subscription login."
        ),
        404 => format!("{host} does not have that model. Choose another one in Settings."),
        429 => format!("{host} is rate-limiting your key. Wait a minute and build again."),
        500..=599 => format!("{host} is having trouble right now. Try again shortly."),
        other => format!("{host} refused the request ({other}). Check the model name in Settings."),
    }
}

pub async fn send(
    provider: &Provider,
    key: &str,
    model: &str,
    system: &str,
    user: &str,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Could not start a network client: {e}."))?;

    let mut request = client.post(provider.endpoint()).json(&provider.body(model, system, user));
    request = match provider {
        Provider::Anthropic => request
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01"),
        // The offline sidecar needs no credential, and sending an empty
        // bearer header to it would be noise at best.
        _ if key.is_empty() => request,
        _ => request.header("authorization", format!("Bearer {key}")),
    };

    let response = request.send().await.map_err(|e| {
        // A transport error can carry the URL but never the key; still, keep it
        // to a sentence rather than a debug dump.
        format!(
            "Could not reach {}: {}. Check your connection.",
            provider.host(),
            if e.is_timeout() { "it timed out" } else { "the request failed" }
        )
    })?;

    let status = response.status();
    let raw = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(error_for(provider, status.as_u16()));
    }
    text_of(provider, &raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Decision 11's helper only works if every provider that issues keys says
    /// where — and only if the two that do not stay silent rather than sending
    /// someone to a console that has nothing for them.
    #[test]
    fn every_provider_that_issues_keys_says_where_and_the_others_stay_silent() {
        assert!(Provider::Anthropic.key_url().starts_with("https://"));
        assert!(Provider::OpenAi.key_url().starts_with("https://"));
        assert_eq!(
            Provider::Compatible {
                base_url: "https://example.test/v1".to_string()
            }
            .key_url(),
            ""
        );
        assert_eq!(
            Provider::Local {
                base_url: String::new()
            }
            .key_url(),
            ""
        );
    }

    #[test]
    fn each_provider_names_the_exact_host_it_will_contact() {
        assert_eq!(Provider::Anthropic.host(), "api.anthropic.com");
        assert_eq!(Provider::OpenAi.host(), "api.openai.com");
        assert_eq!(
            Provider::parse("compatible", "https://openrouter.ai/api/v1")
                .unwrap()
                .host(),
            "openrouter.ai"
        );
        assert_eq!(
            Provider::parse("compatible", "http://localhost:11434/v1")
                .unwrap()
                .host(),
            "localhost:11434"
        );
        assert!(
            Provider::parse("compatible", "http://api.example.com/v1")
                .unwrap_err()
                .contains("https://"),
            "remote http must be refused"
        );
    }

    /// Sampling parameters are rejected outright by the current Opus
    /// generation. This is the guard against someone "improving" determinism by
    /// adding `temperature: 0` and turning every request into a 400.
    #[test]
    fn the_anthropic_body_carries_no_sampling_parameters() {
        let body = Provider::Anthropic.body("claude-opus-5", "sys", "user").to_string();
        for banned in ["temperature", "top_p", "top_k"] {
            assert!(!body.contains(banned), "{banned} would be rejected with a 400");
        }
    }

    #[test]
    fn the_anthropic_body_leaves_headroom_for_thinking() {
        let body = Provider::Anthropic.body("claude-opus-5", "sys", "user");
        assert!(body["max_tokens"].as_u64().unwrap() >= 4096);
    }

    #[test]
    fn the_openai_shape_asks_for_json_back() {
        let body = Provider::OpenAi.body("gpt-5", "sys", "user");
        assert_eq!(body["response_format"]["type"], "json_object");
        assert_eq!(body["messages"][0]["role"], "system");
    }

    #[test]
    fn a_text_block_is_found_past_any_thinking_blocks() {
        let raw = r#"{"content":[{"type":"thinking","thinking":""},{"type":"text","text":"the answer"}]}"#;
        assert_eq!(text_of(&Provider::Anthropic, raw).unwrap(), "the answer");
    }

    #[test]
    fn an_openai_choice_is_read() {
        let raw = r#"{"choices":[{"message":{"role":"assistant","content":"the answer"}}]}"#;
        assert_eq!(text_of(&Provider::OpenAi, raw).unwrap(), "the answer");
    }

    #[test]
    fn an_unreadable_reply_is_a_sentence_not_a_panic() {
        assert!(text_of(&Provider::Anthropic, "not json").is_err());
        assert!(text_of(&Provider::Anthropic, r#"{"content":[]}"#).is_err());
    }

    /// Provider error bodies have been known to echo the submitted credential.
    /// The message is built from the status code alone, never the body.
    #[test]
    fn an_error_message_is_built_from_the_status_not_the_body() {
        let message = error_for(&Provider::Anthropic, 401);
        assert!(message.contains("api.anthropic.com"));
        assert!(message.contains("subscription login"));
        assert!(!message.contains("sk-"));
    }

    /// The offline engine needs its own id. Sharing `Compatible`'s would mean
    /// sharing its keychain account: a key saved for a custom endpoint would be
    /// reported as the offline engine's, and saving one while offline was
    /// selected would overwrite the other provider's credential.
    #[test]
    fn the_offline_engine_has_its_own_identity_and_needs_no_key() {
        let local = Provider::parse("local", "").unwrap();
        assert_eq!(local.id(), "local");
        assert_ne!(local.id(), Provider::parse("compatible", "https://x.test/v1").unwrap().id());
        assert_eq!(local.host(), "127.0.0.1");
        assert!(!local.needs_key());
        assert!(Provider::Anthropic.needs_key());
    }

    #[test]
    fn a_custom_endpoint_needs_a_real_url() {
        assert!(Provider::parse("compatible", "").is_err());
        assert!(Provider::parse("compatible", "openrouter.ai").is_err());
        assert!(Provider::parse("nonesuch", "").is_err());
    }

    #[test]
    fn a_trailing_slash_on_a_base_url_does_not_double_up() {
        let provider = Provider::parse("compatible", "https://openrouter.ai/api/v1/").unwrap();
        assert_eq!(provider.endpoint(), "https://openrouter.ai/api/v1/chat/completions");
    }
}
