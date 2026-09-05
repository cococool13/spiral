import { useCallback, useEffect, useRef, useState } from "react";
import { WallpaperTile } from "../components/WallpaperTile";
import { useDebounce } from "../hooks/useDebounce";
import { errorCopy, search as searchWallpapers } from "../sources";
import type { Wallpaper } from "../sources/types";

const CHIPS = [
  { label: "Toplist", categories: "111" },
  { label: "General", categories: "100" },
  { label: "Anime", categories: "010" },
  { label: "People", categories: "001" },
] as const;

// Wallhaven allows ~45 requests/minute — debounce typing well below that.
const SEARCH_DEBOUNCE_MS = 500;

type Status = "idle" | "loading" | "ready" | "error";

export function Browse() {
  const [query, setQuery] = useState("");
  const [chipIndex, setChipIndex] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [items, setItems] = useState<Wallpaper[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  // First-run already said Wallhaven would be reached. Opening Browse is the
  // act; an empty window is not the errand.
  const [touched, setTouched] = useState(true);
  const requestId = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Roving tabindex: only this tile is in the tab order.
  const [activeTile, setActiveTile] = useState(0);

  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const gridRef = useRef<HTMLDivElement>(null);

  // Arrow-key navigation between tiles (Enter activates natively). The grid is
  // a composite widget, so it takes one Tab stop and the arrows move inside it
  // — without the roving index every tile was its own stop and reaching "Load
  // more" cost one press per result.
  function onGridKeyDown(e: React.KeyboardEvent) {
    const handled = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!handled.includes(e.key) || !gridRef.current) return;
    const grid = gridRef.current;
    const buttons = Array.from(grid.querySelectorAll<HTMLButtonElement>(".tile button"));
    if (buttons.length === 0) return;

    const tiles = Array.from(grid.children) as HTMLElement[];
    const firstRowTop = tiles[0]?.offsetTop;
    const columns = Math.max(1, tiles.filter((t) => t.offsetTop === firstRowTop).length);

    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const last = buttons.length - 1;
    let next: number;
    switch (e.key) {
      case "ArrowLeft":
        next = Math.max(0, current - 1);
        break;
      case "ArrowRight":
        next = Math.min(last, current + 1);
        break;
      case "ArrowUp":
        next = Math.max(0, current - columns);
        break;
      case "ArrowDown":
        next = Math.min(last, current < 0 ? 0 : current + columns);
        break;
      case "Home":
        next = 0;
        break;
      default:
        next = last;
    }
    buttons[next]?.focus();
    setActiveTile(next);
    e.preventDefault();
  }

  const search = useCallback(() => {
    const id = ++requestId.current;
    setStatus("loading");
    setError(undefined);
    searchWallpapers({
      query: debouncedQuery,
      categories: CHIPS[chipIndex].categories,
      sorting: debouncedQuery ? "relevance" : "toplist",
      page: 1,
    })
      .then((result) => {
        if (id !== requestId.current) return;
        setActiveTile(0); // a fresh result set starts its tab stop at the top
        setItems(result.items);
        setPageNum(result.page);
        setLastPage(result.lastPage);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(errorCopy(e));
        setStatus("error");
      });
  }, [chipIndex, debouncedQuery]);

  useEffect(() => {
    if (!touched) return;
    search();
  }, [search, touched]);

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
    setLoadingMore(true);
    setError(undefined);
    try {
      const result = await searchWallpapers({
        query: debouncedQuery,
        categories: CHIPS[chipIndex].categories,
        sorting: debouncedQuery ? "relevance" : "toplist",
        page: pageNum + 1,
      });
      if (id !== requestId.current) return; // a new search superseded this
      setItems((existing) => [...existing, ...result.items]);
      setPageNum(result.page);
      setLastPage(result.lastPage);
    } catch (e: unknown) {
      if (id === requestId.current) setError(errorCopy(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="browse">
      {/* Every screen needs a top-level heading. The only h1 used to live
          inside the empty state, so once results arrived the view had none. */}
      <h1 className="visually-hidden">Browse wallpapers</h1>

      {/* A stable region, mounted before it has anything to say, so repeated
          polite updates announce reliably. Results used to arrive in silence:
          only the failure case had a role. */}
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
        placeholder="search wallpapers — press /"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          setTouched(true);
        }}
      />

      {/* Same one-of-N control as Settings' segmented group, and now stated
          the same way: the selected chip was previously visual only. */}
      <div className="browse__chips" role="group" aria-label="Category">
        {CHIPS.map((chip, i) => (
          <button
            key={chip.label}
            aria-pressed={i === chipIndex}
            className={i === chipIndex ? "chip chip--active" : "chip"}
            onClick={() => {
              setChipIndex(i);
              setTouched(true);
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {status === "idle" && (
        <section className="browse__empty" aria-label="No wallpapers loaded">
          <span className="browse__empty-eyebrow">Browse</span>
          <h1 className="browse__empty-title">Nothing loaded yet.</h1>
          <p className="browse__empty-copy">
            Search, or pick a category. Wallhaven is reached only when you act.
            A named GitHub update check may already have run on open — see Settings.
          </p>
        </section>
      )}

      {status === "loading" && (
        <section className="browse__empty" aria-label="Loading">
          <span className="browse__empty-eyebrow">Browse</span>
          <p className="browse__empty-copy">Fetching from Wallhaven…</p>
        </section>
      )}

      {status === "error" && (
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
            Nothing on Wallhaven matches “{debouncedQuery}”. Try a broader
            search.
          </p>
        </section>
      )}

      {status === "ready" && items.length > 0 && (
        <div className="browse__scroll">
          {/* No role="list": the children are figures, not listitems, so the
              grid announced as a list containing nothing. Arrow keys already
              make this a composite widget rather than a list. */}
          <div className="browse__grid" ref={gridRef} onKeyDown={onGridKeyDown}>
            {items.map((wallpaper, i) => (
              <WallpaperTile
                key={wallpaper.id}
                wallpaper={wallpaper}
                tabbable={i === Math.min(activeTile, items.length - 1)}
                position={i + 1}
                total={items.length}
              />
            ))}
          </div>
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
