import { useEffect, useRef, useState } from "react";
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
  const { activity, activityOpen, setActivityOpen, log } = useWallpaper();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [requests, setRequests] = useState<NativeActivity[]>([]);
  const [infos, setInfos] = useState<SourceInfo[]>([]);

  useEffect(() => {
    if (!activityOpen) return;
    closeRef.current?.focus();
    void activityList(200)
      .then(setRequests)
      .catch(() => setRequests([]));
    void sourcesList()
      .then(setInfos)
      .catch(() => undefined);
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
