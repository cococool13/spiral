//! Bing's daily image (`HPImageArchive`, unofficial and fragile). Fetched from
//! Bing by each person's own app, never mirrored. Images are for personal use
//! and the copyright line is always shown.

use std::collections::HashSet;
use std::sync::Arc;

use serde::Deserialize;

use super::super::model::{Credit, ResolvedSearch, StoredItem, StoredPage, UserError, WallId};
use super::super::net::{BoxFuture, Net, Rate};
use super::{grade, plain_text, resolution, safe_id, HostRule, Source, SourceMeta};

const API: &str = "https://www.bing.com/HPImageArchive.aspx";
const ORIGIN: &str = "https://www.bing.com";
/// The archive reaches back 15 days: `idx` 0 and 7, eight images each.
const OFFSETS: [u32; 2] = [0, 7];

pub static META: SourceMeta = SourceMeta {
    id: "bing",
    prefix: 'b',
    name: "Bing daily",
    group: "bing",
    hosts: &[HostRule::exact("www.bing.com")],
    // Two archive requests per day are enough; the 24 h cache covers the rest.
    rate: Rate {
        capacity: 4,
        per_secs: 24 * 60 * 60,
    },
    licence: "For personal use as a wallpaper. Each image shows its copyright line.",
    optional_key: false,
};

pub struct Bing;

impl Source for Bing {
    fn meta(&self) -> &'static SourceMeta {
        &META
    }

    fn search<'a>(
        &'a self,
        q: &'a ResolvedSearch,
        net: &'a Arc<Net>,
    ) -> BoxFuture<'a, Result<StoredPage, UserError>> {
        Box::pin(async move {
            if q.query.page > 1 {
                return Ok(StoredPage::new(q.query.page, 1, Vec::new()));
            }
            let mut bodies = Vec::new();
            let mut error = None;
            for offset in OFFSETS {
                let query = params(offset);
                match net.api(META.call(API, &query, "search")).await {
                    Ok(bytes) => bodies.push(bytes),
                    Err(err) => {
                        error = Some(err);
                        break;
                    }
                }
            }
            if bodies.is_empty() {
                return Err(error.unwrap_or_else(UserError::unavailable));
            }
            parse(&bodies, q)
        })
    }
}

pub fn params(offset: u32) -> Vec<(String, String)> {
    vec![
        ("format".into(), "js".into()),
        ("idx".into(), offset.to_string()),
        ("n".into(), "8".into()),
        ("mkt".into(), "en-US".into()),
    ]
}

pub fn parse(bodies: &[Vec<u8>], q: &ResolvedSearch) -> Result<StoredPage, UserError> {
    // Bing's UHD file is 3840x2160.
    let (width, height) = (3840, 2160);
    if !grade(width, height, q.floor()) {
        return Ok(StoredPage::new(1, 1, Vec::new()));
    }
    let needle = q.query.query.to_lowercase();
    let mut seen = HashSet::new();
    let mut items = Vec::new();
    for body in bodies {
        let api: Api = serde_json::from_slice(body).map_err(|_| UserError::bad())?;
        for image in api.images {
            let Some(name) = image.urlbase.strip_prefix("/th?id=OHR.") else {
                continue;
            };
            if !safe_id(name) || !seen.insert(name.to_string()) {
                continue;
            }
            let haystack = format!("{} {}", image.title, image.copyright).to_lowercase();
            if !needle.is_empty() && !haystack.contains(&needle) {
                continue;
            }
            let base = format!("{ORIGIN}{}", image.urlbase);
            let item = (|| {
                Some(StoredItem {
                    id: WallId::make('b', name)?,
                    resolution: resolution(width, height),
                    thumb_small: META.own(&format!("{base}_640x360.jpg"))?,
                    thumb_large: META.own(&format!("{base}_1920x1080.jpg"))?,
                    full: META.own(&format!("{base}_UHD.jpg"))?,
                    title: Some(plain_text(&image.title, 120)),
                    credit: Some(Credit {
                        line: plain_text(&image.copyright, 200),
                        licence: "Personal use only · Bing".into(),
                        page: None,
                    }),
                })
            })();
            items.extend(item);
        }
    }
    Ok(StoredPage::new(1, 1, items))
}

#[derive(Deserialize)]
struct Api {
    #[serde(default)]
    images: Vec<Image>,
}

#[derive(Deserialize)]
struct Image {
    urlbase: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    copyright: String,
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{fixture, net, query};
    use super::*;

    #[test]
    fn two_archive_pages_give_fifteen_days_without_duplicates() {
        let bodies = vec![
            fixture("bing_archive_0.json"),
            fixture("bing_archive_7.json"),
        ];
        let page = parse(&bodies, &query("bing", "", 1)).unwrap();
        assert_eq!(page.items.len(), 15);
        let first = &page.items[0];
        assert_eq!(first.id.as_str(), "b-HangingBat_EN-US7714746725");
        assert_eq!(
            first.full,
            "https://www.bing.com/th?id=OHR.HangingBat_EN-US7714746725_UHD.jpg"
        );
        assert_eq!(first.resolution, "3840x2160");
        assert!(first.credit.as_ref().unwrap().line.contains("Doug Gimesy"));
        assert_eq!(page.last_page, 1);
    }

    #[test]
    fn a_search_word_filters_titles_and_copyright_lines() {
        let bodies = vec![
            fixture("bing_archive_0.json"),
            fixture("bing_archive_7.json"),
        ];
        let page = parse(&bodies, &query("bing", "autumn", 1)).unwrap();
        assert!(!page.items.is_empty());
        assert!(page.items.len() < 15);
    }

    #[tokio::test]
    async fn the_second_load_of_the_day_comes_from_the_cache() {
        let (fixtures, net, dir) = net("bing", vec![(API, fixture("bing_archive_0.json"))]);
        for _ in 0..3 {
            let page = Bing.search(&query("bing", "", 1), &net).await.unwrap();
            assert_eq!(page.items.len(), 8);
        }
        assert_eq!(fixtures.hits(), 2);
        let none = Bing.search(&query("bing", "", 2), &net).await.unwrap();
        assert!(none.items.is_empty());
        assert_eq!(fixtures.hits(), 2);
        let _ = std::fs::remove_dir_all(dir);
    }
}
