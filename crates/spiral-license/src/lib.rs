//! Whop license gate for Spiral apps.
//!
//! Keys live in the OS keychain. Validation goes to Spiral's Cloudflare Worker,
//! which holds the Whop API key — never ship that key inside the app.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Public validator. Override at build time with `SPIRAL_LICENSE_URL` if needed.
pub const DEFAULT_VALIDATOR_URL: &str = "https://spiral-license.cohencool.workers.dev/validate";

const GRACE_SECS: u64 = 72 * 60 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppId {
    Wallpaper,
    Clean,
    Resume,
    Slim,
}

impl AppId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Wallpaper => "wallpaper",
            Self::Clean => "clean",
            Self::Resume => "resume",
            Self::Slim => "slim",
        }
    }

    fn keychain_service(self) -> &'static str {
        match self {
            Self::Wallpaper => "app.spiral.wallpaper",
            Self::Clean => "app.spiral.clean",
            Self::Resume => "app.spiral.resume",
            Self::Slim => "app.spiral.slim",
        }
    }
}

const KEY_ACCOUNT: &str = "whop-license";
const STATUS_ACCOUNT: &str = "whop-license-status";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedStatus {
    key_hash: String,
    hwid_hash: String,
    validated_at: u64,
}

#[derive(Debug, Deserialize)]
struct ValidateResponse {
    ok: bool,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LicenseError {
    EmptyKey,
    Keychain(String),
    Network(String),
    InvalidKey,
    NoAccess,
    DeviceMismatch,
    ValidatorNotConfigured,
    Other(String),
}

impl LicenseError {
    pub fn user_message(&self) -> String {
        match self {
            Self::EmptyKey => "Paste the license key from your Whop purchase.".into(),
            Self::Keychain(e) => format!("Could not reach this machine's keychain: {e}."),
            Self::Network(_) => {
                "Could not reach the license server. Check the network and try again.".into()
            }
            Self::InvalidKey => {
                "That license key is not valid. Check it on whop.com, then try again.".into()
            }
            Self::NoAccess => {
                "That key does not include Spiral Collection. Buy access, then try again.".into()
            }
            Self::DeviceMismatch => {
                "This key is already tied to another machine. Reset it from your Whop orders, then try again.".into()
            }
            Self::ValidatorNotConfigured => {
                "License checks are not configured yet. Try again later.".into()
            }
            Self::Other(e) => e.clone(),
        }
    }
}

fn entry(app: AppId, account: &str) -> Result<keyring::Entry, LicenseError> {
    keyring::Entry::new(app.keychain_service(), account)
        .map_err(|e| LicenseError::Keychain(e.to_string()))
}

pub fn store_key(app: AppId, key: &str) -> Result<(), LicenseError> {
    let key = key.trim();
    if key.is_empty() {
        return Err(LicenseError::EmptyKey);
    }
    entry(app, KEY_ACCOUNT)?
        .set_password(key)
        .map_err(|e| LicenseError::Keychain(e.to_string()))
}

pub fn read_key(app: AppId) -> Option<String> {
    entry(app, KEY_ACCOUNT).ok()?.get_password().ok()
}

pub fn has_key(app: AppId) -> bool {
    read_key(app).is_some()
}

pub fn clear_key(app: AppId) -> Result<(), LicenseError> {
    match entry(app, KEY_ACCOUNT)?.delete_credential() {
        Ok(()) => {}
        Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(LicenseError::Keychain(e.to_string())),
    }
    if let Ok(e) = entry(app, STATUS_ACCOUNT) {
        let _ = e.delete_credential();
    }
    Ok(())
}

fn hash_hex(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    hex::encode(hasher.finalize())
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn save_status(app: AppId, key: &str, hwid: &str) -> Result<(), LicenseError> {
    let status = CachedStatus {
        key_hash: hash_hex(key),
        hwid_hash: hash_hex(hwid),
        validated_at: now_secs(),
    };
    let json = serde_json::to_string(&status).map_err(|e| LicenseError::Other(e.to_string()))?;
    entry(app, STATUS_ACCOUNT)?
        .set_password(&json)
        .map_err(|e| LicenseError::Keychain(e.to_string()))
}

fn cached_status_covers(status: &CachedStatus, key: &str, hwid: &str, now: u64) -> bool {
    if status.key_hash != hash_hex(key) || status.hwid_hash != hash_hex(hwid) {
        return false;
    }
    now.saturating_sub(status.validated_at) <= GRACE_SECS
}

fn grace_ok(app: AppId, key: &str, hwid: &str) -> bool {
    let Ok(entry) = entry(app, STATUS_ACCOUNT) else {
        return false;
    };
    let Ok(raw) = entry.get_password() else {
        return false;
    };
    let Ok(status) = serde_json::from_str::<CachedStatus>(&raw) else {
        return false;
    };
    cached_status_covers(&status, key, hwid, now_secs())
}

/// Stable-enough machine id for Whop metadata binding. Not a secret.
pub fn machine_id() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if let Some(rest) = line.split("IOPlatformUUID").nth(1) {
                    let id = rest
                        .chars()
                        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
                        .collect::<String>();
                    if !id.is_empty() {
                        return id;
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_ComputerSystemProduct).UUID",
            ])
            .output()
        {
            let id = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !id.is_empty() {
                return id;
            }
        }
    }

    // Last resort — still binds the key to this user+host pair.
    let host = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "unknown-host".into());
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "unknown-user".into());
    hash_hex(&format!("{host}:{user}"))
}

fn http_client() -> Result<reqwest::Client, LicenseError> {
    reqwest::Client::builder()
        .user_agent(concat!("SpiralLicense/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| LicenseError::Network(e.to_string()))
}

/// Fail closed on known auth errors; treat validator/Whop outages as network
/// so `ensure_licensed` can use the 72h grace instead of locking a paid user out.
fn classify_validator(
    ok: bool,
    http_success: bool,
    http_server_error: bool,
    http_429: bool,
    error: Option<&str>,
) -> Result<(), LicenseError> {
    if ok && http_success {
        return Ok(());
    }
    let code = error.unwrap_or("unknown");
    match code {
        "invalid_key" => Err(LicenseError::InvalidKey),
        "no_access" => Err(LicenseError::NoAccess),
        "device_mismatch" => Err(LicenseError::DeviceMismatch),
        "validator_not_configured" => Err(LicenseError::ValidatorNotConfigured),
        "missing_fields" | "bad_json" => Err(LicenseError::Other(format!(
            "License check failed ({code})."
        ))),
        "whop_unavailable" | "rate_limited" => Err(LicenseError::Network(code.into())),
        other if http_server_error || http_429 => Err(LicenseError::Network(other.into())),
        other => Err(LicenseError::Other(format!(
            "License check failed ({other})."
        ))),
    }
}

fn grace_eligible(e: &LicenseError) -> bool {
    matches!(
        e,
        LicenseError::Network(_) | LicenseError::ValidatorNotConfigured
    )
}

/// Activate: store key, validate online, refuse on failure.
pub async fn activate(app: AppId, key: &str, validator_url: &str) -> Result<(), LicenseError> {
    let key = key.trim();
    if key.is_empty() {
        return Err(LicenseError::EmptyKey);
    }
    let hwid = machine_id();
    validate_online(app, key, &hwid, validator_url).await?;
    store_key(app, key)?;
    save_status(app, key, &hwid)?;
    Ok(())
}

/// Shared by launch and IPC: a stored key that currently validates.
/// Online success wins; a revoked/invalid key is refused even with grace;
/// only outages may use the 72h window from a previous successful check.
fn current_validity(
    stored_key: bool,
    online: Result<(), LicenseError>,
    grace: bool,
) -> Result<(), LicenseError> {
    if !stored_key {
        return Err(LicenseError::EmptyKey);
    }
    match online {
        Ok(()) => Ok(()),
        Err(e) if grace_eligible(&e) && grace => Ok(()),
        Err(e) => Err(e),
    }
}

/// Launch check: require a stored key; revalidate online; allow 72h grace offline.
pub async fn ensure_licensed(app: AppId, validator_url: &str) -> Result<(), LicenseError> {
    let Some(key) = read_key(app) else {
        return current_validity(false, Ok(()), false);
    };
    let hwid = machine_id();
    let online = validate_online(app, &key, &hwid, validator_url).await;
    if online.is_ok() {
        let _ = save_status(app, &key, &hwid);
    }
    current_validity(true, online, grace_ok(app, &key, &hwid))
}

async fn validate_online(
    app: AppId,
    key: &str,
    hwid: &str,
    validator_url: &str,
) -> Result<(), LicenseError> {
    let client = http_client()?;
    let res = client
        .post(validator_url)
        .json(&serde_json::json!({
            "license_key": key,
            "hwid": hwid,
            "app": app.as_str(),
        }))
        .send()
        .await
        .map_err(|e| LicenseError::Network(e.to_string()))?;

    let status = res.status();
    let body: ValidateResponse = res
        .json()
        .await
        .map_err(|e| LicenseError::Network(e.to_string()))?;

    classify_validator(
        body.ok,
        status.is_success(),
        status.is_server_error(),
        status.as_u16() == 429,
        body.error.as_deref(),
    )
}

/// Tauri license commands for one app. Expand in `src-tauri/src/license.rs`.
///
/// ```ignore
/// spiral_license::license_commands!(spiral_license::AppId::Wallpaper);
/// ```
#[macro_export]
macro_rules! license_commands {
    ($app_id:expr) => {
        const APP: $crate::AppId = $app_id;

        fn validator_url() -> String {
            std::env::var("SPIRAL_LICENSE_URL")
                .unwrap_or_else(|_| $crate::DEFAULT_VALIDATOR_URL.into())
        }

        fn map_err(e: $crate::LicenseError) -> String {
            e.user_message()
        }

        #[tauri::command]
        pub fn license_status() -> Result<bool, String> {
            Ok($crate::has_key(APP))
        }

        #[tauri::command]
        pub async fn license_activate(key: String) -> Result<(), String> {
            $crate::activate(APP, &key, &validator_url())
                .await
                .map_err(map_err)
        }

        #[tauri::command]
        pub async fn license_ensure() -> Result<(), String> {
            $crate::ensure_licensed(APP, &validator_url())
                .await
                .map_err(map_err)
        }

        #[tauri::command]
        pub fn license_clear() -> Result<(), String> {
            $crate::clear_key(APP).map_err(map_err)
        }

        /// Refuse product commands unless the key is currently valid —
        /// same check as launch: online, or 72h grace on outage.
        pub async fn require(_app: &tauri::AppHandle) -> Result<(), String> {
            $crate::ensure_licensed(APP, &validator_url())
                .await
                .map_err(map_err)
        }

        /// For sync Tauri commands (blocking thread pool). Do not call from `async fn`.
        pub fn require_sync(app: &tauri::AppHandle) -> Result<(), String> {
            tauri::async_runtime::block_on(require(app))
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_hex_is_deterministic() {
        assert_eq!(
            hash_hex("spiral"),
            "0f0e99f465a65c3cb8a7514fa35714553fc70d91c948679dc7a91fb3d79e6a06"
        );
    }

    #[test]
    fn classify_validator_fails_closed_on_auth() {
        assert_eq!(
            classify_validator(false, false, false, false, Some("invalid_key")),
            Err(LicenseError::InvalidKey)
        );
        assert_eq!(
            classify_validator(false, false, false, false, Some("no_access")),
            Err(LicenseError::NoAccess)
        );
        assert_eq!(
            classify_validator(false, false, false, false, Some("device_mismatch")),
            Err(LicenseError::DeviceMismatch)
        );
    }

    #[test]
    fn classify_validator_treats_outages_as_network() {
        assert!(matches!(
            classify_validator(false, false, true, false, Some("whop_unavailable")),
            Err(LicenseError::Network(_))
        ));
        assert!(matches!(
            classify_validator(false, false, false, true, Some("rate_limited")),
            Err(LicenseError::Network(_))
        ));
        assert!(matches!(
            classify_validator(false, false, true, false, Some("unknown")),
            Err(LicenseError::Network(_))
        ));
        assert_eq!(
            classify_validator(false, false, true, false, Some("validator_not_configured")),
            Err(LicenseError::ValidatorNotConfigured)
        );
    }

    #[test]
    fn classify_validator_accepts_ok() {
        assert_eq!(classify_validator(true, true, false, false, None), Ok(()));
    }

    #[test]
    fn grace_eligible_covers_outages_not_auth() {
        assert!(grace_eligible(&LicenseError::Network("down".into())));
        assert!(grace_eligible(&LicenseError::ValidatorNotConfigured));
        assert!(!grace_eligible(&LicenseError::InvalidKey));
        assert!(!grace_eligible(&LicenseError::NoAccess));
        assert!(!grace_eligible(&LicenseError::DeviceMismatch));
    }

    #[test]
    fn cached_status_covers_matching_key_within_window() {
        let status = CachedStatus {
            key_hash: hash_hex("key"),
            hwid_hash: hash_hex("hw"),
            validated_at: 1_000,
        };
        assert!(cached_status_covers(
            &status,
            "key",
            "hw",
            1_000 + GRACE_SECS
        ));
        assert!(!cached_status_covers(
            &status,
            "key",
            "hw",
            1_000 + GRACE_SECS + 1
        ));
        assert!(!cached_status_covers(&status, "other", "hw", 1_000));
        assert!(!cached_status_covers(&status, "key", "other", 1_000));
    }

    #[test]
    fn store_key_rejects_empty() {
        assert_eq!(
            store_key(AppId::Wallpaper, "  ").unwrap_err(),
            LicenseError::EmptyKey
        );
    }

    #[test]
    fn app_id_as_str() {
        assert_eq!(AppId::Wallpaper.as_str(), "wallpaper");
        assert_eq!(AppId::Clean.as_str(), "clean");
        assert_eq!(AppId::Resume.as_str(), "resume");
        assert_eq!(AppId::Slim.as_str(), "slim");
    }

    #[test]
    fn empty_key_user_message() {
        assert!(LicenseError::EmptyKey.user_message().contains("Whop"));
    }

    #[test]
    fn current_validity_refuses_a_stored_but_revoked_key() {
        assert_eq!(
            current_validity(true, Err(LicenseError::InvalidKey), true),
            Err(LicenseError::InvalidKey)
        );
        assert_eq!(
            current_validity(true, Err(LicenseError::NoAccess), true),
            Err(LicenseError::NoAccess)
        );
        assert_eq!(
            current_validity(true, Err(LicenseError::DeviceMismatch), false),
            Err(LicenseError::DeviceMismatch)
        );
    }

    #[test]
    fn current_validity_matches_launch() {
        assert_eq!(
            current_validity(false, Ok(()), true),
            Err(LicenseError::EmptyKey)
        );
        assert_eq!(current_validity(true, Ok(()), false), Ok(()));
        assert_eq!(
            current_validity(true, Err(LicenseError::Network("down".into())), true),
            Ok(())
        );
        assert!(matches!(
            current_validity(true, Err(LicenseError::Network("down".into())), false),
            Err(LicenseError::Network(_))
        ));
        assert_eq!(
            current_validity(
                true,
                Err(LicenseError::ValidatorNotConfigured),
                true
            ),
            Ok(())
        );
    }

    #[test]
    fn require_macro_revalidates_like_launch() {
        let src = include_str!("lib.rs");
        let require = src
            .split("pub async fn require")
            .nth(1)
            .expect("async require");
        let body = require
            .split("pub fn require_sync")
            .next()
            .expect("require body");
        assert!(
            body.contains("ensure_licensed"),
            "require must use the launch check, not a stored-key probe"
        );
        assert!(
            !body.contains("has_key"),
            "require must not stop at a stored key: {body}"
        );
    }

    fn spawn_json_once(status: u16, body: &'static str) -> String {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let mut buf = [0u8; 512];
            let mut total = Vec::new();
            loop {
                match stream.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        total.extend_from_slice(&buf[..n]);
                        if total.windows(4).any(|w| w == b"\r\n\r\n") {
                            break;
                        }
                    }
                    Err(_) => break,
                }
                if total.len() > 16_384 {
                    break;
                }
            }
            let header = format!(
                "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(header.as_bytes());
            let _ = stream.write_all(body.as_bytes());
        });
        format!("http://{addr}/validate")
    }

    #[tokio::test]
    async fn validate_online_refuses_a_revoked_key() {
        let url = spawn_json_once(403, r#"{"ok":false,"error":"invalid_key"}"#);
        let err = validate_online(AppId::Wallpaper, "mem_revoked", "hw", &url)
            .await
            .unwrap_err();
        assert_eq!(err, LicenseError::InvalidKey);
        assert_eq!(
            current_validity(true, Err(err), true),
            Err(LicenseError::InvalidKey)
        );
    }

    #[tokio::test]
    async fn validate_online_treats_validator_outage_as_network() {
        let url = spawn_json_once(502, r#"{"ok":false,"error":"whop_unavailable"}"#);
        let err = validate_online(AppId::Clean, "mem_paid", "hw", &url)
            .await
            .unwrap_err();
        assert!(matches!(err, LicenseError::Network(_)));
        assert_eq!(current_validity(true, Err(err.clone()), true), Ok(()));
        assert!(current_validity(true, Err(err), false).is_err());
    }
}
