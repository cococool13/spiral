mod bench;
mod boot;
mod cache;
mod license;
mod net;
mod paths;
mod setter;
mod settings;
mod shell;
mod smoke;
mod wallhaven;
mod window;

use settings::{Settings, SettingsState};
use shell::ModuleId;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;

pub struct Http(std::sync::OnceLock<reqwest::Client>);

impl Http {
    fn new() -> Self {
        Self(std::sync::OnceLock::new())
    }

    pub fn get(&self) -> &reqwest::Client {
        self.0.get_or_init(|| {
            reqwest::Client::builder()
                .user_agent(concat!("Spiral/", env!("CARGO_PKG_VERSION")))
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .expect("Spiral could not start")
        })
    }
}

#[tauri::command]
async fn search_wallpapers(
    app: AppHandle,
    http: State<'_, Http>,
    query: String,
    categories: String,
    sorting: String,
    page: u32,
) -> Result<net::SearchPage, String> {
    license::require(&app).await?;
    wallhaven::search(http.get(), &query, &categories, &sorting, page).await
}

#[tauri::command]
async fn cache_thumb(
    app: AppHandle,
    http: State<'_, Http>,
    id: String,
    url: String,
) -> Result<String, String> {
    license::require(&app).await?;
    cache::cache_thumb(&app, http.get(), &id, &url).await
}

#[tauri::command]
async fn apply_wallpaper(
    app: AppHandle,
    http: State<'_, Http>,
    id: String,
    url: String,
) -> Result<(), String> {
    license::require(&app).await?;
    let fit = app.state::<SettingsState>().0.lock().unwrap().fit_mode;
    let path = cache::download_full(&app, http.get(), &id, &url).await?;
    setter::set_wallpaper(&app, path.clone(), fit)?;
    cache::prune_wallpapers(&app, &path);
    Ok(())
}

#[tauri::command]
fn get_settings(state: State<'_, SettingsState>) -> Settings {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn set_settings(
    app: AppHandle,
    state: State<'_, SettingsState>,
    shell: State<'_, shell::Shell>,
    settings: Settings,
) -> Result<(), String> {
    let previous = state.0.lock().unwrap().clone();
    if settings.launch_at_login != previous.launch_at_login {
        let autolaunch = app.autolaunch();
        if settings.launch_at_login {
            autolaunch.enable()
        } else {
            autolaunch.disable()
        }
        .map_err(|err| format!("settings_failed:{err}"))?;
    }
    settings::save(shell.root(), &settings)?;
    *state.0.lock().unwrap() = settings.clone();
    shell.sync_login_flags(settings.launch_at_login, settings.auto_update_check)?;
    Ok(())
}

#[tauri::command]
fn thumb_cache_size(app: AppHandle) -> u64 {
    cache::thumb_cache_size(&app)
}

#[tauri::command]
fn clear_thumb_cache(app: AppHandle) -> Result<(), String> {
    cache::clear_thumb_cache(&app)
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
        .manage(Http::new())
        .invoke_handler(tauri::generate_handler![
            search_wallpapers,
            cache_thumb,
            apply_wallpaper,
            get_settings,
            set_settings,
            thumb_cache_size,
            clear_thumb_cache,
            modules_set,
            bench_mark,
            license::license_status,
            license::license_activate,
            license::license_request_code,
            license::license_activate_email,
            license::license_ensure,
            license::license_clear,
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
            window::open(app.handle(), &boot)?;
            smoke::maybe_run(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Spiral could not start");
}
