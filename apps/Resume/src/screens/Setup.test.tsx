import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Setup } from "./Setup";

const completeSetup = vi.fn(async () => ({
  provider: "anthropic",
  model: "",
  baseUrl: "",
  hasKey: false,
  usesModel: false,
  host: "api.anthropic.com",
  keyUrl: "",
  needsSetup: false,
}));

vi.mock("../lib/ipc", () => ({
  completeSetup: () => completeSetup(),
  saveApiKey: vi.fn(),
  saveEngine: vi.fn(),
  offlineModelStatus: async () => ({ available: false, models: [] }),
}));

describe("Setup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers a model, a key, and rules, and skip finishes setup", async () => {
    const onDone = vi.fn();
    render(<Setup onDone={onDone} />);
    expect(screen.getByRole("button", { name: /Download a model/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Use Claude or ChatGPT/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Rules only/ }));
    await waitFor(() => expect(completeSetup).toHaveBeenCalled());
    expect(onDone).toHaveBeenCalled();
  });
});
