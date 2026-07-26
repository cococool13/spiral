import { useCallback, useEffect, useReducer, useState } from "react";

import mark from "./assets/brand/mark-red.svg";
import { BrowserCard } from "./components/BrowserCard";
import { CustomCard } from "./components/CustomCard";
import { Deck } from "./components/Deck";
import { Notice } from "./components/Notice";
import { ProfileCard } from "./components/ProfileCard";
import { ReviewPanel } from "./components/ReviewPanel";
import { Stage } from "./components/Stage";
import { Intro } from "./components/Intro";
import { Done } from "./screens/Done";
import * as ipc from "./lib/ipc";
import { authSentence, deviceNoun, waitingSentence } from "./lib/platform";
import {
  RECOMMENDED_PROFILE_ID,
  STEPS,
  canAdvance,
  canApply,
  capabilityFor,
  initialState,
  previewRequestKey,
  reduce,
  stepIndex,
} from "./lib/wizard";

export function App() {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [resetConfirmed, setResetConfirmed] = useState(false);
  // The intro is a splash, not a wizard step: it gates nothing and carries no
  // state, so it stays out of the machine and out of the progress ticks.
  const [started, setStarted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Both reads are read-only and neither elevates.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      dispatch({ type: "detection.loading" });
      try {
        const report = await ipc.detectBrowsers();
        if (cancelled) return;
        dispatch({ type: "detection.loaded", report });
      } catch (thrown) {
        if (cancelled) return;
        dispatch({
          type: "detection.failed",
          error: ipc.toWizardError("Could not check this computer", thrown),
        });
        return;
      }
      dispatch({ type: "catalog.loading" });
      try {
        const catalog = await ipc.listProfiles();
        if (cancelled) return;
        dispatch({ type: "catalog.loaded", catalog });
      } catch (thrown) {
        if (cancelled) return;
        dispatch({
          type: "catalog.failed",
          error: ipc.toWizardError("Could not read the profiles", thrown),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { step, selection, customDraft, selectedChannelIds, busy } = state;
  // Detection is the thing that actually looked at the machine, so its
  // answer drives the wording rather than the build target.
  const platform = state.detection?.platform ?? "macos";

  const requestKey = previewRequestKey(state);
  useEffect(() => {
    if (requestKey === null || selection === null) return;
    let cancelled = false;
    void (async () => {
      dispatch({ type: "preview.loading" });
      try {
        const report =
          selection.kind === "bundled"
            ? await ipc.previewProfile(selection.profileId, selectedChannelIds)
            : await ipc.previewCustom(
                customDraft.moduleIds,
                customDraft.excludedControlIds,
                selectedChannelIds,
              );
        if (cancelled) return;
        dispatch({ type: "preview.loaded", report });
      } catch (thrown) {
        if (cancelled) return;
        dispatch({
          type: "preview.failed",
          error: ipc.toWizardError("Could not review the changes", thrown),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const apply = useCallback(async () => {
    if (!canApply(state).ok || state.preview === null) return;
    dispatch({ type: "apply.loading" });
    try {
      const outcome = await ipc.applyProfile(state.preview.planHash, true);
      dispatch({ type: "apply.succeeded", outcome });
    } catch (thrown) {
      dispatch({
        type: "apply.failed",
        error: ipc.toWizardError("Could not apply the profile", thrown),
      });
    }
  }, [state]);

  const runReset = useCallback(async (force = false) => {
    if (!force && !resetConfirmed) return;
    dispatch({ type: "reset.loading" });
    try {
      const outcome = await ipc.resetPolicies(state.selectedChannelIds, true);
      dispatch({ type: "reset.succeeded", outcome });
      setResetConfirmed(false);
    } catch (thrown) {
      dispatch({
        type: "reset.failed",
        error: ipc.toWizardError("Could not remove the policies", thrown),
      });
    }
  }, [resetConfirmed, state.selectedChannelIds]);


  const capability = capabilityFor(state.detection);
  const installed = (state.detection?.channels ?? []).filter(
    (channel) => channel.appPath !== "",
  );
  const advance = canAdvance(state);

  if (!started) return <Intro onStart={() => setStarted(true)} />;

  if (step === "done") {
    return (
      <div className="app">
        <Header step={step} />
        <main className="page">
          <Done
            outcome={state.outcome}
            platform={platform}
            resetOutcome={state.resetOutcome}
            resetConfirmed={resetConfirmed}
            onResetConfirmChange={setResetConfirmed}
            onReset={() => void runReset()}
            busy={busy === "reset"}
            canReset={capability.canApply}
            onOpenPolicyPage={
              installed[0] === undefined
                ? undefined
                : () => {
                    const path = installed[0]?.appPath;
                    if (path === undefined) return;
                    void ipc.openPolicyPage(path).catch((thrown) =>
                      dispatch({
                        type: "reset.failed",
                        error: ipc.toWizardError("Could not open Brave", thrown),
                      }),
                    );
                  }
            }
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Header step={step} />

      <main className="page">
        {state.error !== null ? <Notice error={state.error} /> : null}

        {step === "welcome" ? (
          <Stage
            title="Is this the browser you want to configure?"
          >
            {busy === "detection" ? (
              <p className="busy" role="status">
                Looking for Brave
              </p>
            ) : null}
            {busy === null && !capability.canPreview ? (
              <p className="warn">{capability.reason}</p>
            ) : null}
            {installed.some((c) => c.managedPolicyCount > 0) ? (
              <p className="startover">
                Brave is already managed on this {deviceNoun(platform)}.{" "}
                <button
                  type="button"
                  className="linklike"
                  disabled={busy !== null}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Remove every policy SlimBrave Neo wrote and put " +
                          "Brave back to its own defaults? " +
                          authSentence(platform),
                      )
                    )
                      return;
                    void runReset(true);
                  }}
                >
                  Remove them and start clean
                </button>
              </p>
            ) : null}
            {installed.length > 0 ? (
              <Deck label="Detected Brave channels">
                {installed.map((channel) => (
                  <BrowserCard
                    key={channel.id}
                    channel={channel}
                    selected={selectedChannelIds.includes(channel.id)}
                    onToggle={() =>
                      dispatch({ type: "channel.toggled", channelId: channel.id })
                    }
                  />
                ))}
              </Deck>
            ) : null}
          </Stage>
        ) : null}

        {step === "profile" && state.catalog !== null ? (
          <Stage
            title="Which profile?"
          >
            <Deck
              label="Profiles"
              onFocusChange={(index) => {
                const ids = [
                  ...state.catalog!.profiles.map((profile) => profile.id),
                  "custom",
                ];
                const id = ids[index];
                if (id === undefined) return;
                dispatch(
                  id === "custom"
                    ? { type: "custom.selected" }
                    : { type: "profile.selected", profileId: id },
                );
              }}
            >
              {[
                ...state.catalog.profiles.map((profile) => (
                  <ProfileCard
                    key={profile.id}
                    id={profile.id}
                    name={profile.name}
                    description={profile.description}
                    risk={profile.risk}
                    recommended={profile.id === RECOMMENDED_PROFILE_ID}
                    selected={
                      selection?.kind === "bundled" &&
                      selection.profileId === profile.id
                    }
                    onSelect={() =>
                      dispatch({ type: "profile.selected", profileId: profile.id })
                    }
                  />
                )),
                <CustomCard
                  key="custom"
                  catalog={state.catalog}
                  draft={customDraft}
                  selected={selection?.kind === "custom"}
                  onToggleModule={(moduleId) =>
                    dispatch({ type: "custom.moduleToggled", moduleId })
                  }
                  onToggleControl={(controlId) =>
                    dispatch({ type: "custom.controlToggled", controlId })
                  }
                />,
              ]}
            </Deck>
          </Stage>
        ) : null}

        {step === "review" ? (
          <Stage title="Review">
            <ReviewPanel
              preview={state.preview}
              platform={platform}
              confirmed={state.confirmed}
              onConfirmChange={(confirmed) =>
                dispatch({ type: "confirmation.set", confirmed })
              }
              busy={busy === "preview" || busy === "apply" ? busy : null}
              notice={notice}
              onExport={
                state.preview === null
                  ? undefined
                  : () => {
                      const hash = state.preview?.planHash;
                      if (hash === undefined) return;
                      void ipc
                        .exportPlan(hash, new Date().toISOString().slice(0, 10))
                        .then((path) => setNotice(`Saved to ${path}`))
                        .catch((thrown) =>
                          dispatch({
                            type: "preview.failed",
                            error: ipc.toWizardError(
                              "Could not export the plan",
                              thrown,
                            ),
                          }),
                        );
                    }
              }
            />
          </Stage>
        ) : null}
      </main>

      <footer className="footer">
        <button
          type="button"
          onClick={() => dispatch({ type: "step.back" })}
          disabled={step === "welcome" || busy !== null}
        >
          Back
        </button>
        <p className="footer__reason" aria-live="polite">
          {busy === "apply"
            ? waitingSentence(platform)
            : advance.reason}
        </p>
        <button
          type="button"
          data-variant="primary"
          onClick={() =>
            step === "review" ? void apply() : dispatch({ type: "step.next" })
          }
          disabled={!advance.ok}
        >
          {step === "review"
            ? busy === "apply"
              ? "Applying"
              : "Apply"
            : "Continue"}
        </button>
      </footer>
    </div>
  );
}

/** Compact step indicator. Not a rail: one line, no navigation. */
function Header({ step }: { readonly step: (typeof STEPS)[number] }) {
  const index = stepIndex(step);
  const total = STEPS.length - 1; // "done" is an outcome, not a step
  return (
    <header className="header">
      <img src={mark} alt="" width={20} height={20} />
      <span className="header__wordmark">Spiral Slim</span>
      {step === "done" ? null : (
        <span
          className="header__progress"
          aria-label={`Step ${index + 1} of ${total}`}
        >
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className="header__tick" data-done={i <= index} />
          ))}
        </span>
      )}
    </header>
  );
}
