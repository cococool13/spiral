import { nextBulletId } from "../lib/ids";
import type { BulletReview, Role } from "../lib/types";
import { Field } from "./Field";

/** What one entry is called on screen. A project has no employer and a
 *  volunteering entry is not a "role", so the words come from the section
 *  rather than being fixed here — the fields and the editing are identical. */
export interface EntryWords {
  title: string;
  organization: string;
  remove: string;
}

export function RoleEditor({
  role,
  words,
  reviews,
  onChange,
  onRemove,
}: {
  role: Role;
  words: EntryWords;
  reviews: BulletReview[];
  onChange: (role: Role) => void;
  onRemove: () => void;
}) {
  return (
    <article className="entry">
      <div className="entry__grid">
        <Field
          label={words.title}
          value={role.title}
          onChange={(title) => onChange({ ...role, title })}
        />
        <Field
          label={words.organization}
          value={role.organization}
          onChange={(organization) => onChange({ ...role, organization })}
        />
      </div>
      <Field
        label="Place"
        value={role.location}
        onChange={(location) => onChange({ ...role, location })}
      />
      <div className="entry__grid">
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
      <div className="entry__stack">
      {role.bullets.map((bullet) => {
        const review = reviews.find((r) => r.bulletId === bullet.id);
        const previewId = `${bullet.id}-preview`;
        const noteIds = review?.notes.map((_, i) => `${bullet.id}-note-${i}`) ?? [];
        const describedBy = [
          review && review.tightened !== bullet.text ? previewId : null,
          ...noteIds,
        ]
          .filter(Boolean)
          .join(" ") || undefined;
        return (
          <div key={bullet.id}>
            <input
              className="field__input"
              type="text"
              aria-label={`Bullet in ${role.title || words.title}`}
              aria-describedby={describedBy}
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
              <p className="bullet-note" id={previewId}>
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
            {review?.notes.map((note, i) => (
              <p className="bullet-note bullet-note--flag" id={noteIds[i]} key={note}>
                {note}
              </p>
            ))}
          </div>
        );
      })}
      </div>
      <div className="panel__actions">
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange({
              ...role,
              bullets: [...role.bullets, { id: nextBulletId(role.id, role.bullets.map((b) => b.id)), text: "" }],
            })
          }
        >
          Add a bullet
        </button>
        <button type="button" className="btn" onClick={onRemove}>
          {words.remove}
        </button>
      </div>
    </article>
  );
}
