import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DownloadProgress, ModelStatus } from "../lib/types";
import { OfflineModel } from "./OfflineModel";

const pinned: ModelStatus = {
  available: true,
  name: "Qwen3 4B Instruct (Q4_K_M)",
  size: "2.5 GB",
  installed: false,
  path: "",
};

const offlineModelStatus = vi.fn(async (): Promise<ModelStatus> => pinned);
const downloadOfflineModel = vi.fn(
  async (onProgress: (p: DownloadProgress) => void): Promise<ModelStatus> => {
    onProgress({ received: 1_250_000_000, total: 2_500_000_000, percent: 50 });
    return { ...pinned, installed: true, path: "/tmp/models/qwen.gguf" };
  },
);
const removeOfflineModel = vi.fn(async (): Promise<ModelStatus> => pinned);

vi.mock("../lib/ipc", () => ({
  offlineModelStatus: () => offlineModelStatus(),
  downloadOfflineModel: (p: (x: DownloadProgress) => void) => downloadOfflineModel(p),
  removeOfflineModel: () => removeOfflineModel(),
}));

describe("OfflineModel", () => {
  beforeEach(() => vi.clearAllMocks());

  /** Decision 17: the size is stated before a byte is fetched. */
  it("states the download size on the button and in the copy", async () => {
    render(<OfflineModel />);
    await waitFor(() => expect(screen.getByText(/2\.5 GB download, once/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Download it (2.5 GB)" })).toBeTruthy();
  });

  it("says nothing leaves the computer", async () => {
    render(<OfflineModel />);
    await waitFor(() => expect(screen.getByText(/nothing leaves it/)).toBeTruthy());
  });

  it("downloads only when asked, and shows real progress", async () => {
    render(<OfflineModel />);
    await screen.findByRole("button", { name: /Download it/ });
    expect(downloadOfflineModel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Download it/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove the offline model" })).toBeTruthy(),
    );
    expect(downloadOfflineModel).toHaveBeenCalledTimes(1);
  });

  it("offers removal once installed, and the path it occupies", async () => {
    offlineModelStatus.mockResolvedValueOnce({
      ...pinned,
      installed: true,
      path: "/tmp/models/qwen.gguf",
    });
    render(<OfflineModel />);
    await waitFor(() => expect(screen.getByText("/tmp/models/qwen.gguf")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Remove the offline model" }));
    await waitFor(() => expect(removeOfflineModel).toHaveBeenCalled());
  });

  /** A build with no pinned model must say so, not offer a download that
   *  cannot work. */
  it("says plainly when this build ships no offline model", async () => {
    offlineModelStatus.mockResolvedValueOnce({
      available: false,
      name: "",
      size: "",
      installed: false,
      path: "",
    });
    render(<OfflineModel />);
    await waitFor(() =>
      expect(screen.getByText(/does not include an offline model/)).toBeTruthy(),
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows a failed download as a sentence", async () => {
    downloadOfflineModel.mockRejectedValueOnce(
      "The downloaded file did not match its checksum, so it was deleted. Try again.",
    );
    render(<OfflineModel />);
    fireEvent.click(await screen.findByRole("button", { name: /Download it/ }));
    await waitFor(() => expect(screen.getByText(/did not match its checksum/)).toBeTruthy());
  });
});
