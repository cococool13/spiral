use std::path::PathBuf;

use crate::settings::FitMode;

use super::model::{Applied, DisplaySize, UserError};

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

    use super::super::model::{Applied, DisplaySize, UserError};

    pub fn set(path: &Path, fit: FitMode) -> Result<Applied, UserError> {
        let style = match fit {
            FitMode::Fill => "10",
            FitMode::Fit => "6",
            FitMode::Center => "0",
        };
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
