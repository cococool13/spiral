#[cfg(debug_assertions)]
pub fn maybe_run(app: tauri::AppHandle) {
    let mode = std::env::var("SPIRAL_SMOKE").unwrap_or_default();
    if mode != "1" && mode != "pin" {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let result = if mode == "pin" {
            pin(&app).await
        } else {
            run(&app).await
        };
        let code = match result {
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

    if std::env::var("SPIRAL_RESUME_SMOKE").as_deref() == Ok("1") {
        return resume_pdf(app).await;
    }

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

/// `SPIRAL_SMOKE=pin`: pin the picture on this Space through Spiral Live,
/// check the helper started, acknowledged the job and set the still, then
/// unpin and check it exited. The desktop keeps the same picture throughout.
#[cfg(debug_assertions)]
async fn pin(app: &tauri::AppHandle) -> Result<(), String> {
    use crate::live;
    use crate::settings::FitMode;
    use tauri::Manager;

    let helper = live::availability().map_err(|reason| format!("pin unavailable: {reason}"))?;
    println!("SMOKE pin helper {}", helper.display());
    let root = app.state::<crate::shell::Shell>().root().clone();
    let source = live::current_desktop(app)?;
    println!("SMOKE pin source {}", source.display());
    if !live::is_still(&source) {
        return Err(format!(
            "the desktop on this Space is not a still ({}); set one first",
            source.display()
        ));
    }
    let pinned = tauri::async_runtime::spawn_blocking({
        let root = root.clone();
        move || live::pin(&root, &source, FitMode::Fill)
    })
    .await
    .map_err(|err| err.to_string())??;
    if !pinned.pinned || !pinned.running {
        return Err(format!("pin did not start Spiral Live: {pinned:?}"));
    }
    let status = live::read_status(&live::LivePaths::new(&root)).ok_or("no status.json")?;
    println!(
        "SMOKE pin running pid {} applied {} login {}",
        status.pid, status.applied, status.login_item
    );
    let off = tauri::async_runtime::spawn_blocking(move || live::unpin(&root))
        .await
        .map_err(|err| err.to_string())??;
    // The rule: nothing to do means gone within a second.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(1);
    while live::helper_running() && std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    if off.pinned || live::helper_running() {
        return Err(format!("unpin left Spiral Live running: {off:?}"));
    }
    println!("SMOKE pin unpinned, helper exited");
    println!("SMOKE OK");
    Ok(())
}

#[cfg(debug_assertions)]
async fn resume_pdf(app: &tauri::AppHandle) -> Result<(), String> {
    use crate::shell::ModuleId;
    use resume_proto::Call;
    use serde_json::json;
    use std::time::Instant;
    use tauri::Manager;

    let shell = app.state::<crate::shell::Shell>();
    shell.set_modules(vec![ModuleId::Resume])?;
    shell.set_active(ModuleId::Resume);
    shell.resume_link().activate();
    let dir = shell.root().resume_dir();
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let fixture = dir.join("fixture.txt");
    let text = "Ada Lovelace\nada@example.com\n555-0100\nLondon\n\nEXPERIENCE\nAnalyst, Admiralty\nJan 2021 - Present\n- Wrote the first algorithm and filed the notes.\n";
    std::fs::write(&fixture, text).map_err(|err| err.to_string())?;
    let import_started = Instant::now();
    let imported = {
        let link = shell.resume_link();
        link.dispatch(
            &dir,
            true,
            &Call::ImportFile {
                path: fixture.display().to_string(),
            },
            |_| Ok(None),
            |_| {},
        )?
    };
    println!(
        "SMOKE resume import {} ms",
        import_started.elapsed().as_millis()
    );
    if imported["contact"]["name"] != "Ada Lovelace" {
        return Err(format!("import did not read the fixture: {imported}"));
    }
    let build_started = Instant::now();
    let built = {
        let link = shell.resume_link();
        link.dispatch(
            &dir,
            true,
            &Call::Build {
                doc: json!({
                    "contact": imported["contact"],
                    "headline": imported["headline"],
                    "summary": imported["summary"],
                    "experience": imported["experience"],
                    "education": imported["education"],
                    "projects": imported["projects"],
                    "leadership": imported["leadership"],
                    "awards": imported["awards"],
                    "interests": imported["interests"],
                    "skills": imported["skills"],
                }),
                look: "column".into(),
                accent: "ink".into(),
                aim: "one_page".into(),
                tighten: false,
                format: "pdf".into(),
            },
            |_| Ok(None),
            |_| {},
        )?
    };
    println!(
        "SMOKE resume build {} ms",
        build_started.elapsed().as_millis()
    );
    let file = built["file"]
        .as_str()
        .ok_or("build did not return a file")?;
    let path = if file.starts_with("cache/") {
        dir.join(file)
    } else {
        std::path::PathBuf::from(file)
    };
    let bytes =
        std::fs::read(&path).map_err(|err| format!("could not read {}: {err}", path.display()))?;
    if !bytes.starts_with(b"%PDF") {
        return Err(format!("{} is not a PDF", path.display()));
    }
    println!("SMOKE resume pdf {} bytes {}", path.display(), bytes.len());
    println!("SMOKE OK");
    Ok(())
}
