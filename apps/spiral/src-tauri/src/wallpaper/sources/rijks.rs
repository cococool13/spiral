//! Rijksmuseum through its new open APIs: `data.rijksmuseum.nl` search returns
//! Linked Art object ids, each object (`id.rijksmuseum.nl`) names its licence
//! and IIIF image (`iiif.micr.io`), and the IIIF `info.json` gives the pixel
//! size. No key. Public-domain images only. A page costs one search plus one
//! request per object and per image size, all cached for a day.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tokio::task::JoinSet;

use super::super::model::{Credit, ResolvedSearch, StoredItem, StoredPage, UserError, WallId};
use super::super::net::{BoxFuture, Call, Net, Rate};
use super::{capped, grade, pages, plain_text, readable, resolution, HostRule, Source, SourceMeta};

const SEARCH: &str = "https://data.rijksmuseum.nl/search/collection";
const API_PAGE: usize = 100;
const PER_PAGE: usize = 20;
/// Wider renders were refused (HTTP 400) for some images; 4096 always worked.
const FULL_MAX: u32 = 4096;
const OBJECT_RATE: Rate = Rate::per_minute(120);
const ENGLISH: &str = "http://vocab.getty.edu/aat/300388277";

pub static META: SourceMeta = SourceMeta {
    id: "rijks",
    prefix: 'r',
    name: "Rijksmuseum",
    group: "museums",
    hosts: &[
        HostRule::exact("data.rijksmuseum.nl"),
        HostRule::exact("id.rijksmuseum.nl"),
        HostRule::exact("iiif.micr.io"),
    ],
    rate: Rate::per_minute(30),
    licence: "Public-domain paintings from the Rijksmuseum.",
    optional_key: false,
};

/// Search pages chain by `pageToken`, so the tokens seen so far are kept per
/// search text: `tokens[k]` opens API page `k`.
#[derive(Default)]
pub struct Rijks {
    tokens: Mutex<HashMap<String, Vec<String>>>,
}

pub struct Found {
    pub ids: Vec<String>,
    pub next: Option<String>,
    pub total: u64,
}

/// An object that passed the licence check, waiting for its pixel size.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Candidate {
    pub number: String,
    pub iiif: String,
    pub title: String,
    pub maker: Option<String>,
    pub page: Option<String>,
}

impl Source for Rijks {
    fn meta(&self) -> &'static SourceMeta {
        &META
    }

    fn search<'a>(
        &'a self,
        q: &'a ResolvedSearch,
        net: &'a Arc<Net>,
    ) -> BoxFuture<'a, Result<StoredPage, UserError>> {
        Box::pin(async move {
            let index = (q.query.page as usize - 1) * PER_PAGE;
            let api_page = index / API_PAGE;
            let found = self.api_page(&q.query.query, api_page, net).await?;
            let slice: Vec<String> = found
                .ids
                .iter()
                .skip(index % API_PAGE)
                .take(PER_PAGE)
                .cloned()
                .collect();
            let candidates = fetch_all(net, slice, |net, url| async move {
                let bytes = net
                    .api(Call {
                        source: META.id,
                        url: &url,
                        query: &[],
                        rate: OBJECT_RATE,
                        action: "search",
                    })
                    .await
                    .ok()?;
                candidate(&bytes)
            })
            .await;
            let sized = fetch_all(net, candidates, |net, candidate| async move {
                let url = format!("{}/info.json", candidate.iiif);
                let bytes = net
                    .api(Call {
                        source: META.id,
                        url: &url,
                        query: &[],
                        rate: OBJECT_RATE,
                        action: "search",
                    })
                    .await
                    .ok()?;
                Some((candidate, size(&bytes)?))
            })
            .await;
            let floor = q.floor();
            let items = sized
                .into_iter()
                .filter_map(|(candidate, (width, height))| item(candidate, width, height, floor))
                .collect();
            Ok(StoredPage::new(
                q.query.page,
                pages(found.total, PER_PAGE as u64),
                items,
            ))
        })
    }
}

impl Rijks {
    async fn api_page(&self, text: &str, want: usize, net: &Arc<Net>) -> Result<Found, UserError> {
        let mut page = 0;
        let mut token: Option<String> = None;
        {
            let tokens = self.tokens.lock().expect("tokens");
            if let Some(known) = tokens.get(text) {
                let reach = want.min(known.len());
                if reach > 0 {
                    page = reach;
                    token = Some(known[reach - 1].clone());
                }
            }
        }
        loop {
            let query = params(text, token.as_deref());
            let bytes = net.api(META.call(SEARCH, &query, "search")).await?;
            let found = parse_search(&bytes)?;
            if page == want {
                return Ok(found);
            }
            let next = found
                .next
                .ok_or_else(|| UserError::new("source_unavailable"))?;
            {
                let mut tokens = self.tokens.lock().expect("tokens");
                let known = tokens.entry(text.to_string()).or_default();
                if known.len() == page {
                    known.push(next.clone());
                }
            }
            token = Some(next);
            page += 1;
        }
    }
}

async fn fetch_all<T, U, F, Fut>(net: &Arc<Net>, inputs: Vec<T>, job: F) -> Vec<U>
where
    T: Send + 'static,
    U: Send + 'static,
    F: Fn(Arc<Net>, T) -> Fut,
    Fut: std::future::Future<Output = Option<U>> + Send + 'static,
{
    let mut set = JoinSet::new();
    for (index, input) in inputs.into_iter().enumerate() {
        let fut = job(Arc::clone(net), input);
        set.spawn(async move { (index, fut.await) });
    }
    let mut out = Vec::new();
    while let Some(joined) = set.join_next().await {
        if let Ok((index, Some(value))) = joined {
            out.push((index, value));
        }
    }
    out.sort_by_key(|(index, _)| *index);
    out.into_iter().map(|(_, value)| value).collect()
}

pub fn params(text: &str, token: Option<&str>) -> Vec<(String, String)> {
    let mut pairs: Vec<(String, String)> = vec![
        ("type".into(), "painting".into()),
        ("imageAvailable".into(), "true".into()),
    ];
    if !text.is_empty() {
        pairs.push(("title".into(), text.into()));
    }
    if let Some(token) = token {
        pairs.push(("pageToken".into(), token.into()));
    }
    pairs
}

pub fn parse_search(bytes: &[u8]) -> Result<Found, UserError> {
    let api: Value = serde_json::from_slice(bytes).map_err(|_| UserError::bad())?;
    let ids = api
        .get("orderedItems")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("id")?.as_str())
                .filter(|id| {
                    id.strip_prefix("https://id.rijksmuseum.nl/")
                        .is_some_and(|rest| {
                            !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())
                        })
                })
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let next = api
        .get("next")
        .and_then(|next| next.get("id"))
        .and_then(Value::as_str)
        .and_then(|url| reqwest::Url::parse(url).ok())
        .and_then(|url| {
            url.query_pairs()
                .find(|(key, _)| key == "pageToken")
                .map(|(_, value)| value.into_owned())
        });
    let total = api
        .get("partOf")
        .and_then(|part| part.get("totalItems"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    Ok(Found { ids, next, total })
}

fn english(value: &Value) -> bool {
    value
        .get("language")
        .and_then(Value::as_array)
        .is_some_and(|langs| {
            langs
                .iter()
                .any(|lang| lang.get("id").and_then(Value::as_str) == Some(ENGLISH))
        })
}

fn array<'a>(value: &'a Value, key: &str) -> impl Iterator<Item = &'a Value> {
    value
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
}

/// The licence, IIIF image, title and maker from one Linked Art object, or
/// nothing when the image is not public domain.
pub fn candidate(bytes: &[u8]) -> Option<Candidate> {
    let object: Value = serde_json::from_slice(bytes).ok()?;
    let mut iiif = None;
    let mut public = false;
    let mut page = None;
    for subject in array(&object, "subject_of") {
        for carrier in array(subject, "digitally_carried_by") {
            let licensed = array(carrier, "referred_to_by").any(|text| {
                text.get("content")
                    .and_then(Value::as_str)
                    .is_some_and(|content| content.contains("creativecommons.org/publicdomain/"))
            });
            for point in array(carrier, "access_point") {
                let Some(url) = point.get("id").and_then(Value::as_str) else {
                    continue;
                };
                if let Some(rest) = url.strip_prefix("https://iiif.micr.io/") {
                    let name = rest.split('/').next().unwrap_or("");
                    if !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric()) {
                        iiif = Some(format!("https://iiif.micr.io/{name}"));
                        public |= licensed;
                    }
                } else if url.starts_with("https://www.rijksmuseum.nl/") {
                    page = Some(readable(url));
                }
            }
        }
    }
    if !public {
        return None;
    }
    let names: Vec<&Value> = array(&object, "identified_by").collect();
    let number = names
        .iter()
        .find(|name| name.get("type").and_then(Value::as_str) == Some("Identifier"))
        .and_then(|name| name.get("content")?.as_str())?
        .to_string();
    let title = names
        .iter()
        .filter(|name| name.get("type").and_then(Value::as_str) == Some("Name"))
        .find(|name| english(name))
        .or_else(|| {
            names
                .iter()
                .find(|name| name.get("type").and_then(Value::as_str) == Some("Name"))
        })
        .and_then(|name| name.get("content")?.as_str())
        .map(|title| plain_text(title, 120))
        .unwrap_or_else(|| "Untitled".into());
    let maker = object.get("produced_by").and_then(|produced| {
        array(produced, "part")
            .flat_map(|part| array(part, "referred_to_by"))
            .chain(array(produced, "referred_to_by"))
            .filter(|text| english(text))
            .find_map(|text| text.get("content")?.as_str())
            .map(|line| {
                let name = line.split_once(": ").map_or(line, |(_, name)| name);
                let name = name.split(" (").next().unwrap_or(name);
                plain_text(name.split(", ").next().unwrap_or(name), 80)
            })
    });
    Some(Candidate {
        number,
        iiif: iiif?,
        title,
        maker,
        page,
    })
}

pub fn size(bytes: &[u8]) -> Option<(u32, u32)> {
    let info: Value = serde_json::from_slice(bytes).ok()?;
    let width = u32::try_from(info.get("width")?.as_u64()?).ok()?;
    let height = u32::try_from(info.get("height")?.as_u64()?).ok()?;
    Some((width, height))
}

pub fn item(
    candidate: Candidate,
    width: u32,
    height: u32,
    floor: super::super::model::DisplaySize,
) -> Option<StoredItem> {
    let (width, height) = capped(width, height, FULL_MAX);
    if !grade(width, height, floor) {
        return None;
    }
    let base = &candidate.iiif;
    let rest = candidate
        .number
        .replace(|c: char| !c.is_ascii_alphanumeric() && c != '-', "_");
    Some(StoredItem {
        id: WallId::make('r', &rest)?,
        resolution: resolution(width, height),
        thumb_small: META.own(&format!("{base}/full/640,/0/default.jpg"))?,
        thumb_large: META.own(&format!("{base}/full/1600,/0/default.jpg"))?,
        full: META.own(&format!("{base}/full/{width},/0/default.jpg"))?,
        credit: Some(Credit {
            line: format!(
                "{}, {}",
                candidate.maker.as_deref().unwrap_or("Artist unknown"),
                candidate.title
            ),
            licence: "Public domain · Rijksmuseum".into(),
            page: candidate.page,
        }),
        title: Some(candidate.title),
    })
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{fixture, net, query};
    use super::*;
    use crate::wallpaper::model::WALLPAPER_GRADE;

    #[test]
    fn search_ids_the_next_token_and_the_total_parse() {
        let found = parse_search(&fixture("rijks_search.json")).unwrap();
        assert_eq!(found.ids.len(), 3);
        assert_eq!(found.ids[0], "https://id.rijksmuseum.nl/20010092");
        assert!(found.next.as_deref().unwrap().starts_with("eyJ0b2tlbiI6"));
        assert_eq!(found.total, 348);
    }

    #[test]
    fn a_public_domain_object_names_its_image_title_and_maker() {
        let candidate = candidate(&fixture("rijks_object.json")).unwrap();
        assert_eq!(candidate.number, "AK-MAK-1830");
        assert_eq!(candidate.iiif, "https://iiif.micr.io/tvgDM");
        assert_eq!(candidate.title, "Landscape in China");
        assert_eq!(candidate.maker.as_deref(), Some("Hashimoto Kansetsu"));
        assert!(candidate
            .page
            .as_deref()
            .unwrap()
            .starts_with("rijksmuseum.nl/"));
    }

    #[test]
    fn an_object_without_a_public_domain_mark_is_skipped() {
        let text = String::from_utf8(fixture("rijks_object.json")).unwrap();
        let closed = text.replace("creativecommons.org/publicdomain/", "example.org/rights/");
        assert!(candidate(closed.as_bytes()).is_none());
    }

    #[test]
    fn the_image_size_decides_and_the_full_render_is_capped() {
        let candidate = candidate(&fixture("rijks_object.json")).unwrap();
        // The recorded scroll is 6032x12553: portrait, so not a wallpaper.
        assert_eq!(size(&fixture("rijks_info.json")), Some((6032, 12553)));
        assert!(item(candidate.clone(), 6032, 12553, WALLPAPER_GRADE).is_none());
        let wide = item(candidate, 12553, 6032, WALLPAPER_GRADE).unwrap();
        assert_eq!(wide.id.as_str(), "r-AK-MAK-1830");
        assert_eq!(wide.resolution, "4096x1968");
        assert_eq!(
            wide.full,
            "https://iiif.micr.io/tvgDM/full/4096,/0/default.jpg"
        );
        assert_eq!(
            wide.credit.unwrap().line,
            "Hashimoto Kansetsu, Landscape in China"
        );
    }

    #[tokio::test]
    async fn a_page_asks_search_then_each_object_then_each_image_size() {
        let (fixtures, net, dir) = net(
            "rijks",
            vec![
                (SEARCH, fixture("rijks_search.json")),
                ("https://id.rijksmuseum.nl/", fixture("rijks_object.json")),
                ("https://iiif.micr.io/", fixture("rijks_info.json")),
            ],
        );
        let page = Rijks::default()
            .search(&query("rijks", "", 1), &net)
            .await
            .unwrap();
        // Three objects (the same recorded one); the portrait scroll is dropped.
        assert!(page.items.is_empty());
        assert_eq!(page.last_page, 18);
        // 1 search + 3 objects + 1 info (the three share one IIIF URL, cached).
        assert!(fixtures.hits() >= 5);
        let again = fixtures.hits();
        Rijks::default()
            .search(&query("rijks", "", 1), &net)
            .await
            .unwrap();
        assert_eq!(fixtures.hits(), again);
        let _ = std::fs::remove_dir_all(dir);
    }
}
