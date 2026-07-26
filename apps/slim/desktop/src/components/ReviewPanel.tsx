import type { Platform, PreviewReport } from "../lib/contract";
import { controlLabel, riskLabel } from "../lib/copy";
import { authSentence, deviceNoun, needsProfileApproval } from "../lib/platform";

const FIGURES = [
  ["added", "add"],
  ["changed", "change"],
  ["removed", "remove"],
  ["kept", "unchanged"],
] as const;

function total(preview: PreviewReport, key: "add" | "change" | "remove") {
  return preview.targets.reduce((sum, target) => sum + target.changes[key], 0);
}

/**
 * The review, in the same card language as the choices that led here. The
 * figures are the point of the screen: applying replaces a whole managed
 * policy set, so the removal count gets the same weight as the additions and
 * is never tucked into prose.
 */
export function ReviewPanel({
  preview,
  platform,
  confirmed,
  onConfirmChange,
  busy,
  notice,
  onExport,
}: {
  readonly preview: PreviewReport | null;
  readonly platform: Platform;
  readonly confirmed: boolean;
  readonly onConfirmChange: (confirmed: boolean) => void;
  readonly busy: "preview" | "apply" | null;
  /** Path of the last export, shown inline rather than in a dialog. */
  readonly notice?: string | null;
  readonly onExport?: (() => void) | undefined;
}) {
  if (preview === null) {
    return (
      <div className="review">
        <p className="busy" role="status">
          {busy === "preview"
            ? "Working out exactly what would change"
            : "Waiting for the change review"}
        </p>
      </div>
    );
  }

  const removals = total(preview, "remove");
  const unsupported = preview.controls.filter(
    (control) => control.action === "unsupported",
  );
  const channelNames = preview.targets.map((target) => target.label).join(", ");

  return (
    <div className="review">
      <div className="review__card">
        <h3 className="card__name">{preview.profileName}</h3>
        <p className="review__target">
          {channelNames} · {preview.managedPolicyCount} policies ·{" "}
          {riskLabel(preview.risk)}
        </p>

        <dl className="figures">
          {FIGURES.map(([label, tone]) => {
            const value = preview.targets.reduce(
              (sum, target) => sum + target.changes[tone],
              0,
            );
            return (
              <div
                className="figure"
                key={label}
                data-tone={value === 0 ? "zero" : tone}
              >
                <dt className="figure__label">{label}</dt>
                <dd className="figure__value">{value}</dd>
              </div>
            );
          })}
        </dl>

        {removals > 0 ? (
          <p className="review__note">
            <strong>
              {removals} managed {removals === 1 ? "policy" : "policies"}{" "}
              already on this {deviceNoun(platform)} will be removed.
            </strong>{" "}
            Applying replaces the whole managed set for the selected channels
            rather than merging into it.
          </p>
        ) : null}

        {preview.blocked ? (
          <p className="review__note" data-tone="blocked">
            This profile needs a policy Brave does not support here, so Spiral
            Slim will not apply it. Choose a different profile.
          </p>
        ) : null}

        {unsupported.length > 0 && !preview.blocked ? (
          <p className="review__note">
            {unsupported.length}{" "}
            {unsupported.length === 1 ? "setting has" : "settings have"} no
            verified Brave mapping and will be left alone rather than guessed
            at: {unsupported.map((c) => controlLabel(c.id)).join(", ")}.
          </p>
        ) : null}

        <details className="review__detail">
          <summary>Every policy in this plan ({preview.controls.length})</summary>
          <table className="controls-table">
            <thead>
              <tr>
                <th scope="col">Setting</th>
                <th scope="col">Now</th>
                <th scope="col">After</th>
              </tr>
            </thead>
            <tbody>
              {preview.controls.map((control) => (
                <tr key={control.id} data-action={control.action}>
                  <td>{controlLabel(control.id)}</td>
                  <td>{control.current === null ? "not set" : String(control.current)}</td>
                  <td>
                    {control.action === "unsupported"
                      ? "not applied"
                      : String(control.desired)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>

        {onExport === undefined ? null : (
          <p className="review__actions">
            <button type="button" className="linklike" onClick={onExport}>
              Export this plan
            </button>
            {notice === undefined || notice === null ? null : (
              <span className="review__notice">{notice}</span>
            )}
          </p>
        )}
      </div>

      {preview.blocked ? null : (
        <label className="confirm" htmlFor="confirm-apply">
          <input
            id="confirm-apply"
            type="checkbox"
            checked={confirmed}
            onChange={(event) => onConfirmChange(event.currentTarget.checked)}
          />
          <span>
            Write these {preview.managedPolicyCount} policies to {channelNames},
            removing the {removals} not in this profile. {authSentence(platform)}
            {needsProfileApproval(platform)
              ? " The Configuration Profile then needs approving in System Settings."
              : ""}
          </span>
        </label>
      )}
    </div>
  );
}
