/**
 * The only place the UI talks to native.
 *
 * Every reply is re-validated against the contract before it is returned,
 * and every rejection is turned into a WizardError that says what to do
 * next. Screens never see a raw invoke result or a raw thrown value.
 */
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import {
  ContractError,
  applyOutcome,
  decode,
  detectionReport,
  previewReport,
  profileCatalog,
  resetOutcome,
  type ApplyOutcome,
  type DetectionReport,
  type PreviewReport,
  type ProfileCatalog,
  type ResetOutcome,
} from "./contract";
import type { WizardError } from "./wizard";

/** Native errors already carry the three fields a WizardError needs. */
function isNativeError(value: unknown): value is WizardError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["title"] === "string" &&
    typeof candidate["detail"] === "string" &&
    typeof candidate["nextStep"] === "string"
  );
}

export function toWizardError(
  fallbackTitle: string,
  thrown: unknown,
): WizardError {
  if (isNativeError(thrown)) return thrown;
  if (thrown instanceof ContractError) {
    return {
      title: fallbackTitle,
      detail: thrown.message,
      nextStep:
        "Nothing was changed. Check that apps/slim is a complete, unmodified " +
        "checkout, then try again.",
    };
  }
  return {
    title: fallbackTitle,
    detail: thrown instanceof Error ? thrown.message : String(thrown),
    nextStep: "Nothing was changed. Try again, or reopen Spiral Slim.",
  };
}

async function call<T>(
  command: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
  channel: string,
): Promise<T> {
  const payload: unknown = await invoke(command, args);
  return decode(schema, channel, payload);
}

/** Read-only: reports which Brave channels are installed on this Mac. */
export function detectBrowsers(): Promise<DetectionReport> {
  return call("detect_browsers", {}, detectionReport, "Browser detection");
}

/** Read-only: the bundled profiles in apps/slim/profiles. */
export function listProfiles(): Promise<ProfileCatalog> {
  return call("list_profiles", {}, profileCatalog, "The profile list");
}

/** Read-only: what applying this profile would do, before anything happens. */
export function previewProfile(
  profileId: string,
  channelIds: readonly string[],
): Promise<PreviewReport> {
  return call(
    "preview_profile",
    { profileId, channelIds: [...channelIds] },
    previewReport,
    "The change review",
  );
}

/**
 * Read-only: the same for a selection composed from the bundled modules.
 * Native resolves it through the same engine and stores the same kind of
 * plan, so apply is gated identically.
 */
export function previewCustom(
  moduleIds: readonly string[],
  excludedControlIds: readonly string[],
  channelIds: readonly string[],
): Promise<PreviewReport> {
  return call(
    "preview_custom",
    {
      moduleIds: [...moduleIds],
      excludedControlIds: [...excludedControlIds],
      channelIds: [...channelIds],
    },
    previewReport,
    "The change review",
  );
}

/**
 * The one call that changes the system. `planHash` names the reviewed
 * change; native refuses anything else, and refuses a false `confirmed`.
 */
export function applyProfile(
  planHash: string,
  confirmed: boolean,
): Promise<ApplyOutcome> {
  return call(
    "apply_profile",
    { planHash, confirmed },
    applyOutcome,
    "The result",
  );
}

/** Writes the reviewed plan to Downloads. Touches no policy. */
export function exportPlan(planHash: string, stamp: string): Promise<string> {
  return call("export_plan", { planHash, stamp }, z.string().min(1), "The export");
}

/** Opens Brave on brave://policy so the change can be checked in Brave. */
export function openPolicyPage(appPath: string): Promise<null> {
  return call("open_policy_page", { appPath }, z.null(), "Opening Brave");
}

/** Removes every policy SlimBrave Neo wrote. Also privileged. */
export function resetPolicies(
  channelIds: readonly string[],
  confirmed: boolean,
): Promise<ResetOutcome> {
  return call(
    "reset_policies",
    { channelIds: [...channelIds], confirmed },
    resetOutcome,
    "The reset result",
  );
}
