mod bench;
mod boot;
mod license;
mod paths;
mod settings;
mod shell;
mod smoke;
mod wallpaper;
mod window;

use settings::{GeneralSettings, SettingsState};
use shell::ModuleId;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use wallpaper::{Applied, SearchPage, SearchParams, WallId};

#[tauri::command]
async fn module_activate(
    app: AppHandle,
    shell: State<'_, shell::Shell>,
    id: ModuleId,
) -> Result<(), String> {
    if !shell.contains(id) {
        return Err("module_inactive".into());
    }
    if id == ModuleId::Wallpaper {
        license::require(&app).await?;
        if shell.wallpaper_engine().is_none() {
            let display = wallpaper::largest_display(&app);
            let engine = wallpaper::WallpaperEngine::open(shell.root().clone(), display);
            shell.ensure_wallpaper(engine);
        }
    }
    shell.set_active(id);
    Ok(())
}

#[tauri::command]
async fn wallpaper_cached_page(
    app: AppHandle,
    shell: State<'_, shell::Shell>,
) -> Result<Option<SearchPage>, String> {
    license::require(&app).await?;
    let engine = shell.wallpaper()?;
    Ok(engine.cached_first_page())
}

#[tauri::command]
async fn wallpaper_search(
    app: AppHandle,
    shell: State<'_, shell::Shell>,
    params: SearchParams,
) -> Result<SearchPage, String> {
    license::require(&app).await?;
    let engine = shell.wallpaper()?;
    engine.search(params).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn wallpaper_prefetch_page(
    app: AppHandle,
    shell: State<'_, shell::Shell>,
    params: SearchParams,
) -> Result<(), String> {
    license::require(&app).await?;
    let engine = shell.wallpaper()?;
    engine.prefetch_page(params);
    Ok(())
}

#[tauri::command]
async fn wallpaper_stage_full(
    app: AppHandle,
    shell: State<'_, shell::Shell>,
    id: WallId,
) -> Result<(), String> {
    license::require(&app).await?;
    let engine = shell.wallpaper()?;
    engine.stage_full(id);
    Ok(())
}

#[tauri::command]
async fn wallpaper_apply(
    app: AppHandle,
    shell: State<'_, shell::Shell>,
    id: WallId,
) -> Result<Applied, String> {
    license::require(&app).await?;
    let engine = shell.wallpaper()?;
    let fit = app
        .state::<SettingsState>()
        .0
        .lock()
        .expect("settings")
        .fit_mode;
    engine
        .apply(id, fit, |path, fit| {
            wallpaper::set_wallpaper(&app, path, fit)
        })
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn general_view(
    shell: State<'_, shell::Shell>,
    wallpaper: State<'_, SettingsState>,
) -> GeneralSettings {
    let shell_settings = shell.snapshot();
    let fit = wallpaper.0.lock().expect("settings").clone();
    GeneralSettings::read(&shell_settings, &fit)
}

#[tauri::command]
fn general_update(
    app: AppHandle,
    shell: State<'_, shell::Shell>,
    wallpaper: State<'_, SettingsState>,
    settings: GeneralSettings,
) -> Result<GeneralSettings, String> {
    let previous = shell.snapshot();
    if settings.launch_at_login != previous.launch_at_login {
        let autolaunch = app.autolaunch();
        let result = if settings.launch_at_login {
            autolaunch.enable()
        } else {
            autolaunch.disable()
        };
        result.map_err(|err| format!("settings_failed:{err}"))?;
    }
    let mut shell_settings = shell.settings_mut();
    let mut wallpaper_settings = wallpaper.0.lock().expect("settings");
    let stored = settings::apply_general(
        shell.root(),
        &mut shell_settings,
        &mut wallpaper_settings,
        &settings,
    )?;
    Ok(stored)
}

#[tauri::command]
fn thumb_cache_size(shell: State<'_, shell::Shell>) -> u64 {
    wallpaper::stored_thumb_bytes(shell.root())
}

#[tauri::command]
fn clear_thumb_cache(shell: State<'_, shell::Shell>) -> Result<(), String> {
    wallpaper::clear_stored_thumbs(shell.root()).map_err(|err| err.to_string())
}

fn thumb_scheme(
    ctx: tauri::UriSchemeContext<'_, tauri::Wry>,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    let uri = request.uri().clone();
    tauri::async_runtime::spawn(async move {
        let response = match serve_thumb(&app, &uri).await {
            Ok(bytes) => wallpaper::thumb_response(bytes),
            Err(_) => wallpaper::empty_thumb(),
        };
        responder.respond(response);
    });
}

async fn serve_thumb(
    app: &AppHandle,
    uri: &tauri::http::Uri,
) -> Result<Vec<u8>, wallpaper::UserError> {
    let (id, rendition) =
        wallpaper::parse_thumb_request(uri).ok_or_else(wallpaper::UserError::bad)?;
    let engine = app
        .state::<shell::Shell>()
        .wallpaper_engine()
        .ok_or_else(wallpaper::UserError::inactive)?;
    engine.thumb(&id, rendition).await
}

#[tauri::command]
fn modules_set(
    shell: State<'_, shell::Shell>,
    wallpaper: State<'_, SettingsState>,
    modules: Vec<ModuleId>,
) -> Result<(), String> {
    shell.set_modules(modules)?;
    if shell.contains(ModuleId::Wallpaper) {
        let mut settings = wallpaper.0.lock().unwrap();
        if !settings.first_run_completed {
            settings.first_run_completed = true;
            settings::save(shell.root(), &settings)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn bench_mark(mark: String) -> Result<(), String> {
    if !bench::known(&mark) {
        return Err("unknown mark".into());
    }
    bench::mark(&mark);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    bench::init_from_env();
    bench::mark_process_start();

    let mut autostart = tauri_plugin_autostart::Builder::new().app_name("Spiral Wallpaper");
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_autostart::MacosLauncher;
        autostart = autostart.macos_launcher(MacosLauncher::LaunchAgent);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(autostart.build())
        .register_asynchronous_uri_scheme_protocol("thumb", thumb_scheme)
        .invoke_handler(tauri::generate_handler![
            module_activate,
            wallpaper_cached_page,
            wallpaper_search,
            wallpaper_prefetch_page,
            wallpaper_stage_full,
            wallpaper_apply,
            general_view,
            general_update,
            thumb_cache_size,
            clear_thumb_cache,
            modules_set,
            bench_mark,
            license::license_view,
            license::license_use_legacy,
            license::license_activate,
            license::license_request_code,
            license::license_activate_email,
            license::license_clear,
            license::provider_view,
            license::provider_set,
            license::provider_clear,
        ])
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .map_err(|err| std::io::Error::other(err.to_string()))?;
            let root = paths::Root::resolve(app_data);
            let shell_settings =
                settings::ShellSettings::load_or_derive(&root, &paths::LegacyRoots::detect());
            let wallpaper = settings::load(&root);
            let boot = boot::BootState::from(&shell_settings, boot::resume_supported());
            app.manage(SettingsState(std::sync::Mutex::new(wallpaper)));
            app.manage(shell::Shell::new(root, shell_settings));
            app.manage(license::LicenseGate::production());
            window::open(app.handle(), &boot)?;
            smoke::maybe_run(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Spiral could not start");
}
