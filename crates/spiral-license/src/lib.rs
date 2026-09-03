//! Whop license gate for Spiral apps.
//!
//! Keys live in the OS keychain. Validation goes to Spiral's Cloudflare Worker,
//! which holds the Whop API key — never ship that key inside the app.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Public validator. Override at build time with `SPIRAL_LICENSE_URL` if needed.
pub const DEFAULT_VALIDATOR_URL: &str =
    "https://spiral-license.cohencool.workers.dev/validate";

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
    if status.key_hash != hash_hex(key) || status.hwid_hash != hash_hex(hwid) {
        return false;
    }
    now_secs().saturating_sub(status.validated_at) <= GRACE_SECS
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

fn map_api_error(code: &str) -> LicenseError {
    match code {
        "invalid_key" => LicenseError::InvalidKey,
        "no_access" => LicenseError::NoAccess,
        "device_mismatch" => LicenseError::DeviceMismatch,
        "validator_not_configured" => LicenseError::ValidatorNotConfigured,
        other => LicenseError::Other(format!("License check failed ({other}).")),
    }
}

fn http_client() -> Result<reqwest::Client, LicenseError> {
    reqwest::Client::builder()
        .user_agent(concat!("SpiralLicense/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| LicenseError::Network(e.to_string()))
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

/// Launch check: require a stored key; revalidate online; allow 72h grace offline.
pub async fn ensure_licensed(app: AppId, validator_url: &str) -> Result<(), LicenseError> {
    let key = read_key(app).ok_or(LicenseError::EmptyKey)?;
    let hwid = machine_id();
    match validate_online(app, &key, &hwid, validator_url).await {
        Ok(()) => {
            let _ = save_status(app, &key, &hwid);
            Ok(())
        }
        Err(LicenseError::Network(_)) if grace_ok(app, &key, &hwid) => Ok(()),
        Err(e) => Err(e),
    }
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

    if body.ok && status.is_success() {
        return Ok(());
    }

    Err(map_api_error(body.error.as_deref().unwrap_or("unknown")))
}
