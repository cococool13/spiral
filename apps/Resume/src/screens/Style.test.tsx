import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDoc } from "../lib/types";
import { Style } from "./Style";

import type { ResumeDoc, Thumbnail } from "../lib/types";

const renderThumbnails = vi.fn(
  async (_doc: ResumeDoc, _accent: string): Promise<Thumbnail[]> => [
    { id: "column", name: "Column", svg: "<svg id='a'></svg>", error: "" },
    { id: "sheet", name: "Sheet", svg: "<svg id='b'></svg>", error: "" },
  ],
);

vi.mock("../lib/ipc", () => ({
  renderThumbnails: (doc: ResumeDoc, accent: string) => renderThumbnails(doc, accent),
  // Written this way on purpose: check-hex forbids colour literals outside the
  // token file, and a test fixture is no exception. The real values come from
  // Rust; what matters here is only that two swatches arrive.
  listAccents: async () => [
    { id: "ink", hex: "rgb(17, 17, 17)" },
    { id: "navy", hex: "rgb(31, 51, 82)" },
  ],
}));

describe("Style", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a card per template once the thumbnails arrive", async () => {
    render(<Style
        doc={emptyDoc()}
        chosen=""
        accent="ink"
        onChoose={vi.fn()}
        onChooseAccent={vi.fn()}
        onContinue={vi.fn()}
      />);
    await waitFor(() => expect(screen.getByRole("radio", { name: /Column/ })).toBeTruthy());
    expect(screen.getByRole("radio", { name: /Sheet/ })).toBeTruthy();
  });

  it("reports the chosen template upward", async () => {
    const onChoose = vi.fn();
    render(<Style
        doc={emptyDoc()}
        chosen=""
        accent="ink"
        onChoose={onChoose}
        onChooseAccent={vi.fn()}
        onContinue={vi.fn()}
      />);
    await waitFor(() => screen.getByRole("radio", { name: /Column/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Column/ }));
    expect(onChoose).toHaveBeenCalledWith("column");
  });

  it("marks the chosen card for assistive technology", async () => {
    render(<Style
        doc={emptyDoc()}
        chosen="sheet"
        accent="ink"
        onChoose={vi.fn()}
        onChooseAccent={vi.fn()}
        onContinue={vi.fn()}
      />);
    await waitFor(() => screen.getByRole("radio", { name: /Sheet/ }));
    expect(screen.getByRole("radio", { name: /Sheet/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /Column/ }).getAttribute("aria-checked")).toBe("false");
  });

  it("does not continue before a style is chosen, and says what is missing", async () => {
    const onContinue = vi.fn();
    render(<Style
        doc={emptyDoc()}
        chosen=""
        accent="ink"
        onChoose={vi.fn()}
        onChooseAccent={vi.fn()}
        onContinue={onContinue}
      />);
    await waitFor(() => screen.getByRole("radio", { name: /Column/ }));
    const use = screen.getByRole("button", { name: "Use this style" });
    expect(use.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(use);
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText("Pick a style to carry on.")).toBeTruthy();
  });

  it("shows a failed template's reason on its own card instead of blanking the screen", async () => {
    renderThumbnails.mockResolvedValueOnce([
      { id: "column", name: "Column", svg: "<svg id='a'></svg>", error: "" },
      { id: "sheet", name: "Sheet", svg: "", error: "The template failed to typeset: nope." },
    ]);
    render(<Style
        doc={emptyDoc()}
        chosen=""
        accent="ink"
        onChoose={vi.fn()}
        onChooseAccent={vi.fn()}
        onContinue={vi.fn()}
      />);
    await waitFor(() => screen.getByRole("radio", { name: /Column/ }));
    expect(screen.getByText(/failed to typeset/)).toBeTruthy();
  });
});
