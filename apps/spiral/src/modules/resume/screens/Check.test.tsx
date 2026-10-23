import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyDoc } from "../lib/types";
import { Check } from "./Check";

const checkResume = vi.fn(async () => ({ findings: [] as Array<Record<string, string | number>> }));

vi.mock("../api", () => ({
  checkResume: () => checkResume(),
}));

describe("Check", () => {
  it("says when nothing is wrong", async () => {
    checkResume.mockResolvedValueOnce({ findings: [] });
    render(<Check doc={emptyDoc()} text="" onContinue={vi.fn()} />);
    expect(await screen.findByText("No problems found.")).toBeTruthy();
  });

  it("names each problem and the next step", async () => {
    checkResume.mockResolvedValueOnce({
      findings: [
        { type: "missingContact", field: "email" },
        { type: "unknownHeading", raw: "SIDE QUESTS" },
        { type: "unparsedDate", raw: "last spring" },
        { type: "hiddenText", page: 2, sample: "white text" },
      ],
    });
    render(<Check doc={emptyDoc()} text="Ada" onContinue={vi.fn()} />);
    expect(await screen.findByText("Add an email.")).toBeTruthy();
    expect(screen.getByText(/SIDE QUESTS is not a heading/)).toBeTruthy();
    expect(screen.getByText(/last spring has no year/)).toBeTruthy();
    expect(screen.getByText(/Page 2 has hidden text/)).toBeTruthy();
  });

  it("continues", async () => {
    const onContinue = vi.fn();
    checkResume.mockResolvedValueOnce({ findings: [] });
    render(<Check doc={emptyDoc()} text="" onContinue={onContinue} />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
