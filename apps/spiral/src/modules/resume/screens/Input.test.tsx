import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDoc, type ResumeDoc } from "../lib/types";
import { Input } from "./Input";

function named(name: string): ResumeDoc {
  return { ...emptyDoc(), contact: { ...emptyDoc().contact, name } };
}

const importResumeFile = vi.fn(async (): Promise<ResumeDoc | null> => named("Grace Hopper"));
const parsePastedText = vi.fn(async (text: string) => named(text.split("\n")[0]));

const importDroppedFile = vi.fn(async (path: string) => named(path.split("/").pop() ?? ""));

type DropPayload = { type: "over" | "leave" } | { type: "drop"; paths: string[] };
const drag = vi.hoisted(() => ({ handler: null as null | ((event: { payload: DropPayload }) => Promise<void>) }));

vi.mock("../api", () => ({
  importResumeFile: () => importResumeFile(),
  importDroppedFile: (path: string) => importDroppedFile(path),
  parsePastedText: (text: string) => parsePastedText(text),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async (handler: (event: { payload: DropPayload }) => Promise<void>) => {
      drag.handler = handler;
      return () => undefined;
    },
  }),
}));

describe("Input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    drag.handler = null;
  });

  it("imports a dropped file directly, without the picker", async () => {
    const onReady = vi.fn();
    render(<Input onReady={onReady} />);
    await waitFor(() => expect(drag.handler).not.toBeNull());
    await drag.handler?.({ payload: { type: "drop", paths: ["/Users/ada/Ada Lovelace.pdf"] } });
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(importDroppedFile).toHaveBeenCalledWith("/Users/ada/Ada Lovelace.pdf");
    expect(importResumeFile).not.toHaveBeenCalled();
    expect(onReady.mock.calls[0][0].contact.name).toBe("Ada Lovelace.pdf");
  });

  it("refuses several dropped files at once and says why", async () => {
    render(<Input onReady={vi.fn()} />);
    await waitFor(() => expect(drag.handler).not.toBeNull());
    await drag.handler?.({ payload: { type: "drop", paths: ["/a.pdf", "/b.docx"] } });
    expect(await screen.findByText(/Drop one resume at a time/)).toBeTruthy();
    expect(importDroppedFile).not.toHaveBeenCalled();
  });

  it("shows the reason a dropped file was refused", async () => {
    importDroppedFile.mockRejectedValueOnce(
      "Spiral reads PDF, Word (.docx) and text files, and photo.png is none of these. Save it as a PDF or paste the text instead.",
    );
    render(<Input onReady={vi.fn()} />);
    await waitFor(() => expect(drag.handler).not.toBeNull());
    await drag.handler?.({ payload: { type: "drop", paths: ["/photo.png"] } });
    expect(await screen.findByText(/photo.png is none of these/)).toBeTruthy();
  });

  it("imports the file the user chose", async () => {
    const onReady = vi.fn();
    render(<Input onReady={onReady} />);
    fireEvent.click(screen.getByRole("button", { name: "Open a file" }));
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls[0][0].contact.name).toBe("Grace Hopper");
  });

  it("says nothing and does nothing when the picker is dismissed", async () => {
    importResumeFile.mockResolvedValueOnce(null);
    const onReady = vi.fn();
    render(<Input onReady={onReady} />);
    fireEvent.click(screen.getByRole("button", { name: "Open a file" }));
    await waitFor(() => expect(importResumeFile).toHaveBeenCalled());
    expect(onReady).not.toHaveBeenCalled();
    expect(screen.queryByText(/could not/i)).toBeNull();
  });

  it("shows an unreadable file as a sentence", async () => {
    importResumeFile.mockRejectedValueOnce(
      "That PDF has no text in it. It looks like a scan or a picture of a resume.",
    );
    render(<Input onReady={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open a file" }));
    await waitFor(() => expect(screen.getByText(/looks like a scan/)).toBeTruthy());
  });

  it("still reads pasted text", async () => {
    const onReady = vi.fn();
    render(<Input onReady={onReady} />);
    fireEvent.click(screen.getByRole("button", { name: "Paste text" }));
    fireEvent.change(screen.getByLabelText("Paste your resume"), {
      target: { value: "Ada Lovelace\nada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read the pasted text" }));
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls[0][0].contact.name).toBe("Ada Lovelace");
  });

  it("will not read empty text", () => {
    render(<Input onReady={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Paste text" }));
    const read = screen.getByRole("button", { name: "Read the pasted text" });
    expect(read.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(read);
    expect(parsePastedText).not.toHaveBeenCalled();
    expect(screen.getByText("Paste the resume text to continue.")).toBeTruthy();
  });

  it("starts from scratch with a blank role ready to type", () => {
    const onReady = vi.fn();
    render(<Input onReady={onReady} />);
    fireEvent.click(screen.getByRole("button", { name: "Start from scratch" }));
    expect(onReady.mock.calls[0][1]).toBe("scratch");
    expect(onReady.mock.calls[0][0].contact.name).toBe("");
    expect(onReady.mock.calls[0][0].experience[0].id).toBe("exp-0");
  });

  it("is one drop zone with three ways in", () => {
    render(<Input onReady={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Drop a resume" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("offers a quiet way back to a saved resume", () => {
    const onOpenSaved = vi.fn();
    render(
      <Input
        onReady={vi.fn()}
        savedAt="2026-08-01T10:00:00Z"
        onOpenSaved={onOpenSaved}
      />,
    );
    expect(screen.getByText(/Saved from/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open it" }));
    expect(onOpenSaved).toHaveBeenCalled();
  });

  it("names every format it can read", () => {
    render(<Input onReady={vi.fn()} />);
    const upload = screen.getByRole("button", { name: "Open a file" });
    expect(upload.getAttribute("aria-describedby")).toBe("import-file-note");
    expect(screen.getByText(/PDF, Word or text/)).toBeTruthy();
    expect(screen.queryByText(/two-column PDF may look jumbled/i)).toBeNull();
  });
});
