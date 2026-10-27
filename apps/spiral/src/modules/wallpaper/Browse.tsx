import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { capabilities } from "../../capabilities";
import { useDebounce } from "../../hooks/useDebounce";
import { Button } from "../../ui/Button";
import { cachedPage, displaysList, prefetchPage, search as searchWallpapers, sourcesList } from "./api";
import { Activity } from "./Activity";
import { errorCopy } from "./errors";
import { SkeletonGrid, WallpaperGrid } from "./grid";
import { fitsDisplay, itemPage, sizeLabel, stepRecent, type DisplayPixels } from "./library";
import { ApplyTo, LiveGallery } from "./live/Parked";
import { QuickLook } from "./QuickLook";
import { PaletteSwatches, SourceFilterChips, SourceIntro } from "./Sources";
import {
  errorSource,
  filterChip,
  needsIntro,
  readIntroduced,
  sourceName,
  writeIntroduced,
  type FilterChip,
} from "./catalog";
import { CHIPS, useWallpaper } from "./state";
import type { ThumbPlatform } from "./thumbs";
import { thumbSrc } from "./thumbs";
import type { Categories, GalleryItem, SearchParams, SourceFilter, SourceInfo, Sorting } from "./types";

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
  const [source, setSource] = useState<SourceFilter>("wallhaven");
  const [colour, setColour] = useState<string | null>(null);
  const [infos, setInfos] = useState<SourceInfo[]>([]);
  const [largest, setLargest] = useState<DisplayPixels | null>(null);
  const [introduced, setIntroduced] = useState(() => readIntroduced());
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const requestId = useRef(0);
  const caps = capabilities();
  const filter = filterChip(source);
  const pendingIntro = needsIntro(filter, introduced);
  const asking = errorSource(filter, infos);
  const infosRef = useRef(infos);
  infosRef.current = infos;

  useEffect(() => {
    void sourcesList()
      .then(setInfos)
      .catch(() => undefined);
    void displaysList()
      .then((list) => {
        const best = list.reduce<DisplayPixels | null>(
          (top, entry) => (!top || entry.width * entry.height > top.width * top.height ? entry : top),
          null,
        );
        if (best) setLargest({ width: best.width, height: best.height });
      })
      .catch(() => undefined);
  }, []);

  const target = largest ?? display;
  const shown = useMemo(
    () => (fits ? items.filter((item) => fitsDisplay(item.resolution, target)) : items),
    [target, fits, items],
  );
  const displayLabel = `${target.width} × ${target.height}`;
  const categories: Categories = source === "wallhaven" ? CHIPS[chip].categories : "111";
  const colours = source === "wallhaven" ? (colour ?? undefined) : undefined;

  useEffect(() => {
    setVisible(shown);
  }, [setVisible, shown]);

  const search = useCallback(() => {
    const id = ++requestId.current;
    if (pendingIntro.length > 0) {
      // Nothing is asked until the person continues; the intro card shows
      // instead of the grid, and the skeleton takes over on Continue.
      setItems([]);
      setStatus("loading");
      return;
    }
    const params = currentParams(debouncedQuery, categories, 1, source, colours, fits);
    let fresh = false;
    setStatus("loading");
    setError(undefined);
    setUnavailable([]);
    if (
      params.source === "wallhaven" &&
      !params.colors &&
      params.query === "" &&
      params.categories === "111" &&
      params.sorting === "toplist"
    ) {
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
    log(`Searching ${hostsFor(filter, infosRef.current)}: ${describe(params)}.`);
    void searchWallpapers(params)
      .then((result) => {
        if (id !== requestId.current) return;
        fresh = true;
        setActiveTile(0);
        setItems(result.items);
        setPageNum(result.page);
        setLastPage(result.lastPage);
        setUnavailable(result.unavailable);
        setStatus("ready");
        log(`${capital(errorSource(filter, infosRef.current))} sent ${result.items.length} wallpapers, page 1 of ${result.lastPage}.`);
        if (result.unavailable.length > 0) {
          log(`${namesOf(result.unavailable, infosRef.current)} did not answer this time.`);
        }
        if (params.source === "wallhaven" && result.page < result.lastPage) {
          log(`Fetching page ${result.page + 1} ahead from wallhaven.cc.`);
          void prefetchPage({ ...params, page: result.page + 1 });
        }
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        fresh = true;
        const copy = errorCopy(err, capital(errorSource(filter, infosRef.current)));
        setError(copy);
        setStatus("error");
        log(`Search failed. ${copy}`);
      });
    // `pendingIntro` is derived from `filter` and `introduced`; its length is enough.
  }, [categories, colours, debouncedQuery, filter, fits, log, pendingIntro.length, source]);

  useEffect(() => {
    search();
  }, [search]);

  function continueIntro() {
    const next = new Set(introduced);
    for (const id of pendingIntro) next.add(id);
    writeIntroduced(next);
    setIntroduced(next);
  }

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
    const params = currentParams(debouncedQuery, categories, pageNum + 1, source, colours, fits);
    setLoadingMore(true);
    setError(undefined);
    log(`Loading page ${params.page} from ${hostsFor(filter, infos)}.`);
    try {
      const result = await searchWallpapers(params);
      if (id !== requestId.current) return;
      setItems((existing) => {
        const seen = new Set(existing.map((item) => item.id));
        return [...existing, ...result.items.filter((item) => !seen.has(item.id))];
      });
      setPageNum(result.page);
      setLastPage(result.lastPage);
      setUnavailable(result.unavailable);
      if (params.source === "wallhaven" && result.page < result.lastPage) {
        void prefetchPage({ ...params, page: result.page + 1 });
      }
    } catch (err: unknown) {
      if (id === requestId.current) setError(errorCopy(err, capital(asking)));
    } finally {
      setLoadingMore(false);
    }
  }

  function pickSource(next: SourceFilter) {
    if (next === source) return;
    requestId.current += 1;
    setLive(false);
    setItems([]);
    setActiveTile(0);
    setSource(next);
  }

  const emptyQuery = debouncedQuery.length > 0 ? debouncedQuery : query;
  const hiddenBySize = status === "ready" && items.length > 0 && shown.length === 0;
  const introducing = !live && pendingIntro.length > 0;

  return (
    <main className="browse">
      <h1 className="visually-hidden">Wallpaper</h1>
      <span className="visually-hidden" role="status">
        {status === "loading"
          ? `Searching ${asking}.`
          : status === "ready" && !introducing
            ? shown.length === 0
              ? "No results."
              : `${shown.length} wallpapers.`
            : ""}
      </span>

      <div className="filters">
        <SourceFilterChips value={source} onChange={pickSource} />
        <div className="filters__row">
          {source === "wallhaven" || caps.liveWallpaper ? (
          <div className="chips" role="radiogroup" aria-label="Category">
            {(source === "wallhaven" ? CHIPS : []).map((item, index) => (
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
          ) : null}
          {source === "wallhaven" && !live ? <PaletteSwatches value={colour} onChange={setColour} /> : null}
          <button
            type="button"
            className="chip chip--fit"
            aria-pressed={fits}
            title="Ask sources only for wallpapers at least as large as your largest display"
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
          {introducing ? (
            <SourceIntro
              ids={pendingIntro}
              infos={infos}
              onContinue={continueIntro}
              onBack={() => pickSource("wallhaven")}
            />
          ) : null}

          {status === "loading" && items.length === 0 && !introducing ? <SkeletonGrid /> : null}

          {status === "error" && items.length === 0 ? (
            <section className="browse__empty" role="alert">
              <p>{error}</p>
              <Button onClick={search}>Try again</Button>
            </section>
          ) : null}

          {status === "ready" && items.length === 0 && !introducing ? (
            <section className="browse__empty">
              <p>
                {emptyQuery
                  ? `Nothing on ${capital(asking)} matches “${emptyQuery}”. Try a broader search.`
                  : `${capital(asking)} had nothing at wallpaper size on this page.`}
              </p>
            </section>
          ) : null}

          {unavailable.length > 0 && items.length > 0 ? (
            <p className="notice" role="status">
              {namesOf(unavailable, infos)} did not answer this time. Showing the others.
            </p>
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
          <p className="dock__state">{current ? `On this Space: ${sizeLabel(current.resolution)}, ${current.credit ? current.credit.line : itemPage(current)}` : source === "wallhaven" ? "Searches go to wallhaven.cc. SFW only." : `Searches go to ${hostsFor(filter, infos)}.`}</p>
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
  const what = params.query ? `"${params.query}"` : params.sorting === "toplist" ? "top picks" : "relevance";
  const parts = [what];
  if (params.source === "wallhaven") {
    const category = CHIPS.find((item) => item.categories === params.categories)?.label ?? "All";
    parts.push(category.toLowerCase());
    if (params.colors) parts.push(`colour ${params.colors}`);
  }
  if (params.fit) parts.push("display size or larger");
  parts.push(`page ${params.page}`);
  return parts.join(", ");
}

function currentParams(
  query: string,
  categories: Categories,
  page: number,
  source: SourceFilter,
  colors: string | undefined,
  fit: boolean,
): SearchParams {
  const sorting: Sorting = query ? "relevance" : "toplist";
  const params: SearchParams = { query, categories, sorting, page, source, fit };
  if (colors) params.colors = colors;
  return params;
}

/** The hosts behind a chip, as a person would read them. */
function hostsFor(chip: FilterChip, infos: SourceInfo[]): string {
  const hosts = chip.members.flatMap((id) => infos.find((info) => info.id === id)?.hosts.slice(0, 1) ?? []);
  return hosts.length > 0 ? hosts.join(", ") : chip.label;
}

function namesOf(ids: string[], infos: SourceInfo[]): string {
  return ids.map((id) => sourceName(id, infos)).join(", ");
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

