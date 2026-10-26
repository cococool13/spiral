import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { capabilities } from "../../capabilities";
import { useDebounce } from "../../hooks/useDebounce";
import { Button } from "../../ui/Button";
import { cachedPage, prefetchPage, search as searchWallpapers } from "./api";
import { Activity } from "./Activity";
import { errorCopy } from "./errors";
import { WallpaperGrid } from "./grid";
import { fitsDisplay, sizeLabel, stepRecent } from "./library";
import { ApplyTo, ColourSwatches, LiveGallery, SourceChips } from "./live/Parked";
import { QuickLook } from "./QuickLook";
import { CHIPS, useWallpaper } from "./state";
import type { ThumbPlatform } from "./thumbs";
import { thumbSrc } from "./thumbs";
import type { GalleryItem, SearchParams, Sorting } from "./types";

const SEARCH_DEBOUNCE_MS = 500;

type Status = "loading" | "ready" | "error";

interface BrowseProps {
  platform: ThumbPlatform;
}

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function Browse({ platform }: BrowseProps) {
  const wall = useWallpaper();
  const { query, chip, setChip, fits, setFits, display, setVisible, recent, current, apply, log, toast } = wall;
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [activeTile, setActiveTile] = useState(0);
  const [live, setLive] = useState(false);
  const requestId = useRef(0);
  const caps = capabilities();

  const shown = useMemo(
    () => (fits ? items.filter((item) => fitsDisplay(item.resolution, display)) : items),
    [display, fits, items],
  );
  const displayLabel = `${display.width} × ${display.height}`;

  useEffect(() => {
    setVisible(shown);
  }, [setVisible, shown]);

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
          log("Showed the saved first page while Wallhaven answers.");
        })
        .catch(() => undefined);
    }
    log(`Searching wallhaven.cc: ${describe(params)}.`);
    void searchWallpapers(params)
      .then((result) => {
        if (id !== requestId.current) return;
        fresh = true;
        setActiveTile(0);
        setItems(result.items);
        setPageNum(result.page);
        setLastPage(result.lastPage);
        setStatus("ready");
        log(`Wallhaven sent ${result.items.length} wallpapers, page 1 of ${result.lastPage}.`);
        if (result.page < result.lastPage) {
          log(`Fetching page ${result.page + 1} ahead from wallhaven.cc.`);
          void prefetchPage({ ...params, page: result.page + 1 });
        }
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        fresh = true;
        const copy = errorCopy(err);
        setError(copy);
        setStatus("error");
        log(`Search failed. ${copy}`);
      });
  }, [chip, debouncedQuery, log]);

  useEffect(() => {
    search();
  }, [search]);

  // `[` and `]` walk the recent row; Space opens quick look when nothing has focus.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // ⌘Z (Ctrl+Z on Windows) puts back the desktop from before the last change.
      const command = platform === "windows" ? event.ctrlKey : event.metaKey;
      if (command && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z" && !typing(event.target)) {
        event.preventDefault();
        void wall.undo();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || wall.quickLook) return;
      if (event.key === "[" || event.key === "]") {
        const next = stepRecent(recent, current?.id ?? null, event.key);
        if (!next) return;
        event.preventDefault();
        void apply(next, "Recent: downloading");
        return;
      }
      if (event.key === " " && event.target === document.body && shown[activeTile]) {
        event.preventDefault();
        wall.setQuickLook(shown[activeTile].id);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeTile, apply, current, platform, recent, shown, wall]);

  async function loadMore() {
    const id = requestId.current;
    const params = currentParams(debouncedQuery, CHIPS[chip].categories, pageNum + 1);
    setLoadingMore(true);
    setError(undefined);
    log(`Loading page ${params.page} from wallhaven.cc.`);
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
  const hiddenBySize = status === "ready" && items.length > 0 && shown.length === 0;

  return (
    <main className="browse">
      <h1 className="visually-hidden">Wallpaper</h1>
      <span className="visually-hidden" role="status">
        {status === "loading"
          ? "Searching Wallhaven."
          : status === "ready"
            ? shown.length === 0
              ? "No results."
              : `${shown.length} wallpapers.`
            : ""}
      </span>

      <div className="filters">
        <SourceChips />
        <div className="filters__row">
          <div className="chips" role="radiogroup" aria-label="Category">
            {CHIPS.map((item, index) => (
              <button
                key={item.label}
                type="button"
                role="radio"
                className="chip"
                aria-checked={!live && chip === index}
                onClick={() => {
                  setLive(false);
                  setChip(index);
                }}
              >
                {item.label}
              </button>
            ))}
            {caps.liveWallpaper ? (
              <button
                type="button"
                role="radio"
                className="chip"
                aria-checked={live}
                onClick={() => setLive(true)}
              >
                Live
              </button>
            ) : null}
          </div>
          <ColourSwatches />
          <button
            type="button"
            className="chip chip--fit"
            aria-pressed={fits}
            title="Only show wallpapers at least as large as this display"
            onClick={() => setFits(!fits)}
          >
            Fits {displayLabel}
          </button>
        </div>
      </div>

      {live ? (
        <div className="browse__scroll">
          <LiveGallery onClose={() => setLive(false)} />
        </div>
      ) : (
        <div className="browse__scroll">
          {status === "loading" && items.length === 0 ? <div className="grid grid--loading" aria-hidden="true" /> : null}

          {status === "error" && items.length === 0 ? (
            <section className="browse__empty" role="alert">
              <p>{error}</p>
              <Button onClick={search}>Try again</Button>
            </section>
          ) : null}

          {status === "ready" && items.length === 0 ? (
            <section className="browse__empty">
              <p>Nothing on Wallhaven matches “{emptyQuery}”. Try a broader search.</p>
            </section>
          ) : null}

          {hiddenBySize ? (
            <section className="browse__empty">
              <p>Nothing on this page fits {displayLabel}.</p>
              <Button onClick={() => setFits(false)}>Show all sizes</Button>
            </section>
          ) : null}

          {shown.length > 0 ? (
            <WallpaperGrid
              items={shown}
              platform={platform}
              activeTile={activeTile}
              onActiveTile={setActiveTile}
            />
          ) : null}
          {error && items.length > 0 ? (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          ) : null}
          {items.length > 0 && pageNum < lastPage ? (
            <div className="browse__more">
              <Button onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <footer className="dock">
        <div className="dock__recent" role="group" aria-label="Recent" aria-keyshortcuts="[ ]">
          <span className="dock__label" id="recent-label">
            Recent
          </span>
          {recent.length === 0 ? <span className="dock__quiet">Wallpapers you set show here.</span> : null}
          {recent.map((item) => (
            <button
              key={item.id}
              type="button"
              className="recent"
              aria-label={`Set again, ${sizeLabel(item.resolution)}`}
              aria-current={current?.id === item.id || undefined}
              title={sizeLabel(item.resolution)}
              onClick={() => void apply(item, "Recent: downloading")}
            >
              <img src={thumbSrc(item.id, "sm", platform)} alt="" />
            </button>
          ))}
        </div>
        <div className="dock__end">
          <ApplyTo />
          <p className="dock__state">{current ? `On this Space: ${sizeLabel(current.resolution)} from wallhaven.cc` : "Searches go to wallhaven.cc. SFW only."}</p>
          <button
            type="button"
            className="dock__activity"
            aria-expanded={wall.activityOpen}
            onClick={() => wall.setActivityOpen(!wall.activityOpen)}
          >
            Activity
          </button>
        </div>
        <p className="visually-hidden" id="grid-keys">
          Arrow keys move. Return sets the wallpaper. Space opens quick look. Left and right brackets step through recent.
        </p>
      </footer>

      <QuickLook items={shown} platform={platform} onStep={setActiveTile} />
      <Activity />
      {toast ? <Toast /> : null}
    </main>
  );
}

function Toast() {
  const { toast, dismissToast, undo } = useWallpaper();
  useEffect(() => {
    const timer = window.setTimeout(dismissToast, 10000);
    return () => window.clearTimeout(timer);
  }, [dismissToast, toast]);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.undo ? (
        <button type="button" className="toast__undo" aria-keyshortcuts="Meta+Z" onClick={() => void undo()}>
          Undo
        </button>
      ) : null}
    </div>
  );
}

function describe(params: SearchParams): string {
  const category = CHIPS.find((item) => item.categories === params.categories)?.label ?? "All";
  const what = params.query ? `"${params.query}"` : params.sorting === "toplist" ? "top of the month" : "relevance";
  return `${what}, ${category.toLowerCase()}, page ${params.page}`;
}

function currentParams(query: string, categories: SearchParams["categories"], page: number): SearchParams {
  const sorting: Sorting = query ? "relevance" : "toplist";
  return { query, categories, sorting, page };
}
