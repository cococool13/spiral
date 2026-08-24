import { useEffect, useRef, useState } from "react";

/** One destination in the menu. `dot` marks it as wanting attention. */
export interface BarItem {
  readonly id: string;
  readonly label: string;
  readonly dot?: boolean;
  readonly onSelect: () => void;
}

/**
 * The bar every Spiral app wears: the mark, the app's name, and one menu.
 *
 * There is no rule under it. Separation is space and material, which is the
 * design system's first principle and the reason four apps that used to have
 * four different chromes now read as one collection. The word before the app's
 * own name is set quiet, so "Spiral" recedes and the app is what you read.
 *
 * The menu is a menu even when it holds one item: an app that grows a second
 * destination should not grow a different header to hold it.
 */
export default function AppBar({
  app,
  items,
  current,
  menuRef,
}: {
  readonly app: string;
  readonly items: readonly BarItem[];
  readonly current?: string;
  /** So a screen that the menu opened can hand focus back to it on close. */
  readonly menuRef?: React.MutableRefObject<HTMLButtonElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const attention = items.some((item) => item.dot);

  // Escape closes and gives the button its focus back; a click anywhere else
  // closes without stealing focus from wherever the person went.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    function onPointer(event: MouseEvent) {
      if (!bar.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <header className="bar" ref={bar}>
      <div className="bar__brand">
        <span className="bar__mark" aria-hidden="true" />
        <h1 className="bar__name">
          <span className="bar__collection">Spiral</span> {app}
        </h1>
      </div>

      <button
        type="button"
        ref={(node) => {
          button.current = node;
          if (menuRef) menuRef.current = node;
        }}
        className="bar__menu"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="bar-menu"
        onClick={() => setOpen((was) => !was)}
      >
        <span className="bar__bars" aria-hidden="true" />
        {attention && (
          <>
            <span className="bar__dot" aria-hidden="true" />
            <span className="visually-hidden"> — something needs attention</span>
          </>
        )}
      </button>

      {open && (
        <nav className="bar__panel" id="bar-menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="bar__item"
              aria-current={item.id === current ? "page" : undefined}
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
            >
              {item.label}
              {item.dot && (
                <>
                  <span className="bar__dot" aria-hidden="true" />
                  <span className="visually-hidden"> — update available</span>
                </>
              )}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
