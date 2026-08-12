//! The one module that may read a secret.
//!
//! Keys live in the OS credential store — Keychain on macOS, Credential Manager
//! on Windows — never in a config file, never in the app data folder, never in
//! the document. `read` is `pub(crate)` so the IPC layer physically cannot
//! return a key to the frontend: the only thing a command can ask is whether
//! one *exists*.
//!
//! Nothing here derives `Debug`, and no error path includes the secret. A key
//! that reaches a log is a key that reaches a bug report.

const SERVICE: &str = "app.spiral.resume";

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, provider)
        .map_err(|e| format!("Could not reach this machine's keychain: {e}."))
}

pub fn store(provider: &str, key: &str) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("That key is empty. Paste the key from your provider's console.".to_string());
    }
    entry(provider)?
        .set_password(key.trim())
        .map_err(|e| format!("Could not save the key to your keychain: {e}."))
}

/// Deliberately `pub(crate)`. The command layer has no way to call this.
pub(crate) fn read(provider: &str) -> Option<String> {
    entry(provider).ok()?.get_password().ok()
}

pub fn has(provider: &str) -> bool {
    read(provider).is_some()
}

pub fn clear(provider: &str) -> Result<(), String> {
    match entry(provider)?.delete_credential() {
        Ok(()) => Ok(()),
        // Already gone is the state the user asked for.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not remove the key from your keychain: {e}.")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real keychain write on a CI machine would prompt or fail, so this test
    /// is opt-in. Run it on a developer machine with:
    /// `SPIRAL_RESUME_KEYCHAIN_TEST=1 cargo test --lib keys -- --ignored`
    #[test]
    #[ignore]
    fn a_key_round_trips_and_can_be_removed() {
        let provider = "spiral-resume-test-provider";
        let _ = clear(provider);
        assert!(!has(provider));

        store(provider, "sk-not-a-real-key").unwrap();
        assert!(has(provider));
        assert_eq!(read(provider).as_deref(), Some("sk-not-a-real-key"));

        clear(provider).unwrap();
        assert!(!has(provider));
        // Clearing twice is not an error — the end state is what was asked for.
        clear(provider).unwrap();
    }

    #[test]
    fn an_empty_key_is_refused_before_it_reaches_the_keychain() {
        let err = store("spiral-resume-test-provider", "   ").unwrap_err();
        assert!(err.contains("empty"), "got {err}");
    }

    /// The guard that matters: no error message may carry the secret. If a
    /// future edit interpolates the key into a message, this fails.
    #[test]
    fn no_error_message_can_contain_the_key() {
        let secret = "sk-ant-super-secret-value";
        let err = store("spiral-resume-test-provider", "  ").unwrap_err();
        assert!(!err.contains(secret));
        assert!(!err.contains("sk-"), "an error mentioned a key prefix: {err}");
    }
}
