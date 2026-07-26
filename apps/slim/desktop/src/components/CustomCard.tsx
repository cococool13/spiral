import type { ProfileCatalog } from "../lib/contract";
import { controlLabel } from "../lib/copy";
import {
  customDraftProblem,
  draftControlIds,
  requiredControlIds,
  type CustomDraft,
} from "../lib/wizard";

/**
 * The custom selection, built inside its own card.
 *
 * Previously the builder rendered below the deck, which stole height from the
 * card and left the controls visually detached from the choice they belonged
 * to. Everything now lives in the card and scrolls with it.
 *
 * Not a <label>: it holds real checkboxes, and nesting controls inside a label
 * makes clicking one toggle the wrong thing.
 */
export function CustomCard({
  catalog,
  draft,
  selected,
  onToggleModule,
  onToggleControl,
}: {
  readonly catalog: ProfileCatalog;
  readonly draft: CustomDraft;
  readonly selected: boolean;
  readonly onToggleModule: (moduleId: string) => void;
  readonly onToggleControl: (controlId: string) => void;
}) {
  const problem = customDraftProblem(catalog, draft);
  const required = new Set(requiredControlIds(catalog, draft.moduleIds));
  const resolved = draftControlIds(catalog, draft);

  return (
    <div className="card card--custom" data-selected={selected}>
      <h3 className="card__name">Custom</h3>
      <p className="card__lede">
        Same parts, your subset. Values are never edited, so a custom profile
        can only ever be a subset of the ones above.
      </p>

      {problem === "" ? (
        <span className="card__foot">
          {draft.moduleIds.length} of {catalog.modules.length} parts ·{" "}
          {resolved.length} settings
        </span>
      ) : (
        <p className="card__problem">{problem}</p>
      )}

      <div className="builder">
        {catalog.modules.map((module) => {
          const included = draft.moduleIds.includes(module.id);
          const moduleInputId = `module-${module.id}`;
          return (
            <div className="module" key={module.id}>
              <label className="module__head" htmlFor={moduleInputId}>
                <input
                  id={moduleInputId}
                  type="checkbox"
                  checked={included}
                  onChange={() => onToggleModule(module.id)}
                />
                <span className="module__name">{module.name}</span>
                <span className="module__count">{module.controls.length}</span>
              </label>

              {included ? (
                <ul className="module__controls">
                  {module.controls.map((control) => {
                    const controlInputId = `control-${control.id}`;
                    const isRequired = required.has(control.id);
                    const kept = !draft.excludedControlIds.includes(control.id);
                    return (
                      <li key={control.id}>
                        <label htmlFor={controlInputId}>
                          <input
                            id={controlInputId}
                            type="checkbox"
                            checked={kept || isRequired}
                            disabled={isRequired}
                            onChange={() => onToggleControl(control.id)}
                          />
                          <span>{controlLabel(control.id)}</span>
                          {isRequired ? (
                            <span className="module__required">required</span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
