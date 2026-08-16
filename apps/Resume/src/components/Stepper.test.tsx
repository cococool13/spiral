import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Stepper } from "./Stepper";

describe("Stepper", () => {
  it("names all five steps", () => {
    render(<Stepper current="input" reached={["input"]} onJump={vi.fn()} />);
    for (const label of ["Input", "Check", "Style", "Format", "Build"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("marks the current step for assistive technology", () => {
    render(<Stepper current="check" reached={["input", "check"]} onJump={vi.fn()} />);
    expect(screen.getByRole("button", { current: "step" }).textContent).toContain("Check");
  });

  it("disables steps that have not been reached", () => {
    render(<Stepper current="input" reached={["input"]} onJump={vi.fn()} />);
    const style = screen.getByRole("button", { name: /Style/ }) as HTMLButtonElement;
    expect(style.disabled).toBe(true);
  });
});
