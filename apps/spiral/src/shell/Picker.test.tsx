import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleId, ModuleState } from "../boot";
import { Picker } from "./Picker";

function moduleState(id: ModuleId, available = true, reason: string | null = null): ModuleState {
  return { id, enabled: false, available, unavailableReason: reason };
}

function motion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function renderPicker(resume = moduleState("resume"), preselect: ModuleId[] = []) {
  const onContinue = vi.fn();
  render(
    <Picker
      wallpaper={moduleState("wallpaper")}
      resume={resume}
      preselect={preselect}
      painted={false}
      busy={false}
      error={null}
      onContinue={onContinue}
    />,
  );
  return onContinue;
}

beforeEach(() => {
  motion(false);
});

describe("picker", () => {
  it("disables Continue when nothing is selected", () => {
    const onContinue = renderPicker();
    const button = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("does not select Resume when Resume is unavailable", () => {
    renderPicker(moduleState("resume", false, "Resume needs macOS 13."));
    const resume = screen.getByRole("checkbox", { name: /Resume/ });
    expect(resume.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Resume needs macOS 13.")).toBeTruthy();
    fireEvent.click(resume);
    expect(resume.getAttribute("aria-checked")).toBe("false");
  });

  it("places registration marks without a travel offset when motion is reduced", () => {
    motion(true);
    renderPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Wallpaper/ }));
    const marks = screen.getByRole("checkbox", { name: /Wallpaper/ }).querySelector(".picker__marks");
    expect(marks).not.toBeNull();
    expect(marks?.getAttribute("data-travel")).toBeNull();
  });
});
