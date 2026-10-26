import { useEffect, useRef, useState } from "react";
import { capabilities } from "../../capabilities";
import { Button } from "../../ui/Button";
import { PillCloseGlyph } from "../../ui/glyphs";
import { activityClear, activityList, sourcesList } from "./api";
import { SourceKeys } from "./Sources";
import { sourceName } from "./catalog";
import { useWallpaper } from "./state";
import type { NativeActivity, SourceInfo } from "./types";

const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
const DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const ACTIONS: Record<string, string> = {
  search: "Asked",
  thumb: "Fetched a preview from",
  download: "Downloaded a picture from",
};

/** Every network or disk action, in plain words, newest first: this window's
 *  own notes, then the request log Spiral keeps on this computer. */
export function Activity() {
  const { activity, activityOpen, setActivityOpen, log, history, loadHistory } = useWallpaper();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [requests, setRequests] = useState<NativeActivity[]>([]);
  const [infos, setInfos] = useState<SourceInfo[]>([]);

  useEffect(() => {
    if (!activityOpen) return;
    closeRef.current?.focus();
    void loadHistory();
    void activityList(200)
      .then(setRequests)
      .catch(() => setRequests([]));
    void sourcesList()
      .then(setInfos)
      .catch(() => undefined);
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

      <h3 className="activity__sub">Requests log</h3>
      <p className="activity__lede">
        One line per request, kept only on this computer. It never leaves it.
      </p>
      {requests.length === 0 ? <p className="activity__quiet">No requests yet.</p> : null}
      <ol className="activity__list">
        {requests.map((entry, index) => (
          <li key={`${entry.at}-${index}`}>
            <time dateTime={entry.at}>{DAY.format(new Date(entry.at))}</time>
            <span>{describeRequest(entry, infos)}</span>
          </li>
        ))}
      </ol>
      {requests.length > 0 ? (
        <button
          type="button"
          className="link"
          onClick={() => {
            void activityClear().then(() => {
              setRequests([]);
              log("Cleared the requests log.");
            });
          }}
        >
          Clear the log
        </button>
      ) : null}

      <SourceKeys infos={infos} onSaved={log} />
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

export function describeRequest(entry: NativeActivity, infos: SourceInfo[]): string {
  const name = entry.source ? sourceName(entry.source, infos) : "a source";
  if (entry.kind === "wallpaper") {
    return entry.credit ? `Set a ${name} picture. ${entry.credit}.` : `Set a ${name} picture.`;
  }
  const verb = ACTIONS[entry.action] ?? "Asked";
  const where = entry.host ?? name;
  const outcome = entry.result === "ok" ? "" : ` Failed: ${entry.code ?? "error"}.`;
  return `${verb} ${where}.${outcome}`;
}
