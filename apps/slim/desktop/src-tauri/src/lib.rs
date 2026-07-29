//! Spiral Slim — a local wizard for configuring Brave through SlimBrave Neo.
//!
//! The rule this file exists to enforce: nothing changes the system until a
//! preview of that exact change has been shown and explicitly confirmed.
//! `apply_profile` cannot be reached any other way, because the only plan it
//! will run is the one `preview_profile` stored, addressed by its hash.

mod bridge;
mod elevate;
mod error;
mod logo;
mod model;
mod project;

use std::sync::Mutex;

use tauri::Manager;

use crate::bridge::{PreparedPlan, Selection};
use crate::error::{SlimError, SlimResult};
use crate::model::{ApplyOutcome, Catalog, Detection, PreviewReport, ResetOutcome};
use crate::project::Project;

/// Everything the process remembers between commands: the single plan the
/// person is currently looking at. Cleared whenever it stops being current.
#[derive(Default)]
struct Session {
    plan: Mutex<Option<PreparedPlan>>,
}

/// The confirmation gate, kept pure so the rule can be tested directly.
///
/// A stored plan is not enough and a confirmation is not enough. The caller
/// has to name the hash of the plan it is confirming, which is the hash the
/// review screen displayed.
fn authorise<'a>(
    stored: Option<&'a PreparedPlan>,
    plan_hash: &str,
    confirmed: bool,
) -> SlimResult<&'a PreparedPlan> {
    if !confirmed {
        return Err(SlimError::new(
            "Not confirmed",
            "Spiral Slim only applies changes you have explicitly confirmed."
                .to_string(),
            "Tick the confirmation on the review step, then choose Apply.",
        ));
    }
    let plan = stored.ok_or_else(|| {
        SlimError::new(
            "Nothing has been reviewed yet",
            "There is no previewed change to apply.".to_string(),
            "Go back to the review step so Spiral Slim can show you the exact \
             changes first.",
        )
    })?;
    if plan.document.plan_hash != plan_hash {
        return Err(SlimError::new(
            "The reviewed change is out of date",
            "The confirmation does not match the change Spiral Slim last \
             previewed."
                .to_string(),
            "Review the current changes again, then confirm.",
        ));
    }
    Ok(plan)
}

fn project(app: &tauri::AppHandle) -> SlimResult<Project> {
    let resource_dir = app.path().resource_dir().ok();
    Project::locate(resource_dir)
}

/* ---------------------------------------------------------------- *
 * Read-only commands. None of these elevate or write anything.
 * ---------------------------------------------------------------- */

#[tauri::command]
fn detect_browsers(app: tauri::AppHandle) -> Result<Detection, SlimError> {
    bridge::detect(&project(&app)?)
}

#[tauri::command]
fn list_profiles(app: tauri::AppHandle) -> Result<Catalog, SlimError> {
    bridge::catalog(&project(&app)?)
}

fn store_preview(
    app: &tauri::AppHandle,
    session: &tauri::State<'_, Session>,
    selection: Selection,
    channel_ids: &[String],
) -> Result<PreviewReport, SlimError> {
    let prepared = bridge::preview(&project(app)?, &selection, channel_ids)?;
    let report = prepared.report.clone();
    // Replacing the stored plan invalidates any confirmation the UI was
    // holding, because a confirmation names a hash.
    *session.plan.lock().map_err(|_| poisoned())? = Some(prepared);
    Ok(report)
}

#[tauri::command]
fn preview_profile(
    app: tauri::AppHandle,
    session: tauri::State<'_, Session>,
    profile_id: String,
    channel_ids: Vec<String>,
) -> Result<PreviewReport, SlimError> {
    store_preview(
        &app,
        &session,
        Selection::Bundled { profile_id },
        &channel_ids,
    )
}

/// A custom selection is previewed the same way and gated the same way. It
/// is not a new policy source: the engine composes it from the same bundled
/// modules, and the entrypoint still validates every key and value.
#[tauri::command]
fn preview_custom(
    app: tauri::AppHandle,
    session: tauri::State<'_, Session>,
    module_ids: Vec<String>,
    excluded_control_ids: Vec<String>,
    channel_ids: Vec<String>,
) -> Result<PreviewReport, SlimError> {
    store_preview(
        &app,
        &session,
        Selection::Custom {
            module_ids,
            excluded_control_ids,
        },
        &channel_ids,
    )
}

/* ---------------------------------------------------------------- *
 * The two commands that change the system.
 * ---------------------------------------------------------------- */

#[tauri::command]
fn apply_profile(
    app: tauri::AppHandle,
    session: tauri::State<'_, Session>,
    plan_hash: String,
    confirmed: bool,
) -> Result<ApplyOutcome, SlimError> {
    let mut guard = session.plan.lock().map_err(|_| poisoned())?;
    let plan = authorise(guard.as_ref(), &plan_hash, confirmed)?;
    if plan.report.blocked {
        return Err(SlimError::new(
            "This profile cannot be applied here",
            "It requires a policy Brave does not support on this Mac."
                .to_string(),
            "Choose a different profile.",
        ));
    }
    let plan = plan.clone();
    // Consume it: a confirmed apply is spent, and a second one needs a fresh
    // preview and a fresh confirmation.
    *guard = None;
    drop(guard);

    bridge::apply(&project(&app)?, &plan)
}

#[tauri::command]
fn reset_policies(
    app: tauri::AppHandle,
    session: tauri::State<'_, Session>,
    channel_ids: Vec<String>,
    confirmed: bool,
) -> Result<ResetOutcome, SlimError> {
    if !confirmed {
        return Err(SlimError::new(
            "Not confirmed",
            "Spiral Slim only removes policies you have explicitly confirmed."
                .to_string(),
            "Confirm the reset, then choose Remove.",
        ));
    }
    let outcome = bridge::reset(&project(&app)?, &channel_ids)?;
    *session.plan.lock().map_err(|_| poisoned())? = None;
    Ok(outcome)
}

/// Export the reviewed plan. Read-only with respect to the system: it writes
/// a file the person asked for and touches no policy.
#[tauri::command]
fn export_plan(
    session: tauri::State<'_, Session>,
    plan_hash: String,
    stamp: String,
) -> Result<String, SlimError> {
    let guard = session.plan.lock().map_err(|_| poisoned())?;
    let plan = guard.as_ref().ok_or_else(|| {
        SlimError::new(
            "Nothing has been reviewed yet",
            "There is no previewed plan to export.".to_string(),
            "Go back to the review step first.",
        )
    })?;
    if plan.document.plan_hash != plan_hash {
        return Err(SlimError::new(
            "The reviewed plan is out of date",
            "The export does not match the plan Spiral Slim last previewed."
                .to_string(),
            "Review the current changes again, then export.",
        ));
    }
    bridge::export_plan(plan, &stamp)
}

/// Open Brave on brave://policy so the change can be verified in Brave itself.
#[tauri::command]
fn open_policy_page(app: tauri::AppHandle, app_path: String) -> Result<(), SlimError> {
    let _ = project(&app)?;
    bridge::open_policy_page(&app_path)
}

fn poisoned() -> SlimError {
    SlimError::new(
        "Spiral Slim lost track of the reviewed change",
        "An earlier step failed unexpectedly.".to_string(),
        "Close and reopen Spiral Slim, then review the changes again.",
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Session::default())
        .invoke_handler(tauri::generate_handler![
            detect_browsers,
            list_profiles,
            preview_profile,
            preview_custom,
            apply_profile,
            reset_policies,
            export_plan,
            open_policy_page,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Spiral Slim");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{
        ChangeCounts, PlanDocument, PreviewPersistence, PreviewReport, TargetReview,
    };

    const HASH: &str = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    fn prepared(hash: &str, blocked: bool) -> PreparedPlan {
        let mut policy = serde_json::Map::new();
        policy.insert("MetricsReportingEnabled".into(), serde_json::json!(false));
        PreparedPlan {
            document: PlanDocument {
                schema_version: bridge::PLAN_SCHEMA_VERSION,
                profile_id: "balanced-daily".into(),
                plan_hash: hash.to_string(),
                policy,
            },
            channel_ids: vec!["stable".into()],
            report: PreviewReport {
                profile_id: "balanced-daily".into(),
                profile_name: "Balanced Daily".into(),
                risk: "low".into(),
                plan_hash: hash.to_string(),
                blocked,
                managed_policy_count: 1,
                channel_ids: vec!["stable".into()],
                controls: vec![],
                targets: vec![TargetReview {
                    label: "Stable".into(),
                    path: "/Library/Managed Preferences/com.brave.Browser.plist".into(),
                    changes: ChangeCounts {
                        add: 1,
                        change: 0,
                        remove: 0,
                        unchanged: 0,
                    },
                }],
                persistence: PreviewPersistence {
                    mode: "on".into(),
                    profile_status: Some("not_detected".into()),
                },
            },
        }
    }

    #[test]
    fn nothing_is_authorised_without_a_preview() {
        let error = authorise(None, HASH, true).unwrap_err();
        assert!(error.next_step.contains("review step"));
    }

    #[test]
    fn nothing_is_authorised_without_confirmation() {
        let plan = prepared(HASH, false);
        let error = authorise(Some(&plan), HASH, false).unwrap_err();
        assert_eq!(error.title, "Not confirmed");
    }

    #[test]
    fn confirming_a_different_plan_is_refused() {
        let plan = prepared(HASH, false);
        let error = authorise(Some(&plan), &"b".repeat(64), true).unwrap_err();
        assert!(error.title.contains("out of date"));
    }

    #[test]
    fn an_empty_hash_never_matches() {
        let plan = prepared(HASH, false);
        assert!(authorise(Some(&plan), "", true).is_err());
    }

    #[test]
    fn a_previewed_and_confirmed_plan_is_authorised() {
        let plan = prepared(HASH, false);
        let authorised = authorise(Some(&plan), HASH, true).unwrap();
        assert_eq!(authorised.document.plan_hash, HASH);
    }

    #[test]
    fn confirmation_is_checked_before_the_stored_plan_is_read() {
        // Order matters: an unconfirmed call must not report "nothing
        // reviewed", which would invite a person to preview and retry.
        let error = authorise(None, HASH, false).unwrap_err();
        assert_eq!(error.title, "Not confirmed");
    }
}
