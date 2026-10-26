import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDoc, type Draft } from "../lib/types";
import { ExportButton, ExportSheet, useExport } from "./Export";

const exportBoth = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ exportBoth }));
vi.mock("../../../shell/analytics/client", () => ({ noteResumeExported: vi.fn() }));

const draft: Draft = { doc: emptyDoc(), template: "column", format: "", accent: "ink", tighten: false };
const files = ["/Users/ada/Desktop/Ada Lovelace Resume.pdf", "/Users/ada/Desktop/Ada Lovelace Resume.docx"];

function Harness() {
  const exporter = useExport(draft);
  return (
    <>
      <ExportButton busy={exporter.phase.kind === "working"} onClick={() => void exporter.run()} />
      <ExportSheet phase={exporter.phase} onClose={exporter.dismiss} onReplace={() => void exporter.replace()} />
    </>
  );
}

async function press(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => exportBoth.mockReset());
afterEach(cleanup);

describe("one export, both formats", () => {
  it("asks for one folder and saves the PDF and the Word file together", async () => {
    exportBoth.mockResolvedValueOnce({ kind: "saved", files, dir: "/Users/ada/Desktop", engine: "Built offline", notes: [] });
    render(<Harness />);
    await press("Export PDF + DOCX");
    expect(exportBoth).toHaveBeenCalledTimes(1);
    expect(exportBoth.mock.calls[0]?.slice(1, 3)).toEqual(["", false]);
    expect(screen.getByText("Saved the PDF and the Word file. Finder shows them.")).toBeTruthy();
    expect(screen.getByText(files[0] as string)).toBeTruthy();
    expect(screen.getByText(files[1] as string)).toBeTruthy();
  });

  it("asks in the app before replacing, with the safe answer focused", async () => {
    exportBoth
      .mockResolvedValueOnce({
        kind: "conflict",
        files: ["Ada Lovelace Resume.pdf", "Ada Lovelace Resume.docx"],
        dir: "/Users/ada/Desktop",
      })
      .mockResolvedValueOnce({ kind: "saved", files, dir: "/Users/ada/Desktop", engine: "", notes: [] });
    render(<Harness />);
    await press("Export PDF + DOCX");
    expect(screen.getByRole("alertdialog").textContent).toContain("already in that folder");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep the old files" }));
    await press("Replace");
    expect(exportBoth.mock.calls[1]?.slice(1, 3)).toEqual(["/Users/ada/Desktop", true]);
    expect(screen.getByText("Saved the PDF and the Word file. Finder shows them.")).toBeTruthy();
  });

  it("keeps the old files when told to, and a cancelled picker says nothing", async () => {
    exportBoth
      .mockResolvedValueOnce({ kind: "conflict", files: ["Resume.pdf"], dir: "/tmp" })
      .mockResolvedValueOnce(null);
    render(<Harness />);
    await press("Export PDF + DOCX");
    await press("Keep the old files");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await press("Export PDF + DOCX");
    expect(screen.queryByRole("status")).toBeNull();
    expect(exportBoth).toHaveBeenCalledTimes(2);
  });

  it("names the problem and the next step when the export fails", async () => {
    exportBoth.mockRejectedValueOnce("That folder is no longer there. Export again and choose another folder.");
    render(<Harness />);
    await press("Export PDF + DOCX");
    expect(screen.getByRole("alert").textContent).toContain("Nothing was saved. Try Export again.");
  });
});
