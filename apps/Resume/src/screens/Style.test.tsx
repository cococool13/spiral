import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDoc } from "../lib/types";
import { Style } from "./Style";

import type { ResumeDoc, Thumbnail } from "../lib/types";

const renderThumbnails = vi.fn(
  async (_doc: ResumeDoc): Promise<Thumbnail[]> => [
    { id: "column", name: "Column", svg: "<svg id='a'></svg>", error: "" },
    { id: "sheet", name: "Sheet", svg: "<svg id='b'></svg>", error: "" },
  ],
);

vi.mock("../lib/ipc", () => ({
  renderThumbnails: (doc: ResumeDoc) => renderThumbnails(doc),
}));

describe("Style", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a card per template once the thumbnails arrive", async () => {
    render(<Style doc={emptyDoc()} chosen="" onChoose={vi.fn()} onContinue={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("radio", { name: /Column/ })).toBeTruthy());
    expect(screen.getByRole("radio", { name: /Sheet/ })).toBeTruthy();
  });

  it("reports the chosen template upward", async () => {
    const onChoose = vi.fn();
    render(<Style doc={emptyDoc()} chosen="" onChoose={onChoose} onContinue={vi.fn()} />);
    await waitFor(() => screen.getByRole("radio", { name: /Column/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Column/ }));
    expect(onChoose).toHaveBeenCalledWith("column");
  });

  it("marks the chosen card for assistive technology", async () => {
    render(<Style doc={emptyDoc()} chosen="sheet" onChoose={vi.fn()} onContinue={vi.fn()} />);
    await waitFor(() => screen.getByRole("radio", { name: /Sheet/ }));
    expect(screen.getByRole("radio", { name: /Sheet/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /Column/ }).getAttribute("aria-checked")).toBe("false");
  });

  it("cannot continue before a style is chosen", async () => {
    render(<Style doc={emptyDoc()} chosen="" onChoose={vi.fn()} onContinue={vi.fn()} />);
    await waitFor(() => screen.getByRole("radio", { name: /Column/ }));
    const use = screen.getByRole("button", { name: "Use this style" }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
  });

  it("shows a failed template's reason on its own card instead of blanking the screen", async () => {
    renderThumbnails.mockResolvedValueOnce([
      { id: "column", name: "Column", svg: "<svg id='a'></svg>", error: "" },
      { id: "sheet", name: "Sheet", svg: "", error: "The template failed to typeset: nope." },
    ]);
    render(<Style doc={emptyDoc()} chosen="" onChoose={vi.fn()} onContinue={vi.fn()} />);
    await waitFor(() => screen.getByRole("radio", { name: /Column/ }));
    expect(screen.getByText(/failed to typeset/)).toBeTruthy();
  });
});
