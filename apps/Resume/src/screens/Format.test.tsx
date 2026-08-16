import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Format } from "./Format";

describe("Format", () => {
  it("offers exactly the two formats the app can produce", () => {
    render(<Format chosen="" onChoose={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /PDF/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Word/ })).toBeTruthy();
  });

  it("reports the chosen format upward", () => {
    const onChoose = vi.fn();
    render(<Format chosen="" onChoose={onChoose} onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /Word/ }));
    expect(onChoose).toHaveBeenCalledWith("docx");
  });

  it("marks the chosen format for assistive technology", () => {
    render(<Format chosen="pdf" onChoose={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /PDF/ }).getAttribute("aria-checked")).toBe("true");
  });

  /** The button stays focusable and named so a keyboard user can find it and
   *  read why it will not act yet — it simply does not advance. */
  it("does not build before a format is chosen, and says what is missing", () => {
    const onContinue = vi.fn();
    render(<Format chosen="" onChoose={vi.fn()} onContinue={onContinue} />);
    const build = screen.getByRole("button", { name: "Build my resume" });
    expect(build.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(build);
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a format to carry on.")).toBeTruthy();
  });
});
