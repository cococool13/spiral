//! The offline model's process.
//!
//! `llama-server` speaks an OpenAI-compatible API, which is why this milestone
//! needed almost no new code in the rewrite path: the local model is reached
//! through exactly the request shape M6 already built for a custom endpoint,
//! and every answer goes through exactly the same fact gate. The only thing
//! that differs is where the request goes — `127.0.0.1`, and nowhere else.
//!
//! **The binary is not in this repository.** `scripts/fetch-sidecar.mjs` vendors
//! the official llama.cpp release build for each platform into `binaries/`
//! before packaging; see `docs/offline-model.md`. Until it is vendored, the app
//! reports the offline model as unavailable rather than failing at run time.

use std::net::TcpListener;
use std::path::Path;
use std::process::{Child, Command, Stdio};

/// Where the sidecar is reachable. Loopback only — this is the whole point of
/// the offline tier, and it is asserted in a test.
pub fn base_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/v1")
}

/// Ask the OS for a free port rather than guessing one. A hard-coded port
/// collides with whatever else the user is running.
pub fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Could not find a free port on this machine: {e}."))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|e| format!("Could not find a free port on this machine: {e}."))
}

/// The arguments the sidecar is started with. Extracted so the flags can be
/// asserted without launching a process.
pub fn arguments(model: &Path, port: u16) -> Vec<String> {
    vec![
        "--model".into(),
        model.display().to_string(),
        "--port".into(),
        port.to_string(),
        // Loopback only. Never 0.0.0.0 — a resume-rewriting server reachable
        // from the local network is not something anyone asked for.
        "--host".into(),
        "127.0.0.1".into(),
        // A resume is short; a big window would cost memory for nothing.
        "--ctx-size".into(),
        "4096".into(),
        // The whole document's bullets in one request, with room for the reply.
        "--n-predict".into(),
        "2048".into(),
    ]
}

/// A running sidecar. Killed on drop, so closing the window leaves nothing
/// behind — the collection's "close the window and the app is gone" promise
/// covers child processes too.
pub struct Sidecar {
    child: Child,
    pub port: u16,
}

impl Sidecar {
    pub fn start(binary: &Path, model: &Path, port: u16) -> Result<Self, String> {
        if !binary.exists() {
            return Err(
                "This build has no offline engine bundled. Use your own API key, or the free rule-based pass."
                    .to_string(),
            );
        }
        if !model.exists() {
            return Err(
                "The offline model is not downloaded yet. Download it in Settings first."
                    .to_string(),
            );
        }
        let child = Command::new(binary)
            .args(arguments(model, port))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Could not start the offline engine: {e}."))?;
        Ok(Self { child, port })
    }

    pub fn url(&self) -> String {
        base_url(self.port)
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        // Best effort: the process is ours, and leaving it running would be
        // exactly the undisclosed background process this collection forbids.
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Half-second polls. A 2.5 GB model that is not in the page cache — the first
/// build after a reboot — routinely takes longer than a minute to load, and the
/// original one-minute budget failed those builds while the load was nearly
/// done, throwing the work away. Three minutes covers a cold start on a slow
/// disk and is still finite.
pub const READY_ATTEMPTS: u32 = 360;

/// Found in review: the original one-minute budget failed cold starts. A
/// runtime test of a constant asserts nothing, so this is checked where it
/// belongs — at compile time. Lowering the budget below three minutes stops
/// the build rather than silently reintroducing the bug.
const _: () = assert!(READY_ATTEMPTS / 2 >= 180);

/// Wait until the server answers, or give up with a sentence.
pub async fn wait_until_ready(port: u16, attempts: u32) -> Result<(), String> {
    let client = reqwest::Client::new();
    let health = format!("http://127.0.0.1:{port}/health");
    for _ in 0..attempts {
        if let Ok(response) = client.get(&health).send().await {
            if response.status().is_success() {
                return Ok(());
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    Err(
        "The offline model is taking longer than three minutes to load, so the build was stopped. It is usually faster the second time. Build again, or use your own API key."
            .to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// The offline tier's entire promise: nothing leaves this computer.
    #[test]
    fn the_sidecar_is_only_ever_reachable_on_loopback() {
        assert_eq!(base_url(8080), "http://127.0.0.1:8080/v1");
        let args = arguments(Path::new("/models/x.gguf"), 8080);
        let host = args.iter().position(|a| a == "--host").expect("no --host flag");
        assert_eq!(args[host + 1], "127.0.0.1");
        assert!(
            !args.iter().any(|a| a == "0.0.0.0"),
            "the offline engine must never bind a public interface"
        );
    }

    #[test]
    fn the_model_path_and_port_are_passed_through() {
        let args = arguments(Path::new("/models/qwen.gguf"), 51234);
        assert!(args.windows(2).any(|w| w[0] == "--model" && w[1] == "/models/qwen.gguf"));
        assert!(args.windows(2).any(|w| w[0] == "--port" && w[1] == "51234"));
    }

    #[test]
    fn a_free_port_is_asked_for_rather_than_assumed() {
        let first = free_port().unwrap();
        assert!(first > 1024, "got a privileged port: {first}");
    }

    /// Both missing-prerequisite cases must be sentences a person can act on,
    /// not a spawn error. They are also the states this build is actually in.
    #[test]
    fn a_missing_binary_or_model_explains_itself() {
        let dir = tempfile::tempdir().unwrap();
        let missing_binary = dir.path().join("llama-server");
        let model = dir.path().join("model.gguf");
        std::fs::write(&model, b"x").unwrap();

        // `Sidecar` deliberately has no `Debug` — it holds a live child
        // process — so the error is read out rather than unwrapped.
        let err = match Sidecar::start(&missing_binary, &model, 8080) {
            Err(err) => err,
            Ok(_) => panic!("a missing binary started something"),
        };
        assert!(err.contains("no offline engine bundled"), "got {err}");

        let binary: PathBuf = std::env::current_exe().unwrap();
        let err = match Sidecar::start(&binary, &dir.path().join("absent.gguf"), 8080) {
            Err(err) => err,
            Ok(_) => panic!("a missing model started something"),
        };
        assert!(err.contains("not downloaded yet"), "got {err}");
    }
}
