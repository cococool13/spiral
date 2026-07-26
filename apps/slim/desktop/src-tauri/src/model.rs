//! Types crossing the UI boundary.
//!
//! Incoming shapes are the JSON the Python entrypoints already emit
//! (snake_case). Outgoing shapes are camelCase and mirror
//! `src/lib/contract.ts`, which re-validates every field on arrival.

use serde::{Deserialize, Serialize};

/// A managed policy value. Chromium policies are scalars only, so anything
/// else in a payload is a bug worth failing on rather than passing through.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PolicyValue {
    Bool(bool),
    Int(i64),
    Text(String),
}

/* ---------------------------------------------------------------- *
 * Detection
 * ---------------------------------------------------------------- */

#[derive(Debug, Clone, Deserialize)]
pub struct RawChannel {
    pub id: String,
    pub label: String,
    pub app_path: String,
    pub bundle_id: String,
    pub policy_path: String,
    pub running: bool,
    #[serde(default)]
    pub managed_policy_count: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawPersistence {
    pub supported_modes: Vec<String>,
    pub mode: String,
    pub profile_installed: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawDetection {
    pub schema_version: u32,
    pub mutates_system: bool,
    pub platform: String,
    pub found: bool,
    pub method: String,
    pub warnings: Vec<String>,
    pub persistence: RawPersistence,
    pub channels: Vec<RawChannel>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    pub id: String,
    pub label: String,
    pub app_path: String,
    pub bundle_id: String,
    pub policy_path: String,
    pub running: bool,
    /// Managed policies this channel already carries, before anything is
    /// applied. Zero means Brave is running on its own defaults.
    pub managed_policy_count: u32,
    /// The channel's own icon as a PNG data URI, read from its app bundle.
    /// None when the bundle has no readable icon — the UI shows a placeholder.
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Persistence {
    pub supported_modes: Vec<String>,
    pub mode: String,
    pub profile_installed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detection {
    pub platform: String,
    pub found: bool,
    pub method: String,
    pub warnings: Vec<String>,
    pub persistence: Persistence,
    pub channels: Vec<Channel>,
}

/* ---------------------------------------------------------------- *
 * Catalog
 * ---------------------------------------------------------------- */

#[derive(Debug, Clone, Deserialize)]
pub struct RawProfile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub risk: String,
    pub modules: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawCatalog {
    pub schema_version: u32,
    pub profiles: Vec<RawProfile>,
    #[serde(default)]
    pub modules: Vec<RawModule>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub risk: String,
    pub modules: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawModuleControl {
    pub id: String,
    pub required: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawModule {
    pub id: String,
    pub name: String,
    pub risk: String,
    pub conflicts_with: Vec<String>,
    pub controls: Vec<RawModuleControl>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleControl {
    pub id: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleSummary {
    pub id: String,
    pub name: String,
    pub risk: String,
    pub conflicts_with: Vec<String>,
    pub controls: Vec<ModuleControl>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub profiles: Vec<ProfileSummary>,
    pub modules: Vec<ModuleSummary>,
}

/* ---------------------------------------------------------------- *
 * Preview — engine half (browser_collection.py)
 * ---------------------------------------------------------------- */

#[derive(Debug, Clone, Deserialize)]
pub struct RawControl {
    pub id: String,
    pub vendor_name: String,
    pub current: Option<PolicyValue>,
    pub desired: PolicyValue,
    pub action: String,
    pub support: String,
    pub required: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawBrowserPlan {
    pub controls: Vec<RawControl>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawPreviewProfile {
    pub id: String,
    pub name: String,
    pub risk: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawEnginePreview {
    pub schema_version: u32,
    pub mutates_system: bool,
    pub blocked: bool,
    pub plan_hash: String,
    pub profile: RawPreviewProfile,
    pub browsers: Vec<RawBrowserPlan>,
}

/* ---------------------------------------------------------------- *
 * Preview — entrypoint half (slimbrave-mac.py --preview-plan)
 * ---------------------------------------------------------------- */

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeCounts {
    pub add: u32,
    pub change: u32,
    pub remove: u32,
    pub unchanged: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawTarget {
    pub label: String,
    pub path: String,
    pub changes: ChangeCounts,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawPlanPersistence {
    pub mode: String,
    pub profile_status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawPlanPreview {
    pub schema_version: u32,
    pub mutates_system: bool,
    pub profile_id: String,
    pub plan_hash: String,
    pub managed_policy_count: u32,
    pub persistence: RawPlanPersistence,
    pub targets: Vec<RawTarget>,
}

/* ---------------------------------------------------------------- *
 * Preview — combined, as the UI sees it
 * ---------------------------------------------------------------- */

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlChange {
    pub id: String,
    pub vendor_name: String,
    pub current: Option<PolicyValue>,
    pub desired: PolicyValue,
    pub action: String,
    pub support: String,
    pub required: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetReview {
    pub label: String,
    pub path: String,
    pub changes: ChangeCounts,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewPersistence {
    pub mode: String,
    pub profile_status: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewReport {
    pub profile_id: String,
    pub profile_name: String,
    pub risk: String,
    pub plan_hash: String,
    pub blocked: bool,
    pub managed_policy_count: u32,
    pub channel_ids: Vec<String>,
    pub controls: Vec<ControlChange>,
    pub targets: Vec<TargetReview>,
    pub persistence: PreviewPersistence,
}

/* ---------------------------------------------------------------- *
 * Outcomes
 * ---------------------------------------------------------------- */

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOutcome {
    pub plan_hash: String,
    pub profile_id: String,
    pub message: String,
    pub channel_labels: Vec<String>,
    pub managed_policy_count: u32,
    pub persist_mode: String,
    pub profile_approval_pending: bool,
    pub brave_running: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetOutcome {
    pub message: String,
    pub removed_paths: Vec<String>,
    pub profile_removed: bool,
}

/* ---------------------------------------------------------------- *
 * The plan handed to the privileged entrypoint
 * ---------------------------------------------------------------- */

#[derive(Debug, Clone, Serialize)]
pub struct PlanDocument {
    pub schema_version: u32,
    pub profile_id: String,
    pub plan_hash: String,
    pub policy: serde_json::Map<String, serde_json::Value>,
}
