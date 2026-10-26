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

    pub fn unavailable() -> Self {
        Self::new("source_unavailable")
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

/// Every source owns one letter. Wallhaven ids stay plain alphanumeric; the
/// others may carry `_` and `-` from their own ids, never `/` or `.`, so an id
/// is always one safe file name.
pub const PREFIXES: [char; 9] = ['w', 'n', 'e', 'c', 'a', 'm', 'b', 's', 'r'];

impl WallId {
    pub fn parse(raw: &str) -> Result<Self, UserError> {
        let mut chars = raw.chars();
        let prefix = chars.next().ok_or_else(UserError::bad)?;
        if !PREFIXES.contains(&prefix) || chars.next() != Some('-') {
            return Err(UserError::bad());
        }
        let rest = &raw[2..];
        let ok = if prefix == 'w' {
            rest.chars().all(|c| c.is_ascii_alphanumeric())
        } else {
            rest.chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        };
        if rest.is_empty() || rest.len() > 96 || !ok {
            return Err(UserError::bad());
        }
        Ok(Self(raw.to_string()))
    }

    pub fn make(prefix: char, rest: &str) -> Option<Self> {
        Self::parse(&format!("{prefix}-{rest}")).ok()
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

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
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

#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    pub query: String,
    pub categories: String,
    pub sorting: String,
    pub page: u32,
    /// A source filter id (`wallhaven`, `all`, `space`, `museums`, ...).
    /// Missing means Wallhaven, so the old command shape still works.
    #[serde(default)]
    pub source: Option<String>,
    /// One Wallhaven palette colour, six hex digits without `#`.
    #[serde(default)]
    pub colors: Option<String>,
    /// Ask only for images at least as large as the largest display.
    #[serde(default)]
    pub fit: bool,
}

/// What the person picked in the source filter. Groups fan out to several
/// sources and interleave the answers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SourceFilter {
    All,
    Wallhaven,
    Space,
    Museums,
    Commons,
    Bing,
    Nasa,
    Esa,
    Aic,
    Cleveland,
    Smithsonian,
    Rijks,
}

impl SourceFilter {
    pub fn parse(raw: Option<&str>) -> Result<Self, UserError> {
        Ok(match raw.unwrap_or("wallhaven") {
            "all" => Self::All,
            "wallhaven" => Self::Wallhaven,
            "space" => Self::Space,
            "museums" => Self::Museums,
            "commons" => Self::Commons,
            "bing" => Self::Bing,
            "nasa" => Self::Nasa,
            "esa" => Self::Esa,
            "aic" => Self::Aic,
            "cleveland" => Self::Cleveland,
            "smithsonian" => Self::Smithsonian,
            "rijks" => Self::Rijks,
            _ => return Err(UserError::bad()),
        })
    }

    /// Source ids behind this filter, in the order their items interleave.
    pub fn members(self) -> &'static [&'static str] {
        match self {
            // Smithsonian (DEMO_KEY: 10 requests an hour) and Rijksmuseum (one
            // request per object) cost too much to ask on every "All" page.
            Self::All => &[
                "wallhaven",
                "nasa",
                "esa",
                "commons",
                "aic",
                "cleveland",
                "bing",
            ],
            Self::Wallhaven => &["wallhaven"],
            Self::Space => &["nasa", "esa"],
            Self::Museums => &["aic", "cleveland", "rijks", "smithsonian"],
            Self::Commons => &["commons"],
            Self::Bing => &["bing"],
            Self::Nasa => &["nasa"],
            Self::Esa => &["esa"],
            Self::Aic => &["aic"],
            Self::Cleveland => &["cleveland"],
            Self::Smithsonian => &["smithsonian"],
            Self::Rijks => &["rijks"],
        }
    }
}

/// Wallhaven's colour search accepts exactly these values.
pub const WALLHAVEN_PALETTE: [&str; 29] = [
    "660000", "990000", "cc0000", "cc3333", "ea4c88", "993399", "663399", "333399", "0066cc",
    "0099cc", "66cccc", "77cc33", "669900", "336600", "666600", "999900", "cccc33", "ffff00",
    "ffcc33", "ff9900", "ff6600", "cc6633", "996633", "663300", "000000", "999999", "cccccc",
    "ffffff", "424153",
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GalleryQuery {
    pub query: String,
    pub categories: Categories,
    pub sorting: Sorting,
    pub page: u32,
    pub source: SourceFilter,
    pub colors: Option<&'static str>,
    pub fit: bool,
}

impl GalleryQuery {
    pub fn parse(params: &SearchParams) -> Result<Self, UserError> {
        if params.page == 0 || params.page > 500 {
            return Err(UserError::bad());
        }
        let colors = match params.colors.as_deref().map(str::trim) {
            None | Some("") => None,
            Some(raw) => Some(
                *WALLHAVEN_PALETTE
                    .iter()
                    .find(|colour| raw.eq_ignore_ascii_case(colour))
                    .ok_or_else(UserError::bad)?,
            ),
        };
        Ok(Self {
            query: params.query.trim().chars().take(120).collect(),
            categories: Categories::parse(&params.categories)?,
            sorting: Sorting::parse(&params.sorting)?,
            page: params.page,
            source: SourceFilter::parse(params.source.as_deref())?,
            colors,
            fit: params.fit,
        })
    }

    pub fn is_default_gallery(&self) -> bool {
        self.query.is_empty()
            && self.categories == Categories::All
            && self.sorting == Sorting::Toplist
            && self.source == SourceFilter::Wallhaven
            && self.colors.is_none()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedSearch {
    pub query: GalleryQuery,
    pub atleast: Option<DisplaySize>,
    pub ratios: Option<&'static str>,
    pub top_range: Option<&'static str>,
    pub display: Option<DisplaySize>,
}

pub const LANDSCAPE_RATIOS: &str = "16x9,16x10,21x9";

/// The smallest picture worth offering as a wallpaper when the person has not
/// asked for their own display size.
pub const WALLPAPER_GRADE: DisplaySize = DisplaySize {
    width: 1920,
    height: 1080,
};

impl ResolvedSearch {
    pub fn from_query(query: GalleryQuery, display: Option<DisplaySize>) -> Self {
        let framed = query.is_default_gallery() || query.fit;
        Self {
            top_range: (query.sorting == Sorting::Toplist).then_some("1M"),
            atleast: framed.then_some(display).flatten(),
            ratios: framed.then_some(LANDSCAPE_RATIOS),
            display,
            query,
        }
    }

    /// The pixel floor every non-Wallhaven adapter filters on: the largest
    /// display when "fits" is on, otherwise wallpaper grade.
    pub fn floor(&self) -> DisplaySize {
        match (self.query.fit, self.display) {
            (true, Some(display)) => DisplaySize {
                width: display.width.max(WALLPAPER_GRADE.width),
                height: display.height.max(WALLPAPER_GRADE.height),
            },
            _ => WALLPAPER_GRADE,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage {
    pub items: Vec<GalleryItem>,
    pub page: u32,
    pub last_page: u32,
    /// Source ids that did not answer for this page; the rest still show.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub unavailable: Vec<&'static str>,
}

/// Who made a picture and on what terms. `page` is a place a person can type,
/// without a scheme, never a link the webview follows.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Credit {
    pub line: String,
    pub licence: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct GalleryItem {
    pub id: WallId,
    pub resolution: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credit: Option<Credit>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credit: Option<Credit>,
}

impl StoredItem {
    pub fn public(&self) -> GalleryItem {
        GalleryItem {
            id: self.id.clone(),
            resolution: self.resolution.clone(),
            title: self.title.clone(),
            credit: self.credit.clone(),
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
    #[serde(skip)]
    pub unavailable: Vec<&'static str>,
}

impl StoredPage {
    pub const VERSION: u32 = 1;

    pub fn new(page: u32, last_page: u32, items: Vec<StoredItem>) -> Self {
        Self {
            v: Self::VERSION,
            page,
            last_page: last_page.max(page),
            items,
            unavailable: Vec::new(),
        }
    }

    pub fn public(&self) -> SearchPage {
        SearchPage {
            items: self.items.iter().map(StoredItem::public).collect(),
            page: self.page,
            last_page: self.last_page,
            unavailable: self.unavailable.clone(),
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
        assert!(WallId::parse("w-ab_c").is_err());
        assert!(WallId::parse("n-PIA_12-3").is_ok());
        assert!(WallId::parse("x-abc").is_err());
        assert!(WallId::parse("n-a.b").is_err());
        assert!(WallId::parse("n-a/b").is_err());
    }

    #[test]
    fn a_colour_outside_the_palette_and_an_unknown_source_are_refused() {
        let mut params = SearchParams {
            query: String::new(),
            categories: "111".into(),
            sorting: "toplist".into(),
            page: 1,
            ..Default::default()
        };
        params.colors = Some("123456".into());
        assert!(GalleryQuery::parse(&params).is_err());
        params.colors = Some("336600".into());
        assert_eq!(GalleryQuery::parse(&params).unwrap().colors, Some("336600"));
        params.source = Some("pexels".into());
        assert!(GalleryQuery::parse(&params).is_err());
    }

    #[test]
    fn fit_frames_any_search_and_raises_the_floor_to_the_display() {
        let params = SearchParams {
            query: "cats".into(),
            categories: "111".into(),
            sorting: "relevance".into(),
            page: 1,
            fit: true,
            source: Some("museums".into()),
            ..Default::default()
        };
        let display = DisplaySize {
            width: 5120,
            height: 2880,
        };
        let resolved =
            ResolvedSearch::from_query(GalleryQuery::parse(&params).unwrap(), Some(display));
        assert_eq!(resolved.atleast, Some(display));
        assert_eq!(resolved.floor(), display);
        let loose = ResolvedSearch::from_query(
            GalleryQuery::parse(&SearchParams {
                fit: false,
                ..params
            })
            .unwrap(),
            Some(display),
        );
        assert_eq!(loose.atleast, None);
        assert_eq!(loose.floor(), WALLPAPER_GRADE);
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
            ..Default::default()
        })
        .unwrap();
        let resolved = ResolvedSearch::from_query(
            query,
            Some(DisplaySize {
                width: 2560,
                height: 1440,
            }),
        );
        let pairs = crate::wallpaper::sources::wallhaven::pairs(&resolved);
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
            ..Default::default()
        })
        .unwrap();
        let resolved = ResolvedSearch::from_query(
            query,
            Some(DisplaySize {
                width: 1920,
                height: 1080,
            }),
        );
        let pairs = crate::wallpaper::sources::wallhaven::pairs(&resolved);
        assert!(pairs.contains(&("purity".into(), "100".into())));
        assert!(pairs.contains(&("q".into(), "cats".into())));
        assert!(!pairs
            .iter()
            .any(|(key, _)| key == "atleast" || key == "ratios" || key == "topRange"));
    }
}
