export type Destination =
  | "clean"
  | "storage"
  | "optimize"
  | "uninstall"
  | "history"
  | "settings";

const VERBS: [Destination, string][] = [
  ["clean", "Clean"],
  ["storage", "Storage"],
  ["optimize", "Optimize"],
  ["uninstall", "Uninstall"],
];

const UTILITY: [Destination, string][] = [
  ["history", "History"],
  ["settings", "Settings"],
];

export default function Sidebar({
  active,
  onSelect,
}: {
  active: Destination;
  onSelect: (d: Destination) => void;
}) {
  const item = ([id, label]: [Destination, string]) => (
    <button
      key={id}
      type="button"
      aria-current={active === id ? "page" : undefined}
      onClick={() => onSelect(id)}
    >
      {label}
    </button>
  );

  return (
    <nav className="rail" aria-label="Sections">
      {VERBS.map(item)}
      <hr />
      {UTILITY.map(item)}
    </nav>
  );
}
