//! Wallpapers the person set, kept across launches.
//!
//! `recent.json` stores enough to set an item again after a restart: the
//! prefixed id, the resolution, the source's full and thumbnail URLs, and
//! the title and credit the source sent.

use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::paths::{self, Root};

use super::model::{GalleryItem, StoredItem, UserError, WallId};

pub const RECENT_LIMIT: usize = 12;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecentItem {
    #[serde(flatten)]
    pub item: StoredItem,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Recent {
    #[serde(default)]
    pub items: Vec<RecentItem>,
}

impl Recent {
    pub fn add(&mut self, item: StoredItem) {
        self.items.retain(|entry| entry.item.id != item.id);
        self.items.insert(0, RecentItem { item });
        self.items.truncate(RECENT_LIMIT);
    }

    pub fn find(&self, id: &WallId) -> Option<StoredItem> {
        self.items
            .iter()
            .find(|entry| &entry.item.id == id)
            .map(|entry| entry.item.clone())
    }

    pub fn public(&self) -> Vec<GalleryItem> {
        self.items.iter().map(|entry| entry.item.public()).collect()
    }
}

pub fn load(root: &Root) -> Recent {
    fs::read(file(root))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

pub fn save(root: &Root, recent: &Recent) -> Result<(), UserError> {
    let failed = UserError::download;
    fs::create_dir_all(root.dir()).map_err(|_| failed())?;
    let bytes = serde_json::to_vec(recent).map_err(|_| failed())?;
    let tmp = root.dir().join("recent.json.tmp");
    {
        let mut out = File::create(&tmp).map_err(|_| failed())?;
        out.write_all(&bytes).map_err(|_| failed())?;
        out.sync_all().map_err(|_| failed())?;
    }
    paths::replace_file(&tmp, &file(root)).map_err(|_| failed())
}

fn file(root: &Root) -> PathBuf {
    root.dir().join("recent.json")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wallpaper::model::Credit;

    fn item(n: usize) -> StoredItem {
        StoredItem {
            id: WallId::parse(&format!("w-{n}")).unwrap(),
            resolution: "3840x2160".into(),
            thumb_small: format!("https://th.wallhaven.cc/small/ab/{n}.jpg"),
            thumb_large: format!("https://th.wallhaven.cc/lg/ab/{n}.jpg"),
            full: format!("https://w.wallhaven.cc/full/ab/wallhaven-{n}.jpg"),
            title: None,
            credit: Some(Credit {
                line: format!("Photo {n}"),
                licence: "CC0".into(),
                page: None,
            }),
        }
    }

    #[test]
    fn recent_survives_a_restart_and_keeps_the_full_url() {
        let dir = std::env::temp_dir().join(format!("spiral-recent-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let root = Root::at(&dir);
        let mut recent = Recent::default();
        for n in 0..15 {
            recent.add(item(n));
        }
        recent.add(item(13));
        save(&root, &recent).unwrap();

        let back = load(&root);
        assert_eq!(back.items.len(), RECENT_LIMIT);
        assert_eq!(back.items[0].item.id.as_str(), "w-13");
        assert_eq!(back.items[0].item.credit.as_ref().unwrap().line, "Photo 13");
        let found = back.find(&WallId::parse("w-5").unwrap()).unwrap();
        assert_eq!(found.full, "https://w.wallhaven.cc/full/ab/wallhaven-5.jpg");
        assert!(back.find(&WallId::parse("w-0").unwrap()).is_none());
        let public = serde_json::to_string(&back.public()).unwrap();
        assert!(!public.contains("http"));
        let _ = fs::remove_dir_all(dir);
    }
}
