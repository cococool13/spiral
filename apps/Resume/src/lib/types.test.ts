import { describe, expect, it } from "vitest";
import { emptyDoc } from "./types";

describe("emptyDoc", () => {
  it("matches the shape Rust serialises", () => {
    expect(emptyDoc()).toEqual({
      contact: { name: "", email: "", phone: "", location: "", links: [] },
      summary: "",
      experience: [],
      education: [],
      projects: [],
      skills: [],
    });
  });
});
