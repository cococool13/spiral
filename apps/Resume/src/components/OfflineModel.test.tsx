import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DownloadProgress, ModelList, ModelStatus } from "../lib/types";
import { OfflineModel } from "./OfflineModel";

const model = (over: Partial<ModelStatus> = {}): ModelStatus => ({
  id: "qwen3.5-4b",
  name: "Qwen3.5 4B",
  note: "The balance most people want.",
  size: "2.7 GB",
  installed: false,
  path: "",
  inUse: false,
  ...over,
});

const three: ModelList = {
  available: true,
  models: [
    model({ id: "qwen3.5-2b", name: "Qwen3.5 2B", size: "1.3 GB", note: "Runs almost anywhere." }),
    model(),
    model({ id: "qwen3.5-9b", name: "Qwen3.5 9B", size: "5.7 GB", note: "Needs the memory." }),
  ],
};

const offlineModelStatus = vi.fn(async (): Promise<ModelList> => three);
const downloadOfflineModel = vi.fn(
  async (id: string, onProgress: (p: DownloadProgress) => void): Promise<ModelList> => {
    onProgress({ received: 1_350_000_000, total: 2_700_000_000, percent: 50 });
    return {
      available: true,
      models: three.models.map((m) =>
        m.id === id ? { ...m, installed: true, inUse: true, path: `/tmp/models/${id}.gguf` } : m,
      ),
    };
  },
);
const removeOfflineModel = vi.fn(async (_id: string): Promise<ModelList> => three);
const chooseOfflineModel = vi.fn(async (id: string): Promise<ModelList> => ({
  available: true,
  models: three.models.map((m) => ({ ...m, installed: true, inUse: m.id === id })),
}));

vi.mock("../lib/ipc", () => ({
  offlineModelStatus: () => offlineModelStatus(),
  downloadOfflineModel: (id: string, p: (x: DownloadProgress) => void) =>
    downloadOfflineModel(id, p),
  removeOfflineModel: (id: string) => removeOfflineModel(id),
  chooseOfflineModel: (id: string) => chooseOfflineModel(id),
}));

describe("OfflineModel", () => {
  beforeEach(() => vi.clearAllMocks());

  /** Decision 17: every size is stated before a byte is fetched. */
  it("names every model and what it costs, before anything is fetched", async () => {
    render(<OfflineModel />);
    await waitFor(() => expect(screen.getByText("Qwen3.5 4B")).toBeTruthy());
    for (const [name, size] of [
      ["Qwen3.5 2B", "1.3 GB"],
      ["Qwen3.5 4B", "2.7 GB"],
      ["Qwen3.5 9B", "5.7 GB"],
    ]) {
      expect(screen.getByText(name)).toBeTruthy();
      expect(screen.getByRole("button", { name: `Download (${size})` })).toBeTruthy();
    }
    expect(downloadOfflineModel).not.toHaveBeenCalled();
  });

  it("says nothing leaves the computer", async () => {
    render(<OfflineModel />);
    await waitFor(() => expect(screen.getByText(/nothing leaves it/)).toBeTruthy());
  });

  it("downloads the one that was asked for, and shows real progress", async () => {
    render(<OfflineModel />);
    fireEvent.click(await screen.findByRole("button", { name: "Download (5.7 GB)" }));
    await waitFor(() => expect(screen.getByText("In use")).toBeTruthy());
    expect(downloadOfflineModel).toHaveBeenCalledTimes(1);
    expect(downloadOfflineModel.mock.calls[0][0]).toBe("qwen3.5-9b");
  });

  it("offers removal once installed, and names the space it occupies", async () => {
    offlineModelStatus.mockResolvedValueOnce({
      available: true,
      models: [model({ installed: true, inUse: true, path: "/tmp/models/qwen.gguf" })],
    });
    render(<OfflineModel />);
    await waitFor(() => expect(screen.getByText("/tmp/models/qwen.gguf")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(removeOfflineModel).toHaveBeenCalledWith("qwen3.5-4b"));
  });

  /** With one model installed there is nothing to choose between, so the app
   *  does not ask. With two there is, so it does. */
  it("only offers a choice when there is one to make", async () => {
    offlineModelStatus.mockResolvedValueOnce({
      available: true,
      models: [model({ installed: true, inUse: true })],
    });
    render(<OfflineModel />);
    await waitFor(() => expect(screen.getByText("In use")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Use this one" })).toBeNull();
  });

  it("switches which installed model is used", async () => {
    offlineModelStatus.mockResolvedValueOnce({
      available: true,
      models: [
        model({ id: "qwen3.5-2b", name: "Qwen3.5 2B", installed: true, inUse: true }),
        model({ installed: true }),
      ],
    });
    render(<OfflineModel />);
    fireEvent.click(await screen.findByRole("button", { name: "Use this one" }));
    await waitFor(() => expect(chooseOfflineModel).toHaveBeenCalledWith("qwen3.5-4b"));
  });

  /** A build with no pinned model must say so, not offer a download that
   *  cannot work. */
  it("says plainly when this build ships no offline model", async () => {
    offlineModelStatus.mockResolvedValueOnce({ available: false, models: [] });
    render(<OfflineModel />);
    await waitFor(() =>
      expect(screen.getByText(/includes no offline model/)).toBeTruthy(),
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows a failed download as a sentence", async () => {
    downloadOfflineModel.mockRejectedValueOnce(
      "The downloaded file did not match its checksum, so it was deleted. Try again.",
    );
    render(<OfflineModel />);
    fireEvent.click(await screen.findByRole("button", { name: "Download (2.7 GB)" }));
    await waitFor(() => expect(screen.getByText(/did not match its checksum/)).toBeTruthy());
  });
});
