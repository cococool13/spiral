import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Format } from "./Format";

describe("Format", () => {
  it("offers exactly the two formats the app can produce", () => {
    render(<Format chosen="" onChoose={vi.fn()} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /PDF/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Word/ })).toBeTruthy();
  });

  it("reports the chosen format upward", () => {
    const onChoose = vi.fn();
    render(<Format chosen="" onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("radio", { name: /Word/ }));
    expect(onChoose).toHaveBeenCalledWith("docx");
  });

  it("marks the chosen format for assistive technology", () => {
    render(<Format chosen="pdf" onChoose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /PDF/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("waits for a format before Build this resume will run", () => {
    const onGenerate = vi.fn();
    render(<Format chosen="" onChoose={vi.fn()} onGenerate={onGenerate} />);
    const generate = screen.getByRole("button", { name: "Build this resume" });
    expect(generate.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(generate);
    expect(onGenerate).not.toHaveBeenCalled();
    expect(screen.getByText("Pick a format to carry on.")).toBeTruthy();
  });

  it("starts the build once a format is chosen", () => {
    const onGenerate = vi.fn();
    render(<Format chosen="pdf" onChoose={vi.fn()} onGenerate={onGenerate} />);
    fireEvent.click(screen.getByRole("button", { name: "Build this resume" }));
    expect(onGenerate).toHaveBeenCalled();
  });
});
