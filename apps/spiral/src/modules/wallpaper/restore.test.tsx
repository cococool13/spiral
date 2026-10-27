import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Activity } from "./Activity";
import { Frame, useWallpaper } from "./state";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function Harness() {
  const wall = useWallpaper();
  return (
    <>
      <button type="button" onClick={() => void wall.apply({ id: "w-a", resolution: "3840x2160" })}>
        Set
      </button>
      <button type="button" onClick={() => void wall.undo()}>
        Undo
      </button>
      <button type="button" onClick={() => wall.setActivityOpen(true)}>
        Open activity
      </button>
      <p data-testid="toast">{wall.toast?.text ?? ""}</p>
      <p data-testid="current">{wall.current?.id ?? "none"}</p>
      <Activity />
    </>
  );
}

function setup(answers: Record<string, unknown>) {
  invoke.mockImplementation(async (cmd: string) => {
    const answer = answers[cmd];
    if (answer instanceof Error) throw answer.message;
    return answer;
  });
  render(
    <Frame>
      <Harness />
    </Frame>,
  );
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => invoke.mockReset());
afterEach(cleanup);

describe("undo and restore", () => {
  it("undo uses the native undo and says what came back", async () => {
    setup({
      wallpaper_apply: { displays: 2, spaces: "current" },
      wallpaper_undo: { displays: 2, missing: [], current: null },
      wallpaper_history: { supported: true, undo: 0, original: null },
    });
    await click("Set");
    expect(screen.getByTestId("toast").textContent).toBe("Set on 2 displays.");
    await click("Undo");
    expect(invoke).toHaveBeenCalledWith("wallpaper_undo");
    expect(screen.getByTestId("toast").textContent).toBe("Put back the previous wallpaper on 2 displays.");
    expect(screen.getByTestId("current").textContent).toBe("none");
  });

  it("names a missing file and the next step", async () => {
    setup({
      wallpaper_undo: new Error("restore_missing:beach.jpg"),
      wallpaper_history: { supported: true, undo: 0, original: null },
    });
    await click("Undo");
    expect(screen.getByTestId("toast").textContent).toBe(
      "beach.jpg is no longer on this computer, so Spiral could not put it back. Choose a picture in your system's wallpaper settings instead.",
    );
  });

  it("offers Restore my original wallpaper in the activity panel", async () => {
    setup({
      wallpaper_history: { supported: true, undo: 3, original: { name: "Sonoma.heic", exists: true } },
      wallpaper_restore_original: { displays: 1, missing: [], current: null },
    });
    await click("Open activity");
    await click("Restore my original wallpaper");
    expect(invoke).toHaveBeenCalledWith("wallpaper_restore_original");
    expect(screen.getByTestId("toast").textContent).toBe("Your own wallpaper is back on 1 display.");
  });

  it("says plainly when the original file is gone, and offers no button", async () => {
    setup({ wallpaper_history: { supported: true, undo: 1, original: { name: "Sonoma.heic", exists: false } } });
    await click("Open activity");
    expect(screen.getByText(/Sonoma.heic is no longer on this computer/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore my original wallpaper" })).toBeNull();
  });

  it("hides the control where the desktop cannot be read", async () => {
    setup({ wallpaper_history: { supported: false, undo: 0, original: null } });
    await click("Open activity");
    expect(screen.queryByText("Your own wallpaper")).toBeNull();
  });
});
