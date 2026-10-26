import { useEffect, useRef } from "react";
import { capabilities } from "../../capabilities";
import { Button } from "../../ui/Button";
import { PillCloseGlyph } from "../../ui/glyphs";
import { useWallpaper } from "./state";

const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** Every network or disk action this window started, in plain words, newest
 *  first. Kept for this session only. */
export function Activity() {
  const { activity, activityOpen, setActivityOpen, history, loadHistory } = useWallpaper();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!activityOpen) return;
    closeRef.current?.focus();
    void loadHistory();
  }, [activityOpen, loadHistory]);

  if (!activityOpen) return null;
  return (
    <aside
      className="activity"
      aria-label="Activity"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        setActivityOpen(false);
      }}
    >
      <header className="activity__head">
        <h2 className="activity__title">Activity</h2>
        <button
          ref={closeRef}
          type="button"
          className="activity__close"
          aria-label="Close activity"
          onClick={() => setActivityOpen(false)}
        >
          <PillCloseGlyph />
        </button>
      </header>
      {capabilities().restoreOriginal && history?.supported ? <RestoreOriginal /> : null}
      <p className="activity__lede">What this window did since it opened. Nothing else ran.</p>
      <ol className="activity__list">
        {activity.map((entry) => (
          <li key={entry.id}>
            <time dateTime={entry.at.toISOString()}>{TIME.format(entry.at)}</time>
            <span>{entry.text}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** Puts back the wallpaper the person had before Spiral first changed it. */
function RestoreOriginal() {
  const { history, restoreOriginal, phase } = useWallpaper();
  const original = history?.original ?? null;
  const steps = history?.undo ?? 0;
  return (
    <section className="activity__restore" aria-labelledby="restore-title">
      <h3 className="activity__title" id="restore-title">
        Your own wallpaper
      </h3>
      {original === null ? (
        <p className="activity__lede">Spiral has not changed your wallpaper yet. Once it does, you can put yours back here.</p>
      ) : original.exists ? (
        <p className="activity__lede" id="restore-note">
          Before Spiral changed it, your desktop showed {original.name}. Spiral kept a note of it on this computer,
          not a copy. {steps > 0 ? `Undo also steps back through the last ${steps} changes.` : ""}
        </p>
      ) : (
        <p className="activity__lede" role="note">
          {original.name} is no longer on this computer, so Spiral cannot put it back. Choose a picture in your
          system's wallpaper settings instead.
        </p>
      )}
      {original?.exists ? (
        <Button
          aria-describedby="restore-note"
          disabled={phase?.phase === "applying"}
          onClick={() => void restoreOriginal()}
        >
          Restore my original wallpaper
        </Button>
      ) : null}
    </section>
  );
}
