import type { BraveChannel } from "../lib/contract";

/** One detected Brave channel: its own logo, its name in helix red. */
export function BrowserCard({
  channel,
  selected,
  onToggle,
}: {
  readonly channel: BraveChannel;
  readonly selected: boolean;
  readonly onToggle: () => void;
}) {
  const inputId = `channel-${channel.id}`;
  return (
    <label className="card card--browser" htmlFor={inputId} data-selected={selected}>
      <input
        id={inputId}
        type="checkbox"
        className="card__input"
        checked={selected}
        onChange={onToggle}
      />
      {channel.icon === null ? (
        <span className="card__logo card__logo--absent" aria-hidden="true" />
      ) : (
        <img
          className="card__logo"
          src={channel.icon}
          alt=""
          width={132}
          height={132}
        />
      )}
      <h3 className="card__name">Brave {channel.label}</h3>
      <p className="card__lede">
        {channel.managedPolicyCount === 0
          ? "Running on Brave's own defaults. Nothing is managed yet."
          : `${channel.managedPolicyCount} managed policies are already set on this channel.`}
      </p>
      <span className="card__foot">
        {selected ? "Will be configured" : "Not selected"}
        {channel.running ? " · running" : ""}
      </span>
    </label>
  );
}
