import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDoc, type ResumeDoc } from "../lib/types";
import { Input } from "./Input";

function named(name: string): ResumeDoc {
  return { ...emptyDoc(), contact: { ...emptyDoc().contact, name } };
}

const importResumeFile = vi.fn(async (): Promise<ResumeDoc | null> => named("Grace Hopper"));
const parsePastedText = vi.fn(async (text: string) => named(text.split("\n")[0]));

vi.mock("../lib/ipc", () => ({
  importResumeFile: () => importResumeFile(),
  importDroppedFile: vi.fn(),
  parsePastedText: (text: string) => parsePastedText(text),
}));

// The drop listener lives on the Tauri webview, which does not exist in jsdom.
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => undefined }),
}));

describe("Input", () => {
  beforeEach(() => vi.clearAllMocks());

  it("imports the file the user chose", async () => {
    const onReady = vi.fn();
    render(<Input onReady={onReady} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose a file" }));
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls[0][0].contact.name).toBe("Grace Hopper");
  });

  it("says nothing and does nothing when the picker is dismissed", async () => {
    importResumeFile.mockResolvedValueOnce(null);
    const onReady = vi.fn();
    render(<Input onReady={onReady} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose a file" }));
    await waitFor(() => expect(importResumeFile).toHaveBeenCalled());
    expect(onReady).not.toHaveBeenCalled();
    expect(screen.queryByText(/could not/i)).toBeNull();
  });

  it("shows an unreadable file as a sentence", async () => {
    importResumeFile.mockRejectedValueOnce(
      "That PDF has no text in it — it looks like a scan or a picture of a resume.",
    );
    render(<Input onReady={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose a file" }));
    await waitFor(() => expect(screen.getByText(/looks like a scan/)).toBeTruthy());
  });

  it("still reads pasted text", async () => {
    const onReady = vi.fn();
    render(<Input onReady={onReady} />);
    fireEvent.change(screen.getByLabelText("Or paste your resume"), {
      target: { value: "Ada Lovelace\nada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read the pasted text" }));
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls[0][0].contact.name).toBe("Ada Lovelace");
  });

  it("will not read empty text", () => {
    render(<Input onReady={vi.fn()} />);
    const read = screen.getByRole("button", { name: "Read the pasted text" }) as HTMLButtonElement;
    expect(read.disabled).toBe(true);
  });

  it("starts from scratch with an empty document", () => {
    const onReady = vi.fn();
    render(<Input onReady={onReady} />);
    fireEvent.click(screen.getByRole("button", { name: "Start from scratch" }));
    expect(onReady.mock.calls[0][0].contact.name).toBe("");
  });

  it("names every format it can read", () => {
    render(<Input onReady={vi.fn()} />);
    expect(screen.getByText(/PDF, Word or a text file/)).toBeTruthy();
  });
});
