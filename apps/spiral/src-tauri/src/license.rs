use serde::{Deserialize, Serialize};
use spiral_license::migrate::{self, LegacyApp, Probe, ProviderId, ProviderProbe, Validity};
use spiral_license::vault::{
    CredentialStore, DeleteOutcome, Existence, Interaction, Secret, VaultError,
};
use spiral_license::LicenseError;
use tauri::Manager;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LicenseView {
    Checking,
    Licensed { grace: bool },
    NeedsActivation { offer: Option<LegacyApp> },
    Locked { message: String },
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
        let view = evaluate(&self.store, &self.exchange, &validator_url()).await;
        inner.view = view.clone();
        inner.ready = true;
        view
    }

    pub async fn use_legacy(&self, app: LegacyApp) -> Result<LicenseView, String> {
        let mut inner = self.inner.lock().await;
        let view = match migrate::adopt_with_consent(&self.store, app) {
            Ok(()) => ensure_view(&self.store, &self.exchange, &validator_url()).await,
            Err(LicenseError::Denied | LicenseError::NeedsInteraction) => {
                inner.view = LicenseView::NeedsActivation { offer: None };
                inner.ready = true;
                return Err(LicenseError::Denied.user_message());
            }
            Err(err) => view_from_error(err),
        };
        inner.view = view.clone();
        inner.ready = true;
        Ok(view)
    }

    pub async fn activate(&self, key: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        migrate::activate(&self.store, key, &validator_url())
            .await
            .map_err(message)?;
        inner.view = LicenseView::Licensed { grace: false };
        inner.ready = true;
        Ok(())
    }

    pub async fn activate_email(&self, email: &str, code: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        migrate::activate_with_code(&self.store, email, code, &validator_url())
            .await
            .map_err(message)?;
        inner.view = LicenseView::Licensed { grace: false };
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
        migrate::clear_license(&self.store).map_err(message)?;
        inner.view = LicenseView::NeedsActivation { offer: None };
        inner.ready = true;
        Ok(())
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

    pub async fn require(&self) -> Result<(), String> {
        match self.view().await {
            LicenseView::Licensed { .. } => Ok(()),
            LicenseView::Locked { message } => Err(message),
            LicenseView::NeedsActivation { .. } => Err(LicenseError::EmptyKey.user_message()),
            LicenseView::Checking => Err("Spiral is still checking the license.".into()),
        }
    }
}

pub async fn evaluate(
    store: &impl CredentialStore,
    exchange: &migrate::LaunchExchange,
    validator_url: &str,
) -> LicenseView {
    match migrate::migrate(store) {
        Ok(probe) => match view_from_probe(probe) {
            Some(view) => view,
            None => ensure_view(store, exchange, validator_url).await,
        },
        Err(err) => view_from_error(err),
    }
}

async fn ensure_view(
    store: &impl CredentialStore,
    exchange: &migrate::LaunchExchange,
    validator_url: &str,
) -> LicenseView {
    view_from_result(migrate::ensure_licensed(store, validator_url, exchange).await)
}

fn view_from_result(result: Result<Validity, LicenseError>) -> LicenseView {
    match result {
        Ok(Validity { grace }) => LicenseView::Licensed { grace },
        Err(err) => view_from_error(err),
    }
}

fn view_from_error(err: LicenseError) -> LicenseView {
    match err {
        LicenseError::InvalidKey | LicenseError::EmptyKey => {
            LicenseView::NeedsActivation { offer: None }
        }
        err => LicenseView::Locked {
            message: err.user_message(),
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
pub async fn license_use_legacy(
    gate: tauri::State<'_, LicenseGate>,
    app: LegacyApp,
) -> Result<LicenseView, String> {
    gate.use_legacy(app).await
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
pub fn provider_view(
    gate: tauri::State<'_, LicenseGate>,
    provider: ProviderId,
) -> Result<ProviderView, String> {
    gate.provider(provider)
}

#[tauri::command]
pub fn provider_set(
    gate: tauri::State<'_, LicenseGate>,
    provider: ProviderId,
    key: String,
) -> Result<ProviderView, String> {
    gate.set_provider(provider, &key)
}

#[tauri::command]
pub fn provider_clear(
    gate: tauri::State<'_, LicenseGate>,
    provider: ProviderId,
) -> Result<ProviderView, String> {
    gate.clear_provider(provider)
}

#[cfg(test)]
mod tests {
    use spiral_license::migrate::{LegacyApp, ProviderId};
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
