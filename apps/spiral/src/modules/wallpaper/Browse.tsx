import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../ui/Button";
import { useDebounce } from "../../hooks/useDebounce";
import { cachedPage, prefetchPage, search as searchWallpapers } from "./api";
import { errorCopy } from "./errors";
import { WallpaperGrid } from "./grid";
import { CHIPS, useSearch } from "./state";
import type { ThumbPlatform } from "./thumbs";
import type { GalleryItem, SearchParams, Sorting } from "./types";

const SEARCH_DEBOUNCE_MS = 500;

type Status = "loading" | "ready" | "error";

interface BrowseProps {
  platform: ThumbPlatform;
}

export function Browse({ platform }: BrowseProps) {
  const { query, chip } = useSearch();
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [activeTile, setActiveTile] = useState(0);
  const requestId = useRef(0);

  const search = useCallback(() => {
    const id = ++requestId.current;
    const params = currentParams(debouncedQuery, CHIPS[chip].categories, 1);
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
  }, [chip, debouncedQuery]);

  useEffect(() => {
    search();
  }, [search]);

  async function loadMore() {
    const id = requestId.current;
    const params = currentParams(debouncedQuery, CHIPS[chip].categories, pageNum + 1);
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

  const emptyQuery = debouncedQuery.length > 0 ? debouncedQuery : query;

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

      {status === "error" && items.length === 0 && (
        <section className="browse__empty" role="alert">
          <p>{error}</p>
          <Button onClick={search}>Try again</Button>
        </section>
      )}

      {status === "ready" && items.length === 0 && (
        <section className="browse__empty">
          <p>Nothing on Wallhaven matches "{emptyQuery}". Try a broader search.</p>
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
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}
          {pageNum < lastPage && (
            <div className="browse__more">
              <Button onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function currentParams(query: string, categories: SearchParams["categories"], page: number): SearchParams {
  const sorting: Sorting = query ? "relevance" : "toplist";
  return { query, categories, sorting, page };
}
