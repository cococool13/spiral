use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::vault::{CredentialStore, DeleteOutcome, Existence, Interaction, Secret, VaultError};
use crate::{
    accept_key, device_id, grace_eligible, launch_step, now_secs, status_age, status_binds,
    status_document, validate_online, Launch, LicenseError, GRACE_SECS,
};

pub const SERVICE: &str = "app.spiral";
pub const LICENSE_ACCOUNT: &str = "license";
pub const STATUS_ACCOUNT: &str = "license-status";
pub const CLEANUP_ACCOUNT: &str = "wallpaper-cleanup";
pub const CLEARED_ACCOUNT: &str = "license-cleared";
const CLEARED_MARK: &str = "cleared";
const CLEANUP_PENDING: &str = "pending";
const WHOP_LICENSE: &str = "whop-license";
const WHOP_STATUS: &str = "whop-license-status";
const LEGACY_PROVIDER_SERVICE: &str = "app.spiral.resume";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LegacyApp {
    Wallpaper,
    Resume,
    Clean,
    Slim,
}

impl LegacyApp {
    pub fn display_name(self) -> &'static str {
        match self {
            Self::Wallpaper => "Spiral Wallpaper",
            Self::Resume => "Spiral Resume",
            Self::Clean => "Spiral Clean",
            Self::Slim => "Spiral Slim",
        }
    }

    pub fn service(self) -> &'static str {
        match self {
            Self::Wallpaper => "app.spiral.wallpaper",
            Self::Resume => "app.spiral.resume",
            Self::Clean => "app.spiral.clean",
            Self::Slim => "app.spiral.slim",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Probe {
    Ready,
    Adopted(LegacyApp),
    NeedsConsent(LegacyApp),
    Nothing,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderId {
    Anthropic,
    OpenAI,
    Compatible,
}

impl ProviderId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::OpenAI => "openai",
            Self::Compatible => "compatible",
        }
    }

    pub fn account(self) -> &'static str {
        match self {
            Self::Anthropic => "provider:anthropic",
            Self::OpenAI => "provider:openai",
            Self::Compatible => "provider:compatible",
        }
    }

    fn legacy_account(self) -> &'static str {
        self.as_str()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProviderProbe {
    Ready,
    Adopted,
    NeedsPaste,
    Absent,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Validity {
    pub grace: bool,
}

pub struct LaunchExchange {
    unclear: Mutex<Option<LicenseError>>,
}

impl LaunchExchange {
    pub fn new() -> Self {
        Self {
            unclear: Mutex::new(None),
        }
    }

    fn stored(&self) -> Option<LicenseError> {
        self.unclear.lock().expect("exchange").clone()
    }

    fn record(&self, err: LicenseError) {
        *self.unclear.lock().expect("exchange") = Some(err);
    }

    pub fn forget(&self) {
        *self.unclear.lock().expect("exchange") = None;
    }
}

impl Default for LaunchExchange {
    fn default() -> Self {
        Self::new()
    }
}

enum FoundKey {
    Value(Secret),
    Locked,
    Absent,
}

pub fn migrate(store: &impl CredentialStore) -> Result<Probe, LicenseError> {
    match store.exists(SERVICE, LICENSE_ACCOUNT, Interaction::Silent)? {
        Existence::Present | Existence::NeedsInteraction => {
            finish_wallpaper_cleanup(store)?;
            return Ok(Probe::Ready);
        }
        Existence::Absent => {}
    }
    if cleared_mark(store)? {
        return probe_foreign(store);
    }
    match read_accounts(store, LegacyApp::Wallpaper.service(), Interaction::Silent)? {
        FoundKey::Value(key) => {
            stage_wallpaper_copy(store, &key)?;
            Ok(Probe::Adopted(LegacyApp::Wallpaper))
        }
        FoundKey::Locked => Ok(Probe::NeedsConsent(LegacyApp::Wallpaper)),
        FoundKey::Absent => probe_foreign(store),
    }
}

pub fn adopt_with_consent(
    store: &impl CredentialStore,
    app: LegacyApp,
) -> Result<(), LicenseError> {
    let key = match read_accounts(store, app.service(), Interaction::User)? {
        FoundKey::Value(key) => key,
        FoundKey::Locked => return Err(LicenseError::NeedsInteraction),
        FoundKey::Absent => return Err(LicenseError::EmptyKey),
    };
    copy_verified(store, app.service(), &key, Interaction::User)
}

pub async fn ensure_licensed(
    store: &impl CredentialStore,
    validator_url: &str,
    exchange: &LaunchExchange,
) -> Result<Validity, LicenseError> {
    let Some(key) = store.get(SERVICE, LICENSE_ACCOUNT, Interaction::Silent)? else {
        return Err(LicenseError::EmptyKey);
    };
    if key.expose().starts_with("mem_") {
        return exchange_mem(store, key.expose(), validator_url, exchange).await;
    }
    let age = store
        .get(SERVICE, STATUS_ACCOUNT, Interaction::Silent)?
        .and_then(|status| status_age(status.expose(), key.expose(), now_secs()));
    validity_of_signed_key(key.expose(), age, validator_url)
        .await
        .inspect(|validity| {
            if !validity.grace {
                let _ = write_status_if_checked(store, key.expose(), age);
            }
        })
}

async fn exchange_mem(
    store: &impl CredentialStore,
    key: &str,
    validator_url: &str,
    exchange: &LaunchExchange,
) -> Result<Validity, LicenseError> {
    if let Some(err) = exchange.stored() {
        return Err(err);
    }
    match validate_online(key, &device_id(), validator_url).await {
        Ok(signed) => {
            accept_key(&signed)?;
            let secret = Secret::new(signed);
            write_back(store, LICENSE_ACCOUNT, &secret)?;
            write_status(store, secret.expose())?;
            Ok(Validity { grace: false })
        }
        Err(err) if outcome_unclear(&err) => {
            exchange.record(err.clone());
            Err(err)
        }
        Err(err) => Err(err),
    }
}

async fn validity_of_signed_key(
    key: &str,
    age: Option<u64>,
    validator_url: &str,
) -> Result<Validity, LicenseError> {
    if launch_step(accept_key(key), age)? == Launch::Licensed {
        return Ok(Validity { grace: false });
    }
    match validate_online(key, &device_id(), validator_url).await {
        Ok(signed) => {
            accept_key(&signed)?;
            Ok(Validity { grace: false })
        }
        Err(err) if grace_eligible(&err) && age.is_some_and(|value| value <= GRACE_SECS) => {
            Ok(Validity { grace: true })
        }
        Err(err) => Err(err),
    }
}

fn write_status_if_checked(
    store: &impl CredentialStore,
    key: &str,
    age: Option<u64>,
) -> Result<(), LicenseError> {
    if age.is_some_and(|value| value < crate::RECHECK_SECS) {
        return Ok(());
    }
    write_status(store, key)
}

pub async fn activate(
    store: &impl CredentialStore,
    key: &str,
    validator_url: &str,
) -> Result<(), LicenseError> {
    let key = crate::normalize_key(key);
    if key.is_empty() {
        return Err(LicenseError::EmptyKey);
    }
    if !key.starts_with("mem_") {
        accept_key(&key)?;
    }
    let signed = validate_online(&key, &device_id(), validator_url).await?;
    accept_key(&signed)?;
    let secret = Secret::new(signed);
    write_back(store, LICENSE_ACCOUNT, &secret)?;
    write_status(store, secret.expose())
}

pub fn clear_license(store: &impl CredentialStore) -> Result<(), LicenseError> {
    for account in [LICENSE_ACCOUNT, STATUS_ACCOUNT, CLEANUP_ACCOUNT] {
        match store.delete(SERVICE, account, Interaction::Silent)? {
            DeleteOutcome::Removed | DeleteOutcome::Absent => {}
            DeleteOutcome::NeedsInteraction => return Err(LicenseError::NeedsInteraction),
        }
    }
    let wallpaper = LegacyApp::Wallpaper.service();
    for account in [LICENSE_ACCOUNT, WHOP_LICENSE, STATUS_ACCOUNT, WHOP_STATUS] {
        match store.delete(wallpaper, account, Interaction::Silent)? {
            DeleteOutcome::Removed | DeleteOutcome::Absent | DeleteOutcome::NeedsInteraction => {}
        }
    }
    write_back(store, CLEARED_ACCOUNT, &Secret::new(CLEARED_MARK))
}

fn cleared_mark(store: &impl CredentialStore) -> Result<bool, LicenseError> {
    match store.exists(SERVICE, CLEARED_ACCOUNT, Interaction::Silent)? {
        Existence::Present | Existence::NeedsInteraction => Ok(true),
        Existence::Absent => Ok(false),
    }
}

pub fn provider_present(
    store: &impl CredentialStore,
    provider: ProviderId,
) -> Result<bool, LicenseError> {
    Ok(
        match store.exists(SERVICE, provider.account(), Interaction::Silent)? {
            Existence::Present | Existence::NeedsInteraction => true,
            Existence::Absent => false,
        },
    )
}

pub fn provider_set(
    store: &impl CredentialStore,
    provider: ProviderId,
    key: &str,
) -> Result<(), LicenseError> {
    let key = key.trim();
    if key.is_empty() {
        return Err(LicenseError::ProviderKeyEmpty);
    }
    write_back(store, provider.account(), &Secret::new(key))
}

pub fn provider_clear(
    store: &impl CredentialStore,
    provider: ProviderId,
) -> Result<(), LicenseError> {
    match store.delete(SERVICE, provider.account(), Interaction::Silent)? {
        DeleteOutcome::Removed | DeleteOutcome::Absent => Ok(()),
        DeleteOutcome::NeedsInteraction => Err(LicenseError::NeedsInteraction),
    }
}

pub fn migrate_provider(
    store: &impl CredentialStore,
    provider: ProviderId,
) -> Result<ProviderProbe, LicenseError> {
    match store.exists(SERVICE, provider.account(), Interaction::Silent)? {
        Existence::Present | Existence::NeedsInteraction => return Ok(ProviderProbe::Ready),
        Existence::Absent => {}
    }
    match store.get(
        LEGACY_PROVIDER_SERVICE,
        provider.legacy_account(),
        Interaction::Silent,
    ) {
        Ok(Some(secret)) => {
            write_back(store, provider.account(), &secret)?;
            Ok(ProviderProbe::Adopted)
        }
        Ok(None) => Ok(ProviderProbe::Absent),
        Err(VaultError::NeedsInteraction) | Err(VaultError::Denied) => {
            Ok(ProviderProbe::NeedsPaste)
        }
        Err(err) => Err(err.into()),
    }
}

fn outcome_unclear(err: &LicenseError) -> bool {
    matches!(
        err,
        LicenseError::Network(_) | LicenseError::ValidatorNotConfigured
    )
}

fn probe_foreign(store: &impl CredentialStore) -> Result<Probe, LicenseError> {
    for app in [LegacyApp::Resume, LegacyApp::Clean, LegacyApp::Slim] {
        if foreign_item(store, app)? {
            return Ok(Probe::NeedsConsent(app));
        }
    }
    Ok(Probe::Nothing)
}

fn foreign_item(store: &impl CredentialStore, app: LegacyApp) -> Result<bool, LicenseError> {
    for account in [LICENSE_ACCOUNT, WHOP_LICENSE] {
        match store.exists(app.service(), account, Interaction::Silent) {
            Ok(Existence::Present | Existence::NeedsInteraction) => return Ok(true),
            Ok(Existence::Absent) | Err(VaultError::Denied) => {}
            Err(err) => return Err(err.into()),
        }
    }
    Ok(false)
}

fn read_accounts(
    store: &impl CredentialStore,
    service: &str,
    interaction: Interaction,
) -> Result<FoundKey, LicenseError> {
    match read_one(store, service, LICENSE_ACCOUNT, interaction)? {
        FoundKey::Absent => read_one(store, service, WHOP_LICENSE, interaction),
        other => Ok(other),
    }
}

fn read_one(
    store: &impl CredentialStore,
    service: &str,
    account: &str,
    interaction: Interaction,
) -> Result<FoundKey, LicenseError> {
    match store.get(service, account, interaction) {
        Ok(Some(secret)) => Ok(FoundKey::Value(secret)),
        Ok(None) => Ok(FoundKey::Absent),
        Err(VaultError::NeedsInteraction | VaultError::Denied) => Ok(FoundKey::Locked),
        Err(err) => Err(err.into()),
    }
}

fn copy_verified(
    store: &impl CredentialStore,
    source: &str,
    key: &Secret,
    interaction: Interaction,
) -> Result<(), LicenseError> {
    if let Some(status) = matching_status(store, source, key.expose(), interaction)? {
        write_back(store, STATUS_ACCOUNT, &status)?;
    }
    write_back(store, LICENSE_ACCOUNT, key)
}

fn matching_status(
    store: &impl CredentialStore,
    service: &str,
    key: &str,
    interaction: Interaction,
) -> Result<Option<Secret>, LicenseError> {
    for account in [STATUS_ACCOUNT, WHOP_STATUS] {
        match store.get(service, account, interaction) {
            Ok(Some(secret)) if status_binds(secret.expose(), key) => return Ok(Some(secret)),
            Ok(Some(_)) => return Ok(None),
            Ok(None) => {}
            Err(VaultError::NeedsInteraction) => return Ok(None),
            Err(err) => return Err(err.into()),
        }
    }
    Ok(None)
}

fn write_back(
    store: &impl CredentialStore,
    account: &str,
    secret: &Secret,
) -> Result<(), LicenseError> {
    store.set(SERVICE, account, secret)?;
    let Some(back) = store.get(SERVICE, account, Interaction::Silent)? else {
        return Err(VaultError::Mismatch.into());
    };
    if back.expose() != secret.expose() {
        return Err(VaultError::Mismatch.into());
    }
    Ok(())
}

fn stage_wallpaper_copy(store: &impl CredentialStore, key: &Secret) -> Result<(), LicenseError> {
    let source = LegacyApp::Wallpaper.service();
    if let Some(status) = matching_status(store, source, key.expose(), Interaction::Silent)? {
        write_back(store, STATUS_ACCOUNT, &status)?;
    }
    write_back(store, CLEANUP_ACCOUNT, &Secret::new(CLEANUP_PENDING))?;
    if let Err(err) = write_back(store, LICENSE_ACCOUNT, key) {
        let _ = store.delete(SERVICE, CLEANUP_ACCOUNT, Interaction::Silent);
        return Err(err);
    }
    finish_wallpaper_cleanup(store)
}

pub async fn activate_with_code(
    store: &impl CredentialStore,
    email: &str,
    code: &str,
    validator_url: &str,
) -> Result<(), LicenseError> {
    let signed = crate::signed_key_for_code(email, code, validator_url).await?;
    let secret = Secret::new(signed);
    write_back(store, LICENSE_ACCOUNT, &secret)?;
    write_status(store, secret.expose())
}

fn write_status(store: &impl CredentialStore, key: &str) -> Result<(), LicenseError> {
    let document = status_document(key)?;
    write_back(store, STATUS_ACCOUNT, &Secret::new(document))?;
    let Some(back) = store.get(SERVICE, STATUS_ACCOUNT, Interaction::Silent)? else {
        return Err(VaultError::Mismatch.into());
    };
    if !status_binds(back.expose(), key) {
        return Err(VaultError::Mismatch.into());
    }
    Ok(())
}

fn finish_wallpaper_cleanup(store: &impl CredentialStore) -> Result<(), LicenseError> {
    let pending = match store.get(SERVICE, CLEANUP_ACCOUNT, Interaction::Silent) {
        Ok(Some(secret)) => secret.expose() == CLEANUP_PENDING,
        Ok(None) => false,
        Err(VaultError::NeedsInteraction) => return Ok(()),
        Err(err) => return Err(err.into()),
    };
    if !pending {
        return Ok(());
    }
    match store.get(SERVICE, LICENSE_ACCOUNT, Interaction::Silent) {
        Ok(Some(_)) => {}
        Ok(None) | Err(VaultError::NeedsInteraction) => return Ok(()),
        Err(err) => return Err(err.into()),
    }
    let mut blocked = false;
    for account in [LICENSE_ACCOUNT, WHOP_LICENSE, STATUS_ACCOUNT, WHOP_STATUS] {
        match store.delete(LegacyApp::Wallpaper.service(), account, Interaction::Silent)? {
            DeleteOutcome::Removed | DeleteOutcome::Absent => {}
            DeleteOutcome::NeedsInteraction => blocked = true,
        }
    }
    if !blocked {
        match store.delete(SERVICE, CLEANUP_ACCOUNT, Interaction::Silent)? {
            DeleteOutcome::Removed | DeleteOutcome::Absent => {}
            DeleteOutcome::NeedsInteraction => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;

    use super::*;
    use crate::vault::{Access, MemoryStore};
    use crate::LICENSE_APP_ID;

    fn open(service: &str, account: &str, value: &str, store: &MemoryStore) {
        store.insert(service, account, value, Access::Open);
    }

    #[test]
    fn license_app_id_is_still_spiral() {
        assert_eq!(LICENSE_APP_ID, "spiral");
    }

    #[test]
    fn before_any_write_the_next_run_copies_again() {
        let store = MemoryStore::new();
        open(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "mem_buyer",
            &store,
        );
        assert_eq!(
            migrate(&store).unwrap(),
            Probe::Adopted(LegacyApp::Wallpaper)
        );
        assert_eq!(
            store.value(SERVICE, LICENSE_ACCOUNT).as_deref(),
            Some("mem_buyer")
        );
        assert!(store
            .value(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT)
            .is_none());
    }

    #[test]
    fn status_written_without_the_key_is_overwritten_on_the_next_run() {
        let store = MemoryStore::new();
        let key = "mem_buyer";
        open(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT, key, &store);
        open(
            LegacyApp::Wallpaper.service(),
            STATUS_ACCOUNT,
            &status_document(key).unwrap(),
            &store,
        );
        open(
            SERVICE,
            STATUS_ACCOUNT,
            &status_document("other-key").unwrap(),
            &store,
        );
        assert_eq!(
            migrate(&store).unwrap(),
            Probe::Adopted(LegacyApp::Wallpaper)
        );
        assert_eq!(store.value(SERVICE, LICENSE_ACCOUNT).as_deref(), Some(key));
        let status = store.value(SERVICE, STATUS_ACCOUNT).unwrap();
        assert!(status_binds(&status, key), "{status}");
        assert!(!status_binds(&status, "other-key"));
    }

    #[test]
    fn a_readable_new_key_returns_ready_without_a_second_copy() {
        let store = MemoryStore::new();
        open(SERVICE, LICENSE_ACCOUNT, "LIC1.kept", &store);
        open(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "LIC1.old",
            &store,
        );
        store.clear_ops();
        assert_eq!(migrate(&store).unwrap(), Probe::Ready);
        assert_eq!(store.set_count(), 0);
        assert_eq!(store.delete_count(), 0);
        assert_eq!(store.secret_gets(LegacyApp::Wallpaper.service()), 0);
        assert_eq!(
            store
                .value(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT)
                .as_deref(),
            Some("LIC1.old")
        );
    }

    #[test]
    fn pending_cleanup_deletes_wallpaper_items_and_the_next_ready_does_not() {
        let store = MemoryStore::new();
        open(SERVICE, LICENSE_ACCOUNT, "LIC1.kept", &store);
        open(SERVICE, CLEANUP_ACCOUNT, CLEANUP_PENDING, &store);
        open(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "LIC1.old",
            &store,
        );
        open(
            LegacyApp::Wallpaper.service(),
            STATUS_ACCOUNT,
            "status",
            &store,
        );
        assert_eq!(migrate(&store).unwrap(), Probe::Ready);
        assert!(store
            .value(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT)
            .is_none());
        assert!(store
            .value(LegacyApp::Wallpaper.service(), STATUS_ACCOUNT)
            .is_none());
        assert!(store.value(SERVICE, CLEANUP_ACCOUNT).is_none());
        store.clear_ops();
        assert_eq!(migrate(&store).unwrap(), Probe::Ready);
        assert_eq!(store.set_count(), 0);
        assert_eq!(store.delete_count(), 0);
    }

    #[test]
    fn wallpaper_delete_is_skipped_when_the_store_needs_interaction() {
        let store = MemoryStore::new();
        open(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "mem_buyer",
            &store,
        );
        store.lock_delete(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT);
        assert_eq!(
            migrate(&store).unwrap(),
            Probe::Adopted(LegacyApp::Wallpaper)
        );
        assert_eq!(
            store
                .value(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT)
                .as_deref(),
            Some("mem_buyer")
        );
        assert_eq!(
            store.value(SERVICE, CLEANUP_ACCOUNT).as_deref(),
            Some(CLEANUP_PENDING)
        );
        store.clear_ops();
        assert_eq!(migrate(&store).unwrap(), Probe::Ready);
        assert!(store.delete_count() > 0);
        assert_eq!(
            store
                .value(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT)
                .as_deref(),
            Some("mem_buyer")
        );
    }

    #[test]
    fn a_second_ready_after_a_finished_copy_does_not_write_or_delete() {
        let store = MemoryStore::new();
        open(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "LIC1.once",
            &store,
        );
        assert_eq!(
            migrate(&store).unwrap(),
            Probe::Adopted(LegacyApp::Wallpaper)
        );
        store.clear_ops();
        assert_eq!(migrate(&store).unwrap(), Probe::Ready);
        assert_eq!(store.set_count(), 0);
        assert_eq!(store.delete_count(), 0);
        assert_eq!(store.user_gets(), 0);
    }

    #[test]
    fn a_status_whose_hash_does_not_match_is_not_copied() {
        let store = MemoryStore::new();
        open(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "mem_buyer",
            &store,
        );
        open(
            LegacyApp::Wallpaper.service(),
            STATUS_ACCOUNT,
            &status_document("someone-else").unwrap(),
            &store,
        );
        migrate(&store).unwrap();
        assert!(store.value(SERVICE, STATUS_ACCOUNT).is_none());
        assert_eq!(
            store.value(SERVICE, LICENSE_ACCOUNT).as_deref(),
            Some("mem_buyer")
        );
    }

    #[test]
    fn a_permissive_resume_item_is_not_read_or_deleted_before_consent() {
        let store = MemoryStore::new();
        open(
            LegacyApp::Resume.service(),
            LICENSE_ACCOUNT,
            "resume-secret",
            &store,
        );
        assert_eq!(
            migrate(&store).unwrap(),
            Probe::NeedsConsent(LegacyApp::Resume)
        );
        assert_eq!(store.secret_gets(LegacyApp::Resume.service()), 0);
        assert_eq!(store.user_gets(), 0);
        assert_eq!(store.delete_count(), 0);
        assert_eq!(
            store
                .value(LegacyApp::Resume.service(), LICENSE_ACCOUNT)
                .as_deref(),
            Some("resume-secret")
        );
        assert!(store.value(SERVICE, LICENSE_ACCOUNT).is_none());
        assert_eq!(store.secret_gets(LegacyApp::Clean.service()), 0);
        assert_eq!(store.secret_gets(LegacyApp::Slim.service()), 0);
    }

    #[test]
    fn a_locked_foreign_item_is_not_treated_as_absent() {
        let store = MemoryStore::new();
        store.insert(
            LegacyApp::Resume.service(),
            LICENSE_ACCOUNT,
            "resume-secret",
            Access::Locked,
        );
        assert_eq!(
            migrate(&store).unwrap(),
            Probe::NeedsConsent(LegacyApp::Resume)
        );
        assert_eq!(store.secret_gets(LegacyApp::Resume.service()), 0);
        assert_eq!(store.delete_count(), 0);
        assert_eq!(
            store
                .value(LegacyApp::Resume.service(), LICENSE_ACCOUNT)
                .as_deref(),
            Some("resume-secret")
        );
    }

    #[test]
    fn foreign_probe_stops_at_the_first_service() {
        let store = MemoryStore::new();
        open(
            LegacyApp::Clean.service(),
            LICENSE_ACCOUNT,
            "clean-secret",
            &store,
        );
        open(
            LegacyApp::Slim.service(),
            LICENSE_ACCOUNT,
            "slim-secret",
            &store,
        );
        assert_eq!(
            migrate(&store).unwrap(),
            Probe::NeedsConsent(LegacyApp::Clean)
        );
        assert_eq!(store.secret_gets(LegacyApp::Clean.service()), 0);
        assert!(store
            .ops()
            .iter()
            .all(|op| !matches!(op, crate::vault::StoreOp::Exists { service, .. } if service == LegacyApp::Slim.service())));
    }

    #[test]
    fn adopt_reads_with_consent_and_does_not_delete_the_source() {
        let store = MemoryStore::new();
        open(
            LegacyApp::Resume.service(),
            LICENSE_ACCOUNT,
            "resume-secret",
            &store,
        );
        let status = status_document("resume-secret").unwrap();
        open(LegacyApp::Resume.service(), STATUS_ACCOUNT, &status, &store);
        adopt_with_consent(&store, LegacyApp::Resume).unwrap();
        assert!(store.user_gets() > 0);
        assert_eq!(store.delete_count(), 0);
        assert_eq!(
            store.value(SERVICE, LICENSE_ACCOUNT).as_deref(),
            Some("resume-secret")
        );
        assert_eq!(
            store
                .value(LegacyApp::Resume.service(), LICENSE_ACCOUNT)
                .as_deref(),
            Some("resume-secret")
        );
        assert!(status_binds(
            &store.value(SERVICE, STATUS_ACCOUNT).unwrap(),
            "resume-secret"
        ));
    }

    #[test]
    fn provider_copy_reads_back_and_leaves_the_source() {
        let store = MemoryStore::new();
        open(LEGACY_PROVIDER_SERVICE, "anthropic", "sk-ant-test", &store);
        assert_eq!(
            migrate_provider(&store, ProviderId::Anthropic).unwrap(),
            ProviderProbe::Adopted
        );
        assert_eq!(
            store
                .value(SERVICE, ProviderId::Anthropic.account())
                .as_deref(),
            Some("sk-ant-test")
        );
        assert_eq!(
            store.value(LEGACY_PROVIDER_SERVICE, "anthropic").as_deref(),
            Some("sk-ant-test")
        );
        store.clear_ops();
        assert_eq!(
            migrate_provider(&store, ProviderId::Anthropic).unwrap(),
            ProviderProbe::Ready
        );
        assert_eq!(store.set_count(), 0);
        assert_eq!(store.delete_count(), 0);
        assert_eq!(store.secret_gets(LEGACY_PROVIDER_SERVICE), 0);
    }

    #[test]
    fn a_locked_provider_key_asks_for_a_paste_and_does_not_prompt() {
        let store = MemoryStore::new();
        store.insert(
            LEGACY_PROVIDER_SERVICE,
            "openai",
            "sk-openai",
            Access::Locked,
        );
        assert_eq!(
            migrate_provider(&store, ProviderId::OpenAI).unwrap(),
            ProviderProbe::NeedsPaste
        );
        assert_eq!(store.user_gets(), 0);
        assert!(store.value(SERVICE, ProviderId::OpenAI.account()).is_none());
        assert!(!provider_present(&store, ProviderId::OpenAI).unwrap());
    }

    #[test]
    fn provider_set_and_clear_report_presence_and_hide_the_secret() {
        let store = MemoryStore::new();
        let secret = "sk-ant-super-secret-value";
        provider_set(&store, ProviderId::Anthropic, secret).unwrap();
        assert!(provider_present(&store, ProviderId::Anthropic).unwrap());
        let err = provider_set(&store, ProviderId::Anthropic, "  ").unwrap_err();
        assert!(!err.user_message().contains(secret));
        assert!(!format!("{err:?}").contains(secret));
        provider_clear(&store, ProviderId::Anthropic).unwrap();
        assert!(!provider_present(&store, ProviderId::Anthropic).unwrap());
    }

    #[test]
    fn a_denied_wallpaper_key_is_offered_and_a_denied_foreign_probe_is_skipped() {
        let wallpaper = MemoryStore::new();
        wallpaper.insert(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "wall-secret",
            Access::Denied,
        );
        assert_eq!(
            migrate(&wallpaper).unwrap(),
            Probe::NeedsConsent(LegacyApp::Wallpaper)
        );
        assert_eq!(wallpaper.secret_gets(LegacyApp::Wallpaper.service()), 1);

        let foreign = MemoryStore::new();
        foreign.insert(
            LegacyApp::Resume.service(),
            LICENSE_ACCOUNT,
            "resume-secret",
            Access::Denied,
        );
        foreign.insert(
            LegacyApp::Clean.service(),
            LICENSE_ACCOUNT,
            "clean-secret",
            Access::Open,
        );
        assert_eq!(
            migrate(&foreign).unwrap(),
            Probe::NeedsConsent(LegacyApp::Clean)
        );
        assert_eq!(foreign.secret_gets(LegacyApp::Resume.service()), 0);
    }

    #[test]
    fn clear_license_drops_wallpaper_and_a_blocked_delete_stays_cleared() {
        let store = MemoryStore::new();
        open(SERVICE, LICENSE_ACCOUNT, "LIC1.here", &store);
        open(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "wall-secret",
            &store,
        );
        clear_license(&store).unwrap();
        assert!(store.value(SERVICE, LICENSE_ACCOUNT).is_none());
        assert!(store
            .value(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT)
            .is_none());
        assert_eq!(migrate(&store).unwrap(), Probe::Nothing);
        assert!(store.value(SERVICE, LICENSE_ACCOUNT).is_none());

        let blocked = MemoryStore::new();
        open(SERVICE, LICENSE_ACCOUNT, "LIC1.here", &blocked);
        open(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "wall-secret",
            &blocked,
        );
        blocked.lock_delete(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT);
        clear_license(&blocked).unwrap();
        assert_eq!(
            blocked
                .value(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT)
                .as_deref(),
            Some("wall-secret")
        );
        assert_eq!(migrate(&blocked).unwrap(), Probe::Nothing);
        assert!(blocked.value(SERVICE, LICENSE_ACCOUNT).is_none());
    }

    #[test]
    fn clear_license_does_not_delete_a_foreign_item() {
        let store = MemoryStore::new();
        open(SERVICE, LICENSE_ACCOUNT, "LIC1.here", &store);
        open(
            LegacyApp::Resume.service(),
            LICENSE_ACCOUNT,
            "resume-secret",
            &store,
        );
        clear_license(&store).unwrap();
        assert!(store.value(SERVICE, LICENSE_ACCOUNT).is_none());
        assert_eq!(
            store
                .value(LegacyApp::Resume.service(), LICENSE_ACCOUNT)
                .as_deref(),
            Some("resume-secret")
        );
    }

    #[test]
    fn the_cleanup_receipt_is_written_before_the_key_and_delete_follows_it() {
        let store = MemoryStore::new();
        open(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "mem_buyer",
            &store,
        );
        migrate(&store).unwrap();
        let ops = store.ops();
        let receipt = ops.iter().position(|op| {
            matches!(op, crate::vault::StoreOp::Set { account, .. } if account == CLEANUP_ACCOUNT)
        });
        let key = ops.iter().position(|op| {
            matches!(op, crate::vault::StoreOp::Set { account, .. } if account == LICENSE_ACCOUNT)
        });
        let deleted = ops.iter().position(|op| {
            matches!(
                op,
                crate::vault::StoreOp::Delete { service, .. }
                    if service == LegacyApp::Wallpaper.service()
            )
        });
        let (Some(receipt), Some(key), Some(deleted)) = (receipt, key, deleted) else {
            panic!("missing receipt, key, or delete: {ops:?}");
        };
        assert!(receipt < key);
        assert!(key < deleted);
    }

    #[test]
    fn a_failed_key_write_leaves_the_wallpaper_item() {
        let store = FailFirstLicenseWrite::new();
        open(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "mem_buyer",
            &store.inner,
        );
        assert!(migrate(&store).is_err());
        assert_eq!(
            store
                .inner
                .value(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT)
                .as_deref(),
            Some("mem_buyer")
        );
        assert!(store.inner.value(SERVICE, LICENSE_ACCOUNT).is_none());
        assert!(store.inner.ops().iter().all(|op| {
            !matches!(
                op,
                crate::vault::StoreOp::Delete { service, .. }
                    if service == LegacyApp::Wallpaper.service()
            )
        }));
        assert_eq!(
            migrate(&store).unwrap(),
            Probe::Adopted(LegacyApp::Wallpaper)
        );
        assert_eq!(
            store.inner.value(SERVICE, LICENSE_ACCOUNT).as_deref(),
            Some("mem_buyer")
        );
        assert!(store
            .inner
            .value(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT)
            .is_none());
    }

    #[test]
    fn a_pending_receipt_without_a_key_still_copies() {
        let store = MemoryStore::new();
        open(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "mem_buyer",
            &store,
        );
        open(SERVICE, CLEANUP_ACCOUNT, CLEANUP_PENDING, &store);
        assert_eq!(
            migrate(&store).unwrap(),
            Probe::Adopted(LegacyApp::Wallpaper)
        );
        assert_eq!(
            store.value(SERVICE, LICENSE_ACCOUNT).as_deref(),
            Some("mem_buyer")
        );
        assert!(store
            .value(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT)
            .is_none());
    }

    #[test]
    fn cleanup_does_not_delete_resume_clean_or_slim() {
        let store = MemoryStore::new();
        open(SERVICE, LICENSE_ACCOUNT, "LIC1.kept", &store);
        open(SERVICE, CLEANUP_ACCOUNT, CLEANUP_PENDING, &store);
        open(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "LIC1.old",
            &store,
        );
        for app in [LegacyApp::Resume, LegacyApp::Clean, LegacyApp::Slim] {
            open(app.service(), LICENSE_ACCOUNT, "foreign-secret", &store);
        }
        assert_eq!(migrate(&store).unwrap(), Probe::Ready);
        assert!(store
            .value(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT)
            .is_none());
        for app in [LegacyApp::Resume, LegacyApp::Clean, LegacyApp::Slim] {
            assert_eq!(
                store.value(app.service(), LICENSE_ACCOUNT).as_deref(),
                Some("foreign-secret")
            );
            assert_eq!(store.secret_gets(app.service()), 0);
        }
    }

    #[test]
    fn a_whop_wallpaper_key_is_copied_when_the_license_account_is_absent() {
        let store = MemoryStore::new();
        open(
            LegacyApp::Wallpaper.service(),
            WHOP_LICENSE,
            "mem_old",
            &store,
        );
        assert_eq!(
            migrate(&store).unwrap(),
            Probe::Adopted(LegacyApp::Wallpaper)
        );
        assert_eq!(
            store.value(SERVICE, LICENSE_ACCOUNT).as_deref(),
            Some("mem_old")
        );
        assert!(store
            .value(LegacyApp::Wallpaper.service(), WHOP_LICENSE)
            .is_none());
    }

    #[test]
    fn a_permissive_whop_resume_key_is_not_read() {
        let store = MemoryStore::new();
        open(
            LegacyApp::Resume.service(),
            WHOP_LICENSE,
            "resume-secret",
            &store,
        );
        assert_eq!(
            migrate(&store).unwrap(),
            Probe::NeedsConsent(LegacyApp::Resume)
        );
        assert_eq!(store.secret_gets(LegacyApp::Resume.service()), 0);
        assert_eq!(store.user_gets(), 0);
        assert_eq!(store.delete_count(), 0);
    }

    struct FailFirstLicenseWrite {
        inner: MemoryStore,
        armed: AtomicBool,
    }

    impl FailFirstLicenseWrite {
        fn new() -> Self {
            Self {
                inner: MemoryStore::new(),
                armed: AtomicBool::new(true),
            }
        }
    }

    impl CredentialStore for FailFirstLicenseWrite {
        fn get(
            &self,
            service: &str,
            account: &str,
            interaction: Interaction,
        ) -> Result<Option<Secret>, VaultError> {
            self.inner.get(service, account, interaction)
        }

        fn exists(
            &self,
            service: &str,
            account: &str,
            interaction: Interaction,
        ) -> Result<Existence, VaultError> {
            self.inner.exists(service, account, interaction)
        }

        fn set(&self, service: &str, account: &str, secret: &Secret) -> Result<(), VaultError> {
            if service == SERVICE
                && account == LICENSE_ACCOUNT
                && self.armed.swap(false, Ordering::SeqCst)
            {
                return Err(VaultError::Unavailable("the key was not saved".into()));
            }
            self.inner.set(service, account, secret)
        }

        fn delete(
            &self,
            service: &str,
            account: &str,
            interaction: Interaction,
        ) -> Result<DeleteOutcome, VaultError> {
            self.inner.delete(service, account, interaction)
        }
    }

    struct ClearHook;

    impl Drop for ClearHook {
        fn drop(&mut self) {
            crate::set_verify_hook(None);
        }
    }

    fn serve(status: u16, body: &'static str) -> (String, Arc<AtomicUsize>) {
        let hits = Arc::new(AtomicUsize::new(0));
        let count = Arc::clone(&hits);
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for _ in 0..4 {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                count.fetch_add(1, Ordering::SeqCst);
                let mut buf = [0u8; 1024];
                let mut total = Vec::new();
                loop {
                    match stream.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            total.extend_from_slice(&buf[..n]);
                            if total.windows(4).any(|window| window == b"\r\n\r\n") {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
                let header = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(header.as_bytes());
                let _ = stream.write_all(body.as_bytes());
            }
        });
        (format!("http://{addr}/activate"), hits)
    }

    fn accept_test_key(key: &str) -> Result<(), LicenseError> {
        if key == "LIC1.signed-test" {
            Ok(())
        } else {
            Err(LicenseError::InvalidKey)
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn a_copied_mem_key_is_exchanged_once_and_kept_when_the_server_is_unclear() {
        crate::set_verify_hook(Some(accept_test_key));
        let _hook = ClearHook;
        let store = MemoryStore::new();
        open(SERVICE, LICENSE_ACCOUNT, "mem_buyer", &store);
        let (url, hits) = serve(500, r#"{"ok":false,"error":"server_error"}"#);
        let exchange = LaunchExchange::new();
        let err = ensure_licensed(&store, &url, &exchange).await.unwrap_err();
        assert!(matches!(err, LicenseError::Network(_)));
        assert_eq!(
            store.value(SERVICE, LICENSE_ACCOUNT).as_deref(),
            Some("mem_buyer")
        );
        assert_eq!(hits.load(Ordering::SeqCst), 1);
        let again = ensure_licensed(&store, &url, &exchange).await.unwrap_err();
        assert!(matches!(again, LicenseError::Network(_)));
        assert_eq!(hits.load(Ordering::SeqCst), 1);
        assert_eq!(
            store.value(SERVICE, LICENSE_ACCOUNT).as_deref(),
            Some("mem_buyer")
        );
        crate::set_verify_hook(None);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn a_copied_mem_key_is_replaced_by_the_signed_key_and_matching_status() {
        crate::set_verify_hook(Some(accept_test_key));
        let _hook = ClearHook;
        let store = MemoryStore::new();
        open(
            LegacyApp::Wallpaper.service(),
            LICENSE_ACCOUNT,
            "mem_buyer",
            &store,
        );
        assert_eq!(
            migrate(&store).unwrap(),
            Probe::Adopted(LegacyApp::Wallpaper)
        );
        assert_eq!(
            store.value(SERVICE, LICENSE_ACCOUNT).as_deref(),
            Some("mem_buyer")
        );
        let (url, hits) = serve(
            200,
            r#"{"ok":true,"status":"active","key":"LIC1.signed-test"}"#,
        );
        let exchange = LaunchExchange::new();
        let validity = ensure_licensed(&store, &url, &exchange).await.unwrap();
        assert!(!validity.grace);
        assert_eq!(hits.load(Ordering::SeqCst), 1);
        assert_eq!(
            store.value(SERVICE, LICENSE_ACCOUNT).as_deref(),
            Some("LIC1.signed-test")
        );
        let status = store.value(SERVICE, STATUS_ACCOUNT).unwrap();
        assert!(status_binds(&status, "LIC1.signed-test"), "{status}");
        assert!(!status_binds(&status, "mem_buyer"));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn email_activation_stores_the_signed_key_on_the_new_service() {
        crate::set_verify_hook(Some(accept_test_key));
        let _hook = ClearHook;
        let store = MemoryStore::new();
        let (url, _) = serve(
            200,
            r#"{"ok":true,"status":"active","key":"LIC1.signed-test"}"#,
        );
        activate_with_code(&store, "a@b.co", "123456", &url)
            .await
            .unwrap();
        assert_eq!(
            store.value(SERVICE, LICENSE_ACCOUNT).as_deref(),
            Some("LIC1.signed-test")
        );
        assert!(status_binds(
            &store.value(SERVICE, STATUS_ACCOUNT).unwrap(),
            "LIC1.signed-test"
        ));
        assert!(store
            .value(LegacyApp::Wallpaper.service(), LICENSE_ACCOUNT)
            .is_none());
        assert!(store
            .value(LegacyApp::Resume.service(), LICENSE_ACCOUNT)
            .is_none());
    }
}
