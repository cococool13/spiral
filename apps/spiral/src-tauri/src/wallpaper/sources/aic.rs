//! Art Institute of Chicago (`api.artic.edu`), public-domain works only, served
//! through its IIIF image server. CC0.

use std::sync::Arc;

use serde::Deserialize;

use super::super::model::{Credit, ResolvedSearch, StoredItem, StoredPage, UserError, WallId};
use super::super::net::{BoxFuture, Net, Rate};
use super::{capped, grade, pages, plain_text, resolution, HostRule, Source, SourceMeta};

const API: &str = "https://api.artic.edu/api/v1/artworks/search";
const IIIF: &str = "https://www.artic.edu/iiif/2";
const PER_PAGE: u64 = 60;
/// Wider requests are redirected down to 843 pixels.
const FULL_MAX: u32 = 4000;
pub const DEFAULT_QUERY: &str = "landscape";

pub static META: SourceMeta = SourceMeta {
    id: "aic",
    prefix: 'a',
    name: "Art Institute of Chicago",
    group: "museums",
    hosts: &[
        HostRule::exact("api.artic.edu"),
        HostRule::exact("www.artic.edu"),
    ],
    rate: Rate::per_minute(30),
    licence: "Public-domain works, released CC0 by the Art Institute of Chicago.",
    optional_key: false,
};

pub struct Aic;

impl Source for Aic {
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
        ("query[term][is_public_domain]".into(), "true".into()),
        (
            "fields".into(),
            "id,title,image_id,artist_title,date_display,thumbnail".into(),
        ),
        ("limit".into(), PER_PAGE.to_string()),
        ("page".into(), q.query.page.to_string()),
    ]
}

pub fn parse(bytes: &[u8], q: &ResolvedSearch) -> Result<StoredPage, UserError> {
    let api: Api = serde_json::from_slice(bytes).map_err(|_| UserError::bad())?;
    let floor = q.floor();
    let items = api
        .data
        .into_iter()
        .filter_map(|art| {
            let thumb = art.thumbnail?;
            let image = art.image_id.filter(|id| {
                !id.is_empty() && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
            })?;
            let (width, height) = capped(thumb.width?, thumb.height?, FULL_MAX);
            if !grade(width, height, floor) {
                return None;
            }
            let base = format!("{IIIF}/{image}");
            let title = plain_text(art.title.as_deref().unwrap_or("Untitled"), 120);
            let mut line = art
                .artist_title
                .map(|artist| plain_text(&artist, 80))
                .unwrap_or_else(|| "Artist unknown".into());
            line.push_str(&format!(", {title}"));
            if let Some(date) = art.date_display.filter(|date| !date.is_empty()) {
                line.push_str(&format!(", {}", plain_text(&date, 40)));
            }
            Some(StoredItem {
                id: WallId::make('a', &art.id.to_string())?,
                resolution: resolution(width, height),
                thumb_small: META.own(&format!("{base}/full/843,/0/default.jpg"))?,
                thumb_large: META.own(&format!("{base}/full/1686,/0/default.jpg"))?,
                full: META.own(&format!("{base}/full/{width},/0/default.jpg"))?,
                title: Some(title),
                credit: Some(Credit {
                    line,
                    licence: "CC0 · Art Institute of Chicago".into(),
                    page: Some(format!("artic.edu/artworks/{}", art.id)),
                }),
            })
        })
        .collect();
    Ok(StoredPage::new(
        q.query.page,
        // The API pages at most 10 000 results deep.
        pages(api.pagination.total.min(10_000), PER_PAGE),
        items,
    ))
}

#[derive(Deserialize)]
struct Api {
    pagination: Pagination,
    #[serde(default)]
    data: Vec<Art>,
}

#[derive(Deserialize)]
struct Pagination {
    total: u64,
}

#[derive(Deserialize)]
struct Art {
    id: u64,
    title: Option<String>,
    image_id: Option<String>,
    artist_title: Option<String>,
    date_display: Option<String>,
    thumbnail: Option<Thumb>,
}

#[derive(Deserialize)]
struct Thumb {
    width: Option<u32>,
    height: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{fixture, net, query};
    use super::*;

    #[test]
    fn public_domain_landscapes_parse_with_capped_iiif_sizes() {
        let page = parse(&fixture("aic_search.json"), &query("aic", "landscape", 1)).unwrap();
        let ids: Vec<_> = page.items.iter().map(|item| item.id.as_str()).collect();
        // 1832x2250 (Bierstadt) is portrait.
        assert_eq!(ids, ["a-23119", "a-874", "a-90048", "a-68792", "a-138"]);
        let cole = &page.items[2];
        assert_eq!(cole.resolution, "4000x3098");
        assert_eq!(
            cole.full,
            "https://www.artic.edu/iiif/2/18092196-50ae-3ff1-9205-1b3110e966c3/full/4000,/0/default.jpg"
        );
        let credit = cole.credit.as_ref().unwrap();
        assert!(credit.line.starts_with("Thomas Cole, "));
        assert!(credit.licence.starts_with("CC0"));
        assert_eq!(page.last_page, 167);
    }

    #[test]
    fn only_public_domain_is_asked_for() {
        let pairs = params(&query("aic", "", 1));
        assert!(pairs.contains(&("query[term][is_public_domain]".into(), "true".into())));
        assert!(pairs.contains(&("q".into(), DEFAULT_QUERY.into())));
    }

    #[tokio::test]
    async fn search_goes_through_net() {
        let (fixtures, net, dir) = net("aic", vec![(API, fixture("aic_search.json"))]);
        let page = Aic.search(&query("aic", "", 1), &net).await.unwrap();
        assert_eq!(page.items.len(), 5);
        assert_eq!(fixtures.hits(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }
}
