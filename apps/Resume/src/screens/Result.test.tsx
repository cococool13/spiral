import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildResult } from "../lib/types";
import { Result } from "./Result";

const saveBuiltDocument = vi.fn(async (): Promise<string | null> => "/Users/ada/Desktop/x.pdf");

vi.mock("../lib/ipc", () => ({
  saveBuiltDocument: () => saveBuiltDocument(),
}));

function version(overrides: Partial<BuildResult> = {}): BuildResult {
  return {
    pages: ["<svg id='p1'></svg>"],
    suggestedName: "Ada-Lovelace-resume.pdf",
    engine: "Built offline, no network used",
    notes: [],
    ...overrides,
  };
}

function show(overrides: Partial<Parameters<typeof Result>[0]> = {}) {
  return render(
    <Result
      versions={[version()]}
      showing={0}
      format="pdf"
      onShow={vi.fn()}
      onAnotherStyle={vi.fn()}
      {...overrides}
    />,
  );
}

describe("Result", () => {
  beforeEach(() => vi.clearAllMocks());

  it("names the format on the save button", () => {
    show({ format: "docx" });
    expect(screen.getByRole("button", { name: /Save the Word file/ })).toBeTruthy();
  });

  it("states plainly which engine ran", () => {
    show();
    expect(screen.getByText("Built offline, no network used")).toBeTruthy();
  });

  it("states the path it wrote to", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /Save the PDF/ }));
    await waitFor(() => expect(screen.getByText(/Saved to \/Users\/ada/)).toBeTruthy());
  });

  it("says nothing when the user cancels the dialog", async () => {
    saveBuiltDocument.mockResolvedValueOnce(null);
    show();
    fireEvent.click(screen.getByRole("button", { name: /Save the PDF/ }));
    await waitFor(() => expect(saveBuiltDocument).toHaveBeenCalled());
    expect(screen.queryByText(/Saved to/)).toBeNull();
  });

  it("does not offer a tweak after the build", () => {
    show();
    expect(screen.queryByRole("button", { name: "Tweak" })).toBeNull();
  });

  it("shows a version strip once there is more than one build", () => {
    const onShow = vi.fn();
    show({ versions: [version(), version()], showing: 1, onShow });
    expect(screen.getByRole("radio", { name: "First" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Version 2" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: "First" }));
    expect(onShow).toHaveBeenCalledWith(0);
  });

  it("shows no version strip for a single build", () => {
    show();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  /** A refused rewrite is reported as information, not as an error — the user's
   *  own wording was kept and the build succeeded. */
  it("reports what the fact gate refused, plainly", () => {
    show({
      versions: [
        version({
          engine: "Rewritten with your key at api.anthropic.com",
          notes: ["Kept your own wording for one bullet — the rewrite changed a number."],
        }),
      ],
    });
    expect(screen.getByText(/changed a number/)).toBeTruthy();
    expect(screen.getByText(/api\.anthropic\.com/)).toBeTruthy();
  });

  it("goes back to the picker", () => {
    const onAnotherStyle = vi.fn();
    show({ onAnotherStyle });
    fireEvent.click(screen.getByRole("button", { name: "Try another style" }));
    expect(onAnotherStyle).toHaveBeenCalled();
  });
});
