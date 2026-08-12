import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Result } from "./Result";

const saveBuiltDocument = vi.fn(async (): Promise<string | null> => "/Users/ada/Desktop/x.pdf");

vi.mock("../lib/ipc", () => ({
  saveBuiltDocument: () => saveBuiltDocument(),
}));

const built = { pages: ["<svg id='p1'></svg>"], suggestedName: "Ada-Lovelace-resume.pdf" };

describe("Result", () => {
  beforeEach(() => vi.clearAllMocks());

  it("names the format on the save button", () => {
    render(<Result result={built} format="docx" onAnotherStyle={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Save the Word file/ })).toBeTruthy();
  });

  it("states the path it wrote to", async () => {
    render(<Result result={built} format="pdf" onAnotherStyle={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Save the PDF/ }));
    await waitFor(() => expect(screen.getByText(/Saved to \/Users\/ada/)).toBeTruthy());
  });

  it("says nothing when the user cancels the dialog", async () => {
    saveBuiltDocument.mockResolvedValueOnce(null);
    render(<Result result={built} format="pdf" onAnotherStyle={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Save the PDF/ }));
    await waitFor(() => expect(saveBuiltDocument).toHaveBeenCalled());
    expect(screen.queryByText(/Saved to/)).toBeNull();
  });

  it("offers exactly two actions — the third belongs to a later milestone", () => {
    render(<Result result={built} format="pdf" onAnotherStyle={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Try another style" })).toBeTruthy();
  });

  it("goes back to the picker", () => {
    const onAnotherStyle = vi.fn();
    render(<Result result={built} format="pdf" onAnotherStyle={onAnotherStyle} />);
    fireEvent.click(screen.getByRole("button", { name: "Try another style" }));
    expect(onAnotherStyle).toHaveBeenCalled();
  });
});
