import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Input } from "./Input";

vi.mock("../lib/ipc", () => ({
  parsePastedText: vi.fn(async (text: string) => ({
    contact: { name: text.split("\n")[0], email: "", phone: "", location: "", links: [] },
    summary: "",
    experience: [],
    education: [],
    projects: [],
    skills: [],
  })),
}));

describe("Input", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hands the parsed document up when text is pasted and read", async () => {
    const onReady = vi.fn();
    render(<Input onReady={onReady} />);
    fireEvent.change(screen.getByLabelText("Paste your resume"), {
      target: { value: "Ada Lovelace\nada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read it" }));
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls[0][0].contact.name).toBe("Ada Lovelace");
  });

  it("will not read empty text", () => {
    render(<Input onReady={vi.fn()} />);
    const read = screen.getByRole("button", { name: "Read it" }) as HTMLButtonElement;
    expect(read.disabled).toBe(true);
  });

  it("starts from scratch with an empty document", () => {
    const onReady = vi.fn();
    render(<Input onReady={onReady} />);
    fireEvent.click(screen.getByRole("button", { name: "Start from scratch" }));
    expect(onReady.mock.calls[0][0].contact.name).toBe("");
  });
});
