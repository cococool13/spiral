import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootState } from "../../boot";
import type { GalleryItem } from "./types";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

const boot = (bench: boolean): BootState => ({
  version: "2.0.0",
  platform: "macos",
  modules: [
    { id: "wallpaper", enabled: true, available: true, unavailableReason: null },
    { id: "resume", enabled: true, available: true, unavailableReason: null },
  ],
  start: { kind: "module", id: "wallpaper" },
  bench,
});

function tiles(count: number): GalleryItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `w-t${index}`,
    resolution: "1920x1080",
  }));
}

async function loadGrid() {
  vi.resetModules();
  const bootMod = await import("../../boot");
  const grid = await import("./grid");
  return { readBoot: bootMod.readBoot, WallpaperGrid: grid.WallpaperGrid };
}

async function decodeAt(index: number) {
  const img = document.querySelectorAll("img")[index];
  fireEvent.load(img);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: () => Promise.resolve(),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("wallpaper grid", () => {
  it("does not mark the 12th tile when the bench is off", async () => {
    const { readBoot, WallpaperGrid } = await loadGrid();
    readBoot(boot(false));
    render(
      <WallpaperGrid items={tiles(12)} platform="macos" activeTile={0} onActiveTile={() => undefined} />,
    );
    for (let index = 0; index < 12; index += 1) {
      await decodeAt(index);
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("marks first_useful_action:wallpaper when the 12th visible tile decodes", async () => {
    const { readBoot, WallpaperGrid } = await loadGrid();
    readBoot(boot(true));
    render(
      <WallpaperGrid items={tiles(12)} platform="macos" activeTile={0} onActiveTile={() => undefined} />,
    );
    for (let index = 0; index < 11; index += 1) {
      await decodeAt(index);
    }
    expect(invoke).not.toHaveBeenCalled();
    await decodeAt(11);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("bench_mark", { mark: "first_useful_action:wallpaper" });
  });

  it("shows On this Space after apply", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "wallpaper_apply") return { displays: 1, spaces: "current" };
      return undefined;
    });
    const { readBoot, WallpaperGrid } = await loadGrid();
    readBoot(boot(false));
    render(
      <WallpaperGrid items={tiles(1)} platform="macos" activeTile={0} onActiveTile={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Apply wallpaper/ }));
    expect((await screen.findAllByText("On this Space")).length).toBeGreaterThan(0);
    expect(invoke).toHaveBeenCalledWith("wallpaper_apply", { id: "w-t0" });
  });

  it("names the screen when apply fails", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "wallpaper_apply") throw "apply_failed:Studio Display";
      return undefined;
    });
    const { readBoot, WallpaperGrid } = await loadGrid();
    readBoot(boot(false));
    render(
      <WallpaperGrid items={tiles(1)} platform="macos" activeTile={0} onActiveTile={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Apply wallpaper/ }));
    const copy =
      "The image downloaded. It couldn't be set on Studio Display. Restart Spiral, then try again.";
    expect((await screen.findAllByText(copy)).length).toBeGreaterThan(0);
  });

  it("stages the full image after a 250 ms hover", async () => {
    vi.useFakeTimers();
    const { readBoot, WallpaperGrid } = await loadGrid();
    readBoot(boot(false));
    render(
      <WallpaperGrid items={tiles(1)} platform="macos" activeTile={0} onActiveTile={() => undefined} />,
    );
    fireEvent.mouseEnter(screen.getByRole("figure"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(249);
    });
    expect(invoke).not.toHaveBeenCalledWith("wallpaper_stage_full", { id: "w-t0" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(invoke).toHaveBeenCalledWith("wallpaper_stage_full", { id: "w-t0" });
  });
});
