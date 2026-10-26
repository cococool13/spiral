//! Still sources behind one trait (spec §7). Each adapter owns a prefix, its
//! hosts, an API budget, a licence note and a credit line. Parsing is pure and
//! tested against recorded answers in `fixtures/`; the network goes through
//! `Net`, never the webview.

pub mod aic;
pub mod bing;
pub mod cleveland;
pub mod commons;
pub mod esa;
pub mod nasa;
pub mod rijks;
pub mod smithsonian;
pub mod wallhaven;

use std::sync::Arc;

use serde::Serialize;
use tokio::task::JoinSet;

use super::model::{
    Credit, DisplaySize, ResolvedSearch, StoredItem, StoredPage, UserError, WallId,
};
use super::net::{https_host, BoxFuture, Call, Net, Rate};

#[derive(Debug)]
pub struct HostRule {
    pub host: &'static str,
    pub subdomains: bool,
}

impl HostRule {
    pub const fn exact(host: &'static str) -> Self {
        Self {
            host,
            subdomains: false,
        }
    }

    pub fn matches(&self, host: &str) -> bool {
        host == self.host
            || (self.subdomains
                && host
                    .strip_suffix(self.host)
                    .is_some_and(|rest| rest.ends_with('.')))
    }
}

#[derive(Debug)]
pub struct SourceMeta {
    pub id: &'static str,
    pub prefix: char,
    pub name: &'static str,
    /// The source filter chip this source sits under.
    pub group: &'static str,
    pub hosts: &'static [HostRule],
    pub rate: Rate,
    pub licence: &'static str,
    /// The source works without a key, and a person may add their own.
    pub optional_key: bool,
}

impl SourceMeta {
    pub fn call<'a>(
        &'static self,
        url: &'a str,
        query: &'a [(String, String)],
        action: &'static str,
    ) -> Call<'a> {
        Call {
            source: self.id,
            url,
            query,
            rate: self.rate,
            action,
        }
    }

    /// The URL, if it is https and on one of this source's own hosts.
    pub fn own(&self, url: &str) -> Option<String> {
        let host = https_host(url)?;
        self.hosts
            .iter()
            .any(|rule| rule.matches(&host))
            .then(|| url.to_string())
    }
}

pub static METAS: [&SourceMeta; 9] = [
    &wallhaven::META,
    &nasa::META,
    &esa::META,
    &commons::META,
    &aic::META,
    &cleveland::META,
    &bing::META,
    &smithsonian::META,
    &rijks::META,
];

pub fn all_hosts() -> impl Iterator<Item = &'static HostRule> {
    METAS.iter().flat_map(|meta| meta.hosts.iter())
}

pub fn id_for_prefix(prefix: char) -> Option<&'static str> {
    METAS
        .iter()
        .find(|meta| meta.prefix == prefix)
        .map(|meta| meta.id)
}

pub trait Source: Send + Sync {
    fn meta(&self) -> &'static SourceMeta;

    /// One page of items, already filtered to landscape pictures at or above
    /// `q.floor()` (Wallhaven filters server side).
    fn search<'a>(
        &'a self,
        q: &'a ResolvedSearch,
        net: &'a Arc<Net>,
    ) -> BoxFuture<'a, Result<StoredPage, UserError>>;

    /// The credit to show in quick look and the activity log. Most sources
    /// know it from the search answer; ESA's lives on the image's own page.
    fn credit<'a>(
        &'a self,
        item: &'a StoredItem,
        _net: &'a Arc<Net>,
    ) -> BoxFuture<'a, Option<Credit>> {
        let credit = item.credit.clone();
        Box::pin(async move { credit })
    }
}

/// What the UI needs to name a source and say what it will do before the
/// first request.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub id: &'static str,
    pub prefix: String,
    pub name: &'static str,
    pub group: &'static str,
    pub licence: &'static str,
    pub hosts: Vec<&'static str>,
    pub optional_key: bool,
    pub keyed: bool,
}

pub struct Registry {
    sources: Vec<Arc<dyn Source>>,
    smithsonian: Arc<smithsonian::Smithsonian>,
}

impl Registry {
    pub fn new(smithsonian_key: Option<String>) -> Self {
        let smithsonian = Arc::new(smithsonian::Smithsonian::new(smithsonian_key));
        let sources: Vec<Arc<dyn Source>> = vec![
            Arc::new(wallhaven::Wallhaven),
            Arc::new(nasa::Nasa),
            Arc::new(esa::Esa),
            Arc::new(commons::Commons),
            Arc::new(aic::Aic),
            Arc::new(cleveland::Cleveland),
            Arc::new(bing::Bing),
            smithsonian.clone(),
            Arc::new(rijks::Rijks::default()),
        ];
        Self {
            sources,
            smithsonian,
        }
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn Source>> {
        self.sources
            .iter()
            .find(|source| source.meta().id == id)
            .cloned()
    }

    pub fn for_item(&self, id: &WallId) -> Option<Arc<dyn Source>> {
        let prefix = id.as_str().chars().next()?;
        self.sources
            .iter()
            .find(|source| source.meta().prefix == prefix)
            .cloned()
    }

    pub fn set_smithsonian_key(&self, key: Option<String>) {
        self.smithsonian.set_key(key);
    }

    pub fn info(&self) -> Vec<SourceInfo> {
        self.sources
            .iter()
            .map(|source| {
                let meta = source.meta();
                SourceInfo {
                    id: meta.id,
                    prefix: meta.prefix.to_string(),
                    name: meta.name,
                    group: meta.group,
                    licence: meta.licence,
                    hosts: meta.hosts.iter().map(|rule| rule.host).collect(),
                    optional_key: meta.optional_key,
                    keyed: meta.id == "smithsonian" && self.smithsonian.keyed(),
                }
            })
            .collect()
    }
}

/// Runs one search across every source behind the filter, at the same time,
/// and interleaves the pages. One source failing does not hide the others; it
/// is named in `unavailable`.
pub async fn search(
    registry: &Registry,
    q: &ResolvedSearch,
    net: &Arc<Net>,
) -> Result<StoredPage, UserError> {
    let members = q.query.source.members();
    if let [only] = members {
        let source = registry.get(only).ok_or_else(UserError::bad)?;
        return source.search(q, net).await.map_err(|err| plain(only, err));
    }
    let mut set = JoinSet::new();
    for (index, id) in members.iter().enumerate() {
        let Some(source) = registry.get(id) else {
            continue;
        };
        let net = Arc::clone(net);
        let q = q.clone();
        set.spawn(async move {
            let result = source.search(&q, &net).await;
            (index, source.meta().id, result)
        });
    }
    let mut answers = Vec::new();
    while let Some(joined) = set.join_next().await {
        if let Ok(answer) = joined {
            answers.push(answer);
        }
    }
    answers.sort_by_key(|(index, _, _)| *index);
    let mut pages = Vec::new();
    let mut unavailable = Vec::new();
    let mut first_error = None;
    for (_, id, result) in answers {
        match result {
            Ok(page) => pages.push(page),
            Err(err) => {
                unavailable.push(id);
                first_error.get_or_insert_with(|| plain(id, err));
            }
        }
    }
    if pages.is_empty() {
        return Err(first_error.unwrap_or_else(UserError::unavailable));
    }
    let mut merged = StoredPage::new(
        q.query.page,
        pages
            .iter()
            .map(|page| page.last_page)
            .max()
            .unwrap_or(q.query.page),
        interleave(pages.into_iter().map(|page| page.items).collect()),
    );
    merged.unavailable = unavailable;
    Ok(merged)
}

/// Wallhaven keeps its own codes (the UI names it); any other source that
/// answers oddly is `source_unavailable`.
fn plain(id: &str, err: UserError) -> UserError {
    match err.code() {
        "download_failed" | "bad_response" if id == "wallhaven" => UserError::bad(),
        "download_failed" | "bad_response" => UserError::unavailable(),
        _ => err,
    }
}

pub fn interleave(lists: Vec<Vec<StoredItem>>) -> Vec<StoredItem> {
    let mut iters: Vec<_> = lists.into_iter().map(Vec::into_iter).collect();
    let mut out = Vec::new();
    loop {
        let before = out.len();
        for iter in &mut iters {
            if let Some(item) = iter.next() {
                out.push(item);
            }
        }
        if out.len() == before {
            return out;
        }
    }
}

/// Landscape (at least 5:4) and at or above the floor on both edges.
pub fn grade(width: u32, height: u32, floor: DisplaySize) -> bool {
    width >= floor.width && height >= floor.height && u64::from(width) * 4 >= u64::from(height) * 5
}

/// The size a capped rendition comes out at: width at most `max`, same shape.
pub fn capped(width: u32, height: u32, max: u32) -> (u32, u32) {
    if width <= max || width == 0 {
        (width, height)
    } else {
        (
            max,
            (u64::from(height) * u64::from(max) / u64::from(width)) as u32,
        )
    }
}

pub fn resolution(width: u32, height: u32) -> String {
    format!("{width}x{height}")
}

pub fn pages(total: u64, per_page: u64) -> u32 {
    total.div_ceil(per_page.max(1)).clamp(1, 500) as u32
}

/// A URL without its query string (Wikimedia adds tracking parameters).
pub fn bare(url: &str) -> &str {
    url.split(['?', '#']).next().unwrap_or(url)
}

/// `https://a.b/c` → `a.b/c`, for a place a person can read and type.
pub fn readable(url: &str) -> String {
    bare(url)
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_start_matches("www.")
        .trim_end_matches('/')
        .to_string()
}

/// Plain text from a short HTML fragment: tags dropped, entities decoded,
/// whitespace collapsed, at most `max` characters.
pub fn plain_text(html: &str, max: usize) -> String {
    let mut text = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => {
                in_tag = false;
                text.push(' ');
            }
            _ if !in_tag => text.push(c),
            _ => {}
        }
    }
    let decoded = decode_entities(&text);
    let collapsed = decoded.split_whitespace().collect::<Vec<_>>().join(" ");
    let collapsed = collapsed.replace(" ,", ",").replace(" .", ".");
    if collapsed.chars().count() > max {
        let mut cut: String = collapsed.chars().take(max.saturating_sub(1)).collect();
        cut.push('…');
        cut
    } else {
        collapsed
    }
}

pub fn decode_entities(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find('&') {
        out.push_str(&rest[..start]);
        let tail = &rest[start..];
        let Some(end) = tail[..tail.len().min(12)].find(';') else {
            out.push('&');
            rest = &tail[1..];
            continue;
        };
        let name = &tail[1..end];
        let decoded = match name {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "nbsp" => Some(' '),
            _ => name
                .strip_prefix("#x")
                .or_else(|| name.strip_prefix("#X"))
                .and_then(|hex| u32::from_str_radix(hex, 16).ok())
                .or_else(|| name.strip_prefix('#').and_then(|dec| dec.parse().ok()))
                .and_then(char::from_u32),
        };
        match decoded {
            Some(c) => {
                out.push(c);
                rest = &tail[end + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

pub fn safe_id(raw: &str) -> bool {
    !raw.is_empty()
        && raw.len() <= 90
        && raw
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

#[cfg(test)]
pub mod test_support {
    use std::sync::Arc;

    use super::super::model::{GalleryQuery, ResolvedSearch, SearchParams};
    use super::super::net::testing::{scratch, Fixtures};
    use super::super::net::Net;

    pub fn fixture(name: &str) -> Vec<u8> {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("src/wallpaper/sources/fixtures")
            .join(name);
        std::fs::read(&path).unwrap_or_else(|_| panic!("fixture {name}"))
    }

    pub fn query(source: &str, text: &str, page: u32) -> ResolvedSearch {
        let params = SearchParams {
            query: text.into(),
            categories: "111".into(),
            sorting: if text.is_empty() {
                "toplist"
            } else {
                "relevance"
            }
            .into(),
            page,
            source: Some(source.into()),
            ..Default::default()
        };
        ResolvedSearch::from_query(GalleryQuery::parse(&params).unwrap(), None)
    }

    pub fn net(
        name: &str,
        bodies: Vec<(&'static str, Vec<u8>)>,
    ) -> (Arc<Fixtures>, Arc<Net>, std::path::PathBuf) {
        let dir = scratch(name);
        let fixtures = Fixtures::new(bodies);
        let net = Arc::new(Net::new(fixtures.clone(), &dir));
        (fixtures, net, dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn every_source_has_its_own_prefix_and_id() {
        let prefixes: HashSet<_> = METAS.iter().map(|meta| meta.prefix).collect();
        let ids: HashSet<_> = METAS.iter().map(|meta| meta.id).collect();
        assert_eq!(prefixes.len(), METAS.len());
        assert_eq!(ids.len(), METAS.len());
        for meta in METAS {
            assert!(super::super::model::PREFIXES.contains(&meta.prefix));
            assert!(!meta.hosts.is_empty());
            assert!(!meta.licence.is_empty());
        }
    }

    #[test]
    fn a_subdomain_rule_does_not_match_a_lookalike() {
        let rule = HostRule {
            host: "wallhaven.cc",
            subdomains: true,
        };
        assert!(rule.matches("w.wallhaven.cc"));
        assert!(rule.matches("wallhaven.cc"));
        assert!(!rule.matches("evilwallhaven.cc"));
        assert!(!HostRule::exact("www.bing.com").matches("cdn.www.bing.com"));
    }

    #[test]
    fn grade_wants_landscape_at_or_above_the_floor() {
        let floor = super::super::model::WALLPAPER_GRADE;
        assert!(grade(3840, 2160, floor));
        assert!(grade(2560, 2048, floor));
        assert!(!grade(2400, 2400, floor));
        assert!(!grade(1600, 900, floor));
        assert!(!grade(1080, 1920, floor));
    }

    #[test]
    fn text_helpers_strip_markup_and_decode_entities() {
        assert_eq!(
            plain_text(
                r#"<a href="//x">Vyacheslav&nbsp;Argenberg</a>, <span>own&#39;s</span>"#,
                80
            ),
            "Vyacheslav Argenberg, own's"
        );
        assert_eq!(
            decode_entities("Hubble&#39;s &amp; Webb&#x27;s &bogus"),
            "Hubble's & Webb's &bogus"
        );
        assert_eq!(plain_text("abcdef", 4), "abc…");
        assert_eq!(readable("https://www.bing.com/a?b=c"), "bing.com/a");
        assert_eq!(bare("https://u.org/a.jpg?utm=1"), "https://u.org/a.jpg");
        assert_eq!(capped(8000, 4000, 4000), (4000, 2000));
        assert_eq!(pages(101, 50), 3);
    }

    #[test]
    fn interleave_takes_one_from_each_in_turn() {
        let item = |id: &str| StoredItem {
            id: WallId::parse(id).unwrap(),
            resolution: "1x1".into(),
            thumb_small: String::new(),
            thumb_large: String::new(),
            full: String::new(),
            title: None,
            credit: None,
        };
        let out = interleave(vec![
            vec![item("w-a"), item("w-b"), item("w-c")],
            vec![item("n-x")],
            vec![item("b-y"), item("b-z")],
        ]);
        let ids: Vec<_> = out.iter().map(|i| i.id.as_str().to_string()).collect();
        assert_eq!(ids, ["w-a", "n-x", "b-y", "w-b", "b-z", "w-c"]);
    }
}
