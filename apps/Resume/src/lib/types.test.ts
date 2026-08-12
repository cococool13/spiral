import { describe, expect, it } from "vitest";
import { emptyDoc } from "./types";

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
