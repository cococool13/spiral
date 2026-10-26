//! The only door to the network for wallpaper sources (spec §7): one client,
//! a host allowlist built from every source's hosts (redirects included), a
//! token bucket per API host, a 24 h response cache for API answers, byte
//! sniffing, and one activity-log entry per request.

use std::collections::HashMap;
use std::fs;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use super::activity::{ActivityLog, Entry};
use super::model::UserError;
use super::sources;

const MAX_BYTES: usize = 40 * 1024 * 1024;
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
pub const USER_AGENT: &str = concat!(
    "Spiral/",
    env!("CARGO_PKG_VERSION"),
    " (+https://spiralcc.tech)"
);

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
        // A redirect may only land on another allowed host (Smithsonian's
        // download service, for one, answers with a 307 to its own bucket).
        let redirects = reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || host_allowed(attempt.url().as_str()).is_err() {
                attempt.stop()
            } else {
                attempt.follow()
            }
        });
        Self {
            client: reqwest::Client::builder()
                .user_agent(USER_AGENT)
                .redirect(redirects)
                .timeout(Duration::from_secs(60))
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

/// True when the URL is https and its host belongs to a shipped source.
pub fn host_allowed(url: &str) -> Result<(), UserError> {
    let host = https_host(url).ok_or_else(UserError::bad)?;
    if sources::all_hosts().any(|rule| rule.matches(&host)) {
        Ok(())
    } else {
        Err(UserError::bad())
    }
}

pub fn https_host(url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(url).ok()?;
    if parsed.scheme() != "https" {
        return None;
    }
    parsed.host_str().map(str::to_ascii_lowercase)
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

/// A request budget: `capacity` requests, refilled evenly over `per_secs`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rate {
    pub capacity: u32,
    pub per_secs: u64,
}

impl Rate {
    pub const fn per_minute(capacity: u32) -> Self {
        Self {
            capacity,
            per_secs: 60,
        }
    }
}

struct Bucket {
    tokens: f64,
    last: Instant,
}

/// One API call: which source asks, where, on what budget, and what for.
pub struct Call<'a> {
    pub source: &'static str,
    pub url: &'a str,
    pub query: &'a [(String, String)],
    pub rate: Rate,
    pub action: &'static str,
}

pub struct Net {
    transport: SharedTransport,
    cache_dir: PathBuf,
    log: ActivityLog,
    buckets: Mutex<HashMap<String, Bucket>>,
}

impl Net {
    pub fn new(transport: SharedTransport, app_dir: &Path) -> Self {
        let cache_dir = app_dir.join("source-cache");
        prune_cache(&cache_dir);
        Self {
            transport,
            cache_dir,
            log: ActivityLog::at(app_dir),
            buckets: Mutex::new(HashMap::new()),
        }
    }

    pub fn activity(&self) -> &ActivityLog {
        &self.log
    }

    /// A JSON or HTML answer from a source's API. Served from the 24 h cache
    /// when fresh (no request, no log line); otherwise it spends one token
    /// from the host's bucket and writes one log line.
    pub async fn api(&self, call: Call<'_>) -> Result<Vec<u8>, UserError> {
        let host = https_host(call.url).ok_or_else(UserError::bad)?;
        let path = self
            .cache_dir
            .join(format!("{:016x}.bin", cache_key(call.url, call.query)));
        if let Some(bytes) = read_fresh(&path) {
            return Ok(bytes);
        }
        self.take(&host, call.rate)?;
        let result = self.transport.get(call.url, call.query).await;
        self.note(call.action, call.source, &host, None, &result);
        let bytes = result?;
        let _ = fs::create_dir_all(&self.cache_dir);
        let tmp = path.with_extension("part");
        if fs::write(&tmp, &bytes).is_ok() {
            let _ = fs::rename(&tmp, &path);
        }
        Ok(bytes)
    }

    /// An image file: a thumbnail or a full-size download. Not cached here
    /// (the thumbnail and wallpaper caches own that) and not rate limited,
    /// because these hosts are CDNs, but always logged.
    pub async fn asset(
        &self,
        url: &str,
        action: &'static str,
        item: &str,
    ) -> Result<Vec<u8>, UserError> {
        let host = https_host(url).ok_or_else(UserError::bad)?;
        let source = item
            .chars()
            .next()
            .and_then(sources::id_for_prefix)
            .unwrap_or("unknown");
        let result = self.transport.get(url, &[]).await;
        self.note(action, source, &host, Some(item), &result);
        result
    }

    fn take(&self, host: &str, rate: Rate) -> Result<(), UserError> {
        let mut buckets = self.buckets.lock().expect("buckets");
        let now = Instant::now();
        let capacity = f64::from(rate.capacity.max(1));
        let bucket = buckets.entry(host.to_string()).or_insert(Bucket {
            tokens: capacity,
            last: now,
        });
        let refill =
            now.duration_since(bucket.last).as_secs_f64() * capacity / rate.per_secs.max(1) as f64;
        bucket.tokens = (bucket.tokens + refill).min(capacity);
        bucket.last = now;
        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            Ok(())
        } else {
            Err(UserError::rate_limited())
        }
    }

    fn note(
        &self,
        action: &str,
        source: &str,
        host: &str,
        item: Option<&str>,
        result: &Result<Vec<u8>, UserError>,
    ) {
        let mut entry = Entry::network(action, source, host, item);
        match result {
            Ok(bytes) => entry.bytes = Some(bytes.len() as u64),
            Err(err) => {
                entry.result = "error".into();
                entry.code = Some(err.code().into());
            }
        }
        self.log.append(&entry);
    }
}

/// FNV-1a over the URL and its query, so the cache file name never holds a
/// search word or a key.
fn cache_key(url: &str, query: &[(String, String)]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    let mut eat = |bytes: &[u8]| {
        for byte in bytes {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x0100_0000_01b3);
        }
    };
    eat(url.as_bytes());
    for (key, value) in query {
        eat(b"&");
        eat(key.as_bytes());
        eat(b"=");
        eat(value.as_bytes());
    }
    hash
}

fn fresh(path: &Path) -> bool {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
        .is_some_and(|age| age < CACHE_TTL)
}

fn read_fresh(path: &Path) -> Option<Vec<u8>> {
    if fresh(path) {
        fs::read(path).ok()
    } else {
        None
    }
}

fn prune_cache(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && !fresh(&path) {
            let _ = fs::remove_file(path);
        }
    }
}

#[cfg(test)]
pub mod testing {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// Answers each URL from a table of recorded bodies; anything else fails
    /// as offline. Counts every request so tests can prove the cache works.
    pub struct Fixtures {
        pub hits: AtomicUsize,
        pub bodies: Vec<(&'static str, Vec<u8>)>,
    }

    impl Fixtures {
        pub fn new(bodies: Vec<(&'static str, Vec<u8>)>) -> Arc<Self> {
            Arc::new(Self {
                hits: AtomicUsize::new(0),
                bodies,
            })
        }

        pub fn hits(&self) -> usize {
            self.hits.load(Ordering::Relaxed)
        }
    }

    impl Transport for Fixtures {
        fn get<'a>(
            &'a self,
            url: &'a str,
            _query: &'a [(String, String)],
        ) -> BoxFuture<'a, Result<Vec<u8>, UserError>> {
            self.hits.fetch_add(1, Ordering::Relaxed);
            let body = self
                .bodies
                .iter()
                .find(|(prefix, _)| url.starts_with(prefix))
                .map(|(_, body)| body.clone());
            Box::pin(async move {
                host_allowed(url)?;
                body.ok_or_else(UserError::offline)
            })
        }
    }

    pub fn scratch(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "spiral-net-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }
}

#[cfg(test)]
mod tests {
    use super::testing::{scratch, Fixtures};
    use super::*;

    #[test]
    fn rejects_non_https_and_foreign_hosts() {
        assert!(host_allowed("http://wallhaven.cc/a.jpg").is_err());
        assert!(host_allowed("https://evil.example/a.jpg").is_err());
        assert!(host_allowed("https://wallhaven.cc.evil/a.jpg").is_err());
        assert!(host_allowed("https://images.pexels.com/a.jpg").is_err());
        assert!(host_allowed("https://notbing.com/a.jpg").is_err());
    }

    #[test]
    fn accepts_wallhaven_hosts() {
        assert!(host_allowed("https://wallhaven.cc/w/abc").is_ok());
        assert!(host_allowed("https://w.wallhaven.cc/full/ab/wallhaven-abc.jpg").is_ok());
        assert!(host_allowed("https://th.wallhaven.cc/small/ab/abc.jpg").is_ok());
    }

    #[test]
    fn accepts_every_shipped_source_host() {
        for url in [
            "https://images-api.nasa.gov/search",
            "https://images-assets.nasa.gov/image/a/a~orig.jpg",
            "https://cdn.esawebb.org/archives/images/screen/a.jpg",
            "https://esahubble.org/images/",
            "https://commons.wikimedia.org/w/api.php",
            "https://upload.wikimedia.org/a.jpg",
            "https://api.artic.edu/api/v1/artworks/search",
            "https://www.artic.edu/iiif/2/a/full/843,/0/default.jpg",
            "https://openaccess-cdn.clevelandart.org/a.jpg",
            "https://www.bing.com/HPImageArchive.aspx",
            "https://api.si.edu/openaccess/api/v1.0/search",
            "https://ids.si.edu/ids/deliveryService",
            "https://data.rijksmuseum.nl/search/collection",
            "https://iiif.micr.io/a/info.json",
        ] {
            assert!(host_allowed(url).is_ok(), "{url}");
        }
    }

    #[tokio::test]
    async fn an_api_answer_is_cached_for_a_day_and_logged_once() {
        let dir = scratch("cache");
        let fixtures = Fixtures::new(vec![("https://images-api.nasa.gov/", b"{}".to_vec())]);
        let net = Net::new(fixtures.clone(), &dir);
        let query = vec![("q".to_string(), "nebula".to_string())];
        for _ in 0..3 {
            let body = net
                .api(Call {
                    source: "nasa",
                    url: "https://images-api.nasa.gov/search",
                    query: &query,
                    rate: Rate::per_minute(30),
                    action: "search",
                })
                .await
                .unwrap();
            assert_eq!(body, b"{}");
        }
        assert_eq!(fixtures.hits(), 1);
        let log = net.activity().list(10);
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].host.as_deref(), Some("images-api.nasa.gov"));
        assert_eq!(log[0].bytes, Some(2));
        let names: Vec<_> = fs::read_dir(dir.join("source-cache"))
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(names.iter().all(|name| !name.contains("nebula")));
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn an_empty_bucket_refuses_without_a_request() {
        let dir = scratch("bucket");
        let fixtures = Fixtures::new(vec![("https://www.bing.com/", b"{}".to_vec())]);
        let net = Net::new(fixtures.clone(), &dir);
        let rate = Rate {
            capacity: 2,
            per_secs: 86_400,
        };
        for page in 0..3 {
            let query = vec![("idx".to_string(), page.to_string())];
            let result = net
                .api(Call {
                    source: "bing",
                    url: "https://www.bing.com/HPImageArchive.aspx",
                    query: &query,
                    rate,
                    action: "search",
                })
                .await;
            if page < 2 {
                assert!(result.is_ok());
            } else {
                assert_eq!(result.unwrap_err().code(), "rate_limited");
            }
        }
        assert_eq!(fixtures.hits(), 2);
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn a_failed_request_is_logged_with_its_code_and_not_cached() {
        let dir = scratch("fail");
        let fixtures = Fixtures::new(Vec::new());
        let net = Net::new(fixtures.clone(), &dir);
        for _ in 0..2 {
            let err = net
                .api(Call {
                    source: "aic",
                    url: "https://api.artic.edu/api/v1/artworks/search",
                    query: &[],
                    rate: Rate::per_minute(30),
                    action: "search",
                })
                .await
                .unwrap_err();
            assert_eq!(err.code(), "offline");
        }
        assert_eq!(fixtures.hits(), 2);
        let log = net.activity().list(10);
        assert_eq!(log[0].result, "error");
        assert_eq!(log[0].code.as_deref(), Some("offline"));
        let _ = fs::remove_dir_all(dir);
    }
}
