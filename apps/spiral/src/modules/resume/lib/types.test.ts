import { describe, expect, it } from "vitest";
import { emptyDoc, scratchDoc } from "./types";

describe("emptyDoc", () => {
  it("matches the shape Rust serialises", () => {
    expect(emptyDoc()).toEqual({
      contact: { name: "", email: "", phone: "", location: "", links: [] },
      headline: "",
      summary: "",
      experience: [],
      education: [],
      projects: [],
      leadership: [],
      awards: [],
      interests: [],
      skills: [],
    });
  });
});

describe("scratchDoc", () => {
  it("opens one empty role so Check is a form, not an Add button", () => {
    const doc = scratchDoc();
    expect(doc.experience).toHaveLength(1);
    expect(doc.experience[0].id).toBe("exp-0");
    expect(doc.experience[0].bullets).toEqual([{ id: "exp-0-b-0", text: "" }]);
    expect(doc.contact.name).toBe("");
  });
});
