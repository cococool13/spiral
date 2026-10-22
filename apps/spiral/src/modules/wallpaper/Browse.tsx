import { useCallback, useEffect, useRef, useState } from "react";
import { useDebounce } from "../../hooks/useDebounce";
import { cachedPage, prefetchPage, search as searchWallpapers } from "./api";
import { errorCopy } from "./errors";
import { WallpaperGrid } from "./grid";
import type { ThumbPlatform } from "./thumbs";
import type { Categories, GalleryItem, SearchParams, Sorting } from "./types";

const CHIPS: { label: string; categories: Categories }[] = [
  { label: "Toplist", categories: "111" },
  { label: "General", categories: "100" },
  { label: "Anime", categories: "010" },
  { label: "People", categories: "001" },
];

const SEARCH_DEBOUNCE_MS = 500;

type Status = "loading" | "ready" | "error";

interface BrowseProps {
  platform: ThumbPlatform;
}

export function Browse({ platform }: BrowseProps) {
  const [query, setQuery] = useState("");
  const [chipIndex, setChipIndex] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [activeTile, setActiveTile] = useState(0);
  const requestId = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);

  const search = useCallback(() => {
    const id = ++requestId.current;
    const params = currentParams(debouncedQuery, CHIPS[chipIndex].categories, 1);
    let fresh = false;
    setStatus("loading");
    setError(undefined);
    if (params.query === "" && params.categories === "111" && params.sorting === "toplist") {
      void cachedPage()
        .then((cached) => {
          if (fresh || id !== requestId.current || !cached) return;
          setItems(cached.items);
          setPageNum(cached.page);
          setLastPage(cached.lastPage);
          setStatus("ready");
        })
        .catch(() => undefined);
    }
    void searchWallpapers(params)
      .then((result) => {
        if (id !== requestId.current) return;
        fresh = true;
        setActiveTile(0);
        setItems(result.items);
        setPageNum(result.page);
        setLastPage(result.lastPage);
        setStatus("ready");
        if (result.page < result.lastPage) {
          void prefetchPage({ ...params, page: result.page + 1 });
        }
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        fresh = true;
        setError(errorCopy(err));
        setStatus("error");
      });
  }, [chipIndex, debouncedQuery]);

  useEffect(() => {
    search();
  }, [search]);

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
      searchInputRef.current?.focus();
    }

    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  async function loadMore() {
    const id = requestId.current;
    const params = currentParams(debouncedQuery, CHIPS[chipIndex].categories, pageNum + 1);
    setLoadingMore(true);
    setError(undefined);
    try {
      const result = await searchWallpapers(params);
      if (id !== requestId.current) return;
      setItems((existing) => [...existing, ...result.items]);
      setPageNum(result.page);
      setLastPage(result.lastPage);
      if (result.page < result.lastPage) {
        void prefetchPage({ ...params, page: result.page + 1 });
      }
    } catch (err: unknown) {
      if (id === requestId.current) setError(errorCopy(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="browse">
      <h1 className="visually-hidden">Browse wallpapers</h1>
      <span className="visually-hidden" role="status">
        {status === "loading"
          ? "Searching Wallhaven."
          : status === "ready"
            ? items.length === 0
              ? "No results."
              : `${items.length} wallpapers.`
            : ""}
      </span>

      <input
        ref={searchInputRef}
        type="search"
        className="browse__search"
        aria-label="Search wallpapers"
        placeholder="search wallpapers, press /"
        spellCheck={false}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />

      <div className="browse__chips" role="group" aria-label="Category">
        {CHIPS.map((chip, index) => (
          <button
            key={chip.label}
            aria-pressed={index === chipIndex}
            className={index === chipIndex ? "chip chip--active" : "chip"}
            onClick={() => setChipIndex(index)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {status === "loading" && items.length === 0 && (
        <section className="browse__empty" aria-label="Loading">
          <span className="browse__empty-eyebrow">Browse</span>
          <p className="browse__empty-copy">Fetching from Wallhaven…</p>
        </section>
      )}

      {status === "error" && items.length === 0 && (
        <section className="browse__empty" aria-label="Search failed" role="alert">
          <span className="browse__empty-eyebrow">Problem</span>
          <p className="browse__empty-copy">{error}</p>
          <button className="btn-glass btn-glass--secondary browse__empty-action" onClick={search}>
            Try again
          </button>
        </section>
      )}

      {status === "ready" && items.length === 0 && (
        <section className="browse__empty" aria-label="No results">
          <span className="browse__empty-eyebrow">Browse</span>
          <h1 className="browse__empty-title">No results.</h1>
          <p className="browse__empty-copy">
            Nothing on Wallhaven matches "{debouncedQuery}". Try a broader search.
          </p>
        </section>
      )}

      {items.length > 0 && (
        <div className="browse__scroll">
          <WallpaperGrid
            items={items}
            platform={platform}
            activeTile={activeTile}
            onActiveTile={setActiveTile}
          />
          {error && (
            <p className="browse__more-error" role="alert">
              {error}
            </p>
          )}
          {pageNum < lastPage && (
            <div className="browse__more">
              <button
                className="btn-glass btn-glass--secondary"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function currentParams(query: string, categories: Categories, page: number): SearchParams {
  const sorting: Sorting = query ? "relevance" : "toplist";
  return { query, categories, sorting, page };
}
