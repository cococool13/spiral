import { describe, expect, it } from "vitest";
import { compareFacts } from "./facts";
import { plainText } from "./plain";
import { emptyDoc, type ResumeDoc } from "./types";

function doc(): ResumeDoc {
  const base = emptyDoc();
  return {
    ...base,
    contact: { ...base.contact, name: "Maya Okafor", email: "maya@example.com" },
    headline: "Operations lead",
    experience: [
      {
        id: "exp-1",
        title: "Operations lead",
        organization: "Halden Health",
        location: "Oakland",
        start: { raw: "2022", year: 2022, month: null, present: false },
        end: { raw: "Present", year: null, month: null, present: true },
        bullets: [{ id: "b1", text: "Cut clinic wait time from 40 minutes to 18." }],
      },
    ],
  } as ResumeDoc;
}

describe("facts locked", () => {
  it("marks every fact unchanged when nothing was typed", () => {
    const rows = compareFacts(doc(), doc());
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every((row) => row.state === "unchanged")).toBe(true);
  });

  it("shows an edit, an addition and a removal against the original", () => {
    const next = doc();
    next.experience[0] = {
      ...next.experience[0],
      organization: "Halden Health Group",
      bullets: [{ id: "b2", text: "Hired four coordinators." }],
    } as ResumeDoc["experience"][number];
    const rows = compareFacts(doc(), next);
    const state = (match: string) => rows.find((row) => row.original === match || row.current === match)?.state;
    expect(state("Halden Health Group")).toBe("edited");
    expect(state("Hired four coordinators.")).toBe("added");
    expect(state("Cut clinic wait time from 40 minutes to 18.")).toBe("removed");
  });
});

describe("plain text", () => {
  it("keeps every fact in reading order", () => {
    const text = plainText(doc());
    const order = ["MAYA OKAFOR", "Operations lead", "maya@example.com", "Halden Health", "Cut clinic wait"];
    const at = order.map((part) => text.indexOf(part));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});
