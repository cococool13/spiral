import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { noteWallpaperApplied } from "../../shell/analytics/client";
import { apply as applyWallpaper } from "./api";
import { errorCopy } from "./errors";
import { addRecent, displayPixels, pickSurprise, readRecent, sizeLabel, wallhavenPage, writeRecent, type DisplayPixels } from "./library";
import type { Categories, GalleryItem } from "./types";

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
  undo?: GalleryItem;
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
  current: GalleryItem | null;
  phase: ApplyPhase | null;
  apply: (item: GalleryItem, why?: string) => Promise<void>;
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

export function Frame({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [fits, setFits] = useState(true);
  const [visible, setVisible] = useState<GalleryItem[]>([]);
  const [recent, setRecent] = useState<GalleryItem[]>(() => readRecent());
  const [current, setCurrent] = useState<GalleryItem | null>(null);
  const [phase, setPhase] = useState<ApplyPhase | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
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

  const log = useCallback((text: string) => {
    serial.current += 1;
    const entry = { id: serial.current, at: new Date(), text };
    setActivity((all) => [entry, ...all].slice(0, 80));
  }, []);

  const apply = useCallback(
    async (item: GalleryItem, why?: string) => {
      if (busy.current) return;
      busy.current = true;
      const previous = currentRef.current;
      setPhase({ id: item.id, phase: "applying" });
      setToast(null);
      log(`${why ?? "Downloading"} ${wallhavenPage(item.id)} (${sizeLabel(item.resolution)}).`);
      try {
        const done = await applyWallpaper(item.id);
        const where = done.displays === 1 ? "1 display" : `${done.displays} displays`;
        setPhase({ id: item.id, phase: "applied" });
        setCurrent(item);
        setRecent((list) => {
          const next = addRecent(list, item);
          writeRecent(next);
          return next;
        });
        noteWallpaperApplied();
        log(`Set ${wallhavenPage(item.id)} on ${where}, this Space.`);
        setToast({
          text: `Set on ${where}.`,
          undo: previous && previous.id !== item.id ? previous : undefined,
        });
      } catch (err: unknown) {
        const copy = errorCopy(err);
        setPhase({ id: item.id, phase: "error", error: copy });
        log(`Did not set ${wallhavenPage(item.id)}. ${copy}`);
      } finally {
        busy.current = false;
      }
    },
    [log],
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
      current,
      phase,
      apply,
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
    [query, chip, searchOpen, fits, display, visible, recent, current, phase, apply, surprise, toast, dismissToast, activity, log, activityOpen, quickLook],
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
