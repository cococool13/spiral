import type { BulletReview, Role } from "../lib/types";
import { Field } from "./Field";

/** Same reasoning as `nextRoleId`: a count is not an identity once anything can
 *  be removed. Bullet ids are how a model rewrite finds its way home. */
function nextBulletId(role: Role): string {
  const prefix = `${role.id}-b-`;
  const used = role.bullets
    .map((bullet) => Number.parseInt(bullet.id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n));
  return `${prefix}${used.length === 0 ? 0 : Math.max(...used) + 1}`;
}

export function RoleEditor({
  role,
  reviews,
  onChange,
  onRemove,
}: {
  role: Role;
  reviews: BulletReview[];
  onChange: (role: Role) => void;
  onRemove: () => void;
}) {
  return (
    <article className="entry">
      <div className="entry__grid">
        <Field label="Title" value={role.title} onChange={(title) => onChange({ ...role, title })} />
        <Field
          label="Employer"
          value={role.organization}
          onChange={(organization) => onChange({ ...role, organization })}
        />
        <Field
          label="Started"
          value={role.start.raw}
          onChange={(raw) => onChange({ ...role, start: { ...role.start, raw } })}
        />
        <Field
          label="Ended"
          value={role.end.raw}
          onChange={(raw) => onChange({ ...role, end: { ...role.end, raw } })}
        />
      </div>
      <span className="field__label">Bullets</span>
      {role.bullets.map((bullet) => {
        const review = reviews.find((r) => r.bulletId === bullet.id);
        return (
          <div key={bullet.id}>
            <input
              className="field__input"
              type="text"
              aria-label={`Bullet in ${role.title || "this role"}`}
              value={bullet.text}
              onChange={(e) =>
                onChange({
                  ...role,
                  bullets: role.bullets.map((b) =>
                    b.id === bullet.id ? { ...b, text: e.target.value } : b,
                  ),
                })
              }
            />
            {review && review.tightened !== bullet.text ? (
              <p className="bullet-note">
                Will become: {review.tightened}{" "}
                <button
                  type="button"
                  className="btn btn--inline"
                  onClick={() =>
                    onChange({
                      ...role,
                      bullets: role.bullets.map((b) =>
                        b.id === bullet.id ? { ...b, text: review.tightened } : b,
                      ),
                    })
                  }
                >
                  Use it now
                </button>
              </p>
            ) : null}
            {review?.notes.map((note) => (
              <p className="bullet-note bullet-note--flag" key={note}>
                {note}
              </p>
            ))}
          </div>
        );
      })}
      <div className="panel__actions">
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange({
              ...role,
              bullets: [...role.bullets, { id: nextBulletId(role), text: "" }],
            })
          }
        >
          Add a bullet
        </button>
        <button type="button" className="btn" onClick={onRemove}>
          Remove this role
        </button>
      </div>
    </article>
  );
}
