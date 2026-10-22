use tauri::webview::{Color, PageLoadEvent};
use tauri::{WebviewUrl, WebviewWindowBuilder};

use crate::boot::BootState;

pub fn open(app: &tauri::AppHandle, boot: &BootState) -> tauri::Result<()> {
    let json = serde_json::to_string(boot)
        .expect("boot state serializes")
        .replace('<', "\\u003c");
    let script = format!("window.__SPIRAL_BOOT__={json};");
    let _window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Spiral")
        .inner_size(1120.0, 760.0)
        .min_inner_size(800.0, 560.0)
        .visible(true)
        .background_color(stock_color())
        .initialization_script(script)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                pin_login_item(&window);
            }
        })
        .build()?;
    crate::bench::mark("window_visible");
    Ok(())
}

fn stock_color() -> Color {
    if system_dark() {
        Color(0x12, 0x12, 0x11, 0xff)
    } else {
        Color(0xf4, 0xf4, 0xf1, 0xff)
    }
}

#[cfg(target_os = "macos")]
fn system_dark() -> bool {
    let key = objc2_foundation::NSString::from_str("AppleInterfaceStyle");
    objc2_foundation::NSUserDefaults::standardUserDefaults()
        .stringForKey(&key)
        .is_some_and(|value| value.to_string() == "Dark")
}

#[cfg(not(target_os = "macos"))]
fn system_dark() -> bool {
    false
}

fn pin_login_item(window: &tauri::WebviewWindow) {
    #[cfg(not(debug_assertions))]
    {
        use tauri::Manager;
        use tauri_plugin_autostart::ManagerExt;
        let app = window.app_handle();
        let shell = app.state::<crate::shell::Shell>();
        if shell.launch_at_login() {
            let _ = app.autolaunch().enable();
        }
    }
    #[cfg(debug_assertions)]
    {
        let _ = window;
    }
}
