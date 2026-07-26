//! Reading a browser's own icon off disk.
//!
//! The browser selection step shows each channel's real logo rather than a
//! drawn imitation. The icon comes from the app bundle already installed on
//! this Mac — no asset is downloaded, and none is redistributed.
//!
//! An icon is decoration. Nothing here may fail detection: every problem
//! resolves to `None` and the UI falls back to a neutral placeholder.

use std::path::{Path, PathBuf};

use base64::Engine as _;
use icns::{IconFamily, IconType};

/// Where Chromium-family bundles keep their icon.
const ICON_RELATIVE: &str = "Contents/Resources/app.icns";

/// Preferred first. 128pt covers the selection row at 2x with room to spare;
/// anything larger is wasted bytes in a data URI.
const PREFERRED: [IconType; 4] = [
    IconType::RGBA32_128x128,
    IconType::RGBA32_256x256,
    IconType::RGBA32_64x64,
    IconType::RGBA32_32x32,
];

/// Refuse to read anything implausible as an icon file. Brave's is ~480 KB.
const MAX_ICNS_BYTES: u64 = 8 * 1024 * 1024;

pub fn icon_path(app_path: &str) -> Option<PathBuf> {
    if app_path.is_empty() {
        return None;
    }
    let path = Path::new(app_path).join(ICON_RELATIVE);
    path.is_file().then_some(path)
}

/// Decode an .icns into a PNG data URI, or None if anything is off.
pub fn read_icon_data_uri(app_path: &str) -> Option<String> {
    let path = icon_path(app_path)?;
    let size = std::fs::metadata(&path).ok()?.len();
    if size == 0 || size > MAX_ICNS_BYTES {
        return None;
    }
    let file = std::fs::File::open(&path).ok()?;
    let family = IconFamily::read(std::io::BufReader::new(file)).ok()?;
    let image = PREFERRED
        .iter()
        .find_map(|kind| family.get_icon_with_type(*kind).ok())?;

    let mut png = Vec::new();
    image.write_png(&mut png).ok()?;
    Some(to_data_uri(&png))
}

pub fn to_data_uri(png: &[u8]) -> String {
    format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_app_path_has_no_icon() {
        assert!(icon_path("").is_none());
        assert!(read_icon_data_uri("").is_none());
    }

    #[test]
    fn a_missing_bundle_has_no_icon() {
        assert!(read_icon_data_uri("/Applications/Nothing Here.app").is_none());
    }

    #[test]
    fn a_bundle_without_an_icns_has_no_icon() {
        let dir = tempfile::tempdir().unwrap();
        let bundle = dir.path().join("Fake.app");
        std::fs::create_dir_all(bundle.join("Contents/Resources")).unwrap();
        assert!(read_icon_data_uri(bundle.to_str().unwrap()).is_none());
    }

    #[test]
    fn a_corrupt_icns_is_ignored_rather_than_fatal() {
        let dir = tempfile::tempdir().unwrap();
        let bundle = dir.path().join("Fake.app");
        std::fs::create_dir_all(bundle.join("Contents/Resources")).unwrap();
        std::fs::write(bundle.join(ICON_RELATIVE), b"not an icns at all").unwrap();
        assert!(icon_path(bundle.to_str().unwrap()).is_some());
        assert!(read_icon_data_uri(bundle.to_str().unwrap()).is_none());
    }

    #[test]
    fn an_empty_icns_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let bundle = dir.path().join("Fake.app");
        std::fs::create_dir_all(bundle.join("Contents/Resources")).unwrap();
        std::fs::write(bundle.join(ICON_RELATIVE), b"").unwrap();
        assert!(read_icon_data_uri(bundle.to_str().unwrap()).is_none());
    }

    #[test]
    fn a_data_uri_is_png_and_base64() {
        let uri = to_data_uri(&[0x89, 0x50, 0x4e, 0x47]);
        assert_eq!(uri, "data:image/png;base64,iVBORw==");
    }

    /// The real thing, when Brave happens to be installed here.
    #[test]
    fn the_installed_brave_icon_decodes_to_a_png() {
        let path = "/Applications/Brave Browser.app";
        if !Path::new(path).is_dir() {
            return;
        }
        let uri = read_icon_data_uri(path).expect("Brave icon should decode");
        assert!(uri.starts_with("data:image/png;base64,iVBOR"));
        assert!(uri.len() > 1000, "icon looks too small to be real");
    }
}
