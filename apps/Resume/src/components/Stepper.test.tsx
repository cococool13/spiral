import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Stepper } from "./Stepper";

describe("Stepper", () => {
  it("is hidden on Import", () => {
    render(<Stepper current="input" reached={["input"]} onJump={vi.fn()} />);
    expect(screen.queryByRole("navigation", { name: "Progress" })).toBeNull();
  });

  it("names the four remaining steps", () => {
    render(<Stepper current="check" reached={["input", "check"]} onJump={vi.fn()} />);
    for (const label of ["Import", "Check", "Style", "Build"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("marks the current step for assistive technology", () => {
    render(<Stepper current="check" reached={["input", "check"]} onJump={vi.fn()} />);
    expect(screen.getByRole("button", { current: "step" }).textContent).toContain("Check");
  });

  it("disables steps that have not been reached", () => {
    render(<Stepper current="check" reached={["input", "check"]} onJump={vi.fn()} />);
    const style = screen.getByRole("button", { name: /Style/ }) as HTMLButtonElement;
    expect(style.disabled).toBe(true);
  });
});
