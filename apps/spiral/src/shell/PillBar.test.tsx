import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModuleState } from "../boot";
import { PillBar } from "./PillBar";

const modules: ModuleState[] = [
  { id: "wallpaper", enabled: true, available: true, unavailableReason: null },
  { id: "resume", enabled: true, available: true, unavailableReason: null },
];

afterEach(cleanup);

function bar(onSelect = vi.fn(), current: "wallpaper" | "resume" = "wallpaper") {
  render(
    <PillBar
      modules={modules}
      enabled={["wallpaper", "resume"]}
      current={current}
      settingsOn={false}
      tools={null}
      dome={null}
      update={null}
      onSelect={onSelect}
      onSettings={vi.fn()}
    />,
  );
  return onSelect;
}

describe("PillBar", () => {
  it("is one labelled nav with a tab per tool", () => {
    bar();
    expect(screen.getByRole("navigation", { name: "Spiral" })).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Wallpaper", "Resume"]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.getAttribute("aria-keyshortcuts")).toBe("Meta+1");
  });

  it("moves between tools with the arrow keys and wraps", () => {
    const onSelect = bar();
    const [wallpaper] = screen.getAllByRole("tab");
    fireEvent.keyDown(wallpaper as HTMLElement, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("resume");
    fireEvent.keyDown(wallpaper as HTMLElement, { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith("resume");
  });

  it("names its icon-only buttons", () => {
    bar();
    expect(screen.getByRole("button", { name: "Settings" }).getAttribute("aria-keyshortcuts")).toBe("Meta+,");
  });
});
