import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";

const deleteStoredData = vi.fn(async () => {});
vi.mock("../lib/ipc", () => ({
  storageInfo: vi.fn(async () => ({ path: "/tmp/spiral-resume", exists: true })),
  deleteStoredData: () => deleteStoredData(),
  // The engine panel is covered by its own tests; here it only needs to render.
  engineInfo: vi.fn(async () => ({
    provider: "anthropic",
    model: "claude-opus-5",
    baseUrl: "",
    hasKey: false,
    usesModel: false,
    host: "api.anthropic.com",
    keyUrl: "",
    needsSetup: false,
  })),
  saveEngine: vi.fn(),
  saveApiKey: vi.fn(),
  clearApiKey: vi.fn(),
  offlineModelStatus: vi.fn(async () => ({
    available: false,
    models: [],
  })),
  downloadOfflineModel: vi.fn(),
  removeOfflineModel: vi.fn(),
}));

describe("Settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the exact folder the document is stored in", async () => {
    render(<Settings onClose={vi.fn()} onCleared={vi.fn()} onEngineChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("/tmp/spiral-resume")).toBeTruthy());
    expect(screen.getByText("Spiral Resume 0.1.1")).toBeTruthy();
  });

  it("closes from the heading, without opening the menu again", async () => {
    const onClose = vi.fn();
    render(<Settings onClose={onClose} onCleared={vi.fn()} onEngineChanged={vi.fn()} />);
    await waitFor(() => screen.getByText("/tmp/spiral-resume"));
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("asks once before deleting, then deletes", async () => {
    const onCleared = vi.fn();
    render(<Settings onClose={vi.fn()} onCleared={onCleared} onEngineChanged={vi.fn()} />);
    await waitFor(() => screen.getByText("/tmp/spiral-resume"));
    fireEvent.click(screen.getByRole("button", { name: /Delete everything/ }));
    expect(deleteStoredData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete it" }));
    await waitFor(() => expect(deleteStoredData).toHaveBeenCalledTimes(1));
    expect(onCleared).toHaveBeenCalled();
  });
});
