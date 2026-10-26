//! Cleveland Museum of Art Open Access API, CC0 works with images only. The
//! "print" JPEG (up to about 3400 pixels) is the wallpaper; the full file is a
//! TIFF and never used.

use std::sync::Arc;

use serde::Deserialize;
use serde_json::Value;

use super::super::model::{Credit, ResolvedSearch, StoredItem, StoredPage, UserError, WallId};
use super::super::net::{BoxFuture, Net, Rate};
use super::{grade, pages, plain_text, resolution, HostRule, Source, SourceMeta};

const API: &str = "https://openaccess-api.clevelandart.org/api/artworks/";
const PER_PAGE: u64 = 48;
pub const DEFAULT_QUERY: &str = "landscape";

pub static META: SourceMeta = SourceMeta {
    id: "cleveland",
    prefix: 'm',
    name: "Cleveland Museum of Art",
    group: "museums",
    hosts: &[
        HostRule::exact("openaccess-api.clevelandart.org"),
        HostRule::exact("openaccess-cdn.clevelandart.org"),
    ],
    rate: Rate::per_minute(30),
    licence: "Open Access works, released CC0 by the Cleveland Museum of Art.",
    optional_key: false,
};

pub struct Cleveland;

impl Source for Cleveland {
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
        ("cc0".into(), "1".into()),
        ("has_image".into(), "1".into()),
        ("limit".into(), PER_PAGE.to_string()),
        (
            "skip".into(),
            (u64::from(q.query.page - 1) * PER_PAGE).to_string(),
        ),
        (
            "fields".into(),
            "id,accession_number,title,creation_date,creators,images,url".into(),
        ),
    ]
}

fn number(value: Option<&Value>) -> Option<u32> {
    match value? {
        Value::String(text) => text.trim().parse().ok(),
        Value::Number(number) => number.as_u64().and_then(|n| u32::try_from(n).ok()),
        _ => None,
    }
}

pub fn parse(bytes: &[u8], q: &ResolvedSearch) -> Result<StoredPage, UserError> {
    let api: Api = serde_json::from_slice(bytes).map_err(|_| UserError::bad())?;
    let floor = q.floor();
    let items = api
        .data
        .into_iter()
        .filter_map(|art| {
            let print = art.images.get("print")?;
            let web = art.images.get("web")?;
            let width = number(print.get("width"))?;
            let height = number(print.get("height"))?;
            if !grade(width, height, floor) {
                return None;
            }
            let full = print.get("url")?.as_str()?;
            let thumb = web.get("url")?.as_str()?;
            if !full.to_ascii_lowercase().ends_with(".jpg") {
                return None;
            }
            let title = plain_text(art.title.as_deref().unwrap_or("Untitled"), 120);
            let maker = art
                .creators
                .first()
                .and_then(|creator| creator.description.as_deref())
                .map(|text| plain_text(text, 100))
                .unwrap_or_else(|| "Artist unknown".into());
            let mut line = format!("{maker}, {title}");
            if let Some(date) = art.creation_date.filter(|date| !date.is_empty()) {
                line.push_str(&format!(", {}", plain_text(&date, 40)));
            }
            Some(StoredItem {
                id: WallId::make('m', &art.id.to_string())?,
                resolution: resolution(width, height),
                thumb_small: META.own(thumb)?,
                thumb_large: META.own(thumb)?,
                full: META.own(full)?,
                title: Some(title),
                credit: Some(Credit {
                    line,
                    licence: "CC0 · Cleveland Museum of Art".into(),
                    page: art
                        .accession_number
                        .map(|number| format!("clevelandart.org/art/{number}")),
                }),
            })
        })
        .collect();
    Ok(StoredPage::new(
        q.query.page,
        pages(api.info.total, PER_PAGE),
        items,
    ))
}

#[derive(Deserialize)]
struct Api {
    info: Info,
    #[serde(default)]
    data: Vec<Art>,
}

#[derive(Deserialize)]
struct Info {
    total: u64,
}

#[derive(Deserialize)]
struct Art {
    id: u64,
    accession_number: Option<String>,
    title: Option<String>,
    creation_date: Option<String>,
    #[serde(default)]
    creators: Vec<Creator>,
    #[serde(default)]
    images: serde_json::Map<String, Value>,
}

#[derive(Deserialize)]
struct Creator {
    description: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{fixture, net, query};
    use super::*;

    #[test]
    fn cc0_landscapes_use_the_print_jpeg() {
        let page = parse(
            &fixture("cleveland_search.json"),
            &query("cleveland", "landscape", 1),
        )
        .unwrap();
        let ids: Vec<_> = page.items.iter().map(|item| item.id.as_str()).collect();
        // 1536x1931 is portrait; 1902x1536 is under wallpaper grade.
        assert_eq!(ids, ["m-152006", "m-171296", "m-111066", "m-148739"]);
        let first = &page.items[0];
        assert_eq!(first.resolution, "3400x2603");
        assert!(first.full.ends_with("_print.jpg"));
        assert!(first.thumb_small.ends_with("_web.jpg"));
        let credit = first.credit.as_ref().unwrap();
        assert!(credit.line.starts_with("Thomas Gainsborough"));
        assert_eq!(credit.page.as_deref(), Some("clevelandart.org/art/1984.59"));
        assert_eq!(page.last_page, 34);
    }

    #[test]
    fn only_cc0_works_with_images_are_asked_for() {
        let pairs = params(&query("cleveland", "", 3));
        assert!(pairs.contains(&("cc0".into(), "1".into())));
        assert!(pairs.contains(&("has_image".into(), "1".into())));
        assert!(pairs.contains(&("skip".into(), "96".into())));
    }

    #[tokio::test]
    async fn search_goes_through_net() {
        let (fixtures, net, dir) = net("cleveland", vec![(API, fixture("cleveland_search.json"))]);
        let page = Cleveland
            .search(&query("cleveland", "", 1), &net)
            .await
            .unwrap();
        assert_eq!(page.items.len(), 4);
        assert_eq!(fixtures.hits(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }
}
