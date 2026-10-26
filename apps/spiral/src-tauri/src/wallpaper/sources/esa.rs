//! ESA/Webb and ESA/Hubble image archives. There is no JSON API, so this reads
//! the `var images = [...]` list the archive pages print (fragile by nature:
//! it fails alone with `source_unavailable`). Images are CC BY 4.0 and the
//! full credit line is mandatory, so quick look fetches it from the image's
//! own page.

use std::sync::Arc;

use super::super::model::{Credit, ResolvedSearch, StoredItem, StoredPage, UserError, WallId};
use super::super::net::{BoxFuture, Net, Rate};
use super::{capped, grade, interleave, plain_text, resolution, HostRule, Source, SourceMeta};

/// The archive's "publication JPEG" is at most 4000 pixels wide.
const FULL_MAX: u32 = 4000;
const PER_PAGE: usize = 50;

pub static META: SourceMeta = SourceMeta {
    id: "esa",
    prefix: 'e',
    name: "ESA/Webb and ESA/Hubble",
    group: "space",
    hosts: &[
        HostRule::exact("esawebb.org"),
        HostRule::exact("cdn.esawebb.org"),
        HostRule::exact("esahubble.org"),
        HostRule::exact("cdn.esahubble.org"),
    ],
    rate: Rate::per_minute(10),
    licence: "CC BY 4.0. The full credit line is shown with every image.",
    optional_key: false,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Site {
    Webb,
    Hubble,
}

impl Site {
    fn tag(self) -> &'static str {
        match self {
            Self::Webb => "webb",
            Self::Hubble => "hubble",
        }
    }

    fn host(self) -> &'static str {
        match self {
            Self::Webb => "esawebb.org",
            Self::Hubble => "esahubble.org",
        }
    }

    fn base_credit(self) -> &'static str {
        match self {
            Self::Webb => "ESA/Webb, NASA & CSA",
            Self::Hubble => "ESA/Hubble & NASA",
        }
    }

    fn from_id(id: &WallId) -> Option<(Self, &str)> {
        let rest = id.as_str().strip_prefix("e-")?;
        if let Some(name) = rest.strip_prefix("webb_") {
            Some((Self::Webb, name))
        } else {
            rest.strip_prefix("hubble_")
                .map(|name| (Self::Hubble, name))
        }
    }

    pub fn list_url(self, page: u32) -> String {
        if page <= 1 {
            format!("https://{}/images/", self.host())
        } else {
            format!("https://{}/images/page/{page}/", self.host())
        }
    }
}

pub struct Esa;

impl Source for Esa {
    fn meta(&self) -> &'static SourceMeta {
        &META
    }

    fn search<'a>(
        &'a self,
        q: &'a ResolvedSearch,
        net: &'a Arc<Net>,
    ) -> BoxFuture<'a, Result<StoredPage, UserError>> {
        Box::pin(async move {
            let query: Vec<(String, String)> = if q.query.query.is_empty() {
                Vec::new()
            } else {
                vec![("search".into(), q.query.query.clone())]
            };
            let webb_url = Site::Webb.list_url(q.query.page);
            let hubble_url = Site::Hubble.list_url(q.query.page);
            let (webb, hubble) = tokio::join!(
                net.api(META.call(&webb_url, &query, "search")),
                net.api(META.call(&hubble_url, &query, "search")),
            );
            let mut lists = Vec::new();
            let mut more = false;
            let mut error = None;
            for (site, answer) in [(Site::Webb, webb), (Site::Hubble, hubble)] {
                match answer.and_then(|bytes| parse(site, &bytes, q)) {
                    Ok((items, full_page)) => {
                        more |= full_page;
                        lists.push(items);
                    }
                    Err(err) => error = Some(err),
                }
            }
            if lists.is_empty() {
                return Err(error.unwrap_or_else(UserError::unavailable));
            }
            let page = q.query.page;
            Ok(StoredPage::new(
                page,
                if more { page + 1 } else { page },
                interleave(lists),
            ))
        })
    }

    fn credit<'a>(
        &'a self,
        item: &'a StoredItem,
        net: &'a Arc<Net>,
    ) -> BoxFuture<'a, Option<Credit>> {
        Box::pin(async move {
            let fallback = item.credit.clone();
            let Some((site, name)) = Site::from_id(&item.id) else {
                return fallback;
            };
            let url = format!("https://{}/images/{name}/", site.host());
            match net.api(META.call(&url, &[], "credit")).await {
                Ok(bytes) => match credit_line(&String::from_utf8_lossy(&bytes)) {
                    Some(line) => Some(Credit {
                        line,
                        ..fallback.unwrap_or_default()
                    }),
                    None => fallback,
                },
                Err(_) => fallback,
            }
        })
    }
}

/// Items from one archive page, and whether the page was full (so another
/// page probably follows).
pub fn parse(
    site: Site,
    bytes: &[u8],
    q: &ResolvedSearch,
) -> Result<(Vec<StoredItem>, bool), UserError> {
    let html = String::from_utf8_lossy(bytes);
    let start = html
        .find("var images = [")
        .ok_or_else(UserError::unavailable)?;
    let block = &html[start..];
    let block = &block[..block.find("];").unwrap_or(block.len())];
    let floor = q.floor();
    let mut count = 0;
    let mut items = Vec::new();
    for chunk in block.split('{').skip(1) {
        count += 1;
        let Some(name) = quoted(chunk, "id: '") else {
            continue;
        };
        if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric()) {
            continue;
        }
        let (Some(width), Some(height)) = (number(chunk, "width: "), number(chunk, "height: "))
        else {
            continue;
        };
        let (width, height) = capped(width, height, FULL_MAX);
        if !grade(width, height, floor) {
            continue;
        }
        let cdn = format!("https://cdn.{}/archives/images", site.host());
        let Some(id) = WallId::make('e', &format!("{}_{name}", site.tag())) else {
            continue;
        };
        let item = (|| {
            Some(StoredItem {
                id,
                resolution: resolution(width, height),
                thumb_small: META.own(&format!("{cdn}/thumb700x/{name}.jpg"))?,
                thumb_large: META.own(&format!("{cdn}/screen/{name}.jpg"))?,
                full: META.own(&format!("{cdn}/publicationjpg/{name}.jpg"))?,
                title: quoted(chunk, "title: '").map(|title| plain_text(title, 120)),
                credit: Some(Credit {
                    line: site.base_credit().into(),
                    licence: "CC BY 4.0".into(),
                    page: Some(format!("{}/images/{name}", site.host())),
                }),
            })
        })();
        items.extend(item);
    }
    Ok((items, count >= PER_PAGE))
}

/// The credit line printed under `<strong>Credit:</strong>` on an image page.
pub fn credit_line(html: &str) -> Option<String> {
    let start = html.find("<div class=\"credit\">")?;
    let rest = &html[start + "<div class=\"credit\">".len()..];
    let end = rest.find("</div>")?;
    let line = plain_text(&rest[..end], 300);
    (!line.is_empty()).then_some(line)
}

fn quoted<'a>(chunk: &'a str, key: &str) -> Option<&'a str> {
    let start = chunk.find(key)? + key.len();
    let rest = &chunk[start..];
    Some(&rest[..rest.find('\'')?])
}

fn number(chunk: &str, key: &str) -> Option<u32> {
    let start = chunk.find(key)? + key.len();
    let digits: String = chunk[start..]
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    digits.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{fixture, net, query};
    use super::*;

    #[test]
    fn the_webb_list_parses_and_keeps_landscape_wallpapers() {
        let q = query("esa", "", 1);
        let (items, full_page) = parse(Site::Webb, &fixture("esa_webb_list.html"), &q).unwrap();
        assert!(!full_page);
        let first = items
            .iter()
            .find(|item| item.id.as_str() == "e-webb_weic2425a")
            .unwrap();
        // 8588x5617 comes down to the 4000-wide publication JPEG.
        assert_eq!(first.resolution, "4000x2616");
        assert_eq!(
            first.full,
            "https://cdn.esawebb.org/archives/images/publicationjpg/weic2425a.jpg"
        );
        assert_eq!(
            first.title.as_deref(),
            Some("NGC 602 (NIRCam and MIRI image)")
        );
        // The 30866x38204 portrait of IC 348 is not a wallpaper.
        assert!(items
            .iter()
            .all(|item| item.id.as_str() != "e-webb_weic2619a"));
    }

    #[test]
    fn the_hubble_list_decodes_titles() {
        let (items, _) = parse(
            Site::Hubble,
            &fixture("esa_hubble_list.html"),
            &query("esa", "", 1),
        )
        .unwrap();
        let tapestry = items
            .iter()
            .find(|item| item.id.as_str() == "e-hubble_heic2007a")
            .unwrap();
        assert_eq!(
            tapestry.title.as_deref(),
            Some("Tapestry of Blazing Starbirth")
        );
        assert!(tapestry
            .thumb_small
            .starts_with("https://cdn.esahubble.org/"));
        // 1663x1375 is too small; 6780x7071 is portrait.
        assert!(items
            .iter()
            .all(|item| item.id.as_str() != "e-hubble_heic2017a"));
        assert!(items
            .iter()
            .all(|item| item.id.as_str() != "e-hubble_heic1501a"));
    }

    #[test]
    fn a_page_without_the_list_is_unavailable() {
        let err = parse(Site::Webb, b"<html>moved</html>", &query("esa", "", 1)).unwrap_err();
        assert_eq!(err.code(), "source_unavailable");
    }

    #[test]
    fn the_credit_line_comes_verbatim_from_the_image_page() {
        let html = String::from_utf8(fixture("esa_webb_detail.html")).unwrap();
        assert_eq!(
            credit_line(&html).as_deref(),
            Some("ESA/Webb, NASA & CSA, P. Zeidler, E. Sabbi, A. Nota, M. Zamani (ESA/Webb)")
        );
    }

    #[tokio::test]
    async fn search_asks_both_archives_and_credit_reads_the_page_once() {
        let (fixtures, net, dir) = net(
            "esa",
            vec![
                (
                    "https://esawebb.org/images/weic2425a/",
                    fixture("esa_webb_detail.html"),
                ),
                ("https://esawebb.org/images/", fixture("esa_webb_list.html")),
                (
                    "https://esahubble.org/images/",
                    fixture("esa_hubble_list.html"),
                ),
            ],
        );
        let page = Esa.search(&query("esa", "", 1), &net).await.unwrap();
        assert_eq!(fixtures.hits(), 2);
        let ids: Vec<_> = page.items.iter().map(|item| item.id.as_str()).collect();
        assert!(ids.contains(&"e-webb_weic2425a"));
        assert!(ids.contains(&"e-hubble_heic2007a"));
        let item = page
            .items
            .iter()
            .find(|item| item.id.as_str() == "e-webb_weic2425a")
            .unwrap();
        for _ in 0..2 {
            let credit = Esa.credit(item, &net).await.unwrap();
            assert!(credit.line.contains("P. Zeidler"));
            assert_eq!(credit.licence, "CC BY 4.0");
        }
        assert_eq!(fixtures.hits(), 3);
        let _ = std::fs::remove_dir_all(dir);
    }
}
