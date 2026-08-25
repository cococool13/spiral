//! Shared network layer for every wallpaper source.
//!
//! All network traffic goes through here (Rust), never the webview.
//! Errors are returned as short string codes ("offline", "rate_limited",
//! "bad_response", "download_failed", "too_large", "bad_image") that the
//! frontend maps to brand copy.

use serde::Serialize;

/// Wallhaven hosts only (apex + any subdomain). The webview CSP cannot
/// constrain Rust fetches, so this is the real allowlist for downloads.
const ALLOWED_HOST_SUFFIX: &str = "wallhaven.cc";

/// Cap before buffering into memory. Thumbs and full images stay well under
/// this; anything larger is treated as a bad response rather than an OOM.
const MAX_BYTES: usize = 40 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperItem {
    pub id: String,
    pub resolution: String,
    pub thumb_url: String,
    pub full_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage {
    pub items: Vec<WallpaperItem>,
    pub page: u32,
    pub last_page: u32,
}

pub fn transport_code(e: &reqwest::Error) -> String {
    if e.is_connect() || e.is_timeout() || e.is_request() {
        "offline".into()
    } else {
        "bad_response".into()
    }
}

fn host_allowed(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "bad_response".to_string())?;
    if parsed.scheme() != "https" {
        return Err("bad_response".into());
    }
    let host = parsed.host_str().ok_or_else(|| "bad_response".to_string())?;
    let ok = host == ALLOWED_HOST_SUFFIX
        || host.ends_with(&format!(".{ALLOWED_HOST_SUFFIX}"));
    if ok {
        Ok(())
    } else {
        Err("bad_response".into())
    }
}

pub async fn fetch_bytes(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    host_allowed(url)?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| transport_code(&e))?;
    match resp.status().as_u16() {
        429 => return Err("rate_limited".into()),
        s if !(200..300).contains(&s) => return Err("download_failed".into()),
        _ => {}
    }
    if let Some(len) = resp.content_length() {
        if len as usize > MAX_BYTES {
            return Err("too_large".into());
        }
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|_| "download_failed".to_string())?;
    if bytes.len() > MAX_BYTES {
        return Err("too_large".into());
    }
    Ok(bytes.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_https_and_foreign_hosts() {
        assert!(host_allowed("http://wallhaven.cc/a.jpg").is_err());
        assert!(host_allowed("https://evil.example/a.jpg").is_err());
        assert!(host_allowed("https://wallhaven.cc.evil/a.jpg").is_err());
    }

    #[test]
    fn accepts_wallhaven_hosts() {
        assert!(host_allowed("https://wallhaven.cc/w/abc").is_ok());
        assert!(host_allowed("https://w.wallhaven.cc/full/ab/wallhaven-abc.jpg").is_ok());
        assert!(host_allowed("https://th.wallhaven.cc/small/ab/abc.jpg").is_ok());
    }
}
