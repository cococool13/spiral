import { useRef, type KeyboardEvent } from "react";
import { mark } from "../../bench";
import { recordTileDecode } from "./decode";
import { Tile } from "./Tile";
import type { ThumbPlatform } from "./thumbs";
import type { GalleryItem } from "./types";

interface WallpaperGridProps {
  items: GalleryItem[];
  platform: ThumbPlatform;
  activeTile: number;
  onActiveTile: (index: number) => void;
}

export function WallpaperGrid({ items, platform, activeTile, onActiveTile }: WallpaperGridProps) {
  const seen = useRef(new Set<number>());
  const gridRef = useRef<HTMLDivElement>(null);
  const tabbable = Math.min(activeTile, Math.max(items.length - 1, 0));

  function onDecoded(index: number) {
    const next = recordTileDecode(seen.current, index);
    seen.current = next.seen;
    if (next.useful) mark("first_useful_action:wallpaper");
  }

  function onGridKeyDown(event: KeyboardEvent) {
    const handled = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!handled.includes(event.key) || !gridRef.current) return;
    const grid = gridRef.current;
    const buttons = Array.from(grid.querySelectorAll<HTMLButtonElement>(".tile button"));
    if (buttons.length === 0) return;

    const tiles = Array.from(grid.children) as HTMLElement[];
    const firstRowTop = tiles[0]?.offsetTop;
    const columns = Math.max(1, tiles.filter((tile) => tile.offsetTop === firstRowTop).length);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const last = buttons.length - 1;
    let next: number;
    switch (event.key) {
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
    onActiveTile(next);
    event.preventDefault();
  }

  return (
    <div className="browse__grid" ref={gridRef} onKeyDown={onGridKeyDown}>
      {items.map((item, index) => (
        <Tile
          key={item.id}
          item={item}
          index={index}
          total={items.length}
          tabbable={index === tabbable}
          platform={platform}
          onDecoded={onDecoded}
        />
      ))}
    </div>
  );
}
