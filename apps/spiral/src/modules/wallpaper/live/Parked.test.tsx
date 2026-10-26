import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { capabilities, previewing } from "../../../capabilities";
import { Frame } from "../state";
import { ApplyTo } from "./Parked";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

function parked() {
  return render(
    <Frame>
      <ApplyTo />
    </Frame>,
  );
}

afterEach(() => {
  cleanup();
  delete window.__SPIRAL_CAPS__;
});

describe("capability gate", () => {
  it("ships with every native-only feature off, except those whose native half landed", () => {
    const { restoreOriginal, ...parkedCaps } = capabilities();
    expect(restoreOriginal).toBe(true);
    expect(Object.values(parkedCaps).every((on) => on === false)).toBe(true);
    expect(previewing()).toBe(false);
  });

  it("renders nothing that needs native work when the capability is off", () => {
    const view = parked();
    expect(view.container.textContent).toBe("");
    expect(screen.queryByRole("radiogroup", { name: "Apply to" })).toBeNull();
  });

  it("shows the parked controls, tagged Preview, only under the dev override", () => {
    window.__SPIRAL_CAPS__ = { applyPerDisplay: true };
    parked();
    expect(screen.getByRole("radiogroup", { name: "Apply to" })).toBeTruthy();
    expect(screen.getAllByText("Preview").length).toBeGreaterThan(0);
  });
});
