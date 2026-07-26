import type { ApplyOutcome, Platform, ResetOutcome } from "../lib/contract";
import { deviceNoun } from "../lib/platform";

interface Props {
  readonly outcome: ApplyOutcome | null;
  readonly platform: Platform;
  readonly resetOutcome: ResetOutcome | null;
  readonly resetConfirmed: boolean;
  readonly onResetConfirmChange: (confirmed: boolean) => void;
  readonly onReset: () => void;
  readonly busy: boolean;
  readonly canReset: boolean;
  /** Opens Brave on brave://policy. Absent when Brave was not detected. */
  readonly onOpenPolicyPage?: (() => void) | undefined;
}

export function Done({
  outcome,
  platform,
  resetOutcome,
  resetConfirmed,
  onResetConfirmChange,
  onReset,
  busy,
  canReset,
  onOpenPolicyPage,
}: Props) {
  if (resetOutcome !== null) {
    return (
      <div className="pane__inner">
        <h1>Policies removed</h1>
        <p className="lede">
          Brave is back to its own defaults on this {deviceNoun(platform)}.
          Restart Brave for that to take effect.
        </p>
        <div className="panel">
          <p style={{ margin: 0 }}>{resetOutcome.message}</p>
        </div>
        <h2>Check it</h2>
        <p>
          Open <code>brave://policy</code> in Brave. The policy list should now
          be empty for the channels you reset.
        </p>
      </div>
    );
  }

  if (outcome === null) {
    return (
      <div className="pane__inner">
        <h1>All set</h1>
        <p className="lede">Nothing to report yet.</p>
      </div>
    );
  }

  return (
    <div className="pane__inner">
      <h1>
        {outcome.profileApprovalPending ? "One step left" : "All set"}
      </h1>

      {outcome.profileApprovalPending ? (
        <>
          <p className="lede">
            The policies are written and active now, but the Configuration
            Profile that makes them survive a reboot is{" "}
            <strong>not installed yet</strong>. macOS needs you to approve it.
          </p>
          <div className="panel">
            <p style={{ margin: 0 }}>
              <strong>Finish the install</strong>
            </p>
            <ol className="steplist">
              <li>
                Open <strong>System Settings</strong>.
              </li>
              <li>
                Go to <strong>General → Device Management</strong>.
              </li>
              <li>
                Select <strong>SlimBrave Neo - Brave Policy</strong> and choose{" "}
                <strong>Install</strong>.
              </li>
            </ol>
            <p style={{ marginBottom: 0 }}>
              Spiral Slim already opened that pane for you. Until you finish it,
              macOS 13 and later may clear these policies at the next restart.
            </p>
          </div>
        </>
      ) : (
        <p className="lede">
          {platform === "windows"
            ? "These policies live in the registry, so they survive a restart. There is no further step."
            : "The Configuration Profile is installed, so these settings survive a restart."}
        </p>
      )}

      <h2>What changed</h2>
      <div className="panel">
        <dl className="facts">
          <dt>Profile applied</dt>
          <dd>{outcome.profileId}</dd>
          <dt>Brave channels</dt>
          <dd>{outcome.channelLabels.join(", ") || "default policy target"}</dd>
          <dt>Managed policies</dt>
          <dd>{outcome.managedPolicyCount}</dd>
        </dl>
        <p className="choice__meta" style={{ marginTop: "8px" }}>
          {outcome.message}
        </p>
      </div>

      {outcome.braveRunning ? (
        <p className="warn">
          Brave is still running. Quit it completely and reopen it before the
          new policies apply.
        </p>
      ) : null}

      <h2>Check it yourself</h2>
      <p>
        Each policy Spiral Slim wrote appears at <code>brave://policy</code>
        with its source and value. If one is missing, Brave has not reloaded
        yet. Quit and reopen it.
      </p>
      {onOpenPolicyPage === undefined ? null : (
        <p style={{ marginTop: "8px" }}>
          <button type="button" onClick={onOpenPolicyPage}>
            Open brave://policy
          </button>
        </p>
      )}

      <h2>Undo</h2>
      <p>
        Removing the policies puts Brave back to its own defaults. It deletes the
        managed policy files, removes the Configuration Profile, and repairs the
        per-site exceptions SlimBrave writes into your Brave profile.
      </p>

      {canReset ? (
        <>
          <label className="confirm" htmlFor="confirm-reset">
            <input
              id="confirm-reset"
              type="checkbox"
              checked={resetConfirmed}
              onChange={(event) =>
                onResetConfirmChange(event.currentTarget.checked)
              }
            />
            <span>
              I want Spiral Slim to remove every policy it wrote and the
              Configuration Profile with it.
            </span>
          </label>
          <p style={{ marginTop: "16px" }}>
            <button
              type="button"
              onClick={onReset}
              disabled={!resetConfirmed || busy}
            >
              {busy ? "Removing…" : "Remove all policies"}
            </button>
          </p>
        </>
      ) : (
        <p className="warn">
          Undo is unavailable because Spiral Slim cannot reach the SlimBrave Neo
          scripts. You can remove the policies from Terminal with{" "}
          <code>sudo python3 slimbrave-mac.py --reset</code>.
        </p>
      )}
    </div>
  );
}
