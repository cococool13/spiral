mod cache;
mod history;
mod model;
mod net;
mod recent;
mod setter;
mod wallhaven;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::watch;

use crate::paths::Root;
use crate::settings::FitMode;

pub use history::{restore_original, undo, Desktop, HistoryView, Restored};
pub use model::{
    Applied, DisplaySize, GalleryItem, Rendition, SearchPage, SearchParams, UserError, WallId,
};
pub use setter::{largest_display, set_wallpaper, NativeDesktop};

/// The recent row, read from disk so it shows before Wallpaper finishes opening.
pub fn recent_items(root: &Root) -> Vec<GalleryItem> {
    recent::load(root).public()
}

pub fn history_view(root: &Root, desktop: &dyn Desktop) -> HistoryView {
    history::load(root).view(desktop.supported())
}

pub fn stored_thumb_bytes(root: &Root) -> u64 {
    cache::thumb_cache_size(root)
}

pub fn clear_stored_thumbs(root: &Root) -> Result<(), UserError> {
    cache::clear_thumbs(root)
}

#[cfg(debug_assertions)]
pub use setter::current_wallpaper;

use model::{GalleryQuery, ResolvedSearch, StoredItem, StoredPage};
use net::{LiveTransport, SharedTransport};

pub struct WallpaperEngine {
    root: Root,
    transport: SharedTransport,
    display: Option<DisplaySize>,
    catalog: Mutex<HashMap<WallId, StoredItem>>,
    search_job: Mutex<Option<SearchJob>>,
    prefetch_gen: AtomicU64,
}

struct SearchJob {
    resolved: ResolvedSearch,
    rx: watch::Receiver<Option<Result<SearchPage, UserError>>>,
}

impl WallpaperEngine {
    pub fn open(root: Root, display: Option<DisplaySize>) -> Arc<Self> {
        Self::with_transport(root, Arc::new(LiveTransport::new()), display)
    }

    pub fn with_transport(
        root: Root,
        transport: SharedTransport,
        display: Option<DisplaySize>,
    ) -> Arc<Self> {
        Arc::new(Self {
            root,
            transport,
            display,
            catalog: Mutex::new(HashMap::new()),
            search_job: Mutex::new(None),
            prefetch_gen: AtomicU64::new(0),
        })
    }

    pub fn start_default_search(self: &Arc<Self>) {
        let this = Arc::clone(self);
        tokio::spawn(async move {
            let _ = this
                .search(SearchParams {
                    query: String::new(),
                    categories: "111".into(),
                    sorting: "toplist".into(),
                    page: 1,
                })
                .await;
        });
    }

    pub fn cached_first_page(&self) -> Option<SearchPage> {
        let page = cache::read_last_page(&self.root)?;
        self.remember(&page);
        Some(page.public())
    }

    pub async fn search(self: &Arc<Self>, params: SearchParams) -> Result<SearchPage, UserError> {
        let query = GalleryQuery::parse(&params)?;
        let resolved = ResolvedSearch::from_query(query, self.display);
        let rx = {
            let mut slot = self.search_job.lock().expect("search");
            let join = slot.as_ref().and_then(|job| {
                if job.resolved != resolved {
                    return None;
                }
                match &*job.rx.borrow() {
                    None | Some(Ok(_)) => Some(job.rx.clone()),
                    Some(Err(_)) => None,
                }
            });
            if let Some(rx) = join {
                rx
            } else {
                self.prefetch_gen.fetch_add(1, Ordering::Relaxed);
                let (tx, rx) = watch::channel(None);
                *slot = Some(SearchJob {
                    resolved: resolved.clone(),
                    rx: rx.clone(),
                });
                let this = Arc::clone(self);
                let task = resolved.clone();
                tokio::spawn(async move {
                    let result = this.fetch_search(&task).await;
                    let _ = tx.send(Some(result));
                });
                rx
            }
        };
        wait_search(rx).await
    }

    pub fn prefetch_page(self: &Arc<Self>, params: SearchParams) {
        let Ok(query) = GalleryQuery::parse(&params) else {
            return;
        };
        let resolved = ResolvedSearch::from_query(query, self.display);
        let token = self.begin_prefetch();
        let this = Arc::clone(self);
        tokio::spawn(async move {
            if !this.prefetch_current(token) {
                return;
            }
            let Ok(stored) = this.fetch_stored(&resolved).await else {
                return;
            };
            if !this.prefetch_current(token) {
                return;
            }
            this.remember(&stored);
            for item in stored.items {
                if !this.prefetch_current(token) {
                    return;
                }
                let _ = cache::download_thumb(
                    &this.root,
                    this.transport.as_ref(),
                    &item.id,
                    item.thumb(Rendition::Small),
                    Rendition::Small,
                )
                .await;
            }
        });
    }

    pub fn begin_prefetch(&self) -> u64 {
        self.prefetch_gen.fetch_add(1, Ordering::Relaxed) + 1
    }

    pub fn prefetch_current(&self, token: u64) -> bool {
        self.prefetch_gen.load(Ordering::Relaxed) == token
    }

    pub fn stage_full(self: &Arc<Self>, id: WallId) {
        let this = Arc::clone(self);
        tokio::spawn(async move {
            let _ = this.stage_one(id).await;
        });
    }

    pub async fn stage_one(&self, id: WallId) -> Result<(), UserError> {
        let item = self.item(&id)?;
        let _ = cache::download_full(
            &self.root.staging(),
            self.transport.as_ref(),
            &id,
            &item.full,
        )
        .await?;
        cache::cap_staging(&self.root.staging());
        Ok(())
    }

    pub async fn apply<F>(&self, id: WallId, fit: FitMode, set: F) -> Result<Applied, UserError>
    where
        F: FnOnce(std::path::PathBuf, FitMode) -> Result<Applied, UserError>,
    {
        let item = self.item(&id)?;
        let path = if let Some(staged) = cache::find_full(&self.root.staging(), &id) {
            cache::promote(&staged, &self.root.wallpapers())?
        } else if let Some(existing) = cache::find_full(&self.root.wallpapers(), &id) {
            existing
        } else {
            cache::download_full(
                &self.root.wallpapers(),
                self.transport.as_ref(),
                &id,
                &item.full,
            )
            .await?
        };
        let applied = set(path.clone(), fit)?;
        let mut keep = history::load(&self.root).pinned();
        keep.push(path);
        cache::prune_wallpapers(&self.root.wallpapers(), &keep);
        let mut recent = recent::load(&self.root);
        recent.add(item);
        let _ = recent::save(&self.root, &recent);
        Ok(applied)
    }

    /// `apply`, plus a snapshot of the desktop it replaces for undo and
    /// restore. A desktop Spiral cannot read is applied over without one.
    pub async fn apply_tracked(
        &self,
        id: WallId,
        fit: FitMode,
        desktop: &dyn Desktop,
    ) -> Result<Applied, UserError> {
        let root = self.root.clone();
        self.apply(id, fit, move |path, fit| {
            let _guard = history::lock();
            let before = desktop.capture().unwrap_or_default();
            let applied = desktop.set(path, fit)?;
            let mut stored = history::load(&root);
            stored.record(before, &root.wallpapers());
            let _ = history::save(&root, &stored);
            Ok(applied)
        })
        .await
    }

    pub async fn thumb(&self, id: &WallId, rendition: Rendition) -> Result<Vec<u8>, UserError> {
        if let Some(bytes) = cache::read_thumb(&self.root, id, rendition) {
            return Ok(bytes);
        }
        let item = self.item(id)?;
        cache::download_thumb(
            &self.root,
            self.transport.as_ref(),
            id,
            item.thumb(rendition),
            rendition,
        )
        .await
    }

    async fn fetch_search(&self, resolved: &ResolvedSearch) -> Result<SearchPage, UserError> {
        let stored = self.fetch_stored(resolved).await?;
        self.remember(&stored);
        if resolved.query.is_default_gallery() && resolved.query.page == 1 {
            let _ = cache::write_last_page(&self.root, &stored);
        }
        Ok(stored.public())
    }

    async fn fetch_stored(&self, resolved: &ResolvedSearch) -> Result<StoredPage, UserError> {
        let pairs = wallhaven::pairs(resolved);
        let bytes = self
            .transport
            .get(wallhaven::endpoint(), &pairs)
            .await
            .map_err(|err| {
                if err.code() == "download_failed" {
                    UserError::bad()
                } else {
                    err
                }
            })?;
        wallhaven::parse_page(&bytes)
    }

    fn remember(&self, page: &StoredPage) {
        let mut catalog = self.catalog.lock().expect("catalog");
        for item in &page.items {
            catalog.insert(item.id.clone(), item.clone());
        }
    }

    /// This session's search results first, then the recent row saved on
    /// disk, so an item set in an earlier launch can be set again.
    fn item(&self, id: &WallId) -> Result<StoredItem, UserError> {
        let known = self.catalog.lock().expect("catalog").get(id).cloned();
        known
            .or_else(|| recent::load(&self.root).find(id))
            .ok_or_else(UserError::unknown)
    }
}

async fn wait_search(
    mut rx: watch::Receiver<Option<Result<SearchPage, UserError>>>,
) -> Result<SearchPage, UserError> {
    loop {
        if let Some(result) = rx.borrow().clone() {
            return result;
        }
        if rx.changed().await.is_err() {
            return Err(UserError::bad());
        }
    }
}

pub fn parse_thumb_request(uri: &tauri::http::Uri) -> Option<(WallId, Rendition)> {
    let path = uri.path().trim_start_matches('/');
    if path.contains('/') {
        return None;
    }
    let id = WallId::parse(path).ok()?;
    let rendition = uri.query().unwrap_or("").split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=')?;
        (key == "r").then(|| Rendition::parse(value)).flatten()
    })?;
    Some((id, rendition))
}

pub fn thumb_response(bytes: Vec<u8>) -> tauri::http::Response<Vec<u8>> {
    let Ok(ext) = net::image_ext(&bytes) else {
        return empty_thumb();
    };
    tauri::http::Response::builder()
        .status(200)
        .header(tauri::http::header::CONTENT_TYPE, net::content_type(ext))
        .body(bytes)
        .expect("thumb response")
}

pub fn empty_thumb() -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(404)
        .body(Vec::new())
        .expect("thumb response")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::Root;
    use crate::settings::FitMode;
    use model::{StoredItem, StoredPage};
    use net::{BoxFuture, Transport};
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

    struct Dir(Root);

    impl Drop for Dir {
        fn drop(&mut self) {
            if let Some(parent) = self.0.last_page().parent() {
                let _ = fs::remove_dir_all(parent);
            }
        }
    }

    fn scratch(name: &str) -> Dir {
        let n = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let path =
            std::env::temp_dir().join(format!("spiral-engine-{name}-{}-{n}", std::process::id()));
        fs::create_dir_all(&path).unwrap();
        Dir(Root::at(path))
    }

    struct Script {
        hits: AtomicUsize,
        body: Vec<u8>,
        fail: bool,
    }

    impl Transport for Script {
        fn get<'a>(
            &'a self,
            _url: &'a str,
            _query: &'a [(String, String)],
        ) -> BoxFuture<'a, Result<Vec<u8>, UserError>> {
            self.hits.fetch_add(1, Ordering::Relaxed);
            let fail = self.fail;
            let body = self.body.clone();
            Box::pin(async move {
                if fail {
                    Err(UserError::offline())
                } else {
                    Ok(body)
                }
            })
        }
    }

    fn seed(root: &Root, count: usize) {
        let items = (0..count)
            .map(|index| StoredItem {
                id: WallId::parse(&format!("w-{index}")).unwrap(),
                resolution: "1920x1080".into(),
                thumb_small: format!("https://th.wallhaven.cc/small/ab/{index}.jpg"),
                thumb_large: format!("https://th.wallhaven.cc/lg/ab/{index}.jpg"),
                full: format!("https://w.wallhaven.cc/full/ab/wallhaven-{index}.jpg"),
            })
            .collect();
        cache::write_last_page(
            root,
            &StoredPage {
                v: StoredPage::VERSION,
                page: 1,
                last_page: 4,
                items,
            },
        )
        .unwrap();
    }

    #[test]
    fn a_seeded_last_page_returns_eight_items_without_a_network_call() {
        let dir = scratch("page");
        seed(&dir.0, 8);
        let script = Arc::new(Script {
            hits: AtomicUsize::new(0),
            body: Vec::new(),
            fail: true,
        });
        let transport: SharedTransport = script.clone();
        let engine = WallpaperEngine::with_transport(dir.0.clone(), transport, None);
        let page = engine.cached_first_page().expect("seeded page");
        assert_eq!(page.items.len(), 8);
        assert_eq!(page.items[0].id.as_str(), "w-0");
        assert_eq!(page.items[7].resolution, "1920x1080");
        assert_eq!(script.hits.load(Ordering::Relaxed), 0);
        let json = serde_json::to_string(&page).unwrap();
        assert!(!json.contains("http"));
        assert!(!json.contains("wallhaven"));
        assert!(!json.contains("thumbSmall"));
        assert!(!dir.0.thumb_ledger().exists());
    }

    #[test]
    fn a_new_prefetch_invalidates_the_previous_token() {
        let dir = scratch("token");
        let engine = WallpaperEngine::with_transport(
            dir.0.clone(),
            Arc::new(Script {
                hits: AtomicUsize::new(0),
                body: Vec::new(),
                fail: true,
            }),
            None,
        );
        let first = engine.begin_prefetch();
        let second = engine.begin_prefetch();
        assert!(!engine.prefetch_current(first));
        assert!(engine.prefetch_current(second));
    }

    #[tokio::test]
    async fn a_different_search_cancels_prefetch_and_does_not_read_the_cached_page_as_network() {
        let dir = scratch("cancel");
        seed(&dir.0, 8);
        let script = Arc::new(Script {
            hits: AtomicUsize::new(0),
            body: Vec::new(),
            fail: true,
        });
        let transport: SharedTransport = script.clone();
        let engine = WallpaperEngine::with_transport(dir.0.clone(), transport, None);
        assert_eq!(engine.cached_first_page().unwrap().items.len(), 8);
        assert_eq!(script.hits.load(Ordering::Relaxed), 0);
        let token = engine.begin_prefetch();
        let err = engine
            .search(SearchParams {
                query: "cats".into(),
                categories: "111".into(),
                sorting: "relevance".into(),
                page: 1,
            })
            .await
            .unwrap_err();
        assert_eq!(err.to_string(), "offline");
        assert!(!engine.prefetch_current(token));
        assert_eq!(script.hits.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn staging_keeps_two_full_images_and_apply_reuses_the_file() {
        let dir = scratch("stage");
        seed(&dir.0, 3);
        let script = Arc::new(Script {
            hits: AtomicUsize::new(0),
            body: vec![0xFF, 0xD8, 0xFF, 0x00],
            fail: false,
        });
        let transport: SharedTransport = script.clone();
        let engine = WallpaperEngine::with_transport(dir.0.clone(), transport, None);
        let page = engine.cached_first_page().unwrap();
        for item in &page.items {
            engine.stage_one(item.id.clone()).await.unwrap();
        }
        assert_eq!(script.hits.load(Ordering::Relaxed), 3);
        let staged: Vec<_> = fs::read_dir(dir.0.staging())
            .unwrap()
            .flatten()
            .filter(|entry| entry.path().is_file())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(staged.len(), 2);
        fs::create_dir_all(dir.0.wallpapers()).unwrap();
        let outside = dir.0.last_page().parent().unwrap().join("outside.jpg");
        fs::write(&outside, b"outside").unwrap();
        let id = WallId::parse(staged[0].split('.').next().unwrap()).unwrap();
        let hits = script.hits.load(Ordering::Relaxed);
        let applied = engine
            .apply(id, FitMode::Fill, |path, _fit| {
                assert!(path.starts_with(dir.0.wallpapers()));
                assert!(path.is_file());
                Ok(Applied::here(2))
            })
            .await
            .unwrap();
        assert_eq!(applied, Applied::here(2));
        assert_eq!(script.hits.load(Ordering::Relaxed), hits);
        assert!(outside.is_file());
        assert_eq!(fs::read(&outside).unwrap(), b"outside");
    }

    /// One screen whose picture is whatever was last set or restored.
    struct FakeDesktop(Mutex<history::Screen>);

    impl FakeDesktop {
        fn showing(path: &std::path::Path) -> Self {
            Self(Mutex::new(history::Screen {
                name: "Built-in Display".into(),
                index: 0,
                path: path.to_path_buf(),
                scaling: Some(3),
                clipping: Some(true),
            }))
        }

        fn path(&self) -> std::path::PathBuf {
            self.0.lock().unwrap().path.clone()
        }
    }

    impl Desktop for FakeDesktop {
        fn capture(&self) -> Result<Vec<history::Screen>, UserError> {
            Ok(vec![self.0.lock().unwrap().clone()])
        }

        fn set(&self, path: std::path::PathBuf, _fit: FitMode) -> Result<Applied, UserError> {
            let mut screen = self.0.lock().unwrap();
            screen.path = path;
            screen.scaling = Some(3);
            Ok(Applied::here(1))
        }

        fn restore(&self, screens: &[history::Screen]) -> Result<u32, UserError> {
            *self.0.lock().unwrap() = screens[0].clone();
            Ok(1)
        }
    }

    fn jpeg_engine(dir: &Dir) -> (Arc<WallpaperEngine>, Arc<Script>) {
        let script = Arc::new(Script {
            hits: AtomicUsize::new(0),
            body: vec![0xFF, 0xD8, 0xFF, 0x00],
            fail: false,
        });
        let transport: SharedTransport = script.clone();
        let engine = WallpaperEngine::with_transport(dir.0.clone(), transport, None);
        (engine, script)
    }

    #[tokio::test]
    async fn undo_walks_back_through_applies_and_restore_puts_back_the_original() {
        let dir = scratch("undo");
        seed(&dir.0, 3);
        let original = dir.0.dir().join("beach.jpg");
        fs::write(&original, b"mine").unwrap();
        let desktop = FakeDesktop::showing(&original);
        let (engine, _) = jpeg_engine(&dir);
        engine.cached_first_page().unwrap();
        let first = WallId::parse("w-0").unwrap();
        let second = WallId::parse("w-1").unwrap();
        engine
            .apply_tracked(first.clone(), FitMode::Fill, &desktop)
            .await
            .unwrap();
        engine
            .apply_tracked(second.clone(), FitMode::Fill, &desktop)
            .await
            .unwrap();
        assert_eq!(desktop.path(), dir.0.wallpapers().join("w-1.jpg"));
        assert!(
            dir.0.wallpapers().join("w-0.jpg").is_file(),
            "a file undo may put back is pinned"
        );
        let view = history_view(&dir.0, &desktop);
        assert_eq!(view.undo, 2);
        assert_eq!(view.original.unwrap().name, "beach.jpg");

        let back = undo(&dir.0, &desktop).unwrap();
        assert_eq!(back.current, Some(first));
        assert_eq!(desktop.path(), dir.0.wallpapers().join("w-0.jpg"));

        let restored = restore_original(&dir.0, &desktop).unwrap();
        assert_eq!(restored.current, None);
        assert_eq!(desktop.path(), original);
        undo(&dir.0, &desktop).unwrap();
        assert_eq!(desktop.path(), dir.0.wallpapers().join("w-0.jpg"));

        fs::remove_file(&original).unwrap();
        let err = restore_original(&dir.0, &desktop).unwrap_err();
        assert_eq!(err.to_string(), "restore_missing:beach.jpg");
        assert_eq!(desktop.path(), dir.0.wallpapers().join("w-0.jpg"));
    }

    #[tokio::test]
    async fn undo_with_nothing_recorded_says_so() {
        let dir = scratch("empty-undo");
        let desktop = FakeDesktop::showing(std::path::Path::new("/nowhere.jpg"));
        assert_eq!(
            undo(&dir.0, &desktop).unwrap_err().to_string(),
            "nothing_to_undo"
        );
        assert_eq!(
            restore_original(&dir.0, &desktop).unwrap_err().to_string(),
            "no_original"
        );
    }

    #[tokio::test]
    async fn a_recent_item_from_an_earlier_launch_applies_and_downloads_again_if_evicted() {
        let dir = scratch("recent");
        seed(&dir.0, 3);
        let desktop = FakeDesktop::showing(std::path::Path::new("/nowhere.jpg"));
        let (engine, _) = jpeg_engine(&dir);
        engine.cached_first_page().unwrap();
        let id = WallId::parse("w-2").unwrap();
        engine
            .apply_tracked(id.clone(), FitMode::Fill, &desktop)
            .await
            .unwrap();
        assert_eq!(recent_items(&dir.0)[0].id, id);

        fs::remove_file(dir.0.last_page()).unwrap();
        fs::remove_dir_all(dir.0.wallpapers()).unwrap();
        let (fresh, script) = jpeg_engine(&dir);
        fresh
            .apply_tracked(id.clone(), FitMode::Fill, &desktop)
            .await
            .unwrap();
        assert_eq!(script.hits.load(Ordering::Relaxed), 1);
        assert_eq!(desktop.path(), dir.0.wallpapers().join("w-2.jpg"));
        assert!(fresh
            .apply_tracked(WallId::parse("w-9").unwrap(), FitMode::Fill, &desktop)
            .await
            .is_err());
    }
}
