use std::path::PathBuf;

use crate::settings::FitMode;

use super::history::{Desktop, Screen};
use super::model::{Applied, DisplaySize, UserError};

/// The real desktop: reads and sets pictures through the OS, on the main
/// thread where AppKit needs it.
pub struct NativeDesktop<'a>(pub &'a tauri::AppHandle);

impl Desktop for NativeDesktop<'_> {
    fn capture(&self) -> Result<Vec<Screen>, UserError> {
        capture_desktop(self.0)
    }

    fn set(&self, path: PathBuf, fit: FitMode) -> Result<Applied, UserError> {
        set_wallpaper(self.0, path, fit)
    }

    fn restore(&self, screens: &[Screen]) -> Result<u32, UserError> {
        restore_desktop(self.0, screens.to_vec())
    }

    fn supported(&self) -> bool {
        cfg!(any(target_os = "macos", windows))
    }
}

fn capture_desktop(app: &tauri::AppHandle) -> Result<Vec<Screen>, UserError> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(macos::capture());
        })
        .map_err(|_| UserError::apply("this Mac"))?;
        rx.recv().map_err(|_| UserError::apply("this Mac"))?
    }

    #[cfg(windows)]
    {
        let _ = app;
        return windows::capture();
    }

    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = app;
        Err(UserError::new("restore_unsupported"))
    }
}

fn restore_desktop(app: &tauri::AppHandle, screens: Vec<Screen>) -> Result<u32, UserError> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(macos::restore(&screens));
        })
        .map_err(|_| UserError::apply("this Mac"))?;
        rx.recv().map_err(|_| UserError::apply("this Mac"))?
    }

    #[cfg(windows)]
    {
        let _ = app;
        return windows::restore(&screens);
    }

    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (app, screens);
        Err(UserError::new("restore_unsupported"))
    }
}

pub fn set_wallpaper(
    app: &tauri::AppHandle,
    path: PathBuf,
    fit: FitMode,
) -> Result<Applied, UserError> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(macos::set(&path, fit));
        })
        .map_err(|_| UserError::apply("this Mac"))?;
        rx.recv().map_err(|_| UserError::apply("this Mac"))?
    }

    #[cfg(windows)]
    {
        let _ = app;
        return windows::set(&path, fit);
    }

    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (app, path, fit);
        Err(UserError::apply("this computer"))
    }
}

pub fn largest_display(app: &tauri::AppHandle) -> Option<DisplaySize> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(macos::largest());
        })
        .ok()?;
        rx.recv().ok().flatten()
    }

    #[cfg(windows)]
    {
        let _ = app;
        return windows::largest();
    }

    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = app;
        None
    }
}

#[cfg(debug_assertions)]
pub fn current_wallpaper(app: &tauri::AppHandle) -> Result<Option<PathBuf>, UserError> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(macos::current());
        })
        .map_err(|_| UserError::apply("this Mac"))?;
        rx.recv().map_err(|_| UserError::apply("this Mac"))?
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(None)
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2::runtime::AnyObject;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{
        NSScreen, NSWorkspace, NSWorkspaceDesktopImageAllowClippingKey,
        NSWorkspaceDesktopImageOptionKey, NSWorkspaceDesktopImageScalingKey,
    };
    use objc2_foundation::{NSDictionary, NSNumber, NSString, NSURL};
    use std::path::Path;

    use crate::settings::FitMode;

    use super::super::history::{self, Screen};
    use super::super::model::{Applied, DisplaySize, UserError};

    type DesktopOptions = NSDictionary<NSWorkspaceDesktopImageOptionKey, AnyObject>;

    pub fn desktop_options(fit: FitMode) -> objc2::rc::Retained<DesktopOptions> {
        let scaling = NSNumber::new_usize(match fit {
            FitMode::Fill | FitMode::Fit => 3,
            FitMode::Center => 2,
        });
        let clipping = NSNumber::new_bool(matches!(fit, FitMode::Fill));
        unsafe {
            NSDictionary::from_slices(
                &[
                    NSWorkspaceDesktopImageScalingKey,
                    NSWorkspaceDesktopImageAllowClippingKey,
                ],
                &[&scaling as &AnyObject, &clipping as &AnyObject],
            )
        }
    }

    pub fn set(path: &Path, fit: FitMode) -> Result<Applied, UserError> {
        let mtm = MainThreadMarker::new().ok_or_else(|| UserError::apply("this Mac"))?;
        let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
        let workspace = NSWorkspace::sharedWorkspace();
        let options = desktop_options(fit);
        let screens = NSScreen::screens(mtm);
        if screens.is_empty() {
            return Err(UserError::apply("this Mac"));
        }
        for (index, screen) in screens.iter().enumerate() {
            let name = screen.localizedName().to_string();
            let label = if name.is_empty() {
                format!("Display {}", index + 1)
            } else {
                name
            };
            unsafe {
                workspace.setDesktopImageURL_forScreen_options_error(&url, &screen, &options)
            }
            .map_err(|_| UserError::apply(&label))?;
        }
        Ok(Applied::here(screens.len() as u32))
    }

    fn screen_label(name: String, index: usize) -> String {
        if name.is_empty() {
            format!("Display {}", index + 1)
        } else {
            name
        }
    }

    /// Every screen's current picture and placement, through the public
    /// `desktopImageURL(for:)` and `desktopImageOptions(for:)`.
    pub fn capture() -> Result<Vec<Screen>, UserError> {
        let mtm = MainThreadMarker::new().ok_or_else(|| UserError::apply("this Mac"))?;
        let workspace = NSWorkspace::sharedWorkspace();
        let mut out = Vec::new();
        for (index, screen) in NSScreen::screens(mtm).iter().enumerate() {
            let Some(path) = workspace
                .desktopImageURLForScreen(&screen)
                .and_then(|url| url.path())
            else {
                continue;
            };
            let options = workspace.desktopImageOptionsForScreen(&screen);
            let number = |key: &NSString| {
                options
                    .as_ref()
                    .and_then(|options| options.objectForKey(key))
                    .and_then(|value| value.downcast::<NSNumber>().ok())
            };
            let (scaling, clipping) = unsafe {
                (
                    number(NSWorkspaceDesktopImageScalingKey).map(|n| n.as_isize() as i64),
                    number(NSWorkspaceDesktopImageAllowClippingKey).map(|n| n.as_bool()),
                )
            };
            out.push(Screen {
                name: screen.localizedName().to_string(),
                index: index as u32,
                path: path.to_string().into(),
                scaling,
                clipping,
            });
        }
        Ok(out)
    }

    /// Sets each live screen back to the matching saved picture. A screen with
    /// no match is left alone.
    pub fn restore(screens: &[Screen]) -> Result<u32, UserError> {
        let mtm = MainThreadMarker::new().ok_or_else(|| UserError::apply("this Mac"))?;
        let workspace = NSWorkspace::sharedWorkspace();
        let mut changed = 0;
        for (index, screen) in NSScreen::screens(mtm).iter().enumerate() {
            let name = screen.localizedName().to_string();
            let Some(saved) = history::match_screen(screens, &name, index as u32) else {
                continue;
            };
            let url = NSURL::fileURLWithPath(&NSString::from_str(&saved.path.to_string_lossy()));
            let scaling = saved.scaling.map(|raw| NSNumber::new_isize(raw as isize));
            let clipping = saved.clipping.map(NSNumber::new_bool);
            let mut keys: Vec<&NSWorkspaceDesktopImageOptionKey> = Vec::new();
            let mut values: Vec<&AnyObject> = Vec::new();
            unsafe {
                if let Some(scaling) = &scaling {
                    keys.push(NSWorkspaceDesktopImageScalingKey);
                    values.push(scaling as &AnyObject);
                }
                if let Some(clipping) = &clipping {
                    keys.push(NSWorkspaceDesktopImageAllowClippingKey);
                    values.push(clipping as &AnyObject);
                }
            }
            let options = NSDictionary::from_slices(&keys, &values);
            unsafe {
                workspace.setDesktopImageURL_forScreen_options_error(&url, &screen, &options)
            }
            .map_err(|_| UserError::apply(&screen_label(name, index)))?;
            changed += 1;
        }
        if changed == 0 {
            return Err(UserError::apply("this Mac"));
        }
        Ok(changed)
    }

    pub fn largest() -> Option<DisplaySize> {
        let mtm = MainThreadMarker::new()?;
        let mut best: Option<DisplaySize> = None;
        let mut best_area = 0u64;
        for screen in NSScreen::screens(mtm).iter() {
            let frame = screen.frame();
            let scale = screen.backingScaleFactor();
            let width = (frame.size.width * scale).round().max(0.0) as u32;
            let height = (frame.size.height * scale).round().max(0.0) as u32;
            let area = u64::from(width) * u64::from(height);
            if area > best_area {
                best_area = area;
                best = Some(DisplaySize { width, height });
            }
        }
        best
    }

    #[cfg(debug_assertions)]
    pub fn current() -> Result<Option<std::path::PathBuf>, UserError> {
        let mtm = MainThreadMarker::new().ok_or_else(|| UserError::apply("this Mac"))?;
        let workspace = NSWorkspace::sharedWorkspace();
        let Some(screen) = NSScreen::screens(mtm).iter().next() else {
            return Ok(None);
        };
        let url = workspace.desktopImageURLForScreen(&screen);
        Ok(url
            .and_then(|u| u.path())
            .map(|path| path.to_string().into()))
    }

    #[cfg(test)]
    mod tests {
        use objc2_app_kit::{
            NSWorkspaceDesktopImageAllowClippingKey, NSWorkspaceDesktopImageFillColorKey,
            NSWorkspaceDesktopImageScalingKey,
        };
        use objc2_foundation::NSString;

        use super::*;

        fn has_key(options: &DesktopOptions, key: &NSString) -> bool {
            let keys = options.allKeys();
            (0..keys.count()).any(|index| keys.objectAtIndex(index).isEqualToString(key))
        }

        #[test]
        fn the_options_dictionary_has_exactly_the_two_public_keys() {
            for fit in [FitMode::Fill, FitMode::Fit, FitMode::Center] {
                let options = desktop_options(fit);
                assert_eq!(options.count(), 2);
                unsafe {
                    assert!(has_key(&options, NSWorkspaceDesktopImageScalingKey));
                    assert!(has_key(&options, NSWorkspaceDesktopImageAllowClippingKey));
                    assert!(!has_key(&options, NSWorkspaceDesktopImageFillColorKey));
                }
            }
        }
    }
}

#[cfg(windows)]
mod windows {
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    use crate::settings::FitMode;

    use super::super::history::Screen;
    use super::super::model::{Applied, DisplaySize, UserError};

    pub fn set(path: &Path, fit: FitMode) -> Result<Applied, UserError> {
        let style = match fit {
            FitMode::Fill => "10",
            FitMode::Fit => "6",
            FitMode::Center => "0",
        };
        set_style(path, style)
    }

    /// The one desktop picture Windows keeps, and its `WallpaperStyle`.
    pub fn capture() -> Result<Vec<Screen>, UserError> {
        use std::os::windows::ffi::OsStringExt;
        let mut buf = [0u16; 1024];
        let ok = unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::SystemParametersInfoW(
                windows_sys::Win32::UI::WindowsAndMessaging::SPI_GETDESKWALLPAPER,
                buf.len() as u32,
                buf.as_mut_ptr().cast(),
                0,
            )
        };
        if ok == 0 {
            return Err(UserError::apply("this display"));
        }
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        if len == 0 {
            return Ok(Vec::new());
        }
        let path = std::ffi::OsString::from_wide(&buf[..len]);
        let style = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .open_subkey("Control Panel\\Desktop")
            .ok()
            .and_then(|key| key.get_value::<String, _>("WallpaperStyle").ok())
            .and_then(|value| value.trim().parse::<i64>().ok());
        Ok(vec![Screen {
            name: String::new(),
            index: 0,
            path: path.into(),
            scaling: style,
            clipping: None,
        }])
    }

    pub fn restore(screens: &[Screen]) -> Result<u32, UserError> {
        let Some(saved) = screens.first() else {
            return Err(UserError::apply("this display"));
        };
        let style = saved.scaling.unwrap_or(10).to_string();
        set_style(&saved.path, &style).map(|applied| applied.displays)
    }

    fn set_style(path: &Path, style: &str) -> Result<Applied, UserError> {
        let desktop = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .open_subkey_with_flags("Control Panel\\Desktop", winreg::enums::KEY_SET_VALUE)
            .map_err(|_| UserError::apply("this display"))?;
        desktop
            .set_value("WallpaperStyle", &style)
            .map_err(|_| UserError::apply("this display"))?;
        desktop
            .set_value("TileWallpaper", &"0")
            .map_err(|_| UserError::apply("this display"))?;

        let mut wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let ok = unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::SystemParametersInfoW(
                windows_sys::Win32::UI::WindowsAndMessaging::SPI_SETDESKWALLPAPER,
                0,
                wide.as_mut_ptr().cast(),
                windows_sys::Win32::UI::WindowsAndMessaging::SPIF_UPDATEINIFILE
                    | windows_sys::Win32::UI::WindowsAndMessaging::SPIF_SENDWININICHANGE,
            )
        };
        if ok == 0 {
            Err(UserError::apply("this display"))
        } else {
            Ok(Applied::here(monitor_count()))
        }
    }

    pub fn largest() -> Option<DisplaySize> {
        let width = unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::GetSystemMetrics(
                windows_sys::Win32::UI::WindowsAndMessaging::SM_CXSCREEN,
            )
        };
        let height = unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::GetSystemMetrics(
                windows_sys::Win32::UI::WindowsAndMessaging::SM_CYSCREEN,
            )
        };
        if width <= 0 || height <= 0 {
            None
        } else {
            Some(DisplaySize {
                width: width as u32,
                height: height as u32,
            })
        }
    }

    fn monitor_count() -> u32 {
        let count = unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::GetSystemMetrics(
                windows_sys::Win32::UI::WindowsAndMessaging::SM_CMONITORS,
            )
        };
        if count > 0 {
            count as u32
        } else {
            1
        }
    }
}
