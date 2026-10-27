//! Wallhaven: the default still source. SFW only, no key path.

use std::sync::Arc;

use super::super::model::{ResolvedSearch, StoredItem, StoredPage, UserError, WallId};
use super::super::net::{BoxFuture, Net, Rate};
use super::{HostRule, Source, SourceMeta};

const API_SEARCH: &str = "https://wallhaven.cc/api/v1/search";

pub static META: SourceMeta = SourceMeta {
    id: "wallhaven",
    prefix: 'w',
    name: "Wallhaven",
    group: "wallhaven",
    hosts: &[HostRule {
        host: "wallhaven.cc",
        subdomains: true,
    }],
    // Wallhaven allows 45 a minute; stay under it.
    rate: Rate::per_minute(40),
    licence: "Uploaded by Wallhaven members; rights stay with the creators. SFW only.",
    optional_key: false,
};

pub struct Wallhaven;

impl Source for Wallhaven {
    fn meta(&self) -> &'static SourceMeta {
        &META
    }

    fn search<'a>(
        &'a self,
        q: &'a ResolvedSearch,
        net: &'a Arc<Net>,
    ) -> BoxFuture<'a, Result<StoredPage, UserError>> {
        Box::pin(async move {
            let query = pairs(q);
            let bytes = net.api(META.call(API_SEARCH, &query, "search")).await?;
            parse_page(&bytes)
        })
    }
}

pub fn pairs(search: &ResolvedSearch) -> Vec<(String, String)> {
    let mut pairs = vec![
        ("q".into(), search.query.query.clone()),
        ("categories".into(), search.query.categories.as_str().into()),
        ("purity".into(), "100".into()),
        ("sorting".into(), search.query.sorting.as_str().into()),
        ("page".into(), search.query.page.to_string()),
    ];
    if let Some(range) = search.top_range {
        pairs.push(("topRange".into(), range.into()));
    }
    if let Some(size) = search.atleast {
        pairs.push(("atleast".into(), size.atleast()));
    }
    if let Some(ratios) = search.ratios {
        pairs.push(("ratios".into(), ratios.into()));
    }
    if let Some(colour) = search.query.colors {
        pairs.push(("colors".into(), colour.into()));
    }
    pairs
}

pub fn parse_page(bytes: &[u8]) -> Result<StoredPage, UserError> {
    let api: ApiResponse = serde_json::from_slice(bytes).map_err(|_| UserError::bad())?;
    let items = api.data.into_iter().filter_map(stored_item).collect();
    Ok(StoredPage::new(
        api.meta.current_page,
        api.meta.last_page,
        items,
    ))
}

fn stored_item(wallpaper: ApiWallpaper) -> Option<StoredItem> {
    if !resolution_ok(&wallpaper.resolution) {
        return None;
    }
    let id = WallId::parse(&format!("w-{}", wallpaper.id)).ok()?;
    Some(StoredItem {
        id,
        resolution: wallpaper.resolution,
        thumb_small: META.own(&wallpaper.thumbs.small)?,
        thumb_large: META.own(&wallpaper.thumbs.large)?,
        full: META.own(&wallpaper.path)?,
        title: None,
        credit: None,
    })
}

fn resolution_ok(raw: &str) -> bool {
    let Some((width, height)) = raw.split_once('x') else {
        return false;
    };
    !width.is_empty()
        && !height.is_empty()
        && width.chars().all(|c| c.is_ascii_digit())
        && height.chars().all(|c| c.is_ascii_digit())
}

#[derive(serde::Deserialize)]
struct ApiThumbs {
    large: String,
    small: String,
}

#[derive(serde::Deserialize)]
struct ApiWallpaper {
    id: String,
    resolution: String,
    path: String,
    thumbs: ApiThumbs,
}

#[derive(serde::Deserialize)]
struct ApiMeta {
    current_page: u32,
    last_page: u32,
}

#[derive(serde::Deserialize)]
struct ApiResponse {
    data: Vec<ApiWallpaper>,
    meta: ApiMeta,
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{fixture, net, query};
    use super::*;
    use crate::wallpaper::model::{GalleryQuery, SearchParams};

    #[test]
    fn a_foreign_full_url_is_dropped_and_the_page_keeps_no_url_in_the_public_view() {
        let body = br#"{
            "data": [
                {
                    "id": "abc",
                    "resolution": "1920x1080",
                    "path": "https://evil.example/a.jpg",
                    "thumbs": {
                        "small": "https://th.wallhaven.cc/small/ab/abc.jpg",
                        "large": "https://th.wallhaven.cc/lg/ab/abc.jpg"
                    }
                },
                {
                    "id": "def",
                    "resolution": "2560x1440",
                    "path": "https://w.wallhaven.cc/full/de/wallhaven-def.jpg",
                    "thumbs": {
                        "small": "https://th.wallhaven.cc/small/de/def.jpg",
                        "large": "https://th.wallhaven.cc/lg/de/def.jpg"
                    }
                }
            ],
            "meta": { "current_page": 1, "last_page": 3 }
        }"#;
        let page = parse_page(body).unwrap();
        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].id.as_str(), "w-def");
        let public = serde_json::to_string(&page.public()).unwrap();
        assert!(!public.contains("http"));
        assert!(!public.contains("wallhaven"));
    }

    #[test]
    fn the_recorded_colour_search_parses() {
        let page = parse_page(&fixture("wallhaven_search.json")).unwrap();
        assert_eq!(page.items.len(), 3);
        assert_eq!(page.items[0].id.as_str(), "w-og7vpm");
        assert_eq!(page.items[0].resolution, "3840x2160");
        assert!(page.items[0].full.starts_with("https://w.wallhaven.cc/"));
    }

    #[test]
    fn colour_and_fit_reach_the_query() {
        let params = SearchParams {
            query: "forest".into(),
            categories: "100".into(),
            sorting: "relevance".into(),
            page: 1,
            colors: Some("336600".into()),
            fit: true,
            ..Default::default()
        };
        let resolved = ResolvedSearch::from_query(
            GalleryQuery::parse(&params).unwrap(),
            Some(crate::wallpaper::model::DisplaySize {
                width: 3024,
                height: 1964,
            }),
        );
        let pairs = pairs(&resolved);
        assert!(pairs.contains(&("colors".into(), "336600".into())));
        assert!(pairs.contains(&("atleast".into(), "3024x1964".into())));
        assert!(pairs.contains(&("purity".into(), "100".into())));
    }

    #[tokio::test]
    async fn search_goes_through_the_net_layer() {
        let (fixtures, net, dir) = net(
            "wallhaven",
            vec![(
                "https://wallhaven.cc/api/v1/search",
                fixture("wallhaven_search.json"),
            )],
        );
        let page = Wallhaven
            .search(&query("wallhaven", "", 1), &net)
            .await
            .unwrap();
        assert_eq!(page.items.len(), 3);
        assert_eq!(fixtures.hits(), 1);
        assert_eq!(
            net.activity().list(5)[0].source.as_deref(),
            Some("wallhaven")
        );
        let _ = std::fs::remove_dir_all(dir);
    }
}
