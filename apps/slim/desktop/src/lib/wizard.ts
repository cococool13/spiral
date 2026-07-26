/**
 * The wizard state machine.
 *
 * Deliberately pure: no React, no Tauri, no I/O. Every rule that decides
 * whether Spiral Slim is allowed to change a person's browser lives here so
 * it can be tested directly rather than inferred from rendered markup.
 *
 * Two rules matter more than the rest:
 *
 *   1. Preview before apply. Apply is only reachable when a preview exists
 *      that native computed for exactly the current selection. Changing the
 *      selection discards the preview.
 *   2. Explicit confirmation. Confirmation is given against a specific
 *      preview and is discarded whenever that preview is.
 *
 * A custom selection is held to the same rules. It is not a new policy
 * source: it can only include or leave out controls the bundled modules
 * already declare, with the values those modules already set.
 */
import type {
  ApplyOutcome,
  DetectionReport,
  Platform,
  PreviewReport,
  ProfileCatalog,
  ResetOutcome,
} from "./contract";
import { deviceNoun } from "./platform";

export const STEPS = ["welcome", "profile", "review", "done"] as const;
export type Step = (typeof STEPS)[number];

/** The profile Spiral Slim pre-selects: the balanced, recommended daily one. */
export const RECOMMENDED_PROFILE_ID = "balanced-daily";

/** The id the engine gives a user-composed selection. */
export const CUSTOM_PROFILE_ID = "custom";

/**
 * Applying policy goes through the platform SlimBrave entrypoint. Both the
 * macOS and Windows entrypoints expose the plan interface and validate a plan
 * through the same `browser_collection.plan`, so both can be driven from
 * here. Anything else is gated off with a reason rather than shown a button
 * that cannot work.
 */
export const APPLY_PLATFORMS: readonly Platform[] = ["macos", "windows"];

export type BusyChannel =
  | "detection"
  | "catalog"
  | "preview"
  | "apply"
  | "reset";

export interface WizardError {
  /** Which operation failed, in words a person can act on. */
  readonly title: string;
  /** What went wrong. */
  readonly detail: string;
  /** What to do next. Never empty — an error without a next step is a dead end. */
  readonly nextStep: string;
}

/** What the person chose to apply. */
export type Selection =
  | { readonly kind: "bundled"; readonly profileId: string }
  | { readonly kind: "custom" };

/**
 * The custom selection being edited. Kept separate from `selection` so
 * switching to a bundled profile and back does not lose the work.
 */
export interface CustomDraft {
  readonly moduleIds: readonly string[];
  /** Controls to leave unset, so Brave keeps its own default for them. */
  readonly excludedControlIds: readonly string[];
}

export interface WizardState {
  readonly step: Step;
  readonly busy: BusyChannel | null;
  readonly detection: DetectionReport | null;
  readonly catalog: ProfileCatalog | null;
  readonly selectedChannelIds: readonly string[];
  readonly selection: Selection | null;
  readonly customDraft: CustomDraft;
  readonly preview: PreviewReport | null;
  readonly confirmed: boolean;
  readonly outcome: ApplyOutcome | null;
  readonly resetOutcome: ResetOutcome | null;
  readonly error: WizardError | null;
}

export const initialState: WizardState = {
  step: "welcome",
  busy: null,
  detection: null,
  catalog: null,
  selectedChannelIds: [],
  selection: null,
  customDraft: { moduleIds: [], excludedControlIds: [] },
  preview: null,
  confirmed: false,
  outcome: null,
  resetOutcome: null,
  error: null,
};

export type WizardEvent =
  | { type: "detection.loading" }
  | { type: "detection.loaded"; report: DetectionReport }
  | { type: "detection.failed"; error: WizardError }
  | { type: "catalog.loading" }
  | { type: "catalog.loaded"; catalog: ProfileCatalog }
  | { type: "catalog.failed"; error: WizardError }
  | { type: "channel.toggled"; channelId: string }
  | { type: "profile.selected"; profileId: string }
  | { type: "custom.selected" }
  | { type: "custom.moduleToggled"; moduleId: string }
  | { type: "custom.controlToggled"; controlId: string }
  | { type: "step.next" }
  | { type: "step.back" }
  | { type: "preview.loading" }
  | { type: "preview.loaded"; report: PreviewReport }
  | { type: "preview.failed"; error: WizardError }
  | { type: "confirmation.set"; confirmed: boolean }
  | { type: "apply.loading" }
  | { type: "apply.succeeded"; outcome: ApplyOutcome }
  | { type: "apply.failed"; error: WizardError }
  | { type: "reset.loading" }
  | { type: "reset.succeeded"; outcome: ResetOutcome }
  | { type: "reset.failed"; error: WizardError }
  | { type: "error.dismissed" }
  | { type: "wizard.restarted" };

/* ------------------------------------------------------------------ *
 * Capability gating
 * ------------------------------------------------------------------ */

export interface Capability {
  readonly canPreview: boolean;
  readonly canApply: boolean;
  /** Empty when canApply is true. Shown verbatim next to the disabled action. */
  readonly reason: string;
}

export function capabilityFor(detection: DetectionReport | null): Capability {
  if (detection === null) {
    return {
      canPreview: false,
      canApply: false,
      reason: "Spiral Slim has not checked this computer yet.",
    };
  }
  if (!APPLY_PLATFORMS.includes(detection.platform)) {
    return {
      canPreview: false,
      canApply: false,
      reason:
        `Spiral Slim applies Brave policies on macOS and Windows. On ` +
        `${detection.platform} run the SlimBrave Neo script directly.`,
    };
  }
  if (!detection.found || detection.channels.length === 0) {
    return {
      canPreview: false,
      canApply: false,
      reason:
        `No Brave install was found on this ${deviceNoun(detection.platform)}. ` +
        "Install Brave, then reopen Spiral Slim.",
    };
  }
  return { canPreview: true, canApply: true, reason: "" };
}

/* ------------------------------------------------------------------ *
 * Custom selections
 * ------------------------------------------------------------------ */

/** Controls a module declares that cannot be left out. */
export function requiredControlIds(
  catalog: ProfileCatalog | null,
  moduleIds: readonly string[],
): readonly string[] {
  if (catalog === null) return [];
  const selected = new Set(moduleIds);
  return catalog.modules
    .filter((module) => selected.has(module.id))
    .flatMap((module) => module.controls)
    .filter((control) => control.required)
    .map((control) => control.id);
}

/**
 * The controls a custom draft resolves to: every control in the selected
 * modules, minus the excluded ones. Derived from the catalog rather than
 * echoed back by native, so a mismatched preview cannot pass as current.
 */
export function draftControlIds(
  catalog: ProfileCatalog | null,
  draft: CustomDraft,
): readonly string[] {
  if (catalog === null) return [];
  const selected = new Set(draft.moduleIds);
  const excluded = new Set(draft.excludedControlIds);
  const ids = new Set<string>();
  for (const module of catalog.modules) {
    if (!selected.has(module.id)) continue;
    for (const control of module.controls) {
      if (!excluded.has(control.id)) ids.add(control.id);
    }
  }
  return [...ids];
}

/** Why a custom draft cannot be previewed yet, or empty when it can. */
export function customDraftProblem(
  catalog: ProfileCatalog | null,
  draft: CustomDraft,
): string {
  if (draft.moduleIds.length === 0) {
    return "Choose at least one part of Brave to configure.";
  }
  if (draftControlIds(catalog, draft).length === 0) {
    return "Leaving every setting out would apply nothing.";
  }
  const required = new Set(requiredControlIds(catalog, draft.moduleIds));
  const dropped = draft.excludedControlIds.find((id) => required.has(id));
  if (dropped !== undefined) {
    return `${dropped} is required by its module and cannot be left out.`;
  }
  return "";
}

/* ------------------------------------------------------------------ *
 * Derived questions the UI asks
 * ------------------------------------------------------------------ */

export interface Verdict {
  readonly ok: boolean;
  /** Empty when ok. Otherwise the single reason the action is unavailable. */
  readonly reason: string;
}

const ALLOWED: Verdict = { ok: true, reason: "" };

function refuse(reason: string): Verdict {
  return { ok: false, reason };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

/**
 * True when the held preview was computed for exactly what is selected now.
 *
 * For a bundled profile that is an id comparison. For a custom selection the
 * id is always "custom", so the control set the preview actually contains is
 * compared against the control set the draft resolves to — two different
 * custom selections can never be mistaken for one another.
 */
export function previewMatchesSelection(state: WizardState): boolean {
  const { preview, selection, selectedChannelIds } = state;
  if (preview === null || selection === null) return false;
  if (!sameSet(preview.channelIds, selectedChannelIds)) return false;
  if (selection.kind === "bundled") {
    return preview.profileId === selection.profileId;
  }
  if (preview.profileId !== CUSTOM_PROFILE_ID) return false;
  if (customDraftProblem(state.catalog, state.customDraft) !== "") return false;
  return sameSet(
    preview.controls.map((control) => control.id),
    draftControlIds(state.catalog, state.customDraft),
  );
}

export function canPreview(state: WizardState): Verdict {
  const capability = capabilityFor(state.detection);
  if (!capability.canPreview) return refuse(capability.reason);
  if (state.busy !== null) return refuse("Spiral Slim is still working.");
  if (state.selectedChannelIds.length === 0) {
    return refuse("Choose at least one Brave channel first.");
  }
  if (state.selection === null) return refuse("Choose a profile first.");
  if (state.selection.kind === "custom") {
    const problem = customDraftProblem(state.catalog, state.customDraft);
    if (problem !== "") return refuse(problem);
  }
  return ALLOWED;
}

/**
 * The gate in front of the only action that changes the system.
 * Every clause here is load-bearing; none is a convenience check.
 */
export function canApply(state: WizardState): Verdict {
  const capability = capabilityFor(state.detection);
  if (!capability.canApply) return refuse(capability.reason);
  if (state.step !== "review") {
    return refuse("Applying happens on the review step.");
  }
  if (state.busy !== null) return refuse("Spiral Slim is still working.");
  if (state.preview === null) {
    return refuse("Review the exact changes before applying them.");
  }
  if (!previewMatchesSelection(state)) {
    return refuse(
      "The selection changed. Review the updated changes before applying.",
    );
  }
  if (state.preview.blocked) {
    return refuse(
      "This profile needs a policy Brave does not support here, so Spiral " +
        "Slim will not apply it.",
    );
  }
  if (!state.confirmed) {
    return refuse("Confirm that you want these changes applied.");
  }
  return ALLOWED;
}

export function canAdvance(state: WizardState): Verdict {
  switch (state.step) {
    case "welcome": {
      const capability = capabilityFor(state.detection);
      if (!capability.canPreview) return refuse(capability.reason);
      if (state.selectedChannelIds.length === 0) {
        return refuse("Choose at least one Brave channel to continue.");
      }
      return ALLOWED;
    }
    case "profile": {
      if (state.selection === null) return refuse("Choose a profile to continue.");
      if (state.selection.kind === "custom") {
        const problem = customDraftProblem(state.catalog, state.customDraft);
        if (problem !== "") return refuse(problem);
      }
      return ALLOWED;
    }
    case "review":
      return canApply(state);
    case "done":
      return refuse("Spiral Slim has finished.");
  }
}

export function stepIndex(step: Step): number {
  return STEPS.indexOf(step);
}

/**
 * Identifies *what* the review screen should be previewing, or null when it
 * should not be previewing anything.
 *
 * This is the effect trigger in App.tsx, and it deliberately depends only on
 * the selection. It must never depend on `busy` or `error`. An earlier
 * version keyed the effect on a predicate that included `busy`: dispatching
 * `preview.loading` then flipped that predicate, changed the effect's
 * dependencies, ran its cleanup, and cancelled the very request it had just
 * started. The screen sat on "working out what would change" forever.
 *
 * Because the key is null on every other step, navigating away and back
 * changes it (null -> key) and re-fires the request. That is how a failed
 * review is retried, and why no error clause belongs here.
 */
export function previewRequestKey(state: WizardState): string | null {
  const { step, selection, customDraft, selectedChannelIds } = state;
  if (step !== "review" || selection === null) return null;
  return JSON.stringify([
    selection.kind === "bundled" ? selection.profileId : "custom",
    selection.kind === "custom" ? [...customDraft.moduleIds].sort() : [],
    selection.kind === "custom"
      ? [...customDraft.excludedControlIds].sort()
      : [],
    [...selectedChannelIds].sort(),
  ]);
}

/* ------------------------------------------------------------------ *
 * Reducer
 * ------------------------------------------------------------------ */

/**
 * Discard anything that was true of the previous selection. Called on every
 * change to the selection or channel set so a preview — and the confirmation
 * given against it — can never outlive what it described.
 */
function invalidateReview(state: WizardState): WizardState {
  if (state.preview === null && !state.confirmed && state.outcome === null) {
    return state;
  }
  return { ...state, preview: null, confirmed: false, outcome: null };
}

function toggle(
  values: readonly string[],
  value: string,
): readonly string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function reduce(state: WizardState, event: WizardEvent): WizardState {
  switch (event.type) {
    case "detection.loading":
      return { ...state, busy: "detection", error: null };

    case "detection.loaded": {
      // Pre-select every detected channel: the person asked to configure
      // Brave, and leaving a channel out silently is the surprising default.
      const channelIds = event.report.channels
        .filter((channel) => channel.appPath !== "")
        .map((channel) => channel.id);
      return invalidateReview({
        ...state,
        busy: null,
        error: null,
        detection: event.report,
        selectedChannelIds: channelIds,
      });
    }

    case "detection.failed":
      return { ...state, busy: null, error: event.error, detection: null };

    case "catalog.loading":
      return { ...state, busy: "catalog", error: null };

    case "catalog.loaded": {
      const recommended = event.catalog.profiles.find(
        (profile) => profile.id === RECOMMENDED_PROFILE_ID,
      );
      const fallback = event.catalog.profiles[0];
      const chosen = recommended ?? fallback;
      const selection =
        state.selection ??
        (chosen === undefined
          ? null
          : ({ kind: "bundled", profileId: chosen.id } as const));
      // Seed the custom builder from the recommended profile so it starts
      // from the same baseline rather than empty.
      const draft =
        state.customDraft.moduleIds.length > 0
          ? state.customDraft
          : {
              moduleIds: chosen?.modules ?? [],
              excludedControlIds: [] as readonly string[],
            };
      return {
        ...state,
        busy: null,
        error: null,
        catalog: event.catalog,
        selection,
        customDraft: draft,
      };
    }

    case "catalog.failed":
      return { ...state, busy: null, error: event.error, catalog: null };

    case "channel.toggled":
      return invalidateReview({
        ...state,
        selectedChannelIds: toggle(state.selectedChannelIds, event.channelId),
      });

    case "profile.selected": {
      const selection = state.selection;
      if (selection?.kind === "bundled" && selection.profileId === event.profileId) {
        return state;
      }
      return invalidateReview({
        ...state,
        selection: { kind: "bundled", profileId: event.profileId },
      });
    }

    case "custom.selected": {
      if (state.selection?.kind === "custom") return state;
      return invalidateReview({ ...state, selection: { kind: "custom" } });
    }

    case "custom.moduleToggled": {
      const moduleIds = toggle(state.customDraft.moduleIds, event.moduleId);
      // Dropping a module drops any exclusion that only made sense inside it,
      // so a stale exclusion cannot make the draft unresolvable.
      const stillAvailable = new Set(
        (state.catalog?.modules ?? [])
          .filter((module) => moduleIds.includes(module.id))
          .flatMap((module) => module.controls)
          .map((control) => control.id),
      );
      return invalidateReview({
        ...state,
        customDraft: {
          moduleIds,
          excludedControlIds: state.customDraft.excludedControlIds.filter((id) =>
            stillAvailable.has(id),
          ),
        },
      });
    }

    case "custom.controlToggled": {
      // A required control can never be excluded; refuse rather than record.
      const required = new Set(
        requiredControlIds(state.catalog, state.customDraft.moduleIds),
      );
      if (required.has(event.controlId)) return state;
      return invalidateReview({
        ...state,
        customDraft: {
          ...state.customDraft,
          excludedControlIds: toggle(
            state.customDraft.excludedControlIds,
            event.controlId,
          ),
        },
      });
    }

    case "step.next": {
      if (!canAdvance(state).ok) return state;
      const next = STEPS[stepIndex(state.step) + 1];
      // The last forward move is made by apply.succeeded, not by navigation,
      // so "done" is never reachable without the system actually changing.
      if (next === undefined || next === "done") return state;
      return { ...state, step: next, error: null };
    }

    case "step.back": {
      if (state.busy !== null) return state;
      const previous = STEPS[stepIndex(state.step) - 1];
      if (previous === undefined || state.step === "done") return state;
      return { ...state, step: previous, error: null, confirmed: false };
    }

    case "preview.loading":
      return { ...state, busy: "preview", error: null };

    case "preview.loaded":
      // Confirmation is always re-asked: it belongs to the preview shown.
      return {
        ...state,
        busy: null,
        error: null,
        preview: event.report,
        confirmed: false,
      };

    case "preview.failed":
      return {
        ...state,
        busy: null,
        error: event.error,
        preview: null,
        confirmed: false,
      };

    case "confirmation.set": {
      // Confirming something that is not currently shown is not a thing a
      // person can do, so refuse it rather than record it.
      if (event.confirmed && !previewMatchesSelection(state)) return state;
      return { ...state, confirmed: event.confirmed };
    }

    case "apply.loading":
      return canApply(state).ok
        ? { ...state, busy: "apply", error: null }
        : state;

    case "apply.succeeded":
      return {
        ...state,
        busy: null,
        error: null,
        step: "done",
        outcome: event.outcome,
        confirmed: false,
      };

    case "apply.failed":
      return { ...state, busy: null, error: event.error, confirmed: false };

    case "reset.loading":
      return { ...state, busy: "reset", error: null };

    case "reset.succeeded":
      return {
        ...state,
        busy: null,
        error: null,
        resetOutcome: event.outcome,
        outcome: null,
        preview: null,
        confirmed: false,
      };

    case "reset.failed":
      return { ...state, busy: null, error: event.error };

    case "error.dismissed":
      return state.error === null ? state : { ...state, error: null };

    case "wizard.restarted":
      return {
        ...initialState,
        detection: state.detection,
        catalog: state.catalog,
        selectedChannelIds: state.selectedChannelIds,
        selection: state.selection,
        customDraft: state.customDraft,
      };
  }
}
