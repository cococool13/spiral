import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";

const deleteStoredData = vi.fn(async () => {});
vi.mock("../lib/ipc", () => ({
  storageInfo: vi.fn(async () => ({ path: "/tmp/spiral-resume", exists: true })),
  deleteStoredData: () => deleteStoredData(),
}));

describe("Settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the exact folder the document is stored in", async () => {
    render(<Settings onClose={vi.fn()} onCleared={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("/tmp/spiral-resume")).toBeTruthy());
  });

  it("asks once before deleting, then deletes", async () => {
    const onCleared = vi.fn();
    render(<Settings onClose={vi.fn()} onCleared={onCleared} />);
    await waitFor(() => screen.getByText("/tmp/spiral-resume"));
    fireEvent.click(screen.getByRole("button", { name: /Delete everything/ }));
    expect(deleteStoredData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete it" }));
    await waitFor(() => expect(deleteStoredData).toHaveBeenCalledTimes(1));
    expect(onCleared).toHaveBeenCalled();
  });
});
