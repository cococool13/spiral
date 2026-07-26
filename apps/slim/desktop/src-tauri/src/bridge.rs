//! Driving the SlimBrave Neo scripts.
//!
//! Read-only work (`--detect`, `--catalog`, `--preview`, `--preview-plan`)
//! runs as the logged-in user with no elevation at all. Only `--apply-plan`
//! and `--reset` go through the macOS authorisation dialog, and only after
//! the UI has confirmed.

use std::path::Path;
use std::process::Command;

use serde::de::DeserializeOwned;

use crate::elevate::{
    is_safe_control_id, is_safe_identifier, is_safe_path, is_user_cancelled, run_privileged,
    AUTH_DIALOG,
};
use crate::error::{SlimError, SlimResult};
use crate::model::*;
use crate::project::Project;

pub const PLAN_SCHEMA_VERSION: u32 = 1;
const COLLECTION_ENTRYPOINT: &str = "browser_collection.py";

/// The privileged entrypoint for a platform.
///
/// Both scripts take the same `--detect / --preview-plan / --apply-plan /
/// --reset` surface and validate a plan through the same
/// `browser_collection.plan`, so everything above this line is identical;
/// only the place policy lands differs (a managed plist, or the registry).
///
/// Taking the platform as an argument rather than reading `cfg!` inline is
/// what lets a Mac test the Windows answer.
pub fn entrypoint_for(os: &str) -> Option<&'static str> {
    match os {
        "macos" => Some("slimbrave-mac.py"),
        "windows" => Some("slimbrave-windows.py"),
        _ => None,
    }
}

/// The entrypoint for the platform this build runs on.
pub fn entrypoint() -> SlimResult<&'static str> {
    entrypoint_for(std::env::consts::OS).ok_or_else(|| {
        SlimError::new(
            "Not supported on this platform",
            format!(
                "Spiral Slim applies Brave policies on macOS and Windows. This is {}.",
                std::env::consts::OS
            ),
            "Run the SlimBrave Neo script for your platform from a terminal instead.",
        )
    })
}

fn decode<T: DeserializeOwned>(what: &str, stdout: &str) -> SlimResult<T> {
    serde_json::from_str(stdout).map_err(|error| {
        SlimError::new(
            format!("Could not read the {what} result"),
            format!("The SlimBrave Neo script returned unexpected output: {error}"),
            "Check that apps/slim is a complete, unmodified checkout, then try again.",
        )
    })
}

/// Run a script that is documented to change nothing.
fn run_read_only(
    project: &Project,
    script: &str,
    args: &[&str],
    what: &str,
) -> SlimResult<String> {
    let path = project.script(script);
    let output = Command::new(&project.python)
        .arg(&path)
        .args(args)
        .current_dir(&project.root)
        .output()
        .map_err(|error| {
            SlimError::new(
                format!("Could not run the {what} step"),
                format!("{} could not start: {error}", path.display()),
                "Check that Python 3 is installed and apps/slim is a complete checkout.",
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        return Err(SlimError::new(
            format!("The {what} step failed"),
            if detail.is_empty() {
                format!("{script} exited with status {}.", output.status)
            } else {
                detail.to_string()
            },
            "Nothing was changed. Fix the problem above and try again.",
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn require_schema(what: &str, found: u32) -> SlimResult<()> {
    if found == PLAN_SCHEMA_VERSION {
        return Ok(());
    }
    Err(SlimError::new(
        "Unsupported SlimBrave Neo version",
        format!(
            "The {what} result uses schema version {found}; this build of Spiral \
             Slim understands version {PLAN_SCHEMA_VERSION}."
        ),
        "Update Spiral Slim, or check out a matching version of apps/slim.",
    ))
}

/// A payload that claims to change the system has no business in a read-only
/// step; refuse it rather than trusting the flag was a typo.
fn require_read_only(what: &str, mutates: bool) -> SlimResult<()> {
    if !mutates {
        return Ok(());
    }
    Err(SlimError::new(
        "Refusing an unexpected change",
        format!("The {what} step reported that it changes the system."),
        "This is a bug in Spiral Slim. Do not continue; report it with the step name.",
    ))
}

/* ---------------------------------------------------------------- *
 * Step 1 — detection
 * ---------------------------------------------------------------- */

pub fn detect(project: &Project) -> SlimResult<Detection> {
    let stdout = run_read_only(
        project,
        entrypoint()?,
        &["--detect", "--format", "json"],
        "browser detection",
    )?;
    let raw: RawDetection = decode("browser detection", &stdout)?;
    require_schema("browser detection", raw.schema_version)?;
    require_read_only("browser detection", raw.mutates_system)?;

    let channels = raw
        .channels
        .into_iter()
        .filter(|channel| is_safe_identifier(&channel.id))
        .map(|channel| Channel {
            icon: crate::logo::read_icon_data_uri(&channel.app_path),
            id: channel.id,
            label: channel.label,
            app_path: channel.app_path,
            bundle_id: channel.bundle_id,
            policy_path: channel.policy_path,
            running: channel.running,
            managed_policy_count: channel.managed_policy_count,
        })
        .collect();

    Ok(Detection {
        platform: raw.platform,
        found: raw.found,
        method: raw.method,
        warnings: raw.warnings,
        persistence: Persistence {
            supported_modes: raw.persistence.supported_modes,
            mode: raw.persistence.mode,
            profile_installed: raw.persistence.profile_installed,
        },
        channels,
    })
}

/* ---------------------------------------------------------------- *
 * Step 2 — profile catalog
 * ---------------------------------------------------------------- */

pub fn catalog(project: &Project) -> SlimResult<Catalog> {
    let stdout = run_read_only(
        project,
        COLLECTION_ENTRYPOINT,
        &["--catalog", "--format", "json"],
        "profile catalog",
    )?;
    let raw: RawCatalog = decode("profile catalog", &stdout)?;
    require_schema("profile catalog", raw.schema_version)?;

    if raw.profiles.is_empty() {
        return Err(SlimError::new(
            "No profiles found",
            "apps/slim/profiles contains no usable profile.".to_string(),
            "Restore the bundled profiles from the SlimBrave Neo checkout.",
        ));
    }

    Ok(Catalog {
        profiles: raw
            .profiles
            .into_iter()
            .map(|profile| ProfileSummary {
                id: profile.id,
                name: profile.name,
                description: profile.description,
                risk: profile.risk,
                modules: profile.modules,
            })
            .collect(),
        modules: raw
            .modules
            .into_iter()
            .map(|module| ModuleSummary {
                id: module.id,
                name: module.name,
                risk: module.risk,
                conflicts_with: module.conflicts_with,
                controls: module
                    .controls
                    .into_iter()
                    .map(|control| ModuleControl {
                        id: control.id,
                        required: control.required,
                    })
                    .collect(),
            })
            .collect(),
    })
}

/* ---------------------------------------------------------------- *
 * Step 3 — preview
 * ---------------------------------------------------------------- */

/// Everything a confirmed apply needs, held between preview and apply.
#[derive(Debug, Clone)]
pub struct PreparedPlan {
    pub document: PlanDocument,
    pub channel_ids: Vec<String>,
    pub report: PreviewReport,
}

fn channels_argument(channel_ids: &[String]) -> SlimResult<String> {
    if channel_ids.is_empty() {
        return Err(SlimError::new(
            "No Brave channel selected",
            "Spiral Slim needs at least one channel to describe or change.".to_string(),
            "Go back and select a Brave channel.",
        ));
    }
    for id in channel_ids {
        if !is_safe_identifier(id) {
            return Err(SlimError::new(
                "Unrecognised Brave channel",
                format!("{id:?} is not a channel Spiral Slim detected."),
                "Go back to the first step so Spiral Slim can detect Brave again.",
            ));
        }
    }
    Ok(channel_ids.join(","))
}

/// Turn the engine's resolved controls into the policy map the entrypoint
/// will accept. Controls the Brave adapter cannot map are left out entirely
/// — they stay visible in the review as "unsupported" rather than being
/// quietly approximated.
fn policy_from_controls(controls: &[RawControl]) -> serde_json::Map<String, serde_json::Value> {
    let mut policy = serde_json::Map::new();
    for control in controls {
        if control.support != "preview_ready" && control.support != "verified" {
            continue;
        }
        if control.vendor_name.is_empty() {
            continue;
        }
        let value = match &control.desired {
            PolicyValue::Bool(value) => serde_json::Value::Bool(*value),
            PolicyValue::Int(value) => serde_json::Value::from(*value),
            PolicyValue::Text(value) => serde_json::Value::String(value.clone()),
        };
        policy.insert(control.vendor_name.clone(), value);
    }
    policy
}

/// What the person chose: a bundled profile, or a selection they composed
/// from the same bundled modules.
#[derive(Debug, Clone)]
pub enum Selection {
    Bundled {
        profile_id: String,
    },
    Custom {
        module_ids: Vec<String>,
        excluded_control_ids: Vec<String>,
    },
}

impl Selection {
    /// The read-only engine arguments for this selection.
    fn engine_args(&self) -> SlimResult<Vec<String>> {
        match self {
            Selection::Bundled { profile_id } => {
                if !is_safe_identifier(profile_id) {
                    return Err(SlimError::new(
                        "Unrecognised profile",
                        format!("{profile_id:?} is not a profile id."),
                        "Go back and pick a profile from the list.",
                    ));
                }
                Ok(vec!["--preview".into(), profile_id.clone()])
            }
            Selection::Custom {
                module_ids,
                excluded_control_ids,
            } => {
                if module_ids.is_empty() {
                    return Err(SlimError::new(
                        "Nothing selected",
                        "A custom profile needs at least one module.".to_string(),
                        "Go back and tick the parts of Brave you want configured.",
                    ));
                }
                for id in module_ids {
                    if !is_safe_identifier(id) {
                        return Err(SlimError::new(
                            "Unrecognised module",
                            format!("{id:?} is not a module id."),
                            "Go back and rebuild the custom profile.",
                        ));
                    }
                }
                for id in excluded_control_ids {
                    if !is_safe_control_id(id) {
                        return Err(SlimError::new(
                            "Unrecognised setting",
                            format!("{id:?} is not a setting id."),
                            "Go back and rebuild the custom profile.",
                        ));
                    }
                }
                let mut args = vec![
                    "--preview-custom".into(),
                    "--modules".into(),
                    module_ids.join(","),
                ];
                if !excluded_control_ids.is_empty() {
                    args.push("--exclude".into());
                    args.push(excluded_control_ids.join(","));
                }
                Ok(args)
            }
        }
    }
}

pub fn preview(
    project: &Project,
    selection: &Selection,
    channel_ids: &[String],
) -> SlimResult<PreparedPlan> {
    let engine_args = selection.engine_args()?;
    let channels = channels_argument(channel_ids)?;

    // Half one: what the read-only engine resolves the selection to.
    let mut args: Vec<&str> = engine_args.iter().map(String::as_str).collect();
    args.extend(["--format", "json"]);
    let stdout = run_read_only(
        project,
        COLLECTION_ENTRYPOINT,
        &args,
        "profile preview",
    )?;
    let engine: RawEnginePreview = decode("profile preview", &stdout)?;
    require_schema("profile preview", engine.schema_version)?;
    require_read_only("profile preview", engine.mutates_system)?;

    let plan = engine.browsers.first().ok_or_else(|| {
        SlimError::new(
            "Brave was not found",
            "The profile engine did not find a Brave installation to describe."
                .to_string(),
            "Install Brave, then go back to the first step.",
        )
    })?;

    let policy = policy_from_controls(&plan.controls);
    if policy.is_empty() {
        return Err(SlimError::new(
            "Nothing to apply",
            format!(
                "None of the controls in {} have a verified Brave mapping on this \
                 platform.",
                engine.profile.name
            ),
            "Pick a different profile, or check apps/slim is a complete checkout.",
        ));
    }

    let document = PlanDocument {
        schema_version: PLAN_SCHEMA_VERSION,
        profile_id: engine.profile.id.clone(),
        plan_hash: engine.plan_hash.clone(),
        policy,
    };

    // Half two: what that plan does to each selected channel on this Mac.
    // Only the entrypoint knows about removals, because only it knows what
    // is already in each channel's managed policy file.
    let workspace = plan_workspace()?;
    let plan_path = write_plan(workspace.path(), &document)?;
    let stdout = run_read_only(
        project,
        entrypoint()?,
        &[
            "--preview-plan",
            &plan_path.to_string_lossy(),
            "--channels",
            &channels,
            "--persist",
            "on",
            "--format",
            "json",
        ],
        "change review",
    )?;
    let planned: RawPlanPreview = decode("change review", &stdout)?;
    require_schema("change review", planned.schema_version)?;
    require_read_only("change review", planned.mutates_system)?;

    // The two halves must be describing the same plan.
    if planned.plan_hash != document.plan_hash || planned.profile_id != document.profile_id {
        return Err(SlimError::new(
            "The review did not match the plan",
            "The change review describes a different plan than the one that was \
             resolved."
                .to_string(),
            "This is a bug in Spiral Slim. Do not continue; report it.",
        ));
    }
    if planned.targets.is_empty() {
        return Err(SlimError::new(
            "No Brave channel to change",
            "None of the selected channels resolved to a policy location."
                .to_string(),
            "Go back and select a detected Brave channel.",
        ));
    }

    let report = PreviewReport {
        profile_id: document.profile_id.clone(),
        profile_name: engine.profile.name,
        risk: engine.profile.risk,
        plan_hash: document.plan_hash.clone(),
        blocked: engine.blocked,
        managed_policy_count: planned.managed_policy_count,
        channel_ids: channel_ids.to_vec(),
        controls: plan
            .controls
            .iter()
            .map(|control| ControlChange {
                id: control.id.clone(),
                vendor_name: control.vendor_name.clone(),
                current: control.current.clone(),
                desired: control.desired.clone(),
                action: control.action.clone(),
                support: control.support.clone(),
                required: control.required,
                reason: control.reason.clone(),
            })
            .collect(),
        targets: planned
            .targets
            .into_iter()
            .map(|target| TargetReview {
                label: target.label,
                path: target.path,
                changes: target.changes,
            })
            .collect(),
        persistence: PreviewPersistence {
            mode: planned.persistence.mode,
            profile_status: planned.persistence.profile_status,
        },
    };

    Ok(PreparedPlan {
        document,
        channel_ids: channel_ids.to_vec(),
        report,
    })
}

/* ---------------------------------------------------------------- *
 * The plan file
 * ---------------------------------------------------------------- */

fn plan_workspace() -> SlimResult<tempfile::TempDir> {
    tempfile::Builder::new()
        .prefix("spiral-slim-")
        .tempdir()
        .map_err(|error| {
            SlimError::new(
                "Could not prepare the change",
                format!("A private working folder could not be created: {error}"),
                "Free up disk space or check the permissions on your temporary folder.",
            )
        })
}

fn write_plan(dir: &Path, document: &PlanDocument) -> SlimResult<std::path::PathBuf> {
    let path = dir.join("plan.json");
    let body = serde_json::to_vec_pretty(document).map_err(|error| {
        SlimError::new(
            "Could not prepare the change",
            format!("The plan could not be written: {error}"),
            "This is a bug in Spiral Slim. Report it.",
        )
    })?;
    std::fs::write(&path, body).map_err(|error| {
        SlimError::new(
            "Could not prepare the change",
            format!("The plan file could not be saved: {error}"),
            "Free up disk space, then try again.",
        )
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    if !is_safe_path(&path) {
        return Err(SlimError::new(
            "Could not prepare the change",
            "The plan file path is not absolute.".to_string(),
            "This is a bug in Spiral Slim. Report it.",
        ));
    }
    Ok(path)
}

/* ---------------------------------------------------------------- *
 * Step 3 — apply, and the undo route
 * ---------------------------------------------------------------- */

fn privileged(
    project: &Project,
    args: Vec<String>,
    prompt: &str,
    what: &str,
) -> SlimResult<String> {
    let script = project.script(entrypoint()?);
    let mut argv = vec![
        project.python.to_string_lossy().into_owned(),
        script.to_string_lossy().into_owned(),
    ];
    argv.extend(args);

    let output = run_privileged(&argv, prompt)?;
    let stderr = output.stderr.clone();
    if !output.success {
        if is_user_cancelled(&stderr) {
            return Err(SlimError::new(
                "Cancelled",
                format!(
                    "You dismissed the {AUTH_DIALOG}, so nothing was changed."
                ),
                "Choose the action again when you are ready.",
            ));
        }
        let detail = stderr.trim();
        return Err(SlimError::new(
            format!("Could not {what}"),
            if detail.is_empty() {
                "The SlimBrave Neo script reported a failure.".to_string()
            } else {
                detail.to_string()
            },
            "Your existing Brave policy was left as it was. Fix the problem above \
             and try again.",
        ));
    }
    Ok(output.stdout)
}

pub fn apply(project: &Project, prepared: &PreparedPlan) -> SlimResult<ApplyOutcome> {
    let channels = channels_argument(&prepared.channel_ids)?;
    let workspace = plan_workspace()?;
    let plan_path = write_plan(workspace.path(), &prepared.document)?;

    let message = privileged(
        project,
        vec![
            "--apply-plan".to_string(),
            plan_path.to_string_lossy().into_owned(),
            "--channels".to_string(),
            channels,
            "--persist".to_string(),
            "on".to_string(),
        ],
        "Spiral Slim needs permission to write Brave's managed policy.",
        "apply the profile",
    )?;

    // Ask the system what is actually true now rather than assuming the
    // Configuration Profile was approved: on macOS it is not, until the
    // person completes the Device Management step.
    let after = detect(project)?;

    Ok(ApplyOutcome {
        plan_hash: prepared.document.plan_hash.clone(),
        profile_id: prepared.document.profile_id.clone(),
        message: message.trim().to_string(),
        channel_labels: prepared
            .report
            .targets
            .iter()
            .map(|target| target.label.clone())
            .collect(),
        managed_policy_count: prepared.report.managed_policy_count,
        persist_mode: "on".to_string(),
        profile_approval_pending: !after.persistence.profile_installed,
        brave_running: after.channels.iter().any(|channel| channel.running),
    })
}

pub fn reset(project: &Project, channel_ids: &[String]) -> SlimResult<ResetOutcome> {
    let channels = channels_argument(channel_ids)?;
    let message = privileged(
        project,
        vec!["--reset".to_string(), "--channels".to_string(), channels],
        "Spiral Slim needs permission to remove Brave's managed policy.",
        "undo the changes",
    )?;

    let removed_paths = message
        .lines()
        .filter_map(|line| line.strip_prefix("Removed /"))
        .map(|rest| format!("/{}", rest.split(" (").next().unwrap_or(rest)))
        .collect();

    Ok(ResetOutcome {
        profile_removed: message.contains("Removed Configuration Profile"),
        removed_paths,
        message: message.trim().to_string(),
    })
}

/* ---------------------------------------------------------------- *
 * Export, and opening Brave's policy page
 * ---------------------------------------------------------------- */

/// Write the reviewed plan to the person's Downloads folder.
///
/// No file dialog and no dialog plugin: a fixed, predictable destination
/// keeps the dependency list short, and the returned path is reported back so
/// nothing is written somewhere the person has to hunt for.
pub fn export_plan(plan: &PreparedPlan, stamp: &str) -> SlimResult<String> {
    let home = std::env::var_os("HOME").ok_or_else(|| {
        SlimError::new(
            "Could not find your home folder",
            "HOME is not set.".to_string(),
            "Export the plan from Terminal instead.",
        )
    })?;
    let dir = Path::new(&home).join("Downloads");
    if !dir.is_dir() {
        return Err(SlimError::new(
            "No Downloads folder",
            format!("{} does not exist.", dir.display()),
            "Create it, or export the plan from Terminal instead.",
        ));
    }
    let name = format!("spiral-slim-{}-{}.json", plan.document.profile_id, stamp);
    let path = dir.join(name);
    let body = serde_json::to_vec_pretty(&plan.document).map_err(|error| {
        SlimError::new(
            "Could not write the plan",
            error.to_string(),
            "This is a bug in Spiral Slim. Report it.",
        )
    })?;
    std::fs::write(&path, body).map_err(|error| {
        SlimError::new(
            "Could not write the plan",
            format!("{}: {error}", path.display()),
            "Check you have space and permission to write to Downloads.",
        )
    })?;
    Ok(path.to_string_lossy().into_owned())
}

/// Open Brave on its policy page so the person can verify what was written.
///
/// `open -a` with an explicit bundle and a fixed URL: nothing here is derived
/// from anything a person typed.
#[cfg(target_os = "macos")]
pub fn open_policy_page(app_path: &str) -> SlimResult<()> {
    if !is_safe_path(Path::new(app_path)) || !Path::new(app_path).is_dir() {
        return Err(SlimError::new(
            "Brave was not found",
            format!("{app_path} is not an app bundle on this Mac."),
            "Open Brave yourself and go to brave://policy.",
        ));
    }
    let status = Command::new("/usr/bin/open")
        .arg("-a")
        .arg(app_path)
        .arg("brave://policy")
        .status()
        .map_err(|error| {
            SlimError::new(
                "Could not open Brave",
                error.to_string(),
                "Open Brave yourself and go to brave://policy.",
            )
        })?;
    if status.success() {
        return Ok(());
    }
    Err(SlimError::new(
        "Could not open Brave",
        format!("open exited with {status}."),
        "Open Brave yourself and go to brave://policy.",
    ))
}

/// Windows: run `brave.exe brave://policy` directly.
///
/// The executable itself, not `cmd /c start` — there is no shell in the path,
/// so nothing here can be reinterpreted as a command. `app_path` comes from
/// detection, and is still checked for being an absolute, existing file.
#[cfg(target_os = "windows")]
pub fn open_policy_page(app_path: &str) -> SlimResult<()> {
    if !is_safe_path(Path::new(app_path)) || !Path::new(app_path).is_file() {
        return Err(SlimError::new(
            "Brave was not found",
            format!("{app_path} is not a program on this PC."),
            "Open Brave yourself and go to brave://policy.",
        ));
    }
    Command::new(app_path)
        .arg("brave://policy")
        .spawn()
        .map(|_| ())
        .map_err(|error| {
            SlimError::new(
                "Could not open Brave",
                error.to_string(),
                "Open Brave yourself and go to brave://policy.",
            )
        })
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn open_policy_page(_app_path: &str) -> SlimResult<()> {
    Err(SlimError::new(
        "Not supported on this platform",
        "Spiral Slim opens Brave on macOS and Windows only.".to_string(),
        "Open Brave yourself and go to brave://policy.",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn control(id: &str, vendor: &str, support: &str, desired: PolicyValue) -> RawControl {
        RawControl {
            id: id.to_string(),
            vendor_name: vendor.to_string(),
            current: None,
            desired,
            action: "add".to_string(),
            support: support.to_string(),
            required: false,
            reason: String::new(),
        }
    }

    #[test]
    fn only_mapped_controls_reach_the_policy() {
        let controls = vec![
            control("a", "MetricsReportingEnabled", "preview_ready", PolicyValue::Bool(false)),
            control("b", "", "unsupported", PolicyValue::Text("block".into())),
            control("c", "MemorySaverModeSavings", "preview_ready", PolicyValue::Int(1)),
        ];
        let policy = policy_from_controls(&controls);
        assert_eq!(policy.len(), 2);
        assert_eq!(policy["MetricsReportingEnabled"], serde_json::json!(false));
        assert_eq!(policy["MemorySaverModeSavings"], serde_json::json!(1));
    }

    #[test]
    fn an_unsupported_control_with_a_vendor_name_is_still_left_out() {
        // Adapter reported a name but could not verify the value; guessing
        // here would be exactly the silent semantic change to avoid.
        let controls = vec![control(
            "a",
            "SafeBrowsingProtectionLevel",
            "unsupported",
            PolicyValue::Int(1),
        )];
        assert!(policy_from_controls(&controls).is_empty());
    }

    #[test]
    fn booleans_and_integers_keep_their_json_type() {
        let controls = vec![
            control("a", "BraveRewardsDisabled", "preview_ready", PolicyValue::Bool(true)),
            control("b", "MemorySaverModeSavings", "preview_ready", PolicyValue::Int(1)),
        ];
        let policy = policy_from_controls(&controls);
        assert!(policy["BraveRewardsDisabled"].is_boolean());
        assert!(policy["MemorySaverModeSavings"].is_i64());
    }

    #[test]
    fn an_empty_channel_selection_is_refused() {
        let error = channels_argument(&[]).unwrap_err();
        assert!(error.next_step.contains("select a Brave channel"));
    }

    #[test]
    fn a_channel_id_that_is_not_an_identifier_is_refused() {
        let error =
            channels_argument(&["stable; rm -rf /".to_string()]).unwrap_err();
        assert!(error.title.contains("Unrecognised"));
    }

    #[test]
    fn channels_are_joined_for_the_entrypoint() {
        let joined =
            channels_argument(&["stable".to_string(), "beta".to_string()]).unwrap();
        assert_eq!(joined, "stable,beta");
    }

    #[test]
    fn a_payload_claiming_to_mutate_is_refused_in_a_read_only_step() {
        let error = require_read_only("profile preview", true).unwrap_err();
        assert!(error.detail.contains("changes the system"));
    }

    #[test]
    fn each_platform_gets_its_own_entrypoint() {
        assert_eq!(entrypoint_for("macos"), Some("slimbrave-mac.py"));
        assert_eq!(entrypoint_for("windows"), Some("slimbrave-windows.py"));
    }

    #[test]
    fn an_unsupported_platform_is_refused_rather_than_guessed() {
        // Better a clear refusal than running the macOS script on Linux and
        // failing somewhere deep inside it.
        assert_eq!(entrypoint_for("linux"), None);
        assert_eq!(entrypoint_for(""), None);
    }

    #[test]
    fn this_build_resolves_an_entrypoint() {
        // Guards against a build for a platform the bridge cannot drive.
        assert!(entrypoint().is_ok());
    }

    #[test]
    fn an_unknown_schema_version_is_refused() {
        let error = require_schema("browser detection", 2).unwrap_err();
        assert!(error.detail.contains("schema version 2"));
        assert!(require_schema("browser detection", PLAN_SCHEMA_VERSION).is_ok());
    }

    /// The real scripts, driven the way the app drives them. Every command
    /// here is one the entrypoints declare read-only, so this test reports
    /// on the machine it runs on without changing it.
    #[cfg(target_os = "macos")]
    mod against_the_real_scripts {
        use super::*;

        fn project() -> Option<Project> {
            let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()?
                .parent()?
                .to_path_buf();
            if !root.join(entrypoint().ok()?).is_file() {
                return None;
            }
            Some(Project {
                root,
                python: crate::project::resolve_python(None).ok()?,
            })
        }

        #[test]
        fn detection_describes_this_mac() {
            let Some(project) = project() else { return };
            let detection = detect(&project).expect("detection failed");
            assert_eq!(detection.platform, "macos");
            for channel in &detection.channels {
                assert!(!channel.policy_path.is_empty());
                assert!(is_safe_identifier(&channel.id));
            }
        }

        #[test]
        fn the_catalog_lists_the_bundled_profiles() {
            let Some(project) = project() else { return };
            let catalog = catalog(&project).expect("catalog failed");
            assert!(catalog
                .profiles
                .iter()
                .any(|profile| profile.id == "balanced-daily"));
            // The description drives the profile step, so it must be there.
            assert!(catalog
                .profiles
                .iter()
                .all(|profile| !profile.description.is_empty()));
        }

        #[test]
        fn previewing_the_recommended_profile_changes_nothing() {
            let Some(project) = project() else { return };
            let before = detect(&project).expect("detection failed");
            let Some(channel) = before.channels.iter().find(|c| !c.app_path.is_empty())
            else {
                return; // No Brave on this machine; nothing to preview against.
            };
            let policy_path = std::path::Path::new(&channel.policy_path);
            let fingerprint = std::fs::read(policy_path).ok();

            let prepared = preview(
                &project,
                &Selection::Bundled {
                    profile_id: "balanced-daily".to_string(),
                },
                &[channel.id.clone()],
            )
            .expect("preview failed");

            assert_eq!(prepared.report.profile_id, "balanced-daily");
            assert_eq!(prepared.document.plan_hash.len(), 64);
            assert!(prepared.report.managed_policy_count > 0);
            assert!(!prepared.report.targets.is_empty());
            assert!(!prepared.document.policy.is_empty());
            assert_eq!(
                std::fs::read(policy_path).ok(),
                fingerprint,
                "preview modified the managed policy file",
            );
        }

        #[test]
        fn a_custom_selection_previews_and_narrows_with_exclusions() {
            let Some(project) = project() else { return };
            let before = detect(&project).expect("detection failed");
            let Some(channel) = before.channels.iter().find(|c| !c.app_path.is_empty())
            else {
                return;
            };
            let channels = [channel.id.clone()];

            let full = preview(
                &project,
                &Selection::Custom {
                    module_ids: vec!["debloat-core".into()],
                    excluded_control_ids: vec![],
                },
                &channels,
            )
            .expect("custom preview failed");
            assert_eq!(full.report.profile_id, "custom");
            assert!(full.document.policy.contains_key("BraveAIChatEnabled"));

            let trimmed = preview(
                &project,
                &Selection::Custom {
                    module_ids: vec!["debloat-core".into()],
                    excluded_control_ids: vec!["vendor.ai".into()],
                },
                &channels,
            )
            .expect("custom preview failed");
            assert!(!trimmed.document.policy.contains_key("BraveAIChatEnabled"));
            assert_eq!(
                trimmed.document.policy.len() + 1,
                full.document.policy.len(),
            );
            // A different selection must be a different plan, so a stale
            // confirmation can never authorise it.
            assert_ne!(full.document.plan_hash, trimmed.document.plan_hash);
        }

        #[test]
        fn a_custom_selection_cannot_drop_a_required_control() {
            let Some(project) = project() else { return };
            let error = preview(
                &project,
                &Selection::Custom {
                    module_ids: vec!["security-foundation".into()],
                    excluded_control_ids: vec!["security.safe-browsing".into()],
                },
                &["stable".to_string()],
            )
            .expect_err("expected a required control to be undroppable");
            assert!(!error.next_step.is_empty());
        }

        #[test]
        fn an_unknown_profile_is_refused_with_a_next_step() {
            let Some(project) = project() else { return };
            let error = preview(
                &project,
                &Selection::Bundled {
                    profile_id: "not-a-profile".to_string(),
                },
                &["stable".to_string()],
            )
            .expect_err("expected an unknown profile to be refused");
            assert!(!error.next_step.is_empty());
        }
    }

    #[test]
    fn a_custom_selection_with_no_modules_is_refused() {
        let error = Selection::Custom {
            module_ids: vec![],
            excluded_control_ids: vec![],
        }
        .engine_args()
        .unwrap_err();
        assert_eq!(error.title, "Nothing selected");
    }

    #[test]
    fn a_custom_selection_builds_the_engine_arguments() {
        let args = Selection::Custom {
            module_ids: vec!["debloat-core".into(), "quiet-web".into()],
            excluded_control_ids: vec!["vendor.ai".into()],
        }
        .engine_args()
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--preview-custom",
                "--modules",
                "debloat-core,quiet-web",
                "--exclude",
                "vendor.ai",
            ]
        );
    }

    #[test]
    fn a_custom_selection_without_exclusions_omits_the_flag() {
        let args = Selection::Custom {
            module_ids: vec!["debloat-core".into()],
            excluded_control_ids: vec![],
        }
        .engine_args()
        .unwrap();
        assert!(!args.iter().any(|arg| arg == "--exclude"));
    }

    #[test]
    fn a_hostile_module_id_never_reaches_the_engine() {
        let error = Selection::Custom {
            module_ids: vec!["debloat-core; rm -rf /".into()],
            excluded_control_ids: vec![],
        }
        .engine_args()
        .unwrap_err();
        assert_eq!(error.title, "Unrecognised module");
    }

    #[test]
    fn a_traversal_shaped_control_id_never_reaches_the_engine() {
        let error = Selection::Custom {
            module_ids: vec!["debloat-core".into()],
            excluded_control_ids: vec!["../../etc/passwd".into()],
        }
        .engine_args()
        .unwrap_err();
        assert_eq!(error.title, "Unrecognised setting");
    }

    #[test]
    fn the_plan_file_is_written_privately_and_absolutely() {
        let dir = tempfile::tempdir().unwrap();
        let mut policy = serde_json::Map::new();
        policy.insert("MetricsReportingEnabled".into(), serde_json::json!(false));
        let document = PlanDocument {
            schema_version: PLAN_SCHEMA_VERSION,
            profile_id: "balanced-daily".into(),
            plan_hash: "a".repeat(64),
            policy,
        };
        let path = write_plan(dir.path(), &document).unwrap();
        assert!(path.is_absolute());
        let written: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(written["profile_id"], "balanced-daily");
        assert_eq!(written["schema_version"], 1);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode();
            assert_eq!(mode & 0o077, 0, "plan file is readable by other users");
        }
    }
}
