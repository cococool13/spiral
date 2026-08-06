import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { formatBytes } from "../lib/format";

export interface Storage {
  total_bytes: number;
  available_bytes: number;
}

export interface Battery {
  cycle_count: number;
  condition: string;
  maximum_capacity: string | null;
}

export interface HealthReport {
  storage: Storage | null;
  smart: string | null;
  battery: Battery | null;
  local_snapshots: number | null;
  uptime_seconds: number | null;
  model: string | null;
  macos_version: string | null;
}

export type Tier = "user-agent" | "system" | "login-item";
export type ItemState = "enabled" | "disabled" | "unknown";

export interface StartupItem {
  label: string;
  name: string;
  path: string | null;
  tier: Tier;
  state: ItemState;
  controllable: boolean;
  handoff: string | null;
}

export interface StartupInventory {
  user_agents: StartupItem[];
  system: StartupItem[];
  login_items: StartupItem[];
}

const UNAVAILABLE = "Unavailable";

/** Whole days and hours. Anything finer is noise for a figure like this. */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days === 0 && hours === 0) return "Less than an hour";
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  return parts.join(", ");
}

interface FactProps {
  term: string;
  children: React.ReactNode;
}

/**
 * A field that could not be read says so. It does not disappear, because a
 * missing SMART reading and a machine that has none are different facts and
 * must not look the same — see ADR-0017.
 */
function Fact({ term, children }: FactProps) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{children || UNAVAILABLE}</dd>
    </>
  );
}

interface HealthProps {
  report: HealthReport | null;
}

function Health({ report }: HealthProps) {
  if (!report) return <p>Reading this Mac…</p>;

  const { storage, battery } = report;

  return (
    <dl>
      <Fact term="Free space">
        {storage
          ? `${formatBytes(storage.available_bytes)} free of ${formatBytes(storage.total_bytes)}`
          : null}
      </Fact>
      <Fact term="Local snapshots">
        {report.local_snapshots === null
          ? null
          : report.local_snapshots === 0
            ? "None"
            : `${report.local_snapshots} — these hold space that has not come back yet`}
      </Fact>
      <Fact term="Drive health">{report.smart}</Fact>
      {battery && (
        <Fact term="Battery">
          {`${battery.condition}, ${battery.cycle_count} cycles${
            battery.maximum_capacity ? `, ${battery.maximum_capacity} of original capacity` : ""
          }`}
        </Fact>
      )}
      <Fact term="Uptime">
        {report.uptime_seconds === null ? null : formatUptime(report.uptime_seconds)}
      </Fact>
      <Fact term="Model">{report.model}</Fact>
      <Fact term="macOS">{report.macos_version}</Fact>
    </dl>
  );
}

interface StartupRowProps {
  item: StartupItem;
  onToggle: (item: StartupItem, enabled: boolean) => void;
}

function StartupRow({ item, onToggle }: StartupRowProps) {
  return (
    <li>
      <span>{item.name}</span>
      {item.path && <code>{item.path}</code>}
      {item.controllable ? (
        <label>
          <input
            type="checkbox"
            checked={item.state === "enabled"}
            // A state we could not read is not a state we may act on. The
            // control exists because one genuinely does; it is inert because
            // we do not know what turning it would mean.
            disabled={item.state === "unknown"}
            onChange={(e) => onToggle(item, e.target.checked)}
          />
          {item.state === "unknown" ? "State unknown" : "Open at login"}
        </label>
      ) : (
        <p>{item.handoff}</p>
      )}
    </li>
  );
}

interface GroupProps {
  heading: string;
  items: StartupItem[];
  empty: string;
  note?: React.ReactNode;
  onToggle: (item: StartupItem, enabled: boolean) => void;
}

function Group({ heading, items, empty, note, onToggle }: GroupProps) {
  return (
    <section>
      <h3>{heading}</h3>
      {note}
      {items.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <StartupRow key={`${item.tier}:${item.label}`} item={item} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Optimize() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [startup, setStartup] = useState<StartupInventory | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Deliberately does not clear `error`. A refusal is followed by a re-read,
  // and a re-read that cleared the message would erase the only explanation
  // of why the toggle sprang back — leaving the screen looking broken with
  // nothing a user could act on. Callers own when the message goes.
  const load = useCallback(() => {
    // Health never rejects on the Rust side — every field is already
    // optional — so a failure here can only be the bridge itself, and it
    // must not take the Startup section down with it.
    invoke<HealthReport>("health_report")
      .then(setHealth)
      .catch(() => setHealth(null));
    invoke<StartupInventory>("startup_list")
      .then(setStartup)
      .catch((e) =>
        setError(
          `Could not read your login items: ${e}. Try again, or open Login Items in System Settings.`,
        ),
      );
  }, []);

  useEffect(load, [load]);

  const toggle = (item: StartupItem, enabled: boolean) => {
    setError(null);
    invoke("startup_set_enabled", { label: item.label, enabled })
      .then(load)
      .catch((e) => {
        // Re-read either way: a refusal usually means the list moved under
        // us, and showing the stale row is how it moves again.
        load();
        setError(`${e}`);
      });
  };

  return (
    <section>
      <h1>Optimize</h1>
      {error && <p role="alert">{error}</p>}

      <h2>Health</h2>
      <Health report={health} />

      <h2>Startup Items</h2>
      {startup === null ? (
        <p>Reading your login items…</p>
      ) : (
        <>
          <Group
            heading="Your login items"
            items={startup.user_agents}
            empty="Nothing of your own opens at login."
            onToggle={toggle}
          />
          <Group
            heading="System"
            items={startup.system}
            empty="No system items were found."
            onToggle={toggle}
          />
          <Group
            heading="Managed by macOS"
            items={startup.login_items}
            empty="No managed login items were found."
            note={
              <p>
                <button type="button" onClick={() => invoke("open_login_items_settings")}>
                  Open Login Items in System Settings
                </button>
              </p>
            }
            onToggle={toggle}
          />
        </>
      )}
    </section>
  );
}
