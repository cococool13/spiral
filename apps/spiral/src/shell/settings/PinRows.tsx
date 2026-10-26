import { capabilities } from "../../capabilities";
import { loginCopy, PIN_PROMISE, pinStatusCopy, usePin } from "../../lib/pin";
import { Notice } from "../../ui/Notice";
import { Toggle } from "../../ui/Toggle";

/** Pin wallpaper to all Spaces. Off by default; the copy says exactly what
 *  turning it on leaves running. Renders nothing where it cannot work. */
export function PinRows() {
  const on = capabilities().pinAllSpaces;
  const { state, busy, error, setPinned, setKeep } = usePin(on);
  if (!on || !state?.available) return null;
  return (
    <>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <section className="set-row">
        <div className="set-row__copy">
          <h2>Pin wallpaper to all Spaces</h2>
          <p className="notice" id="pin-promise">
            {PIN_PROMISE}
          </p>
          <p className="notice" role="status" data-pinned={state.pinned ? "on" : "off"}>
            {busy ? (state.pinned ? "Unpinning…" : "Starting Spiral Live…") : pinStatusCopy(state)}
          </p>
        </div>
        <Toggle
          checked={state.pinned}
          disabled={busy}
          label="Pin wallpaper to all Spaces"
          describedBy="pin-promise"
          onChange={(next) => void setPinned(next)}
        />
      </section>
      {state.pinned ? (
        <section className="set-row">
          <div className="set-row__copy">
            <h2>Keep pinned after restart</h2>
            <p className="notice" id="pin-keep">
              {loginCopy(state)}
            </p>
          </div>
          <Toggle
            checked={state.keepAfterRestart}
            disabled={busy}
            label="Keep pinned after restart"
            describedBy="pin-keep"
            onChange={(next) => void setKeep(next)}
          />
        </section>
      ) : null}
    </>
  );
}
