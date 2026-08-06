//! Startup Items: what launches at login, across three tiers.
//!
//! The posture is ADR-0008's — inventory everything, offer a control only
//! where one can genuinely work:
//!
//! - **User launch agents** (`~/Library/LaunchAgents`) get a reversible
//!   enable/disable, because `launchctl … gui/<uid>/<label>` needs no
//!   privileges.
//! - **System agents and daemons** are listed without a control.
//!   `launchctl … system/<label>` needs root, and a toggle that silently does
//!   nothing is worse than no toggle. It arrives in M5b with escalation.
//! - **Login items** are listed read-only with a System Settings deep link.
//!   Since macOS 13 the Background Task Management database is protected and
//!   third-party applications cannot toggle its entries at all.
//!
//! This module has no delete path. Removing a plist is a separate deliberate
//! action per ADR-0008, needs a new `Justification` in `remove.rs`, and is
//! M5b work.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

const USER_AGENTS: &str = "Library/LaunchAgents";
const SYSTEM_LOCATIONS: [&str; 2] = ["/Library/LaunchAgents", "/Library/LaunchDaemons"];

const LOGIN_ITEMS_DEEP_LINK: &str = "x-apple.systempreferences:com.apple.LoginItems-Settings.extension";

#[derive(Debug, Serialize, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub enum Tier {
    UserAgent,
    System,
    LoginItem,
}

#[derive(Debug, Serialize, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub enum State {
    Enabled,
    Disabled,
    /// `launchctl print-disabled` could not be read or parsed. Reported as
    /// unknown rather than assumed enabled: the disabled set is a deny-list,
    /// so failing to read it must never be mistaken for reading an empty one.
    Unknown,
}

#[derive(Debug, Serialize, PartialEq, Eq, Clone)]
pub struct StartupItem {
    /// The launchd label, or for a login item its Background Task Management
    /// identifier. Display data everywhere except the user tier, where it is
    /// also the service target and therefore validated before use.
    pub label: String,
    pub name: String,
    pub path: Option<String>,
    pub tier: Tier,
    pub state: State,
    /// Whether the UI should render a toggle. False means no control exists
    /// that can work — never a control rendered disabled.
    pub controllable: bool,
    /// One line saying why there is no control, when there is none.
    pub handoff: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq, Default)]
pub struct StartupInventory {
    pub user_agents: Vec<StartupItem>,
    pub system: Vec<StartupItem>,
    pub login_items: Vec<StartupItem>,
}

const SYSTEM_HANDOFF: &str = "Managed by the system. Turning this off needs administrator access, which Spiral Clean does not yet ask for.";
const LOGIN_ITEM_HANDOFF: &str = "macOS owns this list. Open Login Items in System Settings to change it.";
const APPLE_HANDOFF: &str = "Part of macOS. Spiral Clean does not turn Apple's own agents off.";

// ---------------------------------------------------------------------------
// Label validation — the one new guard in this milestone
// ---------------------------------------------------------------------------

/// Whether a label may be interpolated into a launchd service target.
///
/// The label is parsed out of a plist this application did not write and then
/// placed into `gui/<uid>/<label>`. `Command::args` makes shell injection
/// impossible — but **domain retargeting is not shell injection.** It happens
/// entirely inside that one argument: a label carrying `/` changes which
/// launchd domain the target names, so `../system/com.apple.something` or
/// anything shaped like it would address a service the user never saw.
///
/// So this is an allowlist, not a blocklist. A real launchd label is
/// reverse-DNS: ASCII alphanumerics, dots, hyphens and underscores. Anything
/// else — a separator, whitespace, a control character, a non-ASCII
/// lookalike, an empty string — is refused before a process is spawned.
///
/// Per ADR-0012 this is proven by mutation: stub it to `true` and
/// `a_label_carrying_a_separator_can_never_reach_launchctl` fails.
fn label_is_addressable(label: &str) -> bool {
    !label.is_empty()
        && label.len() <= 255
        && label
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

pub fn inventory(home: &Path) -> StartupInventory {
    let user_disabled = disabled_set(&format!("gui/{}", current_uid()));
    let system_disabled = disabled_set("system");

    let user_agents = agents_in(&home.join(USER_AGENTS))
        .into_iter()
        .map(|(label, path)| {
            let apple = crate::associate::is_apple_bundle_id(&label);
            StartupItem {
                state: state_of(&label, &user_disabled),
                name: display_name(&label),
                path: Some(path.to_string_lossy().into_owned()),
                tier: Tier::UserAgent,
                // Apple's own agents are listed and never controllable, even
                // here where the control would technically work. Disabling one
                // can break the system with no in-app recovery — the same
                // refusal `associate` and `orphans` already make.
                controllable: !apple && label_is_addressable(&label),
                handoff: apple.then(|| APPLE_HANDOFF.to_string()),
                label,
            }
        })
        .collect();

    let system = SYSTEM_LOCATIONS
        .iter()
        .flat_map(|dir| agents_in(Path::new(dir)))
        .map(|(label, path)| StartupItem {
            state: state_of(&label, &system_disabled),
            name: display_name(&label),
            path: Some(path.to_string_lossy().into_owned()),
            tier: Tier::System,
            controllable: false,
            handoff: Some(SYSTEM_HANDOFF.to_string()),
            label,
        })
        .collect();

    let login_items = login_items_from(&run("sfltool", &["dumpbtm"]).unwrap_or_default(), current_uid());

    StartupInventory { user_agents, system, login_items }
}

/// Every readable `*.plist` in `dir`, as `(label, path)`.
///
/// A plist with no `Label` key is skipped rather than named after its file:
/// the filename is a convention, the label is the thing `launchctl` addresses,
/// and guessing one from the other is how the wrong service gets disabled.
/// The directory is sorted so the list is stable between calls.
fn agents_in(dir: &Path) -> Vec<(String, PathBuf)> {
    let mut found: Vec<(String, PathBuf)> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|e| e == "plist"))
        .filter_map(|path| {
            let xml = std::fs::read_to_string(&path).ok()?;
            let label = crate::apps::extract_plist_string(&xml, "Label")?;
            Some((label, path))
        })
        .collect();
    found.sort();
    found.dedup();
    found
}

fn state_of(label: &str, disabled: &Option<HashSet<String>>) -> State {
    match disabled {
        None => State::Unknown,
        Some(set) if set.contains(label) => State::Disabled,
        Some(_) => State::Enabled,
    }
}

/// The last component of a reverse-DNS label, title-cased enough to read.
/// Purely cosmetic — `label` remains the identity everywhere that matters.
fn display_name(label: &str) -> String {
    label.rsplit('.').next().filter(|s| !s.is_empty()).unwrap_or(label).to_string()
}

fn current_uid() -> u32 {
    // SAFETY: `getuid` takes no arguments, cannot fail, and has no
    // preconditions. It is `unsafe` only because it is an FFI call.
    unsafe { libc::getuid() }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

fn disabled_set(domain: &str) -> Option<HashSet<String>> {
    disabled_set_from(&run("launchctl", &["print-disabled", domain])?)
}

/// The labels `launchctl print-disabled` reports as disabled.
///
/// Output is `"<label>" => <value>`, where the value has been spelled both
/// `disabled`/`enabled` and `true`/`false` across macOS versions. Both are
/// understood. **Anything else is not** — an unrecognised value leaves the
/// label out of the disabled set rather than guessing, which reports it as
/// enabled: the honest reading, since this is a deny-list and a label whose
/// state cannot be read is not a label proven disabled.
///
/// Output with no `disabled services` block at all yields `None`, which
/// becomes `State::Unknown` for every item. An empty block yields an empty
/// set — nothing is disabled — which is a different fact and reads as one.
fn disabled_set_from(output: &str) -> Option<HashSet<String>> {
    if !output.contains("disabled services") {
        return None;
    }
    Some(
        output
            .lines()
            .filter_map(|line| {
                let (label, value) = line.split_once("=>")?;
                let label = label.trim().trim_matches('"');
                let value = value.trim().trim_end_matches(&[',', ';'][..]);
                (matches!(value, "disabled" | "true") && !label.is_empty())
                    .then(|| label.to_string())
            })
            .collect(),
    )
}

/// Login items out of `sfltool dumpbtm`, for one UID only.
///
/// The dump carries a section per UID, including system pseudo-users. Only
/// the current user's records are the user's login items; the others belong
/// to root and to macOS itself and are not this section's subject.
///
/// A record whose `Name` and `Identifier` are both `(null)` is kept as an
/// unnamed item rather than dropped. An unattributed thing launching at login
/// is precisely what someone opens this screen to find.
fn login_items_from(dump: &str, uid: u32) -> Vec<StartupItem> {
    let marker = format!("Records for UID {uid} :");
    let section = match dump.split(&marker).nth(1) {
        Some(rest) => rest.split("Records for UID").next().unwrap_or(rest),
        None => return Vec::new(),
    };

    let mut items = Vec::new();
    let mut current: Option<(Option<String>, Option<String>, Option<String>)> = None;

    let flush = |slot: &mut Option<(Option<String>, Option<String>, Option<String>)>,
                 items: &mut Vec<StartupItem>| {
        if let Some((name, developer, identifier)) = slot.take() {
            let label = identifier.clone().unwrap_or_else(|| "unnamed-login-item".to_string());
            let name = name
                .or(developer)
                .or(identifier)
                .unwrap_or_else(|| "Unnamed login item".to_string());
            items.push(StartupItem {
                label,
                name,
                path: None,
                tier: Tier::LoginItem,
                state: State::Unknown,
                controllable: false,
                handoff: Some(LOGIN_ITEM_HANDOFF.to_string()),
            });
        }
    };

    for line in section.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') && trimmed.ends_with(':') {
            flush(&mut current, &mut items);
            current = Some((None, None, None));
            continue;
        }
        let Some(slot) = current.as_mut() else { continue };
        let Some((key, value)) = trimmed.split_once(':') else { continue };
        let value = value.trim();
        let value = (value != "(null)" && !value.is_empty()).then(|| value.to_string());
        match key.trim() {
            "Name" => slot.0 = value,
            "Developer Name" => slot.1 = value,
            "Identifier" => slot.2 = value,
            _ => {}
        }
    }
    flush(&mut current, &mut items);
    items
}

fn run(binary: &str, args: &[&str]) -> Option<String> {
    let out = std::process::Command::new(binary).args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8(out.stdout).ok()
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn startup_list() -> StartupInventory {
    match dirs::home_dir() {
        Some(home) => inventory(&home),
        None => StartupInventory::default(),
    }
}

/// Enable or disable a user launch agent.
///
/// The label is **re-derived from a fresh inventory** rather than trusted, for
/// the same reason `uninstall_execute` re-scans: a label is a reference to a
/// list, and the list can change between the call that displayed it and the
/// call that acts on it. A label that no longer names a controllable user
/// agent is refused, not acted on.
#[tauri::command]
pub fn startup_set_enabled(label: String, enabled: bool) -> Result<(), String> {
    let home = dirs::home_dir().ok_or(
        "Could not find your home folder, so Spiral Clean cannot tell which login items are yours.",
    )?;
    let inventory = inventory(&home);

    let item = inventory
        .user_agents
        .iter()
        .find(|item| item.label == label)
        .ok_or_else(|| format!("{label} is no longer in your login items. Reopen Optimize to see the current list."))?;

    if !item.controllable {
        return Err(item.handoff.clone().unwrap_or_else(|| {
            format!("{label} cannot be turned off from here.")
        }));
    }

    // Belt and braces: `controllable` already implies this, and it is checked
    // again immediately before the interpolation it protects.
    if !label_is_addressable(&label) {
        return Err(format!(
            "{label} is not a name Spiral Clean can address safely. A login item name should contain only letters, numbers, dots, hyphens and underscores."
        ));
    }

    let target = format!("gui/{}/{}", current_uid(), label);
    let verb = if enabled { "enable" } else { "disable" };
    let output = std::process::Command::new("launchctl")
        .args([verb, &target])
        .output()
        .map_err(|e| format!("Could not run launchctl: {e}. Try again, or change this item in System Settings."))?;

    if output.status.success() {
        return Ok(());
    }
    let detail = String::from_utf8_lossy(&output.stderr);
    let detail = detail.trim();
    Err(format!(
        "macOS refused to {verb} {label}{}. Try again, or change this item in System Settings.",
        if detail.is_empty() { String::new() } else { format!(" ({detail})") }
    ))
}

#[tauri::command]
pub fn open_login_items_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg(LOGIN_ITEMS_DEEP_LINK)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open System Settings: {e}. Open it manually and choose General → Login Items."))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn agent(dir: &Path, file: &str, label: &str) {
        fs::create_dir_all(dir).unwrap();
        fs::write(
            dir.join(file),
            format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>Label</key><string>{label}</string></dict></plist>"#
            ),
        )
        .unwrap();
    }

    // -- the guard, and its mutation proof ---------------------------------

    #[test]
    fn a_label_carrying_a_separator_can_never_reach_launchctl() {
        // Stub `label_is_addressable` to `true` and this test fails. That is
        // the proof required by ADR-0012 — the guard is the only thing
        // standing between a hostile plist and a retargeted launchd domain.
        assert!(!label_is_addressable("../system/com.apple.something"));
        assert!(!label_is_addressable("gui/0/com.example.agent"));
        assert!(!label_is_addressable("com.example/agent"));
        assert!(!label_is_addressable(r"com.example\agent"));
    }

    #[test]
    fn a_label_carrying_whitespace_or_control_characters_is_refused() {
        assert!(!label_is_addressable("com.example agent"));
        assert!(!label_is_addressable("com.example\tagent"));
        assert!(!label_is_addressable("com.example\nagent"));
        assert!(!label_is_addressable("com.example\0agent"));
    }

    #[test]
    fn an_empty_or_oversized_label_is_refused() {
        assert!(!label_is_addressable(""));
        assert!(!label_is_addressable(&"a".repeat(256)));
        assert!(label_is_addressable(&"a".repeat(255)));
    }

    #[test]
    fn a_non_ascii_lookalike_is_refused() {
        // U+FF0F FULLWIDTH SOLIDUS, and a Cyrillic 'а'. An allowlist refuses
        // both without needing to know they exist; a blocklist would not.
        assert!(!label_is_addressable("com.example\u{ff0f}agent"));
        assert!(!label_is_addressable("com.\u{0430}pple.agent"));
    }

    #[test]
    fn an_ordinary_reverse_dns_label_is_addressable() {
        assert!(label_is_addressable("com.example.agent"));
        assert!(label_is_addressable("us.zoom.updater"));
        assert!(label_is_addressable("com.google.keystone-agent_1"));
    }

    // -- Apple refusal ------------------------------------------------------

    #[test]
    fn an_apple_agent_is_listed_and_never_controllable() {
        let home = tempfile::tempdir().unwrap();
        agent(&home.path().join(USER_AGENTS), "apple.plist", "com.apple.something");
        let found = inventory(home.path());
        let item = found
            .user_agents
            .iter()
            .find(|i| i.label == "com.apple.something")
            .expect("an Apple agent is still listed");
        assert!(!item.controllable, "Apple's own agents are never toggleable");
        assert_eq!(item.handoff.as_deref(), Some(APPLE_HANDOFF));
    }

    #[test]
    fn a_third_party_agent_is_controllable() {
        let home = tempfile::tempdir().unwrap();
        agent(&home.path().join(USER_AGENTS), "third.plist", "com.example.agent");
        let found = inventory(home.path());
        let item = found.user_agents.iter().find(|i| i.label == "com.example.agent").unwrap();
        assert!(item.controllable);
        assert_eq!(item.handoff, None);
    }

    #[test]
    fn a_plist_with_no_label_is_skipped_not_named_after_its_file() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("com.example.agent.plist"), "<plist><dict></dict></plist>").unwrap();
        assert!(agents_in(dir.path()).is_empty());
    }

    #[test]
    fn a_non_plist_file_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("README.md"), "not a plist").unwrap();
        assert!(agents_in(dir.path()).is_empty());
    }

    #[test]
    fn a_directory_that_does_not_exist_yields_nothing_rather_than_failing() {
        assert!(agents_in(Path::new("/nonexistent/spiral/agents")).is_empty());
    }

    #[test]
    fn the_agent_list_is_stable_between_calls() {
        let dir = tempfile::tempdir().unwrap();
        agent(dir.path(), "b.plist", "com.example.b");
        agent(dir.path(), "a.plist", "com.example.a");
        agent(dir.path(), "c.plist", "com.example.c");
        let labels: Vec<String> = agents_in(dir.path()).into_iter().map(|(l, _)| l).collect();
        assert_eq!(labels, ["com.example.a", "com.example.b", "com.example.c"]);
    }

    // -- print-disabled parsing --------------------------------------------

    #[test]
    fn print_disabled_output_parses_to_the_disabled_labels() {
        let output = "\tdisabled services = {\n\t\t\"us.zoom.updater\" => disabled\n\t\t\"com.example.on\" => enabled\n\t}\n";
        let set = disabled_set_from(output).expect("the block is present");
        assert!(set.contains("us.zoom.updater"));
        assert!(!set.contains("com.example.on"));
    }

    #[test]
    fn the_older_true_false_spelling_is_understood_too() {
        let output = "\tdisabled services = {\n\t\t\"com.example.off\" => true\n\t\t\"com.example.on\" => false\n\t}\n";
        let set = disabled_set_from(output).unwrap();
        assert!(set.contains("com.example.off"));
        assert!(!set.contains("com.example.on"));
    }

    #[test]
    fn an_empty_disabled_block_means_nothing_is_disabled() {
        let set = disabled_set_from("\tdisabled services = {\n\t}\n").expect("the block is present");
        assert!(set.is_empty(), "an empty deny-list is a fact, not a failure");
    }

    #[test]
    fn unparseable_output_is_unknown_and_never_enabled() {
        // The deny-list distinction that matters: failing to read the list is
        // not the same as reading an empty one.
        assert_eq!(disabled_set_from("launchctl: command not recognised"), None);
        assert_eq!(state_of("com.example.agent", &None), State::Unknown);
        assert_eq!(state_of("com.example.agent", &Some(HashSet::new())), State::Enabled);
    }

    #[test]
    fn an_unrecognised_disabled_value_leaves_the_label_out_of_the_set() {
        let output = "\tdisabled services = {\n\t\t\"com.example.x\" => sometimes\n\t}\n";
        let set = disabled_set_from(output).unwrap();
        assert!(!set.contains("com.example.x"));
    }

    // -- BTM parsing --------------------------------------------------------

    const DUMP: &str = "\
========================
 Records for UID 0 : AAAA
========================
 Items:
 #1:
                 Name: rootthing
           Identifier: com.root.thing

========================
 Records for UID 501 : BBBB
========================
 Items:
 #1:
                 Name: (null)
       Developer Name: (null)
           Identifier: Unknown Developer
 #2:
                 Name: Rectangle
       Developer Name: Ryan Hanson
           Identifier: com.knollsoft.Rectangle
";

    #[test]
    fn only_the_current_users_login_items_are_parsed() {
        let items = login_items_from(DUMP, 501);
        assert_eq!(items.len(), 2);
        assert!(!items.iter().any(|i| i.label == "com.root.thing"), "root's records are not the user's");
    }

    #[test]
    fn a_named_login_item_keeps_its_name_and_identifier() {
        let items = login_items_from(DUMP, 501);
        let rectangle = items.iter().find(|i| i.label == "com.knollsoft.Rectangle").unwrap();
        assert_eq!(rectangle.name, "Rectangle");
    }

    #[test]
    fn an_unnamed_login_item_survives_rather_than_being_dropped() {
        // An unattributed thing launching at login is exactly what someone
        // opens this screen to find.
        let items = login_items_from(DUMP, 501);
        assert!(items.iter().any(|i| i.label == "Unknown Developer"));
    }

    #[test]
    fn login_items_are_never_controllable() {
        for item in login_items_from(DUMP, 501) {
            assert!(!item.controllable);
            assert_eq!(item.handoff.as_deref(), Some(LOGIN_ITEM_HANDOFF));
        }
    }

    #[test]
    fn a_uid_with_no_section_yields_no_items() {
        assert!(login_items_from(DUMP, 999).is_empty());
        assert!(login_items_from("", 501).is_empty());
    }

    // -- tier posture -------------------------------------------------------

    #[test]
    fn no_system_item_is_ever_controllable() {
        let home = tempfile::tempdir().unwrap();
        for item in inventory(home.path()).system {
            assert!(!item.controllable, "{} needs root, so no toggle is shown", item.label);
            assert_eq!(item.handoff.as_deref(), Some(SYSTEM_HANDOFF));
        }
    }

    #[test]
    fn every_controllable_item_is_a_user_agent_with_an_addressable_label() {
        // The invariant `startup_set_enabled` relies on, asserted directly.
        let home = tempfile::tempdir().unwrap();
        agent(&home.path().join(USER_AGENTS), "a.plist", "com.example.agent");
        let found = inventory(home.path());
        for item in found.user_agents.iter().chain(&found.system).chain(&found.login_items) {
            if item.controllable {
                assert_eq!(item.tier, Tier::UserAgent);
                assert!(label_is_addressable(&item.label));
                assert!(!crate::associate::is_apple_bundle_id(&item.label));
            }
        }
    }

    #[test]
    fn an_item_with_no_control_always_says_why() {
        let home = tempfile::tempdir().unwrap();
        agent(&home.path().join(USER_AGENTS), "apple.plist", "com.apple.thing");
        let found = inventory(home.path());
        for item in found.user_agents.iter().chain(&found.system).chain(&found.login_items) {
            assert_eq!(
                item.controllable,
                item.handoff.is_none(),
                "{} must either offer a control or explain its absence",
                item.label
            );
        }
    }

    #[test]
    fn the_deep_link_targets_the_login_items_pane() {
        assert_eq!(
            LOGIN_ITEMS_DEEP_LINK,
            "x-apple.systempreferences:com.apple.LoginItems-Settings.extension"
        );
    }

    #[test]
    fn display_name_falls_back_to_the_whole_label() {
        assert_eq!(display_name("com.knollsoft.Rectangle"), "Rectangle");
        assert_eq!(display_name("Rectangle"), "Rectangle");
        assert_eq!(display_name("com.example."), "com.example.");
    }
}
