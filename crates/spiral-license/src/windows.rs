use std::sync::Mutex;

use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
use windows_sys::Win32::Security::Credentials::{
    CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_ENTERPRISE,
    CRED_TYPE_GENERIC,
};

use crate::vault::{
    password_blob, password_from_blob, windows_credential_target, CredentialStore, DeleteOutcome,
    Existence, Interaction, Secret, VaultError,
};

static VAULT: Mutex<()> = Mutex::new(());

pub struct WinStore;

impl CredentialStore for WinStore {
    fn get(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<Option<Secret>, VaultError> {
        let _ = interaction;
        with_vault(|| match cred_read(&target(account, service), true)? {
            CredHit::Missing => Ok(None),
            CredHit::Present(Some(secret)) => Ok(Some(secret)),
            CredHit::Present(None) => Err(VaultError::Unavailable(
                "The credential is not a password.".into(),
            )),
        })
    }

    fn exists(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<Existence, VaultError> {
        let _ = interaction;
        with_vault(|| match cred_read(&target(account, service), false)? {
            CredHit::Missing => Ok(Existence::Absent),
            CredHit::Present(_) => Ok(Existence::Present),
        })
    }

    fn set(&self, service: &str, account: &str, secret: &Secret) -> Result<(), VaultError> {
        with_vault(|| cred_write(&target(account, service), account, secret.expose()))
    }

    fn delete(
        &self,
        service: &str,
        account: &str,
        interaction: Interaction,
    ) -> Result<DeleteOutcome, VaultError> {
        let _ = interaction;
        with_vault(|| cred_delete(&target(account, service)))
    }
}

fn with_vault<T>(body: impl FnOnce() -> Result<T, VaultError>) -> Result<T, VaultError> {
    let _lock = VAULT
        .lock()
        .map_err(|_| VaultError::Unavailable("The credential lock was poisoned.".into()))?;
    body()
}

fn target(account: &str, service: &str) -> String {
    windows_credential_target(account, service)
}

enum CredHit {
    Missing,
    Present(Option<Secret>),
}

fn cred_read(target: &str, copy_secret: bool) -> Result<CredHit, VaultError> {
    let name = wide(target);
    let mut credential = std::ptr::null_mut();
    let ok = unsafe { CredReadW(name.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) };
    if ok == 0 {
        return match unsafe { GetLastError() } {
            ERROR_NOT_FOUND => Ok(CredHit::Missing),
            other => Err(VaultError::Unavailable(format!("credential error {other}"))),
        };
    }
    if credential.is_null() {
        return Err(VaultError::Unavailable(
            "The credential manager returned no item.".into(),
        ));
    }
    let hit = unsafe {
        let raw = &*credential;
        let copied = if copy_secret && !raw.CredentialBlob.is_null() && raw.CredentialBlobSize > 0 {
            let bytes =
                std::slice::from_raw_parts(raw.CredentialBlob, raw.CredentialBlobSize as usize);
            Some(password_from_blob(bytes).map(Secret::new).ok())
        } else {
            None
        };
        wipe(raw);
        CredFree(credential.cast());
        match copied {
            Some(secret) => CredHit::Present(secret),
            None => CredHit::Present(None),
        }
    };
    Ok(hit)
}

fn cred_write(target: &str, account: &str, secret: &str) -> Result<(), VaultError> {
    let mut target_name = wide(target);
    let mut user = wide(account);
    let mut comment = wide("");
    let mut alias = wide("");
    let mut blob = password_blob(secret);
    let mut credential = CREDENTIALW {
        Flags: 0,
        Type: CRED_TYPE_GENERIC,
        TargetName: target_name.as_mut_ptr(),
        Comment: comment.as_mut_ptr(),
        LastWritten: windows_sys::Win32::Foundation::FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        },
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_ENTERPRISE,
        AttributeCount: 0,
        Attributes: std::ptr::null_mut(),
        TargetAlias: alias.as_mut_ptr(),
        UserName: user.as_mut_ptr(),
    };
    let ok = unsafe { CredWriteW(&mut credential, 0) };
    blob.fill(0);
    if ok == 0 {
        let code = unsafe { GetLastError() };
        return Err(VaultError::Unavailable(format!("credential error {code}")));
    }
    Ok(())
}

fn cred_delete(target: &str) -> Result<DeleteOutcome, VaultError> {
    let name = wide(target);
    let ok = unsafe { CredDeleteW(name.as_ptr(), CRED_TYPE_GENERIC, 0) };
    if ok == 0 {
        return match unsafe { GetLastError() } {
            ERROR_NOT_FOUND => Ok(DeleteOutcome::Absent),
            other => Err(VaultError::Unavailable(format!("credential error {other}"))),
        };
    }
    Ok(DeleteOutcome::Removed)
}

fn wipe(credential: &CREDENTIALW) {
    if credential.CredentialBlob.is_null() || credential.CredentialBlobSize == 0 {
        return;
    }
    unsafe {
        std::ptr::write_bytes(
            credential.CredentialBlob,
            0,
            credential.CredentialBlobSize as usize,
        );
    }
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}
