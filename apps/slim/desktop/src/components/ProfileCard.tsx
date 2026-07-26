import { profileCopy, riskLabel } from "../lib/copy";

/**
 * One profile, as a portrait card: name in helix red, then the highlights.
 * The card is the pitch; the full tradeoffs belong on the review step, where
 * a person is deciding rather than browsing.
 */
export function ProfileCard({
  id,
  name,
  description,
  risk,
  recommended,
  selected,
  onSelect,
}: {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly risk: string;
  readonly recommended: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const inputId = `profile-${id}`;
  const copy = profileCopy(id);
  return (
    <label className="card" htmlFor={inputId} data-selected={selected}>
      <input
        id={inputId}
        type="radio"
        name="profile"
        className="card__input"
        checked={selected}
        onChange={onSelect}
        aria-describedby={`${inputId}-body`}
      />
      {recommended ? <span className="card__flag">Recommended</span> : null}
      <h3 className="card__name">{name}</h3>
      <p className="card__lede" id={`${inputId}-body`}>
        {copy?.purpose ?? description}
      </p>
      {copy === null ? null : (
        <ul className="card__points">
          {copy.highlights.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}
      <span className="card__foot">{riskLabel(risk)}</span>
    </label>
  );
}
