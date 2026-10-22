import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderPaste } from "./ProviderPaste";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

const secret = "sk-test-secret";

beforeEach(() => {
  invoke.mockReset();
});

describe("provider paste", () => {
  it("sends a pasted key, then clears it from the screen", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "provider_view") return { kind: "needsPaste" };
      if (cmd === "provider_set") return { kind: "present" };
      throw new Error(cmd);
    });

    render(<ProviderPaste provider="anthropic" label="Anthropic" />);
    expect(await screen.findByText("Spiral could not read the saved key. Paste it again.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: secret } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith("provider_set", { provider: "anthropic", key: secret });
    expect(screen.queryByLabelText("API key")).toBeNull();
    expect(document.body.textContent).not.toContain(secret);
  });

  it("does not show a key that a failed save echoes", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "provider_view") return { kind: "absent" };
      if (cmd === "provider_set") throw `rejected ${secret}`;
      throw new Error(cmd);
    });

    render(<ProviderPaste provider="openai" label="OpenAI" />);
    fireEvent.change(await screen.findByLabelText("API key"), { target: { value: secret } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Spiral could not save that key. Paste it again.",
    );
    expect(document.body.textContent).not.toContain(secret);
  });
});
