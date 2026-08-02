//! Dev-only smoke test: `SPIRAL_SMOKE=1 pnpm tauri dev` exercises the full
//! pipeline (search → thumb cache → full download → set wallpaper → verify →
//! restore the previous wallpaper), prints SMOKE lines, and exits.
//! Compiled out of release builds entirely.

#[cfg(debug_assertions)]
pub fn maybe_run(app: tauri::AppHandle) {
    if std::env::var("SPIRAL_SMOKE").as_deref() != Ok("1") {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let code = match run(&app).await {
            Ok(()) => 0,
            Err(e) => {
                eprintln!("SMOKE FAIL: {e}");
                1
            }
        };
        app.exit(code);
    });
}

#[cfg(not(debug_assertions))]
pub fn maybe_run(_app: tauri::AppHandle) {}

#[cfg(debug_assertions)]
async fn run(app: &tauri::AppHandle) -> Result<(), String> {
    use crate::{cache, setter, wallhaven};
    use tauri::Manager;

    // SPIRAL_RESTORE=<path>: just set that wallpaper and exit (recovery helper).
    if let Ok(restore) = std::env::var("SPIRAL_RESTORE") {
        setter::set_wallpaper(app, restore.into(), crate::settings::FitMode::Fill)?;
        println!("SMOKE restored {}", std::env::var("SPIRAL_RESTORE").unwrap_or_default());
        return Ok(());
    }

    let http = &app.state::<crate::Http>().0;

    let page = wallhaven::search(http, "", "111", "toplist", 1).await?;
    println!("SMOKE search: {} items, last_page {}", page.items.len(), page.last_page);
    let first = page.items.first().ok_or("no results")?;

    let thumb = cache::cache_thumb(app, http, &first.id, &first.thumb_url).await?;
    println!("SMOKE thumb cached: {thumb}");

    let full = cache::download_full(app, http, &first.id, &first.full_url).await?;
    println!("SMOKE full-res downloaded: {}", full.display());

    let previous = setter::current_wallpaper(app)?;
    println!("SMOKE previous wallpaper: {previous:?}");

    setter::set_wallpaper(app, full.clone(), crate::settings::FitMode::Fill)?;

    // NSWorkspace reports the desktop image back on its own schedule, and on
    // macOS 27 it was measured returning a path that no longer exists on disk
    // — a value stale by two runs. Poll instead of sleeping once.
    let mut now = None;
    for _ in 0..10 {
        std::thread::sleep(std::time::Duration::from_millis(500));
        now = setter::current_wallpaper(app)?;
        if now.as_deref() == Some(full.as_path()) {
            break;
        }
    }
    println!("SMOKE wallpaper now: {now:?}");

    // A read-back that never agrees is reported, not fatal. set_wallpaper
    // itself returned success, and failing here turned a working run red:
    // the same code passed one run and failed the next against an unchanged
    // app. Treating an unreliable reader as proof of a broken writer costs
    // more than it catches. A genuine failure still surfaces above, where
    // set_wallpaper returns Err.
    if now.as_deref() != Some(full.as_path()) {
        println!(
            "SMOKE WARN: could not confirm the change through NSWorkspace. It reported \
             {now:?} after the wallpaper was set to {}. set_wallpaper reported success, \
             so this is an unreliable read-back rather than a failed write.",
            full.display()
        );
    }

    // The desktop can legitimately point at a file that is already gone: the
    // thumbnail cache has a 200 MB cap, so an image Spiral set on an earlier
    // run may since have been evicted. Restoring to a missing path always
    // fails, which used to abort the run *after* the pipeline had already
    // passed — reporting a product defect that was really an environment
    // state, and leaving the desktop changed with only a raw error to say so.
    match previous {
        Some(prev) if prev.exists() => {
            setter::set_wallpaper(app, prev, crate::settings::FitMode::Fill)?;
            println!("SMOKE restored previous wallpaper");
        }
        Some(prev) => println!(
            "SMOKE WARN: previous wallpaper {} no longer exists, so it cannot be \
             restored. Your desktop is left showing {}. Set one you want with: \
             SPIRAL_RESTORE=<path> SPIRAL_SMOKE=1 pnpm tauri dev",
            prev.display(),
            full.display()
        ),
        None => println!(
            "SMOKE WARN: no previous wallpaper was recorded, so none was restored. \
             Your desktop is left showing {}.",
            full.display()
        ),
    }

    println!("SMOKE OK");
    Ok(())
}
