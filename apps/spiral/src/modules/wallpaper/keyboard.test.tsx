import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readBoot } from "../../boot";
import { WallpaperGrid } from "./grid";
import { QuickLook } from "./QuickLook";
import { Frame } from "./state";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const items = ["w-a", "w-b", "w-c"].map((id) => ({ id, resolution: "3840x2160" }));

function Harness({ onActive }: { onActive: (index: number) => void }) {
  return (
    <Frame>
      <WallpaperGrid items={items} platform="macos" activeTile={0} onActiveTile={onActive} />
      <QuickLook items={items} platform="macos" onStep={onActive} />
    </Frame>
  );
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string) =>
    cmd === "wallpaper_apply" ? { displays: 1, spaces: "current" } : undefined,
  );
  readBoot({
    version: "2.0.0",
    platform: "macos",
    modules: [
      { id: "wallpaper", enabled: true, available: true, unavailableReason: null },
      { id: "resume", enabled: true, available: true, unavailableReason: null },
    ],
    start: { kind: "module", id: "wallpaper" },
    bench: false,
  });
});

afterEach(cleanup);

describe("wallpaper keyboard", () => {
  it("moves through the grid with the arrow keys, Home and End", () => {
    const onActive = vi.fn();
    render(<Harness onActive={onActive} />);
    const tiles = screen.getAllByRole("button", { name: /Set as wallpaper/ });
    tiles[0]?.focus();
    fireEvent.keyDown(tiles[0] as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tiles[1]);
    expect(onActive).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(tiles[1] as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(tiles[2]);
    fireEvent.keyDown(tiles[2] as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(tiles[0]);
  });

  it("keeps one tile in the tab order", () => {
    render(<Harness onActive={vi.fn()} />);
    const tabbable = screen
      .getAllByRole("button", { name: /Set as wallpaper/ })
      .filter((tile) => tile.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
  });

  it("opens quick look on Space, sets on Return, closes on Esc", async () => {
    render(<Harness onActive={vi.fn()} />);
    const first = screen.getAllByRole("button", { name: /Set as wallpaper/ })[0] as HTMLElement;
    first.focus();
    fireEvent.keyDown(first, { key: " " });
    const look = screen.getByRole("dialog", { name: /Quick look/ });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close quick look" }));

    await act(async () => {
      fireEvent.keyDown(look, { key: "Enter" });
    });
    expect(invoke).toHaveBeenCalledWith("wallpaper_apply", { id: "w-a" });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
