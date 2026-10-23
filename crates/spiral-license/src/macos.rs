use std::sync::Mutex;

use security_framework::base::Error;
use security_framework::item::{ItemClass, ItemSearchOptions, SearchResult};
use security_framework::os::macos::keychain::{SecKeychain, SecPreferencesDomain};
use security_framework::os::macos::passwords::find_generic_password;
use security_framework_sys::base::{errSecAuthFailed, errSecItemNotFound, errSecSuccess};
use security_framework_sys::keychain::{
    SecKeychainGetUserInteractionAllowed, SecKeychainSetUserInteractionAllowed,
};

use crate::vault::{
    run_with_interaction, CredentialStore, DeleteOutcome, Existence, Interaction, Secret,
    VaultError,
};

const ERR_SEC_INTERACTION_NOT_ALLOWED: i32 = -25308;
const ERR_SEC_USER_CANCELED: i32 = -128;
const ERR_SEC_ITEM_NOT_FOUND: i32 = errSecItemNotFound;
const ERR_SEC_AUTH_FAILED: i32 = errSecAuthFailed;
const ERR_SEC_SUCCESS: i32 = errSecSuccess;

static VAULT: Mutex<()> = Mutex::new(());

pub struct MacStore;

enum Found {
    Present,
    Missing,
    Locked,
}

impl CredentialStore for MacStore {
    fn get(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<Option<Secret>, VaultError> {
        with_vault(interaction, || read_secret(service, account))
    }

    fn exists(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<Existence, VaultError> {
        with_vault(interaction, || match probe_attributes(service, account)? {
            Found::Present => Ok(Existence::Present),
            Found::Missing => Ok(Existence::Absent),
            Found::Locked => Ok(Existence::NeedsInteraction),
        })
    }

    fn set(&self, service: &str, account: &str, secret: &Secret) -> Result<(), VaultError> {
        with_vault(Interaction::Silent, || {
            write_secret(service, account, secret)
        })
    }

    fn delete(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<DeleteOutcome, VaultError> {
        with_vault(interaction, || delete_match(service, account))
    }
}

fn with_vault<T>(
    interaction: Interaction,
    body: impl FnOnce() -> Result<T, VaultError>,
) -> Result<T, VaultError> {
    let _lock = VAULT
        .lock()
        .map_err(|_| VaultError::Unavailable("The keychain lock was poisoned.".into()))?;
    run_with_interaction(interaction, interaction_allowed, set_interaction, body)
}

fn interaction_allowed() -> Result<bool, VaultError> {
    let mut state: u8 = 0;
    let code = unsafe { SecKeychainGetUserInteractionAllowed(&mut state) };
    if code == ERR_SEC_SUCCESS {
        Ok(state != 0)
    } else {
        Err(VaultError::Unavailable(format!("keychain error {code}")))
    }
}

fn set_interaction(allowed: bool) -> Result<(), VaultError> {
    let code = unsafe { SecKeychainSetUserInteractionAllowed(u8::from(allowed)) };
    if code == ERR_SEC_SUCCESS {
        Ok(())
    } else {
        Err(VaultError::Unavailable(format!("keychain error {code}")))
    }
}

fn login() -> Result<SecKeychain, VaultError> {
    SecKeychain::default_for_domain(SecPreferencesDomain::User).map_err(unavailable)
}

fn probe_attributes(service: &str, account: &str) -> Result<Found, VaultError> {
    let mut query = password_query(service, account)?;
    query.load_attributes(true).load_data(false);
    match query.search() {
        Ok(items) => {
            let mut present = false;
            for item in items {
                present = true;
                if let SearchResult::Data(mut bytes) = item {
                    bytes.fill(0);
                }
            }
            if present {
                Ok(Found::Present)
            } else {
                Ok(Found::Missing)
            }
        }
        Err(err) => match err.code() {
            ERR_SEC_ITEM_NOT_FOUND => Ok(Found::Missing),
            ERR_SEC_INTERACTION_NOT_ALLOWED => Ok(Found::Locked),
            ERR_SEC_AUTH_FAILED | ERR_SEC_USER_CANCELED => Err(VaultError::Denied),
            other => Err(VaultError::Unavailable(format!("keychain error {other}"))),
        },
    }
}

fn delete_match(service: &str, account: &str) -> Result<DeleteOutcome, VaultError> {
    match password_query(service, account)?.delete() {
        Ok(()) => Ok(DeleteOutcome::Removed),
        Err(err) => match err.code() {
            ERR_SEC_ITEM_NOT_FOUND => Ok(DeleteOutcome::Absent),
            ERR_SEC_INTERACTION_NOT_ALLOWED => Ok(DeleteOutcome::NeedsInteraction),
            ERR_SEC_AUTH_FAILED | ERR_SEC_USER_CANCELED => Err(VaultError::Denied),
            other => Err(VaultError::Unavailable(format!("keychain error {other}"))),
        },
    }
}

fn password_query(service: &str, account: &str) -> Result<ItemSearchOptions, VaultError> {
    if service.is_empty() || account.is_empty() {
        return Err(VaultError::Unavailable(
            "The keychain account is empty.".into(),
        ));
    }
    let keychain = login()?;
    let mut query = ItemSearchOptions::new();
    query
        .class(ItemClass::generic_password())
        .service(service)
        .account(account)
        .keychains(&[keychain]);
    Ok(query)
}

fn read_secret(service: &str, account: &str) -> Result<Option<Secret>, VaultError> {
    if service.is_empty() || account.is_empty() {
        return Err(VaultError::Unavailable(
            "The keychain account is empty.".into(),
        ));
    }
    let keychain = login()?;
    match find_generic_password(Some(&[keychain]), service, account) {
        Ok((password, _item)) => {
            let text = String::from_utf8(password.to_vec())
                .map_err(|_| VaultError::Unavailable("The keychain value is not text.".into()))?;
            Ok(Some(Secret::new(text)))
        }
        Err(err) => match err.code() {
            ERR_SEC_ITEM_NOT_FOUND => Ok(None),
            ERR_SEC_INTERACTION_NOT_ALLOWED => Err(VaultError::NeedsInteraction),
            ERR_SEC_AUTH_FAILED | ERR_SEC_USER_CANCELED => Err(VaultError::Denied),
            other => Err(VaultError::Unavailable(format!("keychain error {other}"))),
        },
    }
}

fn write_secret(service: &str, account: &str, secret: &Secret) -> Result<(), VaultError> {
    if service.is_empty() || account.is_empty() {
        return Err(VaultError::Unavailable(
            "The keychain account is empty.".into(),
        ));
    }
    login()?
        .set_generic_password(service, account, secret.expose().as_bytes())
        .map_err(unavailable)
}

fn unavailable(err: Error) -> VaultError {
    match err.code() {
        ERR_SEC_INTERACTION_NOT_ALLOWED => VaultError::NeedsInteraction,
        ERR_SEC_AUTH_FAILED | ERR_SEC_USER_CANCELED => VaultError::Denied,
        _ => VaultError::Unavailable(err.to_string()),
    }
}
