import { useCallback, useRef } from "react";

/** ARIA's radiogroup pattern, which a group of `role="radio"` buttons does not
 *  get for free.
 *
 *  A radiogroup is **one** Tab stop: Tab enters it at the checked option, the
 *  arrow keys move between options, and Tab leaves. Without that, the style
 *  picker is twelve separate Tab stops and the arrow keys do nothing — which is
 *  both slower and not what a screen-reader user is told to expect when the
 *  group announces itself as "radio, 1 of 12".
 *
 *  Selection follows focus, as the pattern specifies for a group where choosing
 *  has no cost. Home and End jump to the ends. */
export function useRadioGroup<T extends string>(
  values: T[],
  /** Empty before anything is chosen, which is why Tab has to land somewhere. */
  selected: T | "",
  onSelect: (value: T) => void,
) {
  const buttons = useRef(new Map<T, HTMLButtonElement>());

  const move = useCallback(
    (to: number) => {
      const wrapped = (to + values.length) % values.length;
      const value = values[wrapped];
      if (value === undefined) return;
      onSelect(value);
      buttons.current.get(value)?.focus();
    },
    [values, onSelect],
  );

  return useCallback(
    (value: T) => {
      const index = values.indexOf(value);
      // Tab lands on the checked option, or on the first one before anything is
      // chosen — never on all of them.
      const checked = value === selected;
      const isTabStop = checked || (selected === "" && index === 0);

      return {
        role: "radio" as const,
        "aria-checked": checked,
        tabIndex: isTabStop ? 0 : -1,
        ref: (node: HTMLButtonElement | null) => {
          if (node) buttons.current.set(value, node);
          else buttons.current.delete(value);
        },
        onClick: () => onSelect(value),
        onKeyDown: (event: React.KeyboardEvent) => {
          const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
          if (step !== undefined) {
            event.preventDefault();
            move(index + step);
            return;
          }
          if (event.key === "Home") {
            event.preventDefault();
            move(0);
          } else if (event.key === "End") {
            event.preventDefault();
            move(values.length - 1);
          }
        },
      };
    },
    [values, selected, onSelect, move],
  );
}
