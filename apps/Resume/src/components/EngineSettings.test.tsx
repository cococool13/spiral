import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineInfo } from "../lib/types";
import { EngineSettings } from "./EngineSettings";

const base: EngineInfo = {
  provider: "anthropic",
  model: "claude-opus-5",
  baseUrl: "",
  hasKey: false,
  host: "api.anthropic.com",
};

const engineInfo = vi.fn(async (): Promise<EngineInfo> => base);
const saveApiKey = vi.fn(async (_key: string): Promise<EngineInfo> => ({ ...base, hasKey: true }));
const clearApiKey = vi.fn(async (): Promise<EngineInfo> => base);
const saveEngine = vi.fn(async (): Promise<EngineInfo> => base);

vi.mock("../lib/ipc", () => ({
  engineInfo: () => engineInfo(),
  saveApiKey: (key: string) => saveApiKey(key),
  clearApiKey: () => clearApiKey(),
  saveEngine: () => saveEngine(),
}));

describe("EngineSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("names the exact host the key will be sent to, before anything is sent", async () => {
    render(<EngineSettings onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/api\.anthropic\.com/)).toBeTruthy());
  });

  /** Decision 12. A student who pastes their ChatGPT password here has been
   *  failed by the copy, not by themselves. */
  it("states that an API key is not a subscription", async () => {
    render(<EngineSettings onChanged={vi.fn()} />);
    await waitFor(() => screen.getByText(/not your Claude or ChatGPT subscription/));
    expect(screen.getByText(/billed separately/)).toBeTruthy();
  });

  it("says the free path is complete rather than selling the paid one", async () => {
    render(<EngineSettings onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/works with no key at all/)).toBeTruthy());
  });

  /** The key must never be rendered into the DOM in readable form, and must
   *  never come back from Rust — the field starts empty and clears on save. */
  it("keeps the key field masked, empty on load, and clears it after saving", async () => {
    render(<EngineSettings onChanged={vi.fn()} />);
    const field = (await screen.findByLabelText(/Paste your key/)) as HTMLInputElement;
    expect(field.type).toBe("password");
    expect(field.value).toBe("");

    fireEvent.change(field, { target: { value: "sk-ant-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the key" }));

    await waitFor(() => expect(saveApiKey).toHaveBeenCalledWith("sk-ant-secret"));
    await waitFor(() => expect((field as HTMLInputElement).value).toBe(""));
  });

  it("will not save an empty key", async () => {
    render(<EngineSettings onChanged={vi.fn()} />);
    await screen.findByLabelText(/Paste your key/);
    expect((screen.getByRole("button", { name: "Save the key" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("offers removal only once a key exists, and reports it upward", async () => {
    const onChanged = vi.fn();
    engineInfo.mockResolvedValueOnce({ ...base, hasKey: true });
    render(<EngineSettings onChanged={onChanged} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Remove the key" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Remove the key" }));
    await waitFor(() => expect(clearApiKey).toHaveBeenCalled());
    expect(onChanged).toHaveBeenLastCalledWith(base);
  });

  it("hides removal when there is no key", async () => {
    render(<EngineSettings onChanged={vi.fn()} />);
    await screen.findByLabelText(/Paste your key/);
    expect(screen.queryByRole("button", { name: "Remove the key" })).toBeNull();
  });

  it("asks for a base URL only for a custom service", async () => {
    engineInfo.mockResolvedValueOnce({
      ...base,
      provider: "compatible",
      baseUrl: "http://localhost:11434/v1",
      host: "localhost:11434",
    });
    render(<EngineSettings onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("Base URL")).toBeTruthy());
  });
});
