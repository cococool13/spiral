import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { emptyDoc, type Draft, type ResumeDoc, type StoredDoc } from "./lib/types";

function docNamed(name: string): ResumeDoc {
  return { ...emptyDoc(), contact: { ...emptyDoc().contact, name } };
}

const stored: StoredDoc = {
  doc: docNamed("Ada Lovelace"),
  savedAt: "2026-08-01T10:00:00Z",
  template: "column",
  format: "pdf",
  accent: "ink",
  tighten: true,
};

const saveDocument = vi.fn(async (_draft: Draft): Promise<void> => undefined);
const loadDocument = vi.fn(async (): Promise<StoredDoc | null> => stored);

// The Input screen registers a Tauri drag-drop listener on mount, which needs a
// real webview. This test is about the save path, not that listener.
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => undefined }),
}));

vi.mock("./lib/ipc", () => ({
  saveDocument: (draft: Draft) => saveDocument(draft),
  loadDocument: () => loadDocument(),
  engineInfo: async () => ({
    provider: "anthropic",
    model: "claude-opus-5",
    baseUrl: "",
    hasKey: false,
    usesModel: false,
    host: "api.anthropic.com",
    keyUrl: "",
    needsSetup: false,
  }),
  reviewWording: async () => [],
  // The Style screen never mounts in these tests, so it needs no swatches —
  // and a hex literal here would fail check-hex, which is right.
  listAccents: async () => [],
  renderThumbnails: async () => [],
  parsePastedText: async () => emptyDoc(),
  importResumeFile: async () => null,
  importDroppedFile: async () => emptyDoc(),
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  /** A launch that rewrites the file moves "saved from…" to today, which tells
   *  the user they edited something they did not. */
  it("does not write anything back when the user has changed nothing", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Saved from/)).toBeTruthy(), { timeout: 2000 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  /** `save_document` is synchronous and writes the whole document. */
  it("writes once after typing stops, not once per keystroke", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Saved from/)).toBeTruthy(), { timeout: 2000 });
    fireEvent.click(screen.getByRole("button", { name: "Open it" }));

    const headline = (await screen.findByLabelText("Headline")) as HTMLInputElement;
    for (const value of ["A", "An", "Ana", "Analy", "Analyst"]) {
      fireEvent.change(headline, { target: { value } });
    }

    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(saveDocument.mock.calls[0][0]).toMatchObject({
      template: "column",
      format: "pdf",
      doc: expect.objectContaining({ headline: "Analyst" }),
    });
  });

  it("lets someone with no resume type into Check", async () => {
    loadDocument.mockResolvedValueOnce(null);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Start from scratch" }, { timeout: 2000 }));
    expect(screen.getByRole("heading", { name: "Fill in the facts" })).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByLabelText("Title")).toBeTruthy();
    expect(screen.getByLabelText(/Bullet in Title/)).toBeTruthy();
  });
});
