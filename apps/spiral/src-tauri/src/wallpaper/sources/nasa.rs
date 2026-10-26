//! NASA Image and Video Library (`images-api.nasa.gov`). No key. The search
//! answer carries the original's size, so the filter costs no extra request.

use std::sync::Arc;

use serde::Deserialize;

use super::super::model::{Credit, ResolvedSearch, StoredItem, StoredPage, UserError, WallId};
use super::super::net::{BoxFuture, Net, Rate};
use super::{grade, pages, plain_text, resolution, safe_id, HostRule, Source, SourceMeta};

const API: &str = "https://images-api.nasa.gov/search";
const PER_PAGE: u64 = 100;
pub const DEFAULT_QUERY: &str = "nebula";

pub static META: SourceMeta = SourceMeta {
    id: "nasa",
    prefix: 'n',
    name: "NASA",
    group: "space",
    hosts: &[
        HostRule::exact("images-api.nasa.gov"),
        HostRule::exact("images-assets.nasa.gov"),
    ],
    rate: Rate::per_minute(30),
    licence: "Public domain unless the credit names someone else. NASA does not endorse Spiral.",
    optional_key: false,
};

pub struct Nasa;

impl Source for Nasa {
    fn meta(&self) -> &'static SourceMeta {
        &META
    }

    fn search<'a>(
        &'a self,
        q: &'a ResolvedSearch,
        net: &'a Arc<Net>,
    ) -> BoxFuture<'a, Result<StoredPage, UserError>> {
        Box::pin(async move {
            let query = params(q);
            let bytes = net.api(META.call(API, &query, "search")).await?;
            parse(&bytes, q)
        })
    }
}

pub fn params(q: &ResolvedSearch) -> Vec<(String, String)> {
    let text = if q.query.query.is_empty() {
        DEFAULT_QUERY.to_string()
    } else {
        q.query.query.clone()
    };
    vec![
        ("q".into(), text),
        ("media_type".into(), "image".into()),
        ("page".into(), q.query.page.to_string()),
        ("page_size".into(), PER_PAGE.to_string()),
    ]
}

pub fn parse(bytes: &[u8], q: &ResolvedSearch) -> Result<StoredPage, UserError> {
    let api: Api = serde_json::from_slice(bytes).map_err(|_| UserError::bad())?;
    let floor = q.floor();
    let items = api
        .collection
        .items
        .into_iter()
        .filter_map(|entry| {
            let data = entry.data.into_iter().next()?;
            let original = entry.links.iter().find(|link| link.rel == "canonical")?;
            let (width, height) = (original.width?, original.height?);
            let lower = original.href.to_ascii_lowercase();
            if !grade(width, height, floor)
                || !(lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".png"))
                || !safe_id(&data.nasa_id)
            {
                return None;
            }
            let small = entry
                .links
                .iter()
                .find(|link| link.href.contains("~small") || link.rel == "preview")?;
            let large = entry
                .links
                .iter()
                .find(|link| link.href.contains("~large"))
                .or_else(|| {
                    entry
                        .links
                        .iter()
                        .find(|link| link.href.contains("~medium"))
                })
                .unwrap_or(small);
            let line = data
                .secondary_creator
                .or(data.photographer)
                .filter(|text| !text.trim().is_empty())
                .unwrap_or_else(|| format!("NASA/{}", data.center.as_deref().unwrap_or("HQ")));
            Some(StoredItem {
                id: WallId::make('n', &data.nasa_id)?,
                resolution: resolution(width, height),
                thumb_small: META.own(&small.href)?,
                thumb_large: META.own(&large.href)?,
                full: META.own(&original.href)?,
                title: Some(plain_text(&data.title, 120)),
                credit: Some(Credit {
                    line: plain_text(&line, 160),
                    licence: "Public domain (NASA)".into(),
                    page: Some(format!("images.nasa.gov/details/{}", data.nasa_id)),
                }),
            })
        })
        .collect();
    let total = api.collection.metadata.map_or(0, |meta| meta.total_hits);
    // NASA stops paging at 10 000 results.
    let last = pages(total.min(10_000), PER_PAGE);
    Ok(StoredPage::new(q.query.page, last, items))
}

#[derive(Deserialize)]
struct Api {
    collection: Collection,
}

#[derive(Deserialize)]
struct Collection {
    #[serde(default)]
    items: Vec<Entry>,
    metadata: Option<Metadata>,
}

#[derive(Deserialize)]
struct Metadata {
    total_hits: u64,
}

#[derive(Deserialize)]
struct Entry {
    #[serde(default)]
    data: Vec<Data>,
    #[serde(default)]
    links: Vec<Link>,
}

#[derive(Deserialize)]
struct Data {
    nasa_id: String,
    #[serde(default)]
    title: String,
    center: Option<String>,
    secondary_creator: Option<String>,
    photographer: Option<String>,
}

#[derive(Deserialize)]
struct Link {
    href: String,
    #[serde(default)]
    rel: String,
    width: Option<u32>,
    height: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{fixture, net, query};
    use super::*;

    #[test]
    fn only_landscape_originals_at_wallpaper_grade_survive() {
        let page = parse(&fixture("nasa_search.json"), &query("nasa", "nebula", 1)).unwrap();
        // Four results: 2800x1400 landscape, 1072x708 too small, one without a
        // size, one portrait. Only the first is a wallpaper.
        assert_eq!(page.items.len(), 1);
        let item = &page.items[0];
        assert_eq!(item.id.as_str(), "n-PIA14417");
        assert_eq!(item.resolution, "2800x1400");
        assert!(item.full.ends_with("PIA14417~orig.jpg"));
        assert!(item.thumb_small.contains("~small"));
        assert!(item.thumb_large.contains("~medium"));
        let credit = item.credit.as_ref().unwrap();
        assert_eq!(credit.line, "NASA/JPL-Caltech/Harvard-Smithsonian CfA");
        assert_eq!(page.last_page, 4);
    }

    #[test]
    fn an_empty_search_asks_for_the_default_subject() {
        let pairs = params(&query("nasa", "", 2));
        assert!(pairs.contains(&("q".into(), DEFAULT_QUERY.into())));
        assert!(pairs.contains(&("page".into(), "2".into())));
        assert!(pairs.contains(&("media_type".into(), "image".into())));
    }

    #[tokio::test]
    async fn search_logs_one_request() {
        let (fixtures, net, dir) = net("nasa", vec![(API, fixture("nasa_search.json"))]);
        let page = Nasa
            .search(&query("nasa", "nebula", 1), &net)
            .await
            .unwrap();
        assert_eq!(page.items.len(), 1);
        assert_eq!(fixtures.hits(), 1);
        assert_eq!(
            net.activity().list(5)[0].host.as_deref(),
            Some("images-api.nasa.gov")
        );
        let _ = std::fs::remove_dir_all(dir);
    }
}
