#[cfg(debug_assertions)]
pub fn maybe_run(app: tauri::AppHandle) {
    if std::env::var("SPIRAL_SMOKE").as_deref() != Ok("1") {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let code = match run(&app).await {
            Ok(()) => 0,
            Err(err) => {
                eprintln!("SMOKE FAIL: {err}");
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
    use crate::settings::FitMode;
    use crate::shell::ModuleId;
    use crate::wallpaper::{self, SearchParams};
    use tauri::Manager;

    if let Ok(restore) = std::env::var("SPIRAL_RESTORE") {
        wallpaper::set_wallpaper(app, restore.into(), FitMode::Fill)
            .map_err(|err| err.to_string())?;
        println!(
            "SMOKE restored {}",
            std::env::var("SPIRAL_RESTORE").unwrap_or_default()
        );
        return Ok(());
    }

    let shell = app.state::<crate::shell::Shell>();
    if shell.wallpaper_engine().is_none() {
        let display = wallpaper::largest_display(app);
        let engine = wallpaper::WallpaperEngine::open(shell.root().clone(), display);
        shell.ensure_wallpaper(engine);
    }
    shell.set_active(ModuleId::Wallpaper);
    let engine = shell.wallpaper()?;
    let page = engine
        .search(SearchParams {
            query: String::new(),
            categories: "111".into(),
            sorting: "toplist".into(),
            page: 1,
        })
        .await
        .map_err(|err| err.to_string())?;
    println!(
        "SMOKE search: {} items, last_page {}",
        page.items.len(),
        page.last_page
    );
    let first = page.items.first().ok_or("no results")?.id.clone();
    let previous = wallpaper::current_wallpaper(app).map_err(|err| err.to_string())?;
    println!("SMOKE previous wallpaper: {previous:?}");
    let applied = engine
        .apply(first, FitMode::Fill, |path, fit| {
            wallpaper::set_wallpaper(app, path, fit)
        })
        .await
        .map_err(|err| err.to_string())?;
    println!(
        "SMOKE applied on {} displays, current space",
        applied.displays
    );

    match previous {
        Some(prev) if prev.exists() => {
            wallpaper::set_wallpaper(app, prev, FitMode::Fill).map_err(|err| err.to_string())?;
            println!("SMOKE restored previous wallpaper");
        }
        Some(prev) => println!(
            "SMOKE WARN: previous wallpaper {} no longer exists, so it cannot be restored.",
            prev.display()
        ),
        None => println!("SMOKE WARN: no previous wallpaper was recorded, so none was restored."),
    }

    println!("SMOKE OK");
    Ok(())
}
