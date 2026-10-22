use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserError {
    code: &'static str,
    detail: String,
}

impl UserError {
    pub fn new(code: &'static str) -> Self {
        Self {
            code,
            detail: String::new(),
        }
    }

    pub fn with(code: &'static str, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }

    pub fn inactive() -> Self {
        Self::new("module_inactive")
    }

    pub fn offline() -> Self {
        Self::new("offline")
    }

    pub fn bad() -> Self {
        Self::new("bad_response")
    }

    pub fn rate_limited() -> Self {
        Self::new("rate_limited")
    }

    pub fn download() -> Self {
        Self::new("download_failed")
    }

    pub fn too_large() -> Self {
        Self::new("too_large")
    }

    pub fn bad_image() -> Self {
        Self::new("bad_image")
    }

    pub fn apply(screen: &str) -> Self {
        Self::with("apply_failed", screen)
    }

    pub fn unknown() -> Self {
        Self::new("unknown_wallpaper")
    }

    pub fn code(&self) -> &'static str {
        self.code
    }
}

impl std::fmt::Display for UserError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.detail.is_empty() {
            f.write_str(self.code)
        } else {
            write!(f, "{}:{}", self.code, self.detail)
        }
    }
}

impl Serialize for UserError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct WallId(String);

impl WallId {
    pub fn parse(raw: &str) -> Result<Self, UserError> {
        let rest = raw.strip_prefix("w-").ok_or_else(UserError::bad)?;
        if rest.is_empty() || !rest.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(UserError::bad());
        }
        Ok(Self(raw.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Serialize for WallId {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for WallId {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(deserializer)?;
        Self::parse(&raw).map_err(|_| D::Error::custom("wallpaper id"))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DisplaySize {
    pub width: u32,
    pub height: u32,
}

impl DisplaySize {
    pub fn atleast(self) -> String {
        format!("{}x{}", self.width, self.height)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rendition {
    Small,
    Large,
}

impl Rendition {
    #[cfg(test)]
    fn for_edge(device_px: u32) -> Self {
        if device_px <= 480 {
            Self::Small
        } else {
            Self::Large
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "sm" => Some(Self::Small),
            "lg" => Some(Self::Large),
            _ => None,
        }
    }

    pub fn file_mark(self) -> &'static str {
        match self {
            Self::Small => "sm",
            Self::Large => "lg",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Categories {
    All,
    General,
    Anime,
    People,
}

impl Categories {
    pub fn parse(raw: &str) -> Result<Self, UserError> {
        match raw {
            "111" => Ok(Self::All),
            "100" => Ok(Self::General),
            "010" => Ok(Self::Anime),
            "001" => Ok(Self::People),
            _ => Err(UserError::bad()),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::All => "111",
            Self::General => "100",
            Self::Anime => "010",
            Self::People => "001",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Sorting {
    Toplist,
    Relevance,
}

impl Sorting {
    pub fn parse(raw: &str) -> Result<Self, UserError> {
        match raw {
            "toplist" => Ok(Self::Toplist),
            "relevance" => Ok(Self::Relevance),
            _ => Err(UserError::bad()),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Toplist => "toplist",
            Self::Relevance => "relevance",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    pub query: String,
    pub categories: String,
    pub sorting: String,
    pub page: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GalleryQuery {
    pub query: String,
    pub categories: Categories,
    pub sorting: Sorting,
    pub page: u32,
}

impl GalleryQuery {
    pub fn parse(params: &SearchParams) -> Result<Self, UserError> {
        if params.page == 0 {
            return Err(UserError::bad());
        }
        Ok(Self {
            query: params.query.trim().to_string(),
            categories: Categories::parse(&params.categories)?,
            sorting: Sorting::parse(&params.sorting)?,
            page: params.page,
        })
    }

    pub fn is_default_gallery(&self) -> bool {
        self.query.is_empty()
            && self.categories == Categories::All
            && self.sorting == Sorting::Toplist
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedSearch {
    pub query: GalleryQuery,
    pub atleast: Option<DisplaySize>,
    pub ratios: Option<&'static str>,
    pub top_range: Option<&'static str>,
}

pub const LANDSCAPE_RATIOS: &str = "16x9,16x10,21x9";

impl ResolvedSearch {
    pub fn from_query(query: GalleryQuery, display: Option<DisplaySize>) -> Self {
        let default_gallery = query.is_default_gallery();
        Self {
            top_range: (query.sorting == Sorting::Toplist).then_some("1M"),
            atleast: default_gallery.then_some(display).flatten(),
            ratios: default_gallery.then_some(LANDSCAPE_RATIOS),
            query,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage {
    pub items: Vec<GalleryItem>,
    pub page: u32,
    pub last_page: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct GalleryItem {
    pub id: WallId,
    pub resolution: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredItem {
    pub id: WallId,
    pub resolution: String,
    #[serde(rename = "thumbSmall")]
    pub thumb_small: String,
    #[serde(rename = "thumbLarge")]
    pub thumb_large: String,
    pub full: String,
}

impl StoredItem {
    pub fn public(&self) -> GalleryItem {
        GalleryItem {
            id: self.id.clone(),
            resolution: self.resolution.clone(),
        }
    }

    pub fn thumb(&self, rendition: Rendition) -> &str {
        match rendition {
            Rendition::Small => &self.thumb_small,
            Rendition::Large => &self.thumb_large,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredPage {
    pub v: u32,
    pub page: u32,
    #[serde(rename = "lastPage")]
    pub last_page: u32,
    pub items: Vec<StoredItem>,
}

impl StoredPage {
    pub const VERSION: u32 = 1;

    pub fn public(&self) -> SearchPage {
        SearchPage {
            items: self.items.iter().map(StoredItem::public).collect(),
            page: self.page,
            last_page: self.last_page,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SpaceScope {
    Current,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Applied {
    pub displays: u32,
    pub spaces: SpaceScope,
}

impl Applied {
    pub fn here(displays: u32) -> Self {
        Self {
            displays,
            spaces: SpaceScope::Current,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rendition_is_small_at_480_device_pixels_and_large_above() {
        assert_eq!(Rendition::for_edge(0), Rendition::Small);
        assert_eq!(Rendition::for_edge(480), Rendition::Small);
        assert_eq!(Rendition::for_edge(481), Rendition::Large);
    }

    #[test]
    fn a_wall_id_rejects_a_url_and_a_path() {
        assert!(WallId::parse("w-abc123").is_ok());
        assert!(WallId::parse("https://w.wallhaven.cc/full/ab/x.jpg").is_err());
        assert!(WallId::parse("../w-abc").is_err());
        assert!(WallId::parse("w-").is_err());
        assert!(WallId::parse("abc").is_err());
    }

    #[test]
    fn applied_spaces_are_current() {
        let json = serde_json::to_string(&Applied::here(2)).unwrap();
        assert_eq!(json, r#"{"displays":2,"spaces":"current"}"#);
    }

    #[test]
    fn the_default_gallery_is_the_one_month_sfw_toplist() {
        let query = GalleryQuery::parse(&SearchParams {
            query: "  ".into(),
            categories: "111".into(),
            sorting: "toplist".into(),
            page: 1,
        })
        .unwrap();
        let resolved = ResolvedSearch::from_query(
            query,
            Some(DisplaySize {
                width: 2560,
                height: 1440,
            }),
        );
        let pairs = crate::wallpaper::wallhaven::pairs(&resolved);
        assert!(pairs.contains(&("purity".into(), "100".into())));
        assert!(pairs.contains(&("sorting".into(), "toplist".into())));
        assert!(pairs.contains(&("topRange".into(), "1M".into())));
        assert!(pairs.contains(&("atleast".into(), "2560x1440".into())));
        assert!(pairs
            .iter()
            .any(|(key, value)| key == "ratios" && value.contains("16x9")));
        assert!(!pairs
            .iter()
            .any(|(key, value)| key == "url" || value.contains("http")));
    }

    #[test]
    fn a_typed_query_stays_sfw_and_drops_the_default_frame() {
        let query = GalleryQuery::parse(&SearchParams {
            query: "cats".into(),
            categories: "010".into(),
            sorting: "relevance".into(),
            page: 2,
        })
        .unwrap();
        let resolved = ResolvedSearch::from_query(
            query,
            Some(DisplaySize {
                width: 1920,
                height: 1080,
            }),
        );
        let pairs = crate::wallpaper::wallhaven::pairs(&resolved);
        assert!(pairs.contains(&("purity".into(), "100".into())));
        assert!(pairs.contains(&("q".into(), "cats".into())));
        assert!(!pairs
            .iter()
            .any(|(key, _)| key == "atleast" || key == "ratios" || key == "topRange"));
    }
}
