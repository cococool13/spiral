import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Stepper } from "./Stepper";

describe("Stepper", () => {
  it("names the six steps", () => {
    render(<Stepper current="import" reached={["import"]} onJump={vi.fn()} />);
    for (const label of ["Import", "Details", "Style", "Build", "Check", "Export"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("marks the current step for assistive technology", () => {
    render(<Stepper current="check" reached={["import", "details", "style", "build", "check"]} onJump={vi.fn()} />);
    expect(screen.getByRole("button", { current: "step" }).textContent).toBe("Check");
  });

  it("disables steps that have not been reached", () => {
    render(<Stepper current="details" reached={["import", "details"]} onJump={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Style" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Import" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("moves to a reached step with the arrow keys", () => {
    const onJump = vi.fn();
    render(<Stepper current="details" reached={["import", "details"]} onJump={onJump} />);
    fireEvent.keyDown(screen.getByRole("navigation", { name: "Resume steps" }), { key: "ArrowLeft" });
    expect(onJump).toHaveBeenCalledWith("import");
    fireEvent.keyDown(screen.getByRole("navigation", { name: "Resume steps" }), { key: "ArrowRight" });
    expect(onJump).not.toHaveBeenCalledWith("style");
  });
});
