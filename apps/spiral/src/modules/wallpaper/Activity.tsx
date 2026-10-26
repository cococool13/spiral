import { useEffect, useRef } from "react";
import { PillCloseGlyph } from "../../ui/glyphs";
import { useWallpaper } from "./state";

const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** Every network or disk action this window started, in plain words, newest
 *  first. Kept for this session only. */
export function Activity() {
  const { activity, activityOpen, setActivityOpen } = useWallpaper();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activityOpen) closeRef.current?.focus();
  }, [activityOpen]);

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
