import { describe, expect, it, vi } from "vitest";
import { withViewTransition } from "./viewTransition";

describe("withViewTransition", () => {
  it("runs the update immediately when motion is reduced", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const update = vi.fn();
    withViewTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });
});
