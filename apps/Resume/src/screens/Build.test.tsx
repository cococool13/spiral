import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDoc } from "../lib/types";
import type { BuildResult, Progress } from "../lib/types";
import { Build } from "./Build";

const buildDocument = vi.fn(
  async (
    _doc: unknown,
    _template: string,
    _format: string,
    _accent: string,
    onProgress: (p: Progress) => void,
  ): Promise<BuildResult> => {
    onProgress({ stage: "Reading structure", percent: 15 });
    onProgress({ stage: "Preparing the file", percent: 100 });
    return { pages: ["<svg id='p1'></svg>"], suggestedName: "Ada-Lovelace-resume.pdf" };
  },
);

vi.mock("../lib/ipc", () => ({
  buildDocument: (d: unknown, t: string, f: string, a: string, p: (x: Progress) => void) =>
    buildDocument(d, t, f, a, p),
}));

describe("Build", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the last stage reported and its percent", async () => {
    render(
      <Build
        doc={emptyDoc()}
        template="column"
        format="pdf"
        accent="ink"
        onDone={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("Preparing the file…")).toBeTruthy());
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("hands the finished build up", async () => {
    const onDone = vi.fn();
    render(
      <Build doc={emptyDoc()} template="column" format="pdf" accent="ink" onDone={onDone} onBack={vi.fn()} />,
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][0].suggestedName).toBe("Ada-Lovelace-resume.pdf");
  });

  it("builds exactly once", async () => {
    const onDone = vi.fn();
    render(
      <Build doc={emptyDoc()} template="column" format="pdf" accent="ink" onDone={onDone} onBack={vi.fn()} />,
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(buildDocument).toHaveBeenCalledTimes(1);
  });

  it("shows a failure as a sentence with a way back, not a stuck bar", async () => {
    buildDocument.mockRejectedValueOnce("The template failed to typeset: nope.");
    const onBack = vi.fn();
    render(
      <Build doc={emptyDoc()} template="column" format="pdf" accent="ink" onDone={vi.fn()} onBack={onBack} />,
    );
    await waitFor(() => expect(screen.getByText(/failed to typeset/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Back to Style" })).toBeTruthy();
  });
});
