import { useRef, type KeyboardEvent } from "react";
import { mark } from "../../bench";
import { recordTileDecode } from "./decode";
import { wallhavenPage } from "./library";
import { useWallpaper } from "./state";
import { Tile } from "./Tile";
import type { ThumbPlatform } from "./thumbs";
import type { GalleryItem } from "./types";

interface WallpaperGridProps {
  items: GalleryItem[];
  platform: ThumbPlatform;
  activeTile: number;
  onActiveTile: (index: number) => void;
}

const MOVES = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

/** Keyboard first: arrows move, Return sets, Space opens quick look. */
export function WallpaperGrid({ items, platform, activeTile, onActiveTile }: WallpaperGridProps) {
  const { phase, current, apply, setQuickLook, log } = useWallpaper();
  const seen = useRef(new Set<number>());
  const staged = useRef(new Set<string>());
  const gridRef = useRef<HTMLDivElement>(null);
  const tabbable = Math.min(activeTile, Math.max(items.length - 1, 0));

  function onDecoded(index: number) {
    const next = recordTileDecode(seen.current, index);
    seen.current = next.seen;
    if (next.useful) mark("first_useful_action:wallpaper");
  }

  function onStage(item: GalleryItem) {
    if (staged.current.has(item.id)) return;
    staged.current.add(item.id);
    log(`Fetching ${wallhavenPage(item.id)} ahead, because the pointer rested on it.`);
  }

  function columns(grid: HTMLElement): number {
    const tiles = Array.from(grid.children) as HTMLElement[];
    const top = tiles[0]?.offsetTop;
    return Math.max(1, tiles.filter((tile) => tile.offsetTop === top).length);
  }

  function onGridKeyDown(event: KeyboardEvent) {
    const grid = gridRef.current;
    if (!grid || items.length === 0) return;
    if (event.key === " ") {
      event.preventDefault();
      setQuickLook(items[tabbable]?.id ?? null);
      return;
    }
    if (!MOVES.includes(event.key)) return;
    const buttons = Array.from(grid.querySelectorAll<HTMLButtonElement>(".tile__hit"));
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const now = at < 0 ? tabbable : at;
    const step = columns(grid);
    const last = buttons.length - 1;
    const next =
      event.key === "ArrowLeft"
        ? Math.max(0, now - 1)
        : event.key === "ArrowRight"
          ? Math.min(last, now + 1)
          : event.key === "ArrowUp"
            ? Math.max(0, now - step)
            : event.key === "ArrowDown"
              ? Math.min(last, now + step)
              : event.key === "Home"
                ? 0
                : last;
    event.preventDefault();
    buttons[next]?.focus();
    onActiveTile(next);
  }

  return (
    <div
      className="grid"
      ref={gridRef}
      role="group"
      aria-label="Wallpapers"
      aria-describedby="grid-keys"
      onKeyDown={onGridKeyDown}
    >
      {items.map((item, index) => (
        <Tile
          key={item.id}
          item={item}
          index={index}
          total={items.length}
          tabbable={index === tabbable}
          platform={platform}
          phase={phase?.id === item.id && phase.phase !== "applied" ? phase : null}
          onDesktop={current?.id === item.id}
          onApply={(chosen) => void apply(chosen)}
          onFocus={onActiveTile}
          onStage={onStage}
          onDecoded={onDecoded}
        />
      ))}
    </div>
  );
}
