//! Wikimedia Commons featured pictures through the MediaWiki API. Every file
//! carries its own licence; Spiral shows it and skips anything non-free,
//! non-commercial or no-derivatives.

use std::collections::HashMap;
use std::sync::Arc;

use serde::Deserialize;

use super::super::model::{Credit, ResolvedSearch, StoredItem, StoredPage, UserError, WallId};
use super::super::net::{BoxFuture, Net, Rate};
use super::{bare, grade, plain_text, readable, resolution, HostRule, Source, SourceMeta};

const API: &str = "https://commons.wikimedia.org/w/api.php";
const PER_PAGE: u32 = 50;
const MAX_FILE: u64 = 40 * 1024 * 1024;

pub static META: SourceMeta = SourceMeta {
    id: "commons",
    prefix: 'c',
    name: "Wikimedia Commons",
    group: "commons",
    hosts: &[
        HostRule::exact("commons.wikimedia.org"),
        HostRule::exact("upload.wikimedia.org"),
        HostRule::exact("thumb.wikimedia.org"),
    ],
    rate: Rate::per_minute(30),
    licence: "Featured pictures under free licences. Each shows its own licence and author.",
    optional_key: false,
};

pub struct Commons;

impl Source for Commons {
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
    let floor = q.floor();
    let search = format!(
        "incategory:Featured_pictures_on_Wikimedia_Commons filew:>{} fileh:>{} {}",
        floor.width - 1,
        floor.height - 1,
        q.query.query
    );
    let mut pairs: Vec<(String, String)> = vec![
        ("action".into(), "query".into()),
        ("format".into(), "json".into()),
        ("formatversion".into(), "2".into()),
        ("generator".into(), "search".into()),
        ("gsrnamespace".into(), "6".into()),
        ("gsrsearch".into(), search.trim().to_string()),
        ("gsrlimit".into(), PER_PAGE.to_string()),
        (
            "gsroffset".into(),
            ((q.query.page - 1) * PER_PAGE).to_string(),
        ),
        ("prop".into(), "imageinfo".into()),
        ("iiprop".into(), "url|size|mime|extmetadata".into()),
        ("iiurlwidth".into(), "960".into()),
        (
            "iiextmetadatafilter".into(),
            "LicenseShortName|Artist|License|ObjectName".into(),
        ),
    ];
    if q.query.query.is_empty() {
        pairs.push(("gsrsort".into(), "create_timestamp_desc".into()));
    }
    pairs
}

/// Free licences only: CC BY, CC BY-SA, CC0 and public domain marks.
pub fn free(licence: &str) -> bool {
    let licence = licence.to_ascii_lowercase();
    let allowed = licence.starts_with("cc-by")
        || licence.starts_with("cc0")
        || licence.starts_with("pd")
        || licence.starts_with("public domain");
    allowed && !licence.contains("-nc") && !licence.contains("-nd")
}

pub fn parse(bytes: &[u8], q: &ResolvedSearch) -> Result<StoredPage, UserError> {
    let api: Api = serde_json::from_slice(bytes).map_err(|_| UserError::bad())?;
    let floor = q.floor();
    let mut pages = api.query.map(|query| query.pages).unwrap_or_default();
    pages.sort_by_key(|page| page.index);
    let items = pages
        .into_iter()
        .filter_map(|page| {
            let info = page.imageinfo.into_iter().next()?;
            let meta = |key: &str| {
                info.extmetadata
                    .get(key)
                    .map(|value| plain_text(&value.value, 200))
                    .unwrap_or_default()
            };
            let licence = meta("License");
            let short = meta("LicenseShortName");
            if !free(&licence)
                || !matches!(
                    info.mime.as_str(),
                    "image/jpeg" | "image/png" | "image/webp"
                )
                || info.size > MAX_FILE
                || !grade(info.width, info.height, floor)
            {
                return None;
            }
            let small = info.thumburl.as_deref()?;
            let large = info
                .responsive_urls
                .get("2")
                .map(String::as_str)
                .unwrap_or(small);
            let title = Some(meta("ObjectName"))
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| {
                    let name = page.title.trim_start_matches("File:");
                    name.rsplit_once('.')
                        .map_or(name, |(stem, _)| stem)
                        .to_string()
                });
            let artist = meta("Artist");
            Some(StoredItem {
                id: WallId::make('c', &page.pageid.to_string())?,
                resolution: resolution(info.width, info.height),
                thumb_small: META.own(bare(small))?,
                thumb_large: META.own(bare(large))?,
                full: META.own(bare(&info.url))?,
                title: Some(plain_text(&title, 120)),
                credit: Some(Credit {
                    line: if artist.is_empty() {
                        "Wikimedia Commons contributor".into()
                    } else {
                        artist
                    },
                    licence: if short.is_empty() { licence } else { short },
                    page: info.descriptionurl.as_deref().map(readable),
                }),
            })
        })
        .collect();
    let page = q.query.page;
    Ok(StoredPage::new(
        page,
        if api.continue_.is_some() {
            page + 1
        } else {
            page
        },
        items,
    ))
}

#[derive(Deserialize)]
struct Api {
    #[serde(rename = "continue")]
    continue_: Option<serde_json::Value>,
    query: Option<Query>,
}

#[derive(Deserialize)]
struct Query {
    #[serde(default)]
    pages: Vec<Page>,
}

#[derive(Deserialize)]
struct Page {
    pageid: u64,
    #[serde(default)]
    index: u32,
    #[serde(default)]
    title: String,
    #[serde(default)]
    imageinfo: Vec<Info>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Info {
    #[serde(default)]
    size: u64,
    #[serde(default)]
    width: u32,
    #[serde(default)]
    height: u32,
    thumburl: Option<String>,
    #[serde(default)]
    responsive_urls: HashMap<String, String>,
    url: String,
    descriptionurl: Option<String>,
    #[serde(default)]
    mime: String,
    #[serde(default)]
    extmetadata: HashMap<String, Meta>,
}

#[derive(Deserialize)]
struct Meta {
    #[serde(default)]
    value: String,
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{fixture, net, query};
    use super::*;

    #[test]
    fn featured_pictures_parse_with_licence_and_author_and_no_tracking_parameters() {
        let page = parse(&fixture("commons_featured.json"), &query("commons", "", 1)).unwrap();
        assert_eq!(page.items.len(), 6);
        assert_eq!(page.last_page, 2);
        let first = &page.items[0];
        assert_eq!(first.id.as_str(), "c-202062422");
        assert_eq!(first.resolution, "8000x4000");
        for item in &page.items {
            assert!(!item.full.contains('?'));
            assert!(!item.thumb_small.contains("utm_"));
            let credit = item.credit.as_ref().unwrap();
            assert!(credit.licence.starts_with("CC BY"));
            assert!(!credit.line.contains('<'));
            assert!(credit
                .page
                .as_deref()
                .unwrap()
                .starts_with("commons.wikimedia.org/wiki/File:"));
        }
    }

    #[test]
    fn non_free_licences_are_skipped() {
        assert!(free("cc-by-sa-4.0"));
        assert!(free("cc0"));
        assert!(free("pd"));
        assert!(!free("cc-by-nc-sa-4.0"));
        assert!(!free("cc-by-nd-2.0"));
        assert!(!free("fair use"));
        assert!(!free(""));
    }

    #[test]
    fn the_search_asks_for_featured_pictures_at_the_floor() {
        let pairs = params(&query("commons", "", 3));
        let search = &pairs.iter().find(|(key, _)| key == "gsrsearch").unwrap().1;
        assert!(search.contains("incategory:Featured_pictures_on_Wikimedia_Commons"));
        assert!(search.contains("filew:>1919"));
        assert!(pairs.contains(&("gsroffset".into(), "100".into())));
        assert!(pairs.contains(&("gsrsort".into(), "create_timestamp_desc".into())));
    }

    #[tokio::test]
    async fn search_goes_through_net() {
        let (fixtures, net, dir) = net("commons", vec![(API, fixture("commons_featured.json"))]);
        let page = Commons
            .search(&query("commons", "", 1), &net)
            .await
            .unwrap();
        assert_eq!(page.items.len(), 6);
        assert_eq!(fixtures.hits(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }
}
