// @vitest-environment jsdom
//
// Scope, deliberately narrow: the `invoke` contract for `uninstall_execute`,
// not the screen's markup or visual states. The brief itself names the
// highest-value failure this guards against — if `displayed` ever became the
// filtered or re-sorted list instead of every item `uninstall_inspect`
// returned, in the order it returned them, `run_uninstall`'s echo check
// (commands.rs) would deny every real uninstall, and the app would look
// broken with no error a user could act on. Nothing else in this test suite
// catches that; it can only be caught here, at the boundary this screen
// controls.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import Uninstall from "./Uninstall";
import type { AppSummary, InspectResult, UninstallReport } from "./Uninstall";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

// jsdom has never implemented <dialog>'s imperative methods — showModal()
// and close() are simply absent (jsdom/jsdom issue 3294), not stubbed. Uninstall.tsx
// opens and closes its review dialog exactly the way the already-shipped
// ConfirmSheet.tsx does, in a useEffect calling both — so rendering either
// component under jsdom needs the same two methods given a body, not a
// different dialog implementation substituted in to test against.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  }
});

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
});

const APP: AppSummary = {
  name: "Foo",
  bundle_id: "com.example.foo",
  bytes: 4096,
  handoff: null,
  running: false,
};

// Three items, in the order `uninstall_inspect` would already have sorted
// them (commands.rs's `order_items`). Nothing in this test suite re-sorts
// them again — the point is to prove the screen doesn't either.
const INSPECTED: InspectResult = {
  bundle_id: "com.example.foo",
  name: "Foo",
  items: [
    { path: "/Users/x/Library/Application Support/com.example.foo", bytes: 100, evidence: "Verified" },
    { path: "/Users/x/Library/Caches/Foo", bytes: 200, evidence: "Likely" },
    { path: "/Users/x/Library/Preferences/com.example.foo.plist", bytes: 50, evidence: "Verified" },
  ],
  handoff: null,
  running: false,
};

const REPORT: UninstallReport = { removed: 3, partially_removed: [], excluded: 0, failed: [] };

const CASK_APP: AppSummary = {
  name: "Casky",
  bundle_id: "com.example.cask",
  bytes: 2048,
  handoff: "brew uninstall --cask caskname",
  running: false,
};

const CASK_INSPECTED: InspectResult = {
  bundle_id: "com.example.cask",
  name: "Casky",
  items: [{ path: "/Users/x/Library/Caches/Casky", bytes: 10, evidence: "Likely" }],
  handoff: "brew uninstall --cask caskname",
  running: false,
};

function respondTo(list: AppSummary[], inspectByBundleId: Record<string, InspectResult>) {
  mockInvoke.mockImplementation(async (command: string, args?: unknown) => {
    switch (command) {
      case "uninstall_list":
        return list;
      case "uninstall_inspect": {
        const bundleId = (args as { bundleId: string }).bundleId;
        const result = inspectByBundleId[bundleId];
        if (!result) throw new Error(`no inspect fixture for ${bundleId}`);
        return result;
      }
      case "uninstall_execute":
        return REPORT;
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  });
}

async function openReview() {
  render(<Uninstall />);
  const reviewButton = await screen.findByRole("button", { name: "Review" });
  fireEvent.click(reviewButton);
}

describe("Uninstall screen — the uninstall_execute invoke contract", () => {
  it("calls uninstall_execute with all three arguments under their exact Rust key names", async () => {
    respondTo([APP], { [APP.bundle_id]: INSPECTED });
    await openReview();

    const uninstallButton = await screen.findByRole("button", { name: "Uninstall" });
    fireEvent.click(uninstallButton);

    await screen.findByText(/removed$/);

    expect(mockInvoke).toHaveBeenCalledWith("uninstall_execute", {
      bundleId: APP.bundle_id,
      deselected: [],
      displayed: INSPECTED.items.map((item) => item.path),
    });

    // `toHaveBeenCalledWith` above is already an exact structural match, not
    // a partial one — this makes that explicit for a reader rather than
    // relying on knowing Vitest's default, and would also catch a key added
    // under an equal-looking alias the object-equality check might not
    // isolate as clearly on its own.
    const call = mockInvoke.mock.calls.find(([command]) => command === "uninstall_execute");
    expect(call?.[1] && Object.keys(call[1] as object).sort()).toEqual([
      "bundleId",
      "deselected",
      "displayed",
    ]);
  });

  it("sends displayed as every item's path in the order uninstall_inspect returned them, unaffected by deselection", async () => {
    respondTo([APP], { [APP.bundle_id]: INSPECTED });
    await openReview();

    // Deselect the middle item — a position a filtered or re-sorted
    // `displayed` would reveal immediately, unlike the first or last.
    const checkboxes = await screen.findAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    fireEvent.click(checkboxes[1]);

    const uninstallButton = await screen.findByRole("button", { name: "Uninstall" });
    fireEvent.click(uninstallButton);
    await screen.findByText(/removed$/);

    const call = mockInvoke.mock.calls.find(([command]) => command === "uninstall_execute");
    const args = call?.[1] as { displayed: string[] } | undefined;
    expect(args?.displayed).toEqual(INSPECTED.items.map((item) => item.path));
  });

  it("reflects deselection only in deselected, never in displayed", async () => {
    respondTo([APP], { [APP.bundle_id]: INSPECTED });
    await openReview();

    const checkboxes = await screen.findAllByRole("checkbox");
    fireEvent.click(checkboxes[0]); // deselect item 0
    fireEvent.click(checkboxes[2]); // deselect item 2
    fireEvent.click(checkboxes[0]); // reselect item 0 — proves toggling, not one-way marking

    const uninstallButton = await screen.findByRole("button", { name: "Uninstall" });
    fireEvent.click(uninstallButton);
    await screen.findByText(/removed$/);

    const call = mockInvoke.mock.calls.find(([command]) => command === "uninstall_execute");
    const args = call?.[1] as { deselected: number[]; displayed: string[] } | undefined;
    expect(args?.deselected).toEqual([2]);
    expect(args?.displayed).toEqual(INSPECTED.items.map((item) => item.path));
  });

  it("never reaches uninstall_execute for an app with a handoff", async () => {
    respondTo([CASK_APP], { [CASK_APP.bundle_id]: CASK_INSPECTED });
    await openReview();

    // Wait for the review to actually render before asserting on its
    // absence of a delete control — confirms the handoff branch, not an
    // inspect that simply hasn't resolved yet.
    await screen.findByText("brew uninstall --cask caskname");
    expect(screen.queryByRole("button", { name: "Uninstall" })).toBeNull();

    expect(
      mockInvoke.mock.calls.some(([command]) => command === "uninstall_execute"),
    ).toBe(false);
  });
});
