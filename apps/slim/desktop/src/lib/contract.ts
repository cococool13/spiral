/**
 * The UI/native contract.
 *
 * Everything crossing the Tauri boundary is parsed here before any screen
 * sees it. The Rust side already validates the JSON it gets from the Python
 * entrypoints; this is the second, independent check, so a malformed or
 * unexpected payload becomes a readable error instead of a broken review
 * screen that a person might confirm.
 */
import { z } from "zod";

/** A managed policy value. Chromium policies are scalars only. */
const policyValue = z.union([z.boolean(), z.number(), z.string()]);

const platform = z.enum(["macos", "linux", "windows", "unsupported"]);
export type Platform = z.infer<typeof platform>;

const persistMode = z.enum(["off", "on"]);

const stableId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "not a stable id");

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, "not a sha256 digest");

/* ------------------------------------------------------------------ *
 * Step 1 — detection
 * ------------------------------------------------------------------ */

/** The channel's own logo, read from its app bundle on this Mac. */
const iconDataUri = z
  .string()
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/, "not a PNG data URI")
  .nullable();

const braveChannel = z
  .object({
    id: stableId,
    label: z.string().min(1),
    appPath: z.string(),
    bundleId: z.string(),
    policyPath: z.string().min(1),
    running: z.boolean(),
    managedPolicyCount: z.number().int().nonnegative(),
    icon: iconDataUri,
  })
  .strict();
export type BraveChannel = z.infer<typeof braveChannel>;

export const detectionReport = z
  .object({
    platform,
    found: z.boolean(),
    method: z.string(),
    warnings: z.array(z.string()),
    persistence: z
      .object({
        supportedModes: z.array(persistMode),
        mode: persistMode,
        profileInstalled: z.boolean(),
      })
      .strict(),
    channels: z.array(braveChannel),
  })
  .strict();
export type DetectionReport = z.infer<typeof detectionReport>;

/* ------------------------------------------------------------------ *
 * Step 2 — profile catalog
 * ------------------------------------------------------------------ */

const risk = z.enum(["low", "medium", "high", "destructive"]);

const profileSummary = z
  .object({
    id: stableId,
    name: z.string().min(1),
    description: z.string(),
    risk,
    modules: z.array(stableId),
  })
  .strict();

/** A control as a module declares it. Values are not editable — a custom
 *  selection can include a control or leave it out, nothing else. */
const moduleControl = z
  .object({
    id: z.string().min(1),
    required: z.boolean(),
  })
  .strict();

const moduleSummary = z
  .object({
    id: stableId,
    name: z.string().min(1),
    risk,
    conflictsWith: z.array(stableId),
    controls: z.array(moduleControl).min(1),
  })
  .strict();

export const profileCatalog = z
  .object({
    profiles: z.array(profileSummary).min(1),
    modules: z.array(moduleSummary).min(1),
  })
  .strict();
export type ProfileCatalog = z.infer<typeof profileCatalog>;

/* ------------------------------------------------------------------ *
 * Step 3 — review
 * ------------------------------------------------------------------ */

const controlAction = z.enum([
  "add",
  "change",
  "unchanged",
  "unsupported",
]);

const supportState = z.enum([
  "verified",
  "preview_ready",
  "detected_only",
  "unsupported",
]);

const controlChange = z
  .object({
    id: z.string().min(1),
    vendorName: z.string(),
    current: policyValue.nullable(),
    desired: policyValue,
    action: controlAction,
    support: supportState,
    required: z.boolean(),
    reason: z.string(),
  })
  .strict();

const changeCounts = z
  .object({
    add: z.number().int().nonnegative(),
    change: z.number().int().nonnegative(),
    remove: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
  })
  .strict();

const targetReview = z
  .object({
    label: z.string().min(1),
    path: z.string().min(1),
    changes: changeCounts,
  })
  .strict();

export const previewReport = z
  .object({
    profileId: stableId,
    profileName: z.string().min(1),
    risk,
    planHash: sha256Hex,
    /** The engine could not map a control the profile marks as required. */
    blocked: z.boolean(),
    managedPolicyCount: z.number().int().positive(),
    channelIds: z.array(stableId).min(1),
    controls: z.array(controlChange),
    targets: z.array(targetReview).min(1),
    persistence: z
      .object({
        mode: persistMode,
        /** null when persistence is off, so there is no profile to report. */
        profileStatus: z.enum(["installed", "not_detected"]).nullable(),
      })
      .strict(),
  })
  .strict();
export type PreviewReport = z.infer<typeof previewReport>;

/* ------------------------------------------------------------------ *
 * Step 4 — outcome
 * ------------------------------------------------------------------ */

export const applyOutcome = z
  .object({
    planHash: sha256Hex,
    profileId: stableId,
    /** Plain-language summary produced by the SlimBrave entrypoint. */
    message: z.string().min(1),
    channelLabels: z.array(z.string()),
    managedPolicyCount: z.number().int().positive(),
    persistMode,
    /**
     * macOS only. True once the Configuration Profile is queued but the
     * person has not yet approved it in System Settings. Until it flips
     * false, the install is not finished.
     */
    profileApprovalPending: z.boolean(),
    braveRunning: z.boolean(),
  })
  .strict();
export type ApplyOutcome = z.infer<typeof applyOutcome>;

export const resetOutcome = z
  .object({
    message: z.string().min(1),
    removedPaths: z.array(z.string()),
    profileRemoved: z.boolean(),
  })
  .strict();
export type ResetOutcome = z.infer<typeof resetOutcome>;

/* ------------------------------------------------------------------ *
 * Decoding
 * ------------------------------------------------------------------ */

export class ContractError extends Error {
  override readonly name = "ContractError";
  constructor(
    readonly channel: string,
    readonly detail: string,
  ) {
    super(`${channel} returned data Spiral Slim could not read: ${detail}`);
  }
}

/**
 * Parse a native payload, or throw a ContractError naming the channel.
 * Never returns partially-valid data — a review screen built from half a
 * payload is worse than an error.
 */
export function decode<T>(
  schema: z.ZodType<T>,
  channel: string,
  payload: unknown,
): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  const where = first?.path.length ? first.path.join(".") : "payload";
  throw new ContractError(channel, `${where}: ${first?.message ?? "invalid"}`);
}
