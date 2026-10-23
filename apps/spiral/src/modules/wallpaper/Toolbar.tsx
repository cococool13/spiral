import { useEffect, useRef } from "react";
import { SearchField } from "../../ui/SearchField";
import { Segmented } from "../../ui/Segmented";
import { CHIPS, useSearch } from "./state";

export function Toolbar() {
  const { query, setQuery, chip, setChip } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <>
      <SearchField value={query} inputRef={inputRef} onChange={setQuery} />
      <Segmented
        label="Category"
        value={String(chip)}
        options={CHIPS.map((item, index) => ({ value: String(index), label: item.label }))}
        onChange={(value) => setChip(Number(value))}
      />
    </>
  );
}
