use serde::{Deserialize, Serialize};
use spiral_license::migrate::{self, Ensured, LegacyApp, Probe, ProviderId, ProviderProbe};
use spiral_license::vault::{
    CredentialStore, DeleteOutcome, Existence, Interaction, Secret, VaultError,
};
use spiral_license::LicenseError;
use tauri::Manager;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LicenseView {
    Checking,
    Licensed {
        grace: bool,
        key: String,
        device: String,
    },
    NeedsActivation {
        offer: Option<LegacyApp>,
    },
    Retry {
        message: String,
    },
    Locked {
        message: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProviderView {
    Present,
    NeedsPaste,
    Absent,
}

pub fn view_from_probe(probe: Probe) -> Option<LicenseView> {
    match probe {
        Probe::NeedsConsent(app) => Some(LicenseView::NeedsActivation { offer: Some(app) }),
        Probe::Nothing => Some(LicenseView::NeedsActivation { offer: None }),
        Probe::Ready | Probe::Adopted(_) => None,
    }
}

pub fn read_provider(
    store: &impl CredentialStore,
    provider: ProviderId,
) -> Result<ProviderView, String> {
    match migrate::migrate_provider(store, provider).map_err(message)? {
        ProviderProbe::Ready | ProviderProbe::Adopted => Ok(ProviderView::Present),
        ProviderProbe::NeedsPaste => Ok(ProviderView::NeedsPaste),
        ProviderProbe::Absent => Ok(ProviderView::Absent),
    }
}

pub fn set_provider(
    store: &impl CredentialStore,
    provider: ProviderId,
    key: &str,
) -> Result<ProviderView, String> {
    migrate::provider_set(store, provider, key).map_err(message)?;
    Ok(ProviderView::Present)
}

pub fn clear_provider(
    store: &impl CredentialStore,
    provider: ProviderId,
) -> Result<ProviderView, String> {
    migrate::provider_clear(store, provider).map_err(message)?;
    Ok(ProviderView::Absent)
}

pub fn provider_secret(
    store: &impl CredentialStore,
    provider: ProviderId,
) -> Result<Option<String>, String> {
    match store
        .get(migrate::SERVICE, provider.account(), Interaction::Silent)
        .map_err(LicenseError::from)
        .map_err(message)?
    {
        Some(secret) => Ok(Some(secret.expose().to_string())),
        None => Ok(None),
    }
}

enum ShellStore {
    #[cfg(any(test, not(any(target_os = "macos", target_os = "windows"))))]
    Memory(spiral_license::vault::MemoryStore),
    #[cfg(target_os = "macos")]
    Mac(spiral_license::macos::MacStore),
    #[cfg(target_os = "windows")]
    Win(spiral_license::windows::WinStore),
}

macro_rules! dispatch_store {
    ($self:expr, $method:ident($($arg:expr),*)) => {
        match $self {
            #[cfg(any(test, not(any(target_os = "macos", target_os = "windows"))))]
            ShellStore::Memory(store) => store.$method($($arg),*),
            #[cfg(target_os = "macos")]
            ShellStore::Mac(store) => store.$method($($arg),*),
            #[cfg(target_os = "windows")]
            ShellStore::Win(store) => store.$method($($arg),*),
        }
    };
}

impl CredentialStore for ShellStore {
    fn get(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<Option<Secret>, VaultError> {
        dispatch_store!(self, get(service, account, interaction))
    }

    fn exists(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<Existence, VaultError> {
        dispatch_store!(self, exists(service, account, interaction))
    }

    fn set(&self, service: &str, account: &str, secret: &Secret) -> Result<(), VaultError> {
        dispatch_store!(self, set(service, account, secret))
    }

    fn delete(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<DeleteOutcome, VaultError> {
        dispatch_store!(self, delete(service, account, interaction))
    }
}

pub struct LicenseGate {
    store: ShellStore,
    exchange: migrate::LaunchExchange,
    inner: tokio::sync::Mutex<GateInner>,
}

struct GateInner {
    view: LicenseView,
    ready: bool,
}

impl LicenseGate {
    pub fn production() -> Self {
        Self::new(production_store())
    }

    fn new(store: ShellStore) -> Self {
        Self {
            store,
            exchange: migrate::LaunchExchange::new(),
            inner: tokio::sync::Mutex::new(GateInner {
                view: LicenseView::Checking,
                ready: false,
            }),
        }
    }

    pub async fn view(&self) -> LicenseView {
        let mut inner = self.inner.lock().await;
        if inner.ready {
            return inner.view.clone();
        }
        let checked = evaluate(&self.store, &self.exchange, &validator_url()).await;
        inner.view = checked.view.clone();
        inner.ready = checked.settled;
        checked.view
    }

    pub async fn retry(&self) -> LicenseView {
        self.exchange.forget();
        {
            let mut inner = self.inner.lock().await;
            inner.ready = false;
        }
        self.view().await
    }

    pub fn adopt_legacy(&self, app: LegacyApp) -> Result<(), LicenseError> {
        migrate::adopt_with_consent(&self.store, app)
    }

    pub async fn finish_legacy(
        &self,
        adopted: Result<(), LicenseError>,
    ) -> Result<LicenseView, String> {
        let mut inner = self.inner.lock().await;
        let checked = match adopted {
            Ok(()) => ensure_view(&self.store, &self.exchange, &validator_url()).await,
            Err(LicenseError::Denied | LicenseError::NeedsInteraction) => {
                inner.view = LicenseView::NeedsActivation { offer: None };
                inner.ready = true;
                return Err(LicenseError::Denied.user_message());
            }
            Err(err) => classify(err),
        };
        inner.view = checked.view.clone();
        inner.ready = checked.settled;
        Ok(checked.view)
    }

    pub async fn activate(&self, key: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        let stored = migrate::activate(&self.store, key, &validator_url())
            .await
            .map_err(message)?;
        inner.view = licensed_view(&stored, false);
        inner.ready = true;
        Ok(())
    }

    pub async fn activate_email(&self, email: &str, code: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        let stored = migrate::activate_with_code(&self.store, email, code, &validator_url())
            .await
            .map_err(message)?;
        inner.view = licensed_view(&stored, false);
        inner.ready = true;
        Ok(())
    }

    pub async fn request_code(email: &str) -> Result<(), String> {
        spiral_license::request_code(email, &validator_url())
            .await
            .map_err(message)
    }

    pub async fn clear(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        match migrate::clear_license(&self.store) {
            Ok(()) => {
                inner.view = LicenseView::NeedsActivation { offer: None };
                inner.ready = true;
                Ok(())
            }
            Err(err) => {
                inner.view = LicenseView::Checking;
                inner.ready = false;
                Err(message(err))
            }
        }
    }

    pub fn provider(&self, provider: ProviderId) -> Result<ProviderView, String> {
        read_provider(&self.store, provider)
    }

    pub fn set_provider(&self, provider: ProviderId, key: &str) -> Result<ProviderView, String> {
        set_provider(&self.store, provider, key)
    }

    pub fn clear_provider(&self, provider: ProviderId) -> Result<ProviderView, String> {
        clear_provider(&self.store, provider)
    }

    pub fn provider_secret(&self, provider: ProviderId) -> Result<Option<String>, String> {
        provider_secret(&self.store, provider)
    }

    pub async fn require(&self) -> Result<(), String> {
        match self.view().await {
            LicenseView::Licensed { .. } => Ok(()),
            LicenseView::Locked { message } => Err(message),
            LicenseView::NeedsActivation { .. } => Err(LicenseError::EmptyKey.user_message()),
            LicenseView::Checking => Err("Spiral is still checking the license.".into()),
            LicenseView::Retry { message } => Err(message),
        }
    }

    #[cfg(test)]
    async fn seed_licensed(&self) {
        let mut inner = self.inner.lock().await;
        inner.view = LicenseView::Licensed {
            grace: false,
            key: "LIC1…wxyz".into(),
            device: "This computer · 00000000".into(),
        };
        inner.ready = true;
    }
}

struct Checked {
    view: LicenseView,
    settled: bool,
}

async fn evaluate(
    store: &impl CredentialStore,
    exchange: &migrate::LaunchExchange,
    validator_url: &str,
) -> Checked {
    match migrate::migrate(store) {
        Ok(probe) => match view_from_probe(probe) {
            Some(view) => Checked {
                view,
                settled: true,
            },
            None => ensure_view(store, exchange, validator_url).await,
        },
        Err(err) => classify(err),
    }
}

async fn ensure_view(
    store: &impl CredentialStore,
    exchange: &migrate::LaunchExchange,
    validator_url: &str,
) -> Checked {
    classify_result(migrate::ensure_licensed(store, validator_url, exchange).await)
}

fn licensed_view(key: &str, grace: bool) -> LicenseView {
    LicenseView::Licensed {
        grace,
        key: mask_key(key),
        device: spiral_license::device_label(),
    }
}

fn mask_key(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    if chars.len() < 12 {
        return "Key on file".into();
    }
    let head: String = chars[..4].iter().collect();
    let tail: String = chars[chars.len() - 4..].iter().collect();
    format!("{head}…{tail}")
}

fn classify_result(result: Result<Ensured, LicenseError>) -> Checked {
    match result {
        Ok(ensured) => Checked {
            view: licensed_view(&ensured.key, ensured.grace),
            settled: true,
        },
        Err(err) => classify(err),
    }
}

fn classify(err: LicenseError) -> Checked {
    match err {
        LicenseError::InvalidKey | LicenseError::EmptyKey => Checked {
            view: LicenseView::NeedsActivation { offer: None },
            settled: true,
        },
        LicenseError::Network(_)
        | LicenseError::Keychain(_)
        | LicenseError::NeedsInteraction
        | LicenseError::Denied => Checked {
            view: LicenseView::Retry {
                message: err.user_message(),
            },
            settled: false,
        },
        err => Checked {
            view: LicenseView::Locked {
                message: err.user_message(),
            },
            settled: true,
        },
    }
}

fn message(err: LicenseError) -> String {
    err.user_message()
}

fn validator_url() -> String {
    std::env::var("SPIRAL_LICENSE_URL")
        .unwrap_or_else(|_| spiral_license::DEFAULT_VALIDATOR_URL.to_string())
}

fn production_store() -> ShellStore {
    #[cfg(target_os = "macos")]
    {
        ShellStore::Mac(spiral_license::macos::MacStore)
    }
    #[cfg(target_os = "windows")]
    {
        ShellStore::Win(spiral_license::windows::WinStore)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        ShellStore::Memory(spiral_license::vault::MemoryStore::new())
    }
}

pub async fn require(app: &tauri::AppHandle) -> Result<(), String> {
    app.state::<LicenseGate>().require().await
}

#[tauri::command]
pub async fn license_view(gate: tauri::State<'_, LicenseGate>) -> Result<LicenseView, String> {
    Ok(gate.view().await)
}

#[tauri::command]
pub async fn license_retry(gate: tauri::State<'_, LicenseGate>) -> Result<LicenseView, String> {
    Ok(gate.retry().await)
}

#[tauri::command]
pub async fn license_use_legacy(
    app: tauri::AppHandle,
    legacy: LegacyApp,
) -> Result<LicenseView, String> {
    let handle = app.clone();
    let adopted =
        tokio::task::spawn_blocking(move || handle.state::<LicenseGate>().adopt_legacy(legacy))
            .await
            .map_err(|_| "Spiral could not read that key. Use email instead.".to_string())?;
    app.state::<LicenseGate>().finish_legacy(adopted).await
}

#[tauri::command]
pub async fn license_activate(
    gate: tauri::State<'_, LicenseGate>,
    key: String,
) -> Result<(), String> {
    gate.activate(&key).await
}

#[tauri::command]
pub async fn license_request_code(email: String) -> Result<(), String> {
    LicenseGate::request_code(&email).await
}

#[tauri::command]
pub async fn license_activate_email(
    gate: tauri::State<'_, LicenseGate>,
    email: String,
    code: String,
) -> Result<(), String> {
    gate.activate_email(&email, &code).await
}

#[tauri::command]
pub async fn license_clear(gate: tauri::State<'_, LicenseGate>) -> Result<(), String> {
    gate.clear().await
}

#[tauri::command]
pub async fn provider_view(
    app: tauri::AppHandle,
    provider: ProviderId,
) -> Result<ProviderView, String> {
    spawn_vault(move || app.state::<LicenseGate>().provider(provider)).await
}

#[tauri::command]
pub async fn provider_set(
    app: tauri::AppHandle,
    provider: ProviderId,
    key: String,
) -> Result<ProviderView, String> {
    spawn_vault(move || app.state::<LicenseGate>().set_provider(provider, &key)).await
}

#[tauri::command]
pub async fn provider_clear(
    app: tauri::AppHandle,
    provider: ProviderId,
) -> Result<ProviderView, String> {
    spawn_vault(move || app.state::<LicenseGate>().clear_provider(provider)).await
}

async fn spawn_vault<T>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String>
where
    T: Send + 'static,
{
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|_| "Spiral could not reach this machine's keychain.".to_string())?
}

#[cfg(test)]
mod tests {
    use spiral_license::migrate::{Ensured, LegacyApp, ProviderId};
    use spiral_license::vault::{Access, MemoryStore};

    use super::*;

    #[test]
    fn a_permissive_resume_item_stays_an_offer_without_a_secret_read() {
        let store = MemoryStore::new();
        store.insert(
            LegacyApp::Resume.service(),
            "license",
            "resume-secret",
            Access::Open,
        );
        let probe = migrate::migrate(&store).unwrap();
        assert_eq!(
            view_from_probe(probe),
            Some(LicenseView::NeedsActivation {
                offer: Some(LegacyApp::Resume),
            })
        );
        assert_eq!(store.secret_gets(LegacyApp::Resume.service()), 0);
        assert_eq!(store.user_gets(), 0);
        assert_eq!(store.delete_count(), 0);
        let json = serde_json::to_string(&view_from_probe(probe).unwrap()).unwrap();
        assert!(!json.contains("resume-secret"));
    }

    #[test]
    fn a_network_failure_can_be_retried_and_a_revoked_key_stays_locked() {
        let retry = classify(LicenseError::Network("down".into()));
        assert!(!retry.settled);
        assert!(matches!(retry.view, LicenseView::Retry { .. }));
        assert!(matches!(
            classify(LicenseError::Keychain("locked".into())).view,
            LicenseView::Retry { .. }
        ));
        assert!(!classify(LicenseError::Denied).settled);
        assert!(!classify(LicenseError::NeedsInteraction).settled);
        let locked = classify(LicenseError::NoAccess);
        assert!(locked.settled);
        assert!(matches!(locked.view, LicenseView::Locked { .. }));
        let moved = classify(LicenseError::DeviceMismatch);
        assert!(moved.settled);
        assert!(matches!(moved.view, LicenseView::Locked { .. }));
        let json = serde_json::to_string(&retry.view).unwrap();
        assert!(json.contains("\"kind\":\"retry\""));
    }

    #[test]
    fn a_licensed_view_names_this_computer_and_hides_the_key() {
        let secret = "LIC1.do-not-print-this-middle.wxyz";
        let checked = classify_result(Ok(Ensured {
            grace: false,
            key: secret.into(),
        }));
        let LicenseView::Licensed { grace, key, device } = checked.view.clone() else {
            panic!("expected a licensed view");
        };
        assert!(checked.settled);
        assert!(!grace);
        assert_eq!(key, "LIC1…wxyz");
        let short = device
            .strip_prefix("This computer · ")
            .expect("device label");
        assert_eq!(short.len(), 8);
        assert!(short.chars().all(|c| c.is_ascii_hexdigit()));
        let json = serde_json::to_string(&checked.view).unwrap();
        assert!(json.contains("\"kind\":\"licensed\""));
        assert!(!json.contains("do-not-print"));
        assert!(!json.contains(secret));

        let short_json = serde_json::to_string(&licensed_view("short", true)).unwrap();
        assert!(short_json.contains("Key on file"));
        assert!(!short_json.contains("short"));
    }

    #[test]
    fn provider_set_returns_presence_and_hides_the_secret() {
        let store = MemoryStore::new();
        let secret = "sk-ant-do-not-leak";
        let view = set_provider(&store, ProviderId::Anthropic, secret).unwrap();
        assert_eq!(view, ProviderView::Present);
        let json = serde_json::to_string(&view).unwrap();
        assert_eq!(json, r#"{"kind":"present"}"#);
        assert!(!json.contains("sk-ant"));
        assert!(!json.contains(secret));
        let err = set_provider(&store, ProviderId::Anthropic, "  ").unwrap_err();
        assert!(!err.contains(secret));
        assert!(!err.contains("sk-ant"));
        assert_eq!(
            read_provider(&store, ProviderId::Anthropic).unwrap(),
            ProviderView::Present
        );
        assert_eq!(
            clear_provider(&store, ProviderId::Anthropic).unwrap(),
            ProviderView::Absent
        );
        assert_eq!(
            serde_json::to_string(&ProviderView::NeedsPaste).unwrap(),
            r#"{"kind":"needsPaste"}"#
        );
    }

    #[test]
    fn the_engine_answer_carries_the_secret_and_the_view_does_not() {
        let store = MemoryStore::new();
        set_provider(&store, ProviderId::Anthropic, "sk-test-secret").unwrap();
        let view = read_provider(&store, ProviderId::Anthropic).unwrap();
        let json = serde_json::to_string(&view).unwrap();
        assert!(!json.contains("sk-test-secret"));
        assert_eq!(json, r#"{"kind":"present"}"#);
        let key = provider_secret(&store, ProviderId::Anthropic).unwrap();
        assert_eq!(key.as_deref(), Some("sk-test-secret"));
        let answer = resume_proto::Answer::ProviderKey { key };
        assert!(!format!("{answer:?}").contains("sk-test-secret"));
    }

    #[tokio::test]
    async fn the_gate_keeps_a_resume_key_as_an_offer() {
        let store = MemoryStore::new();
        store.insert(
            LegacyApp::Resume.service(),
            "license",
            "resume-secret",
            Access::Open,
        );
        let gate = LicenseGate::new(ShellStore::Memory(store));
        let view = gate.view().await;
        assert_eq!(
            view,
            LicenseView::NeedsActivation {
                offer: Some(LegacyApp::Resume),
            }
        );
        let json = serde_json::to_string(&view).unwrap();
        assert!(!json.contains("resume-secret"));
    }

    #[tokio::test]
    async fn a_partial_clear_does_not_leave_the_gate_licensed() {
        let store = MemoryStore::new();
        store.insert(
            migrate::SERVICE,
            migrate::LICENSE_ACCOUNT,
            "LIC1.here",
            Access::Open,
        );
        store.insert(
            migrate::SERVICE,
            migrate::STATUS_ACCOUNT,
            "status-doc",
            Access::Open,
        );
        store.lock_delete(migrate::SERVICE, migrate::STATUS_ACCOUNT);
        store.insert(
            LegacyApp::Wallpaper.service(),
            migrate::LICENSE_ACCOUNT,
            "wall-secret",
            Access::Open,
        );
        let gate = LicenseGate::new(ShellStore::Memory(store));
        gate.seed_licensed().await;
        let err = gate.clear().await.unwrap_err();
        assert_eq!(err, LicenseError::NeedsInteraction.user_message());
        assert_eq!(
            gate.view().await,
            LicenseView::NeedsActivation { offer: None }
        );
    }

    #[test]
    fn a_ready_probe_does_not_open_the_offer() {
        assert_eq!(view_from_probe(Probe::Ready), None);
        assert_eq!(view_from_probe(Probe::Adopted(LegacyApp::Wallpaper)), None);
        assert_eq!(
            view_from_probe(Probe::Nothing),
            Some(LicenseView::NeedsActivation { offer: None })
        );
    }
}
