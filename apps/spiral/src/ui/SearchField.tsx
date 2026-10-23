import type { RefObject } from "react";
import { SearchGlyph } from "./glyphs";

interface SearchFieldProps {
  value: string;
  inputRef: RefObject<HTMLInputElement>;
  onChange: (value: string) => void;
}

export function SearchField({ value, inputRef, onChange }: SearchFieldProps) {
  return (
    <label className="search">
      <SearchGlyph />
      <input
        ref={inputRef}
        type="search"
        placeholder="Search Wallhaven"
        aria-label="Search Wallhaven"
        aria-keyshortcuts="/"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <kbd>/</kbd>
    </label>
  );
}
