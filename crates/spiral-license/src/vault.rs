use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use crate::LicenseError;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Interaction {
    Silent,
    User,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeleteOutcome {
    Removed,
    Absent,
    NeedsInteraction,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Existence {
    Present,
    Absent,
    NeedsInteraction,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum VaultError {
    NeedsInteraction,
    Denied,
    Unavailable(String),
    Mismatch,
}

impl From<VaultError> for LicenseError {
    fn from(err: VaultError) -> Self {
        match err {
            VaultError::NeedsInteraction => Self::NeedsInteraction,
            VaultError::Denied => Self::Denied,
            VaultError::Unavailable(message) => Self::Keychain(message),
            VaultError::Mismatch => Self::Keychain("the key was not saved".into()),
        }
    }
}

pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl Drop for Secret {
    fn drop(&mut self) {
        let mut bytes = std::mem::take(&mut self.0).into_bytes();
        bytes.fill(0);
    }
}

pub trait CredentialStore: Send + Sync {
    fn get(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<Option<Secret>, VaultError>;

    fn exists(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<Existence, VaultError>;

    fn set(&self, service: &str, account: &str, secret: &Secret) -> Result<(), VaultError>;

    fn delete(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<DeleteOutcome, VaultError>;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Access {
    Open,
    Locked,
    Denied,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StoreOp {
    Get {
        service: String,
        account: String,
        interaction: Interaction,
    },
    Exists {
        service: String,
        account: String,
        interaction: Interaction,
    },
    Set {
        service: String,
        account: String,
    },
    Delete {
        service: String,
        account: String,
        interaction: Interaction,
    },
}

struct Item {
    value: String,
    access: Access,
}

pub struct MemoryStore {
    items: Mutex<HashMap<(String, String), Item>>,
    blocked_deletes: Mutex<HashSet<(String, String)>>,
    ops: Mutex<Vec<StoreOp>>,
}

impl MemoryStore {
    pub fn new() -> Self {
        Self {
            items: Mutex::new(HashMap::new()),
            blocked_deletes: Mutex::new(HashSet::new()),
            ops: Mutex::new(Vec::new()),
        }
    }

    pub fn insert(&self, service: &str, account: &str, value: &str, access: Access) {
        self.items.lock().expect("memory store").insert(
            (service.to_string(), account.to_string()),
            Item {
                value: value.to_string(),
                access,
            },
        );
    }

    pub fn lock_delete(&self, service: &str, account: &str) {
        self.blocked_deletes
            .lock()
            .expect("memory store")
            .insert((service.to_string(), account.to_string()));
    }

    pub fn value(&self, service: &str, account: &str) -> Option<String> {
        self.items
            .lock()
            .expect("memory store")
            .get(&(service.to_string(), account.to_string()))
            .map(|item| item.value.clone())
    }

    pub fn ops(&self) -> Vec<StoreOp> {
        self.ops.lock().expect("memory store").clone()
    }

    pub fn clear_ops(&self) {
        self.ops.lock().expect("memory store").clear();
    }

    pub fn set_count(&self) -> usize {
        self.ops()
            .iter()
            .filter(|op| matches!(op, StoreOp::Set { .. }))
            .count()
    }

    pub fn delete_count(&self) -> usize {
        self.ops()
            .iter()
            .filter(|op| matches!(op, StoreOp::Delete { .. }))
            .count()
    }

    pub fn user_gets(&self) -> usize {
        self.ops()
            .iter()
            .filter(|op| {
                matches!(
                    op,
                    StoreOp::Get {
                        interaction: Interaction::User,
                        ..
                    }
                )
            })
            .count()
    }

    pub fn secret_gets(&self, service: &str) -> usize {
        self.ops()
            .iter()
            .filter(|op| match op {
                StoreOp::Get { service: got, .. } => got == service,
                _ => false,
            })
            .count()
    }

    fn key(service: &str, account: &str) -> (String, String) {
        (service.to_string(), account.to_string())
    }

    fn push(&self, op: StoreOp) {
        self.ops.lock().expect("memory store").push(op);
    }
}

impl Default for MemoryStore {
    fn default() -> Self {
        Self::new()
    }
}

impl CredentialStore for MemoryStore {
    fn get(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<Option<Secret>, VaultError> {
        self.push(StoreOp::Get {
            service: service.to_string(),
            account: account.to_string(),
            interaction,
        });
        let items = self.items.lock().expect("memory store");
        let Some(item) = items.get(&Self::key(service, account)) else {
            return Ok(None);
        };
        if item.access == Access::Denied {
            return Err(VaultError::Denied);
        }
        if item.access == Access::Locked && interaction == Interaction::Silent {
            return Err(VaultError::NeedsInteraction);
        }
        Ok(Some(Secret::new(item.value.clone())))
    }

    fn exists(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<Existence, VaultError> {
        self.push(StoreOp::Exists {
            service: service.to_string(),
            account: account.to_string(),
            interaction,
        });
        let items = self.items.lock().expect("memory store");
        let Some(item) = items.get(&Self::key(service, account)) else {
            return Ok(Existence::Absent);
        };
        if item.access == Access::Denied {
            return Err(VaultError::Denied);
        }
        if item.access == Access::Locked && interaction == Interaction::Silent {
            return Ok(Existence::NeedsInteraction);
        }
        Ok(Existence::Present)
    }

    fn set(&self, service: &str, account: &str, secret: &Secret) -> Result<(), VaultError> {
        self.push(StoreOp::Set {
            service: service.to_string(),
            account: account.to_string(),
        });
        self.items.lock().expect("memory store").insert(
            Self::key(service, account),
            Item {
                value: secret.expose().to_string(),
                access: Access::Open,
            },
        );
        Ok(())
    }

    fn delete(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<DeleteOutcome, VaultError> {
        self.push(StoreOp::Delete {
            service: service.to_string(),
            account: account.to_string(),
            interaction,
        });
        let key = Self::key(service, account);
        if self
            .blocked_deletes
            .lock()
            .expect("memory store")
            .contains(&key)
            && interaction == Interaction::Silent
        {
            return Ok(DeleteOutcome::NeedsInteraction);
        }
        let mut items = self.items.lock().expect("memory store");
        if items.remove(&key).is_some() {
            Ok(DeleteOutcome::Removed)
        } else {
            Ok(DeleteOutcome::Absent)
        }
    }
}

pub fn run_with_interaction<T, E>(
    interaction: Interaction,
    get: impl Fn() -> Result<bool, E>,
    set: impl Fn(bool) -> Result<(), E>,
    body: impl FnOnce() -> Result<T, E>,
) -> Result<T, E> {
    let previous = get()?;
    if interaction == Interaction::Silent {
        set(false)?;
    }
    let _restore = InteractionRestore {
        previous,
        set: &set,
    };
    body()
}

struct InteractionRestore<'a, E, S: Fn(bool) -> Result<(), E>> {
    previous: bool,
    set: &'a S,
}

impl<E, S: Fn(bool) -> Result<(), E>> Drop for InteractionRestore<'_, E, S> {
    fn drop(&mut self) {
        let _ = (self.set)(self.previous);
    }
}

pub fn windows_credential_target(account: &str, service: &str) -> String {
    format!("{account}.{service}")
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn password_blob(text: &str) -> Vec<u8> {
    let mut blob = Vec::with_capacity(text.encode_utf16().count() * 2);
    for unit in text.encode_utf16() {
        blob.extend_from_slice(&unit.to_le_bytes());
    }
    blob
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn password_from_blob(blob: &[u8]) -> Result<String, VaultError> {
    let (pairs, rest) = blob.as_chunks::<2>();
    if !rest.is_empty() {
        return Err(VaultError::Unavailable(
            "The credential is not a password.".into(),
        ));
    }
    let units = pairs
        .iter()
        .map(|pair| u16::from_le_bytes(*pair))
        .collect::<Vec<_>>();
    String::from_utf16(&units)
        .map_err(|_| VaultError::Unavailable("The credential is not a password.".into()))
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use super::*;

    #[test]
    fn secret_type_has_no_debug_or_serialize() {
        let src = include_str!("vault.rs");
        let secret = src.split("pub struct Secret").nth(1).expect("Secret");
        let head = secret.split("impl Secret").next().expect("head");
        assert!(!head.contains("Debug"), "{head}");
        assert!(!head.contains("Serialize"), "{head}");
    }

    #[test]
    fn silent_work_restores_a_disabled_interaction_flag() {
        let flag = Cell::new(false);
        let get = || Ok::<bool, ()>(flag.get());
        let set = |value: bool| {
            flag.set(value);
            Ok(())
        };
        run_with_interaction(Interaction::Silent, get, set, || {
            assert!(!flag.get());
            Ok(())
        })
        .unwrap();
        assert!(!flag.get());
    }

    #[test]
    fn silent_work_restores_an_enabled_interaction_flag() {
        let flag = Cell::new(true);
        let get = || Ok::<bool, ()>(flag.get());
        let set = |value: bool| {
            flag.set(value);
            Ok(())
        };
        run_with_interaction(Interaction::Silent, get, set, || {
            assert!(!flag.get());
            Ok(())
        })
        .unwrap();
        assert!(flag.get());
    }

    #[test]
    fn a_user_call_does_not_turn_interaction_off() {
        let flag = Cell::new(true);
        let get = || Ok::<bool, ()>(flag.get());
        let set = |value: bool| {
            flag.set(value);
            Ok(())
        };
        run_with_interaction(Interaction::User, get, set, || {
            assert!(flag.get());
            Ok(())
        })
        .unwrap();
        assert!(flag.get());
    }

    #[test]
    fn windows_target_matches_keyring_account_dot_service() {
        assert_eq!(
            windows_credential_target("license", "app.spiral.wallpaper"),
            "license.app.spiral.wallpaper"
        );
        assert_eq!(
            windows_credential_target("provider:anthropic", "app.spiral"),
            "provider:anthropic.app.spiral"
        );
    }

    #[test]
    fn password_blob_is_utf16_le_without_a_trailing_nul() {
        assert_eq!(password_blob("Ab"), b"A\0b\0");
        assert_eq!(
            password_from_blob(&password_blob("mem_key")).unwrap(),
            "mem_key"
        );
    }

    #[test]
    fn an_open_item_can_be_read_silently_and_a_locked_item_cannot() {
        let store = MemoryStore::new();
        store.insert(
            "app.spiral.resume",
            "license",
            "resume-secret",
            Access::Open,
        );
        let secret = store
            .get("app.spiral.resume", "license", Interaction::Silent)
            .unwrap()
            .unwrap();
        assert_eq!(secret.expose(), "resume-secret");
        store.insert(
            "app.spiral.clean",
            "license",
            "clean-secret",
            Access::Locked,
        );
        assert_eq!(
            store.exists("app.spiral.clean", "license", Interaction::Silent),
            Ok(Existence::NeedsInteraction)
        );
        assert!(matches!(
            store.get("app.spiral.clean", "license", Interaction::Silent),
            Err(VaultError::NeedsInteraction)
        ));
        assert_eq!(
            store
                .get("app.spiral.clean", "license", Interaction::User)
                .unwrap()
                .unwrap()
                .expose(),
            "clean-secret"
        );
    }

    #[test]
    fn macos_store_does_not_skip_authenticated_items_or_force_interaction_on() {
        let src = include_str!("macos.rs");
        assert!(!src.contains("skip_authenticated_items"), "{src}");
        assert!(!src.contains("disable_user_interaction"), "{src}");
        assert!(src.contains("SecKeychainGetUserInteractionAllowed"));
        assert!(src.contains("SecKeychainSetUserInteractionAllowed"));
        let probe = src
            .split("fn probe_attributes")
            .nth(1)
            .expect("probe_attributes");
        let body = probe.split("fn delete_match").next().expect("probe body");
        assert!(body.contains("load_attributes(true)"), "{body}");
        assert!(body.contains("load_data(false)"), "{body}");
        assert!(!body.contains("find_generic_password"), "{body}");
        assert!(!body.contains("load_data(true)"), "{body}");
    }

    #[test]
    fn windows_exists_does_not_ask_for_the_secret() {
        let src = include_str!("windows.rs");
        let exists = src.split("fn exists(").nth(1).expect("exists");
        let body = exists.split("fn set(").next().expect("exists body");
        assert!(body.contains(", false)"), "{body}");
        assert!(!body.contains(", true)"), "{body}");
    }
}
