import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Categories } from "./types";

export const CHIPS: { label: string; categories: Categories }[] = [
  { label: "Toplist", categories: "111" },
  { label: "General", categories: "100" },
  { label: "Anime", categories: "010" },
  { label: "People", categories: "001" },
];

interface SearchState {
  query: string;
  setQuery: (query: string) => void;
  chip: number;
  setChip: (chip: number) => void;
}

const SearchContext = createContext<SearchState | null>(null);

export function Frame({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState(0);
  const value = useMemo(() => ({ query, setQuery, chip, setChip }), [query, chip]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchState {
  const value = useContext(SearchContext);
  if (!value) {
    throw new Error("Wallpaper search is missing.");
  }
  return value;
}
