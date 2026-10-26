import { useEffect, useRef } from "react";
import { Dome as DomeButton, PillIcon } from "../../ui/Glass";
import { PillSearchGlyph, PillShuffleGlyph } from "../../ui/glyphs";
import { SearchField } from "../../ui/SearchField";
import { useWallpaper } from "./state";

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** Search lives in the pill: a recessed icon, and `/` from anywhere. */
export function Tools() {
  const { query, setQuery, searchOpen, setSearchOpen } = useWallpaper();
  const inputRef = useRef<HTMLInputElement>(null);
  const open = searchOpen || query.length > 0;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      event.preventDefault();
      setSearchOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setSearchOpen]);

  return (
    <>
      <PillIcon
        label="Search"
        aria-keyshortcuts="/"
        aria-expanded={open}
        onClick={() => {
          setSearchOpen(!open);
          if (!open) requestAnimationFrame(() => inputRef.current?.focus());
          else setQuery("");
        }}
      >
        <PillSearchGlyph />
      </PillIcon>
      {open ? (
        <div
          className="pill-search"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setQuery("");
            setSearchOpen(false);
          }}
        >
          <SearchField value={query} inputRef={inputRef} onChange={setQuery} />
        </div>
      ) : null}
    </>
  );
}

export function Dome() {
  const { surprise, visible, phase } = useWallpaper();
  return (
    <DomeButton
      label="Surprise me"
      disabled={visible.length === 0 || phase?.phase === "applying"}
      onClick={surprise}
    >
      <PillShuffleGlyph />
    </DomeButton>
  );
}
