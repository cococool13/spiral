//! Whop license commands for Resume.

spiral_license::license_commands!(spiral_license::AppId::Resume);

#[cfg(test)]
mod tests {
    fn command_region<'a>(src: &'a str, name: &str) -> &'a str {
        let sync = format!("pub fn {name}");
        let async_fn = format!("pub async fn {name}");
        let (start, len) = src
            .find(&sync)
            .map(|i| (i, sync.len()))
            .or_else(|| src.find(&async_fn).map(|i| (i, async_fn.len())))
            .unwrap_or_else(|| panic!("{name} not found"));
        let rest = &src[start..];
        let next = ["\npub fn ", "\npub async fn "]
            .iter()
            .filter_map(|m| rest[len..].find(m).map(|rel| len + rel))
            .min()
            .unwrap_or(rest.len());
        &rest[..next]
    }

    fn asserts_licensed(src: &str, name: &str) {
        let region = command_region(src, name);
        assert!(
            region.contains("license::require_sync") || region.contains("license::require("),
            "{name} must check the license before running:\n{region}"
        );
    }

    #[test]
    fn save_commands_require_a_license() {
        asserts_licensed(include_str!("commands/engine.rs"), "save_engine");
        asserts_licensed(include_str!("commands/engine.rs"), "save_api_key");
        asserts_licensed(include_str!("commands/mod.rs"), "save_document");
        asserts_licensed(include_str!("commands/building.rs"), "save_built_document");
        asserts_licensed(include_str!("commands/engine.rs"), "download_offline_model");
    }
}
