import { describe, expect, it } from "vitest";
import { emptyDoc, emptyRole, emptySchool } from "./types";
import { recommendTemplate } from "./recommend";

describe("recommendTemplate", () => {
  it("sends a student page to Chronicle", () => {
    const school = emptySchool("edu-0");
    school.institution = "Cambridge";
    expect(recommendTemplate({ ...emptyDoc(), education: [school] })).toBe("chronicle");
  });

  it("sends a long work history to Timeline", () => {
    const roles = [0, 1, 2].map((i) => {
      const role = emptyRole(`exp-${i}`);
      role.title = "Engineer";
      role.organization = "Admiralty";
      role.bullets = [
        { id: `exp-${i}-b-0`, text: "Wrote tables" },
        { id: `exp-${i}-b-1`, text: "Checked logs" },
        { id: `exp-${i}-b-2`, text: "Ran the engine" },
      ];
      return role;
    });
    expect(recommendTemplate({ ...emptyDoc(), experience: roles })).toBe("timeline");
  });

  it("falls back to Bullet when there is almost nothing to go on", () => {
    expect(recommendTemplate(emptyDoc())).toBe("bullet");
  });
});
