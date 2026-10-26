//! The displays on this computer in device pixels, for "Fits your display":
//! the gallery asks sources for pictures at least as large as the largest.
//! Read locally; never sent anywhere except as an `atleast` size.

use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
    pub is_main: bool,
}

pub fn list(app: &tauri::AppHandle) -> Vec<Display> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        if app
            .run_on_main_thread(move || {
                let _ = tx.send(macos::list());
            })
            .is_err()
        {
            return Vec::new();
        }
        rx.recv().unwrap_or_default()
    }

    #[cfg(not(target_os = "macos"))]
    {
        super::setter::largest_display(app)
            .map(|size| {
                vec![Display {
                    name: "Main display".into(),
                    width: size.width,
                    height: size.height,
                    scale: 1.0,
                    is_main: true,
                }]
            })
            .unwrap_or_default()
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSScreen;

    use super::Display;

    pub fn list() -> Vec<Display> {
        let Some(mtm) = MainThreadMarker::new() else {
            return Vec::new();
        };
        let main = NSScreen::mainScreen(mtm);
        NSScreen::screens(mtm)
            .iter()
            .map(|screen| {
                let frame = screen.frame();
                let scale = screen.backingScaleFactor();
                Display {
                    name: screen.localizedName().to_string(),
                    width: (frame.size.width * scale).round().max(0.0) as u32,
                    height: (frame.size.height * scale).round().max(0.0) as u32,
                    scale,
                    is_main: main
                        .as_deref()
                        .is_some_and(|main| std::ptr::eq(main, &*screen)),
                }
            })
            .collect()
    }
}
