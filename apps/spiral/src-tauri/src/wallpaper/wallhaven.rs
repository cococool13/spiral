use super::model::{ResolvedSearch, StoredItem, StoredPage, UserError, WallId};
use super::net::host_allowed;

const API_SEARCH: &str = "https://wallhaven.cc/api/v1/search";

pub fn endpoint() -> &'static str {
    API_SEARCH
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
    pairs
}

pub fn parse_page(bytes: &[u8]) -> Result<StoredPage, UserError> {
    let api: ApiResponse = serde_json::from_slice(bytes).map_err(|_| UserError::bad())?;
    let mut items = Vec::with_capacity(api.data.len());
    for wallpaper in api.data {
        if let Some(item) = stored_item(wallpaper) {
            items.push(item);
        }
    }
    Ok(StoredPage {
        v: StoredPage::VERSION,
        page: api.meta.current_page,
        last_page: api.meta.last_page,
        items,
    })
}

fn stored_item(wallpaper: ApiWallpaper) -> Option<StoredItem> {
    if !resolution_ok(&wallpaper.resolution) {
        return None;
    }
    host_allowed(&wallpaper.thumbs.small).ok()?;
    host_allowed(&wallpaper.thumbs.large).ok()?;
    host_allowed(&wallpaper.path).ok()?;
    let id = WallId::parse(&format!("w-{}", wallpaper.id)).ok()?;
    Some(StoredItem {
        id,
        resolution: wallpaper.resolution,
        thumb_small: wallpaper.thumbs.small,
        thumb_large: wallpaper.thumbs.large,
        full: wallpaper.path,
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
    use super::*;

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
}
