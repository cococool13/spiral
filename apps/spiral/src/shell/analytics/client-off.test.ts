import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ loads: 0 }));

vi.mock("posthog-js", () => {
  state.loads += 1;
  return {
    default: {
      init() {
        return undefined;
      },
    },
  };
});

// The shipped config carries the real key; this test is about the empty-key path.
vi.mock("./config", () => ({ POSTHOG_KEY: "", POSTHOG_HOST: "https://us.i.posthog.com" }));

it("does not import posthog or call fetch when the key is empty", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  state.loads = 0;
  vi.resetModules();
  const { begin } = await import("./client");
  await begin({
    optedOut: false,
    platform: "macos",
    fallbackVersion: "2.0.0",
    route: "picker",
    testRun: false,
  });
  expect(state.loads).toBe(0);
  expect(fetchMock).not.toHaveBeenCalled();
});
