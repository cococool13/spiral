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
  beforeEach(() => vi.clearAllMocks());

  /** A launch that rewrites the file moves "saved from…" to today, which tells
   *  the user they edited something they did not. */
  it("does not write anything back when the user has changed nothing", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/You have a resume saved/)).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  /** `save_document` is synchronous and writes the whole document. */
  it("writes once after typing stops, not once per keystroke", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/You have a resume saved/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continue where you left off" }));

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
});
