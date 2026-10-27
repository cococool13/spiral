//! Smithsonian Open Access (`api.si.edu`), CC0 images only.
//!
//! api.data.gov counts `DEMO_KEY` per client IP address (verified: the answer
//! carries `x-ratelimit-limit: 10`, an hourly budget for this address), so
//! the shared demo key is fair to use from each person's own app. A person
//! who wants more can paste their own free key in Settings; it stays on this
//! Mac and only goes to api.si.edu.

use std::sync::{Arc, Mutex};

use serde::Deserialize;
use serde_json::Value;

use super::super::model::{Credit, ResolvedSearch, StoredItem, StoredPage, UserError, WallId};
use super::super::net::{BoxFuture, Call, Net, Rate};
use super::{capped, grade, pages, plain_text, readable, resolution, HostRule, Source, SourceMeta};

const API: &str = "https://api.si.edu/openaccess/api/v1.0/search";
const IDS: &str = "https://ids.si.edu/ids/deliveryService";
const PER_PAGE: u64 = 40;
const FULL_MAX: u32 = 4000;
const DEMO_KEY: &str = "DEMO_KEY";
pub const DEFAULT_QUERY: &str = "landscape";

pub static META: SourceMeta = SourceMeta {
    id: "smithsonian",
    prefix: 's',
    name: "Smithsonian Open Access",
    group: "museums",
    hosts: &[HostRule::exact("api.si.edu"), HostRule::exact("ids.si.edu")],
    // DEMO_KEY: 10 requests an hour for this IP address.
    rate: Rate {
        capacity: 10,
        per_secs: 60 * 60,
    },
    licence: "CC0 images from Smithsonian Open Access.",
    optional_key: true,
};

const OWN_KEY_RATE: Rate = Rate::per_minute(30);

pub struct Smithsonian {
    key: Mutex<Option<String>>,
}

impl Smithsonian {
    pub fn new(key: Option<String>) -> Self {
        Self {
            key: Mutex::new(key.and_then(clean_key)),
        }
    }

    pub fn set_key(&self, key: Option<String>) {
        *self.key.lock().expect("key") = key.and_then(clean_key);
    }

    pub fn keyed(&self) -> bool {
        self.key.lock().expect("key").is_some()
    }
}

/// api.data.gov keys are 40 letters and digits. Anything else is refused
/// rather than sent.
pub fn clean_key(raw: String) -> Option<String> {
    let key = raw.trim().to_string();
    (key.len() >= 20 && key.len() <= 64 && key.chars().all(|c| c.is_ascii_alphanumeric()))
        .then_some(key)
}

impl Source for Smithsonian {
    fn meta(&self) -> &'static SourceMeta {
        &META
    }

    fn search<'a>(
        &'a self,
        q: &'a ResolvedSearch,
        net: &'a Arc<Net>,
    ) -> BoxFuture<'a, Result<StoredPage, UserError>> {
        Box::pin(async move {
            let own = self.key.lock().expect("key").clone();
            let rate = if own.is_some() {
                OWN_KEY_RATE
            } else {
                META.rate
            };
            let query = params(q, own.as_deref().unwrap_or(DEMO_KEY));
            let bytes = net
                .api(Call {
                    source: META.id,
                    url: API,
                    query: &query,
                    rate,
                    action: "search",
                })
                .await?;
            parse(&bytes, q)
        })
    }
}

pub fn params(q: &ResolvedSearch, key: &str) -> Vec<(String, String)> {
    let text = if q.query.query.is_empty() {
        DEFAULT_QUERY.to_string()
    } else {
        q.query.query.replace(['"', ':'], " ")
    };
    vec![
        (
            "q".into(),
            format!("{text} AND online_media_type:Images AND media_usage:CC0"),
        ),
        ("rows".into(), PER_PAGE.to_string()),
        (
            "start".into(),
            (u64::from(q.query.page - 1) * PER_PAGE).to_string(),
        ),
        ("api_key".into(), key.into()),
    ]
}

fn text_at<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut at = value;
    for key in path {
        at = at.get(key)?;
    }
    at.as_str()
}

pub fn parse(bytes: &[u8], q: &ResolvedSearch) -> Result<StoredPage, UserError> {
    let api: Api = serde_json::from_slice(bytes).map_err(|_| UserError::bad())?;
    let floor = q.floor();
    let items = api
        .response
        .rows
        .into_iter()
        .filter_map(|row| {
            let content = row.get("content")?;
            let dnr = content.get("descriptiveNonRepeating")?;
            let media = dnr.get("online_media")?.get("media")?.as_array()?;
            let (ids, width, height) = media.iter().find_map(|media| {
                let ids = media.get("idsId")?.as_str()?;
                let width = u32::try_from(media.get("width")?.as_u64()?).ok()?;
                let height = u32::try_from(media.get("height")?.as_u64()?).ok()?;
                let cc0 = text_at(media, &["usage", "access"]) == Some("CC0");
                let image = media.get("type").and_then(Value::as_str) == Some("Images");
                (cc0 && image).then_some((ids, width, height))
            })?;
            if ids.is_empty()
                || !ids
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
            {
                return None;
            }
            let (width, height) = capped(width, height, FULL_MAX);
            if !grade(width, height, floor) {
                return None;
            }
            let title = plain_text(
                row.get("title")
                    .and_then(Value::as_str)
                    .unwrap_or("Untitled"),
                120,
            );
            let maker = content
                .get("freetext")
                .and_then(|text| text.get("name"))
                .and_then(Value::as_array)
                .and_then(|names| names.first())
                .and_then(|name| name.get("content"))
                .and_then(Value::as_str)
                .map(|name| plain_text(name, 100))
                .unwrap_or_else(|| "Maker unknown".into());
            let mut line = format!("{maker}, {title}");
            if let Some(museum) = dnr.get("data_source").and_then(Value::as_str) {
                line.push_str(&format!(". {}", plain_text(museum, 80)));
            }
            Some(StoredItem {
                id: WallId::make('s', &ids.replace('.', "_"))?,
                resolution: resolution(width, height),
                thumb_small: META.own(&format!("{IDS}?id={ids}&max=640"))?,
                thumb_large: META.own(&format!("{IDS}?id={ids}&max=1600"))?,
                full: META.own(&format!("{IDS}?id={ids}&max={width}"))?,
                title: Some(title),
                credit: Some(Credit {
                    line,
                    licence: "CC0 · Smithsonian Open Access".into(),
                    page: dnr.get("record_link").and_then(Value::as_str).map(readable),
                }),
            })
        })
        .collect();
    Ok(StoredPage::new(
        q.query.page,
        pages(api.response.row_count, PER_PAGE),
        items,
    ))
}

#[derive(Deserialize)]
struct Api {
    response: Response,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    #[serde(default)]
    rows: Vec<Value>,
    #[serde(default)]
    row_count: u64,
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{fixture, net, query};
    use super::*;

    #[test]
    fn cc0_landscape_images_parse_with_safe_ids() {
        let page = parse(
            &fixture("smithsonian_search.json"),
            &query("smithsonian", "mountain", 1),
        )
        .unwrap();
        assert!(!page.items.is_empty());
        for item in &page.items {
            assert!(item.id.as_str().starts_with("s-"));
            assert!(!item.id.as_str().contains('.'));
            assert!(item
                .full
                .starts_with("https://ids.si.edu/ids/deliveryService?id="));
            let (w, h) = item.resolution.split_once('x').unwrap();
            assert!(w.parse::<u32>().unwrap() <= FULL_MAX);
            assert!(w.parse::<u32>().unwrap() > h.parse::<u32>().unwrap());
            assert!(item.credit.as_ref().unwrap().licence.starts_with("CC0"));
        }
        let saam = page
            .items
            .iter()
            .find(|item| item.id.as_str() == "s-SAAM-1947_13_10_1")
            .unwrap();
        assert!(saam.full.contains("id=SAAM-1947.13.10_1&max=3000"));
        assert_eq!(page.last_page, 500);
    }

    #[test]
    fn the_demo_key_is_used_until_a_valid_own_key_is_set() {
        let q = query("smithsonian", "", 1);
        assert!(params(&q, DEMO_KEY).contains(&("api_key".into(), DEMO_KEY.into())));
        let source = Smithsonian::new(None);
        assert!(!source.keyed());
        source.set_key(Some("not a key".into()));
        assert!(!source.keyed());
        source.set_key(Some("  abcdefghijklmnopqrstuvwxyz0123456789ABCD  ".into()));
        assert!(source.keyed());
        source.set_key(None);
        assert!(!source.keyed());
    }

    #[tokio::test]
    async fn the_key_never_reaches_the_activity_log() {
        let (fixtures, net, dir) = net("si", vec![(API, fixture("smithsonian_search.json"))]);
        let source = Smithsonian::new(Some("abcdefghijklmnopqrstuvwxyz0123456789ABCD".into()));
        source
            .search(&query("smithsonian", "", 1), &net)
            .await
            .unwrap();
        assert_eq!(fixtures.hits(), 1);
        let log = std::fs::read_to_string(dir.join("activity.jsonl")).unwrap();
        assert!(!log.contains("abcdefghij"));
        assert!(log.contains("api.si.edu"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
