//! License gate for Spiral desktop apps.
//!
//! One Spiral Collection key unlocks every app. Keys are signed (`LIC1.<payload>.<sig>`,
//! Ed25519) by Spiral's licensing Worker, so a launch verifies offline against the
//! public keys below. The online check (refunds, revocations, device limit) runs on
//! activation and then about once a week, with a 30-day grace when the server cannot
//! be reached. The signing key never ships in an app.

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Licensing Worker. Override at run time with `SPIRAL_LICENSE_URL` (full URL including `/activate`).
pub const DEFAULT_VALIDATOR_URL: &str = "https://licensing.cohencool.workers.dev/activate";

/// Every Spiral app shares one license, sold under this app id.
pub const LICENSE_APP_ID: &str = "spiral";

const RECHECK_SECS: u64 = 7 * 24 * 60 * 60;
const GRACE_SECS: u64 = 30 * 24 * 60 * 60;

/// Public keys that sign license keys, by kid. Same set as the Swift LicenseKit.
const PRODUCTION_KEYS: &[(&str, &str)] = &[("k1", "kuCXGSc9gcqvCGvRT7ggcpVi1LaEB5o5pg2Z1xyV528=")];
/// Debug builds also trust the local `wrangler dev` key (licensing/scripts/keygen.mjs dev).
#[cfg(debug_assertions)]
const DEV_KEYS: &[(&str, &str)] = &[("dev", "EcUKGHuyX1qA/dYwuaCfFE/zmydB9oqqdzk7g7iwYUw=")];
#[cfg(not(debug_assertions))]
const DEV_KEYS: &[(&str, &str)] = &[];

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

const KEY_ACCOUNT: &str = "license";
const STATUS_ACCOUNT: &str = "license-status";
/// Accounts used by builds sold through the previous store. Read once, then migrated.
const LEGACY_KEY_ACCOUNT: &str = "whop-license";
const LEGACY_STATUS_ACCOUNT: &str = "whop-license-status";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct KeyPayload {
    pub v: u8,
    pub kid: String,
    pub app: String,
    pub lid: String,
    pub eh: String,
    pub iat: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedStatus {
    key_hash: String,
    validated_at: u64,
}

#[derive(Debug, Deserialize)]
struct ActivateResponse {
    ok: bool,
    #[serde(default)]
    key: Option<String>,
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
            Self::EmptyKey => "Paste the license key from your purchase email.".into(),
            Self::Keychain(e) => format!("Could not reach this machine's keychain: {e}."),
            Self::Network(_) => {
                "Could not reach the license server. Check the network and try again.".into()
            }
            Self::InvalidKey => {
                "That license key is not valid. Copy it again from your purchase email.".into()
            }
            Self::NoAccess => {
                "That key is no longer active (refunded or revoked). Reply to your receipt email for help.".into()
            }
            Self::DeviceMismatch => {
                "This key is active on too many computers. Reply to your receipt email to move it.".into()
            }
            Self::ValidatorNotConfigured => {
                "License checks are not configured yet. Try again later.".into()
            }
            Self::Other(e) => e.clone(),
        }
    }
}

fn trusted_keys() -> impl Iterator<Item = &'static (&'static str, &'static str)> {
    PRODUCTION_KEYS.iter().chain(DEV_KEYS.iter())
}

/// Strict base64url: canonical spelling only, so one key has one text form.
fn b64url_decode(text: &str) -> Option<Vec<u8>> {
    let bytes = URL_SAFE_NO_PAD.decode(text).ok()?;
    (URL_SAFE_NO_PAD.encode(&bytes) == text).then_some(bytes)
}

/// Keys arrive pasted from email: drop every whitespace character.
pub fn normalize_key(raw: &str) -> String {
    raw.chars().filter(|c| !c.is_whitespace()).collect()
}

/// Offline check: format, known kid, signature, app.
pub fn verify_key(raw: &str) -> Result<KeyPayload, LicenseError> {
    verify_key_with(raw, trusted_keys().copied())
}

fn verify_key_with<'a>(
    raw: &str,
    keys: impl IntoIterator<Item = (&'a str, &'a str)>,
) -> Result<KeyPayload, LicenseError> {
    let key = normalize_key(raw);
    let parts: Vec<&str> = key.split('.').collect();
    if parts.len() != 3 || parts[0] != "LIC1" {
        return Err(LicenseError::InvalidKey);
    }
    let payload_bytes = b64url_decode(parts[1]).ok_or(LicenseError::InvalidKey)?;
    let sig_bytes: [u8; 64] = b64url_decode(parts[2])
        .and_then(|b| b.try_into().ok())
        .ok_or(LicenseError::InvalidKey)?;
    let payload: KeyPayload =
        serde_json::from_slice(&payload_bytes).map_err(|_| LicenseError::InvalidKey)?;
    if payload.v != 1 {
        return Err(LicenseError::InvalidKey);
    }
    let public = keys
        .into_iter()
        .find(|(kid, _)| *kid == payload.kid)
        .and_then(|(_, b64)| STANDARD.decode(b64).ok())
        .and_then(|b| <[u8; 32]>::try_from(b).ok())
        .and_then(|b| VerifyingKey::from_bytes(&b).ok())
        .ok_or(LicenseError::InvalidKey)?;
    let message = format!("{}.{}", parts[0], parts[1]);
    public
        .verify_strict(message.as_bytes(), &Signature::from_bytes(&sig_bytes))
        .map_err(|_| LicenseError::InvalidKey)?;
    if payload.app != LICENSE_APP_ID {
        return Err(LicenseError::InvalidKey);
    }
    Ok(payload)
}

fn entry(app: AppId, account: &str) -> Result<keyring::Entry, LicenseError> {
    keyring::Entry::new(app.keychain_service(), account)
        .map_err(|e| LicenseError::Keychain(e.to_string()))
}

pub fn store_key(app: AppId, key: &str) -> Result<(), LicenseError> {
    let key = normalize_key(key);
    if key.is_empty() {
        return Err(LicenseError::EmptyKey);
    }
    entry(app, KEY_ACCOUNT)?
        .set_password(&key)
        .map_err(|e| LicenseError::Keychain(e.to_string()))
}

fn read_account(app: AppId, account: &str) -> Option<String> {
    entry(app, account).ok()?.get_password().ok()
}

fn delete_account(app: AppId, account: &str) {
    if let Ok(e) = entry(app, account) {
        let _ = e.delete_credential();
    }
}

pub fn read_key(app: AppId) -> Option<String> {
    read_account(app, KEY_ACCOUNT)
}

/// A stored key, or a key from a pre-migration build waiting to be upgraded.
pub fn has_key(app: AppId) -> bool {
    read_key(app).is_some() || read_account(app, LEGACY_KEY_ACCOUNT).is_some()
}

pub fn clear_key(app: AppId) -> Result<(), LicenseError> {
    match entry(app, KEY_ACCOUNT)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(LicenseError::Keychain(e.to_string())),
    }
    for account in [STATUS_ACCOUNT, LEGACY_KEY_ACCOUNT, LEGACY_STATUS_ACCOUNT] {
        delete_account(app, account);
    }
    Ok(())
}

fn hash_hex(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn save_status(app: AppId, key: &str) -> Result<(), LicenseError> {
    let status = CachedStatus {
        key_hash: hash_hex(key),
        validated_at: now_secs(),
    };
    let json = serde_json::to_string(&status).map_err(|e| LicenseError::Other(e.to_string()))?;
    entry(app, STATUS_ACCOUNT)?
        .set_password(&json)
        .map_err(|e| LicenseError::Keychain(e.to_string()))
}

/// Seconds since the last good online check of this key, if any.
fn checked_age(app: AppId, key: &str, now: u64) -> Option<u64> {
    let raw = read_account(app, STATUS_ACCOUNT)?;
    let status: CachedStatus = serde_json::from_str(&raw).ok()?;
    (status.key_hash == hash_hex(key)).then(|| now.saturating_sub(status.validated_at))
}

/// Stable-enough machine id. Not a secret; only its SHA-256 leaves the machine.
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

/// What the server sees: a hash, the same for every Spiral app on this machine,
/// so the four apps count as one device.
fn device_id() -> String {
    hash_hex(&machine_id())
}

fn http_client() -> Result<reqwest::Client, LicenseError> {
    reqwest::Client::builder()
        .user_agent(concat!("SpiralLicense/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| LicenseError::Network(e.to_string()))
}

/// A definite "no" fails closed; outages are `Network` so the grace window applies.
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
        "invalid_key" | "wrong_app" => Err(LicenseError::InvalidKey),
        "refunded" | "revoked" | "disputed" | "no_access" => Err(LicenseError::NoAccess),
        "device_limit" | "device_mismatch" => Err(LicenseError::DeviceMismatch),
        "validator_not_configured" => Err(LicenseError::ValidatorNotConfigured),
        "bad_request" | "missing_fields" | "bad_json" => Err(LicenseError::Other(format!(
            "License check failed ({code})."
        ))),
        "rate_limited" | "server_error" => Err(LicenseError::Network(code.into())),
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

/// Activate: verify offline (unless it is a pre-migration key), register online, store.
pub async fn activate(app: AppId, key: &str, validator_url: &str) -> Result<(), LicenseError> {
    let key = normalize_key(key);
    if key.is_empty() {
        return Err(LicenseError::EmptyKey);
    }
    if !key.starts_with("mem_") {
        verify_key(&key)?;
    }
    let signed = validate_online(&key, &device_id(), validator_url).await?;
    verify_key(&signed)?;
    store_key(app, &signed)?;
    save_status(app, &signed)?;
    for account in [LEGACY_KEY_ACCOUNT, LEGACY_STATUS_ACCOUNT] {
        delete_account(app, account);
    }
    Ok(())
}

/// What a launch decides, given the stored key's offline check and its last online check.
#[derive(Debug, PartialEq, Eq)]
enum Launch {
    Licensed,
    CheckOnline,
}

fn launch_step(offline: Result<(), LicenseError>, age: Option<u64>) -> Result<Launch, LicenseError> {
    offline?;
    match age {
        Some(age) if age < RECHECK_SECS => Ok(Launch::Licensed),
        _ => Ok(Launch::CheckOnline),
    }
}

/// After an online check: success wins, a definite "no" locks, an outage uses the grace window.
fn current_validity(
    online: Result<(), LicenseError>,
    age: Option<u64>,
) -> Result<(), LicenseError> {
    match online {
        Ok(()) => Ok(()),
        Err(e) if grace_eligible(&e) && age.is_some_and(|a| a <= GRACE_SECS) => Ok(()),
        Err(e) => Err(e),
    }
}

/// Launch check. Offline while the last online check is under a week old.
pub async fn ensure_licensed(app: AppId, validator_url: &str) -> Result<(), LicenseError> {
    let Some(key) = read_key(app) else {
        // A build from before the migration left a store key behind: upgrade it once.
        return match read_account(app, LEGACY_KEY_ACCOUNT) {
            Some(legacy) => activate(app, &legacy, validator_url).await,
            None => Err(LicenseError::EmptyKey),
        };
    };
    let now = now_secs();
    let age = checked_age(app, &key, now);
    if launch_step(verify_key(&key).map(|_| ()), age)? == Launch::Licensed {
        return Ok(());
    }
    let online = validate_online(&key, &device_id(), validator_url)
        .await
        .map(|_| ());
    if online.is_ok() {
        let _ = save_status(app, &key);
    }
    current_validity(online, age)
}

/// POST { key, app, device } and return the signed key the server holds for it.
async fn validate_online(key: &str, device: &str, validator_url: &str) -> Result<String, LicenseError> {
    let client = http_client()?;
    let res = client
        .post(validator_url)
        .json(&serde_json::json!({ "key": key, "app": LICENSE_APP_ID, "device": device }))
        .send()
        .await
        .map_err(|e| LicenseError::Network(e.to_string()))?;

    let status = res.status();
    let body: ActivateResponse = res
        .json()
        .await
        .map_err(|e| LicenseError::Network(e.to_string()))?;

    classify_validator(
        body.ok,
        status.is_success(),
        status.is_server_error(),
        status.as_u16() == 429,
        body.error.as_deref(),
    )?;
    body.key
        .ok_or_else(|| LicenseError::Network("server returned no key".into()))
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
        /// same check as launch: offline signature, weekly online check, 30-day grace.
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

    // Signed by the licensing Worker's own code (licensing/scripts/test-vector.ts),
    // published test seed. The Swift and TypeScript tests verify the same string.
    const VECTOR_PUB: &str = "ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=";
    const VECTOR_KEY: &str = "LIC1.eyJ2IjoxLCJraWQiOiJ2ZWMiLCJhcHAiOiJlbWJlciIsImxpZCI6ImxpY192ZWN0b3IwMDAwMDAwMDAwMDAwMDAwIiwiZWgiOiIwMTIzNDU2Nzg5YWJjZGVmIiwiaWF0IjoxNzYwMDAwMDAwfQ.h7YNrLu-98RX1PMmGmK1V4LmY7kvE6iQTFDhsDZFB3W84dSBjI_KyPkm63joPL1It510ZBTHPE5YV13X3rkdCg";

    struct Signer(ed25519_dalek::SigningKey);

    impl Signer {
        fn new(seed: u8) -> Self {
            Self(ed25519_dalek::SigningKey::from_bytes(&[seed; 32]))
        }
        fn public_b64(&self) -> String {
            STANDARD.encode(self.0.verifying_key().to_bytes())
        }
        fn key(&self, kid: &str, app: &str) -> String {
            use ed25519_dalek::Signer as _;
            let json = format!(r#"{{"v":1,"kid":"{kid}","app":"{app}","lid":"lic_t","eh":"0","iat":1}}"#);
            let body = format!("LIC1.{}", URL_SAFE_NO_PAD.encode(json));
            let sig = self.0.sign(body.as_bytes());
            format!("{body}.{}", URL_SAFE_NO_PAD.encode(sig.to_bytes()))
        }
    }

    #[test]
    fn verifies_the_worker_signed_vector_but_only_for_its_app() {
        // The vector is an Ember key: right signature, wrong app for Spiral.
        assert_eq!(
            verify_key_with(VECTOR_KEY, [("vec", VECTOR_PUB)]),
            Err(LicenseError::InvalidKey)
        );
        let s = Signer::new(7);
        let pubkey = s.public_b64();
        let good = s.key("t1", "spiral");
        let payload = verify_key_with(&good, [("t1", pubkey.as_str())]).unwrap();
        assert_eq!(payload.app, "spiral");
        assert_eq!(payload.lid, "lic_t");
    }

    #[test]
    fn vector_signature_checks_out_with_its_payload() {
        // Re-sign the vector's payload check without the app gate: signature bytes must verify.
        let parts: Vec<&str> = VECTOR_KEY.split('.').collect();
        let key = VerifyingKey::from_bytes(&STANDARD.decode(VECTOR_PUB).unwrap().try_into().unwrap()).unwrap();
        let sig: [u8; 64] = b64url_decode(parts[2]).unwrap().try_into().unwrap();
        assert!(key
            .verify_strict(format!("LIC1.{}", parts[1]).as_bytes(), &Signature::from_bytes(&sig))
            .is_ok());
    }

    #[test]
    fn rejects_forgeries() {
        let s = Signer::new(7);
        let pubkey = s.public_b64();
        let keys = [("t1", pubkey.as_str())];
        let good = s.key("t1", "spiral");
        // Wrong signer under a trusted kid, unknown kid, wrong app.
        assert!(verify_key_with(&Signer::new(8).key("t1", "spiral"), keys).is_err());
        assert!(verify_key_with(&s.key("zz", "spiral"), keys).is_err());
        assert!(verify_key_with(&s.key("t1", "ember"), keys).is_err());
        // Every single-character change.
        let alphabet: Vec<char> = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".chars().collect();
        let chars: Vec<char> = good.chars().collect();
        for i in (5..chars.len()).step_by(2) {
            if chars[i] == '.' {
                continue;
            }
            let mut m = chars.clone();
            let at = alphabet.iter().position(|c| *c == m[i]).unwrap();
            m[i] = alphabet[(at + 7) % alphabet.len()];
            let mutated: String = m.into_iter().collect();
            assert!(verify_key_with(&mutated, keys).is_err(), "position {i}");
        }
        // Malformed.
        for bad in ["", "LIC1", "mem_abc", "LIC2.a.b", "LIC1.a.b.c", "LIC1.!!.x"] {
            assert!(verify_key_with(bad, keys).is_err(), "{bad}");
        }
        // Wrapped by an email client: still fine.
        let wrapped = format!(" {}\n{} ", &good[..40], &good[40..]);
        assert!(verify_key_with(&wrapped, keys).is_ok());
    }

    #[test]
    fn release_builds_trust_production_keys() {
        assert!(!PRODUCTION_KEYS.is_empty());
        assert!(PRODUCTION_KEYS.iter().all(|(kid, _)| *kid != "dev"));
        for (_, b64) in trusted_keys() {
            assert_eq!(STANDARD.decode(b64).unwrap().len(), 32);
        }
    }

    #[test]
    fn hash_hex_is_deterministic() {
        assert_eq!(
            hash_hex("spiral"),
            "0f0e99f465a65c3cb8a7514fa35714553fc70d91c948679dc7a91fb3d79e6a06"
        );
    }

    #[test]
    fn classify_validator_fails_closed_on_verdicts() {
        for (code, want) in [
            ("invalid_key", LicenseError::InvalidKey),
            ("wrong_app", LicenseError::InvalidKey),
            ("refunded", LicenseError::NoAccess),
            ("revoked", LicenseError::NoAccess),
            ("disputed", LicenseError::NoAccess),
            ("device_limit", LicenseError::DeviceMismatch),
        ] {
            assert_eq!(classify_validator(false, false, false, false, Some(code)), Err(want));
        }
    }

    #[test]
    fn classify_validator_treats_outages_as_network() {
        assert!(matches!(
            classify_validator(false, false, true, false, Some("server_error")),
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
        assert_eq!(classify_validator(true, true, false, false, None), Ok(()));
    }

    #[test]
    fn launch_is_offline_inside_the_recheck_window() {
        assert_eq!(launch_step(Ok(()), Some(0)), Ok(Launch::Licensed));
        assert_eq!(launch_step(Ok(()), Some(RECHECK_SECS - 1)), Ok(Launch::Licensed));
        assert_eq!(launch_step(Ok(()), Some(RECHECK_SECS)), Ok(Launch::CheckOnline));
        assert_eq!(launch_step(Ok(()), None), Ok(Launch::CheckOnline));
        assert_eq!(launch_step(Err(LicenseError::InvalidKey), Some(0)), Err(LicenseError::InvalidKey));
    }

    #[test]
    fn outage_uses_grace_and_verdicts_lock() {
        let down = || Err(LicenseError::Network("down".into()));
        assert_eq!(current_validity(Ok(()), None), Ok(()));
        assert_eq!(current_validity(down(), Some(GRACE_SECS)), Ok(()));
        assert!(current_validity(down(), Some(GRACE_SECS + 1)).is_err());
        assert!(current_validity(down(), None).is_err());
        assert_eq!(
            current_validity(Err(LicenseError::NoAccess), Some(0)),
            Err(LicenseError::NoAccess)
        );
        assert_eq!(
            current_validity(Err(LicenseError::ValidatorNotConfigured), Some(10)),
            Ok(())
        );
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
        format!("http://{addr}/activate")
    }

    #[tokio::test]
    async fn validate_online_refuses_a_refunded_key() {
        let url = spawn_json_once(403, r#"{"ok":false,"error":"refunded"}"#);
        let err = validate_online("LIC1.x.y", "dev", &url).await.unwrap_err();
        assert_eq!(err, LicenseError::NoAccess);
        assert_eq!(current_validity(Err(err), Some(0)), Err(LicenseError::NoAccess));
    }

    #[tokio::test]
    async fn validate_online_treats_server_outage_as_network() {
        let url = spawn_json_once(500, r#"{"error":"server_error"}"#);
        let err = validate_online("LIC1.x.y", "dev", &url).await.unwrap_err();
        assert!(matches!(err, LicenseError::Network(_)));
        assert_eq!(current_validity(Err(err.clone()), Some(1)), Ok(()));
        assert!(current_validity(Err(err), None).is_err());
    }

    #[tokio::test]
    async fn validate_online_returns_the_signed_key() {
        let url = spawn_json_once(200, r#"{"ok":true,"status":"active","key":"LIC1.a.b"}"#);
        assert_eq!(validate_online("mem_x", "dev", &url).await.unwrap(), "LIC1.a.b");
    }

    /// Live check against a local `wrangler dev`, run by ../licensing/scripts/e2e-local.mjs keys:
    /// SPIRAL_E2E_KEY=<signed spiral key> SPIRAL_LICENSE_URL=http://localhost:8787/activate cargo test live_server
    /// Skips when the variables are unset.
    #[tokio::test]
    async fn live_server_activates_a_purchased_key() {
        let (Ok(key), Ok(url)) = (std::env::var("SPIRAL_E2E_KEY"), std::env::var("SPIRAL_LICENSE_URL")) else {
            return;
        };
        verify_key(&key).expect("offline signature check");
        let signed = validate_online(&key, &"d".repeat(64), &url).await.expect("server accepts the key");
        assert_eq!(signed, key);
        println!("spiral license ok lid={}", verify_key(&signed).unwrap().lid);
    }
}
