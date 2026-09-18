//! Whop license commands for Clean.

spiral_license::license_commands!(spiral_license::AppId::Clean);

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
    fn scan_commands_require_a_license() {
        asserts_licensed(include_str!("commands/clean.rs"), "clean_scan");
        asserts_licensed(include_str!("commands/uninstall.rs"), "uninstall_list");
        asserts_licensed(include_str!("commands/leftovers.rs"), "leftovers_scan");
        asserts_licensed(include_str!("optimize.rs"), "optimize_plan");
        asserts_licensed(include_str!("lipo.rs"), "lipo_candidates");
    }
}
