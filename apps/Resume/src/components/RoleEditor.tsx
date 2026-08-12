import type { Role } from "../lib/types";
import { Field } from "./Field";

export function RoleEditor({
  role,
  onChange,
  onRemove,
}: {
  role: Role;
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
      {role.bullets.map((bullet) => (
        <input
          key={bullet.id}
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
      ))}
      <div className="panel__actions">
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange({
              ...role,
              bullets: [...role.bullets, { id: `${role.id}-b-${role.bullets.length}`, text: "" }],
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
