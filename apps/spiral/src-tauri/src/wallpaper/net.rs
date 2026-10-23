use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use super::model::UserError;

const ALLOWED_HOST_SUFFIX: &str = "wallhaven.cc";
const MAX_BYTES: usize = 40 * 1024 * 1024;

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait Transport: Send + Sync {
    fn get<'a>(
        &'a self,
        url: &'a str,
        query: &'a [(String, String)],
    ) -> BoxFuture<'a, Result<Vec<u8>, UserError>>;
}

pub struct LiveTransport {
    client: reqwest::Client,
}

impl LiveTransport {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent(concat!("Spiral/", env!("CARGO_PKG_VERSION")))
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .expect("Spiral could not start"),
        }
    }
}

impl Transport for LiveTransport {
    fn get<'a>(
        &'a self,
        url: &'a str,
        query: &'a [(String, String)],
    ) -> BoxFuture<'a, Result<Vec<u8>, UserError>> {
        Box::pin(async move { fetch_bytes(&self.client, url, query).await })
    }
}

pub fn host_allowed(url: &str) -> Result<(), UserError> {
    let parsed = reqwest::Url::parse(url).map_err(|_| UserError::bad())?;
    if parsed.scheme() != "https" {
        return Err(UserError::bad());
    }
    let host = parsed.host_str().ok_or_else(UserError::bad)?;
    let ok = host == ALLOWED_HOST_SUFFIX || host.ends_with(&format!(".{ALLOWED_HOST_SUFFIX}"));
    if ok {
        Ok(())
    } else {
        Err(UserError::bad())
    }
}

pub fn image_ext(bytes: &[u8]) -> Result<&'static str, UserError> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Ok("jpg")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Ok("png")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Ok("webp")
    } else {
        Err(UserError::bad_image())
    }
}

pub fn content_type(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "image/jpeg",
    }
}

async fn fetch_bytes(
    client: &reqwest::Client,
    url: &str,
    query: &[(String, String)],
) -> Result<Vec<u8>, UserError> {
    host_allowed(url)?;
    let response = client
        .get(url)
        .query(query)
        .send()
        .await
        .map_err(transport_error)?;
    match response.status().as_u16() {
        429 => return Err(UserError::rate_limited()),
        status if !(200..300).contains(&status) => return Err(UserError::download()),
        _ => {}
    }
    if let Some(len) = response.content_length() {
        if len as usize > MAX_BYTES {
            return Err(UserError::too_large());
        }
    }
    let bytes = response.bytes().await.map_err(|_| UserError::download())?;
    if bytes.len() > MAX_BYTES {
        return Err(UserError::too_large());
    }
    Ok(bytes.to_vec())
}

fn transport_error(err: reqwest::Error) -> UserError {
    if err.is_connect() || err.is_timeout() || err.is_request() {
        UserError::offline()
    } else {
        UserError::bad()
    }
}

pub type SharedTransport = Arc<dyn Transport>;

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
