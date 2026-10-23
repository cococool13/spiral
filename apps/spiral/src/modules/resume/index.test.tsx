import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ModuleRoot, { Frame } from "./index";
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
  tighten: false,
};

const saveDocument = vi.fn(async (_draft: Draft): Promise<void> => undefined);
const loadDocument = vi.fn(async (): Promise<StoredDoc | null> => stored);
const marks: string[] = [];

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => undefined }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "module_activate") return;
    throw new Error(`unexpected invoke: ${cmd}`);
  }),
  convertFileSrc: (path: string) => path,
  Channel: class {
      onmessage: ((value: unknown) => void) | null = null;
  },
}));

vi.mock("../../bench", () => ({
  mark: (name: string) => {
    marks.push(name);
  },
}));

vi.mock("./api", () => ({
  saveDocument: (draft: Draft) => saveDocument(draft),
  loadDocument: () => loadDocument(),
  takeImportedText: () => "",
  previewDocument: () => new Promise(() => undefined),
  checkResume: async () => ({ findings: [] }),
  reviewWording: async () => [],
  cacheSrc: (path: string) => path,
  listAccents: async () => [],
  renderThumbnails: async () => [],
  importResumeFile: async () => null,
  importDroppedFile: async () => emptyDoc(),
  parsePastedText: async () => emptyDoc(),
}));

function show() {
  return render(
    <Frame>
      <ModuleRoot setStatus={vi.fn()} onChooseWallpaper={vi.fn()} />
    </Frame>,
  );
}

describe("Resume editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    marks.length = 0;
    loadDocument.mockResolvedValue(stored);
  });

  it("marks the module ready and shows a saved resume before any preview", async () => {
    show();
    expect(await screen.findByRole("heading", { name: "Import" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Saved from/)).toBeTruthy());
    expect(marks).toContain("module_ready:resume");
    expect(marks).not.toContain("first_useful_action:resume");
  });

  it("does not write anything back when the user has changed nothing", async () => {
    show();
    await waitFor(() => expect(screen.getByText(/Saved from/)).toBeTruthy(), { timeout: 2000 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it("writes once after typing stops", async () => {
    show();
    await waitFor(() => expect(screen.getByText(/Saved from/)).toBeTruthy(), { timeout: 2000 });
    fireEvent.click(screen.getByRole("button", { name: "Open it" }));
    const headline = (await screen.findByLabelText("Headline")) as HTMLInputElement;
    for (const value of ["A", "An", "Ana", "Analy", "Analyst"]) {
      fireEvent.change(headline, { target: { value } });
    }
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(saveDocument.mock.calls[0]?.[0]).toMatchObject({
      template: "column",
      format: "pdf",
      doc: expect.objectContaining({ headline: "Analyst" }),
    });
  });

  it("saves an edit that unmounts before the pause ends", async () => {
    const view = show();
    await waitFor(() => expect(screen.getByText(/Saved from/)).toBeTruthy(), { timeout: 2000 });
    fireEvent.click(screen.getByRole("button", { name: "Open it" }));
    const headline = (await screen.findByLabelText("Headline")) as HTMLInputElement;
    fireEvent.change(headline, { target: { value: "Analyst" } });
    view.unmount();
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1));
    expect(saveDocument.mock.calls[0]?.[0]).toMatchObject({
      doc: expect.objectContaining({ headline: "Analyst" }),
    });
  });

  it("retries an edit when the save fails", async () => {
    saveDocument.mockRejectedValueOnce("The resume could not be saved.");
    const view = show();
    await waitFor(() => expect(screen.getByText(/Saved from/)).toBeTruthy(), { timeout: 2000 });
    fireEvent.click(screen.getByRole("button", { name: "Open it" }));
    const headline = (await screen.findByLabelText("Headline")) as HTMLInputElement;
    fireEvent.change(headline, { target: { value: "Analyst" } });
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(await screen.findByText("The resume could not be saved.")).toBeTruthy();
    view.unmount();
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(2));
  });

  it("lets someone with no resume type the facts", async () => {
    loadDocument.mockResolvedValueOnce(null);
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Start from scratch" }, { timeout: 2000 }));
    expect(screen.getByRole("heading", { name: "Fill in the facts" })).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByLabelText("Title")).toBeTruthy();
  });
});
