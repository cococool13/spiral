import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { noteWallpaperApplied } from "../../shell/analytics/client";
import {
  apply as applyWallpaper,
  history as readHistory,
  recent as readRecent,
  restoreOriginal as restoreOriginalWallpaper,
  undo as undoWallpaper,
} from "./api";
import { errorCopy } from "./errors";
import { addRecent, displayPixels, forgetWebviewRecent, pickSurprise, sizeLabel, itemPage, type DisplayPixels } from "./library";
import type { Categories, GalleryItem, HistoryView, Restored } from "./types";

export const CHIPS: { label: string; categories: Categories }[] = [
  { label: "All", categories: "111" },
  { label: "General", categories: "100" },
  { label: "Anime", categories: "010" },
  { label: "People", categories: "001" },
];

export interface ActivityEntry {
  id: number;
  at: Date;
  text: string;
}

export interface ApplyPhase {
  id: string;
  phase: "applying" | "applied" | "error";
  error?: string;
}

export interface Toast {
  text: string;
  /** Offer the native undo, which puts back the desktop from before the last change. */
  undo?: boolean;
}

interface WallpaperState {
  query: string;
  setQuery: (query: string) => void;
  chip: number;
  setChip: (chip: number) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  fits: boolean;
  setFits: (fits: boolean) => void;
  display: DisplayPixels;
  /** What the grid shows right now, so the dome can pick from it. */
  visible: GalleryItem[];
  setVisible: (items: GalleryItem[]) => void;
  recent: GalleryItem[];
  /** Reads the recent row Rust kept across launches. */
  loadRecent: () => Promise<void>;
  current: GalleryItem | null;
  phase: ApplyPhase | null;
  apply: (item: GalleryItem, why?: string) => Promise<void>;
  undo: () => Promise<void>;
  restoreOriginal: () => Promise<void>;
  history: HistoryView | null;
  loadHistory: () => Promise<void>;
  surprise: () => void;
  toast: Toast | null;
  dismissToast: () => void;
  activity: ActivityEntry[];
  log: (text: string) => void;
  activityOpen: boolean;
  setActivityOpen: (open: boolean) => void;
  quickLook: string | null;
  setQuickLook: (id: string | null) => void;
}

const WallpaperContext = createContext<WallpaperState | null>(null);

function displaysLabel(count: number): string {
  return count === 1 ? "1 display" : `${count} displays`;
}

function missingNote(restored: Restored): string {
  if (restored.missing.length === 0) return "";
  return ` ${restored.missing.join(", ")} is no longer on this computer, so that screen was left as it was.`;
}

export function Frame({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [fits, setFits] = useState(true);
  const [visible, setVisible] = useState<GalleryItem[]>([]);
  const [recent, setRecent] = useState<GalleryItem[]>([]);
  const [current, setCurrent] = useState<GalleryItem | null>(null);
  const [phase, setPhase] = useState<ApplyPhase | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [history, setHistory] = useState<HistoryView | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [quickLook, setQuickLook] = useState<string | null>(null);
  const display = useMemo(displayPixels, []);
  const serial = useRef(0);
  const busy = useRef(false);
  const currentRef = useRef(current);
  currentRef.current = current;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const recentRef = useRef(recent);
  recentRef.current = recent;

  const log = useCallback((text: string) => {
    serial.current += 1;
    const entry = { id: serial.current, at: new Date(), text };
    setActivity((all) => [entry, ...all].slice(0, 80));
  }, []);

  const loadRecent = useCallback(async () => {
    forgetWebviewRecent();
    try {
      setRecent(await readRecent());
    } catch {
      // Recent is a convenience. A row that cannot be read stays empty.
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await readHistory());
    } catch {
      setHistory(null);
    }
  }, []);

  const apply = useCallback(
    async (item: GalleryItem, why?: string) => {
      if (busy.current) return;
      busy.current = true;
      setPhase({ id: item.id, phase: "applying" });
      setToast(null);
      log(`${why ?? "Downloading"} ${itemPage(item)} (${sizeLabel(item.resolution)}).`);
      try {
        const done = await applyWallpaper(item.id);
        const where = displaysLabel(done.displays);
        setPhase({ id: item.id, phase: "applied" });
        setCurrent(item);
        setRecent((list) => addRecent(list, item));
        noteWallpaperApplied();
        log(`Set ${itemPage(item)} on ${where}, this Space.${item.credit ? ` ${item.credit.line}. ${item.credit.licence}.` : ""} The previous wallpaper is kept for undo.`);
        setToast({ text: `Set on ${where}.`, undo: true });
      } catch (err: unknown) {
        const copy = errorCopy(err);
        setPhase({ id: item.id, phase: "error", error: copy });
        log(`Did not set ${itemPage(item)}. ${copy}`);
      } finally {
        busy.current = false;
      }
    },
    [log],
  );

  /** Runs one undo or restore, then says what changed in the toast and the log. */
  const putBack = useCallback(
    async (start: string, work: () => Promise<Restored>, done: (restored: Restored) => string) => {
      if (busy.current) return;
      busy.current = true;
      setToast(null);
      log(start);
      try {
        const restored = await work();
        const item = restored.current ? recentRef.current.find((entry) => entry.id === restored.current) : undefined;
        setCurrent(item ?? null);
        setPhase(null);
        const text = `${done(restored)}${missingNote(restored)}`;
        log(text);
        // Undo walks further back; after a restore it brings Spiral's wallpaper back.
        setToast({ text, undo: true });
      } catch (err: unknown) {
        const copy = errorCopy(err);
        log(copy);
        setToast({ text: copy });
      } finally {
        busy.current = false;
        void loadHistory();
      }
    },
    [loadHistory, log],
  );

  const undo = useCallback(
    () =>
      putBack(
        "Undo: putting back the wallpaper from before the last change. Nothing is downloaded.",
        undoWallpaper,
        (restored) => `Put back the previous wallpaper on ${displaysLabel(restored.displays)}.`,
      ),
    [putBack],
  );

  const restoreOriginal = useCallback(
    () =>
      putBack(
        "Putting back your own wallpaper from before Spiral changed it. Nothing is downloaded.",
        restoreOriginalWallpaper,
        (restored) => `Your own wallpaper is back on ${displaysLabel(restored.displays)}.`,
      ),
    [putBack],
  );

  const dismissToast = useCallback(() => setToast(null), []);

  const surprise = useCallback(() => {
    const pick = pickSurprise(visibleRef.current, currentRef.current?.id ?? null);
    if (pick) void apply(pick, "Surprise: downloading");
  }, [apply]);

  const value = useMemo<WallpaperState>(
    () => ({
      query,
      setQuery,
      chip,
      setChip,
      searchOpen,
      setSearchOpen,
      fits,
      setFits,
      display,
      visible,
      setVisible,
      recent,
      loadRecent,
      current,
      phase,
      apply,
      undo,
      restoreOriginal,
      history,
      loadHistory,
      surprise,
      toast,
      dismissToast,
      activity,
      log,
      activityOpen,
      setActivityOpen,
      quickLook,
      setQuickLook,
    }),
    [query, chip, searchOpen, fits, display, visible, recent, loadRecent, current, phase, apply, undo, restoreOriginal, history, loadHistory, surprise, toast, dismissToast, activity, log, activityOpen, quickLook],
  );
  return <WallpaperContext.Provider value={value}>{children}</WallpaperContext.Provider>;
}

export function useWallpaper(): WallpaperState {
  const value = useContext(WallpaperContext);
  if (!value) {
    throw new Error("Wallpaper state is missing.");
  }
  return value;
}
