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
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import Uninstall from "./Uninstall";
import type { AppSummary, InspectResult, LeftoverItem, UninstallReport } from "./Uninstall";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

// The drop handler (Task 6) subscribes to Tauri's own drag-drop event
// stream via `getCurrentWebview().onDragDropEvent`, not `invoke` — jsdom has
// no Tauri IPC bridge at all, so the real module would throw the moment the
// component's effect called it. Mocking it here also gives each test a
// handle on the exact callback the component registered, so a drop can be
// simulated by calling that callback directly with a `DragDropEvent`-shaped
// payload, the same shape `@tauri-apps/api/webview` documents.
//
// `vi.hoisted` (not a plain `const` above the `vi.mock` call) because
// `vi.mock` factories are hoisted above the rest of the module — a bare
// `const mockOnDragDropEvent = vi.fn()` declared after it would still not
// exist yet when the factory itself runs.
const { mockOnDragDropEvent } = vi.hoisted(() => ({ mockOnDragDropEvent: vi.fn() }));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: mockOnDragDropEvent }),
}));

const mockInvoke = vi.mocked(invoke);

// Resolves to an unlisten function before the very first test runs too, not
// only after each one (`afterEach` below re-primes it, but that does not
// run before test 1) — otherwise the drag-drop registration effect's
// promise would reject on the first render in the file.
mockOnDragDropEvent.mockResolvedValue(() => {});

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
  mockOnDragDropEvent.mockReset();
  // Resolves to an unlisten function by default, exactly like the real
  // Tauri API — a test that cares about the drop callback overrides this
  // with its own captured reference, but every other test still needs the
  // component's registration effect to resolve cleanly rather than reject.
  mockOnDragDropEvent.mockResolvedValue(() => {});
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

// A genuine Apple application, as `apps::discover` now returns since M4b
// Task 1 widened discovery — the drop handler must refuse it by its bundle
// id, independent of whatever `uninstall_inspect` itself would do with it.
const APPLE_APP: AppSummary = {
  name: "Finder",
  bundle_id: "com.apple.finder",
  bytes: 8192,
  handoff: null,
  running: false,
};

// Item 0 owns two paths, item 1 owns one — the shape decision 3 in
// commands.rs's own comment names as the one that makes the item-index
// space (`deselected`) and the flattened-path-index space (`displayed`)
// actually diverge. A leftovers fixture where every item has exactly one
// path could pass with either space wired to the other by mistake; this one
// cannot.
const LEFTOVERS: LeftoverItem[] = [
  {
    bundle_id: "com.example.multi",
    paths: [
      "/Users/x/Library/Application Support/com.example.multi",
      "/Users/x/Library/Caches/com.example.multi",
    ],
    bytes: 300,
  },
  {
    bundle_id: "com.example.single",
    paths: ["/Users/x/Library/Preferences/com.example.single.plist"],
    bytes: 50,
  },
];

const LEFTOVER_REPORT: UninstallReport = { removed: 1, partially_removed: [], excluded: 0, failed: [] };

function respondTo(
  list: AppSummary[],
  inspectByBundleId: Record<string, InspectResult>,
  leftovers: LeftoverItem[] = [],
) {
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
      case "leftovers_scan":
        return leftovers;
      case "leftovers_remove":
        return LEFTOVER_REPORT;
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

// Scope, deliberately narrow, same as above: the `leftovers_remove` invoke
// contract. `run_leftovers` (commands.rs) is explicit that this call's two
// arguments index *different* lists — `deselected` is positions in the
// leftover *item* list, `displayed` is every path of every item flattened
// in order — and that the two spaces are indistinguishable from each other
// exactly when every leftover has one path. `LEFTOVERS` below deliberately
// gives one item two paths so a UI that wired a flattened path offset to
// `deselected` (or vice versa) fails this suite instead of passing it by
// coincidence.
describe("Uninstall screen — the leftovers_remove invoke contract", () => {
  async function loadLeftoversSection(leftovers: LeftoverItem[]) {
    respondTo([], {}, leftovers);
    render(<Uninstall />);
    // Wait for the section to finish its scan before touching its
    // checkboxes — they don't exist while `leftoversLoading` is true.
    await screen.findByText(leftovers[0].bundle_id);
  }

  it("sends deselected as item indices, not flattened path offsets, and displayed as every path flattened in item order, unaffected by deselection", async () => {
    await loadLeftoversSection(LEFTOVERS);

    const checkboxes = await screen.findAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    // Deselect item 1 ("com.example.single") — its one path sits at
    // flattened offset 2, since item 0 ("com.example.multi") contributes
    // offsets 0 and 1. A UI that computed the flattened offset instead of
    // the item index would send `deselected: [2]` here; the item-index
    // space `run_leftovers` actually expects is `[1]`.
    fireEvent.click(checkboxes[1]);

    fireEvent.click(screen.getByRole("button", { name: "Remove leftovers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await screen.findByText(/removed$/);

    const call = mockInvoke.mock.calls.find(([command]) => command === "leftovers_remove");
    const args = call?.[1] as { deselected: number[]; displayed: string[] } | undefined;
    expect(args?.deselected).toEqual([1]);
    expect(args?.displayed).toEqual(LEFTOVERS.flatMap((item) => item.paths));
    expect(args?.displayed).toHaveLength(3);
  });

  it("calls leftovers_remove with exactly deselected and displayed under their exact Rust key names", async () => {
    await loadLeftoversSection(LEFTOVERS);

    fireEvent.click(screen.getByRole("button", { name: "Remove leftovers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await screen.findByText(/removed$/);

    const call = mockInvoke.mock.calls.find(([command]) => command === "leftovers_remove");
    expect(call?.[1] && Object.keys(call[1] as object).sort()).toEqual(["deselected", "displayed"]);
  });
});

// The drop handler (Task 6, Step 2): a dropped app bundle must resolve to
// exactly the same review sheet `inspect` opens from a Review button click
// — never a second review path — and a dropped item that isn't an
// installable, non-Apple application must be refused, by name, with no
// review sheet opened at all.
describe("Uninstall screen — the drop handler", () => {
  async function dropAndCapture() {
    render(<Uninstall />);
    // Wait for the app list to actually resolve — the drop handler reads
    // it via a ref kept in sync with this same state, so resolving a drop
    // before it has loaded would fail to match for a reason unrelated to
    // what each test below means to prove. `findAllBy` because more than
    // one fixture app can be listed at once (the Apple-app refusal test).
    await screen.findAllByRole("button", { name: "Review" });
    await waitFor(() => expect(mockOnDragDropEvent).toHaveBeenCalled());
    const handler = mockOnDragDropEvent.mock.calls[mockOnDragDropEvent.mock.calls.length - 1][0] as (event: {
      payload: { type: string; paths?: string[] };
    }) => void;
    return handler;
  }

  it("opens the same review sheet the list opens for a dropped app that matches an installed application", async () => {
    respondTo([APP], { [APP.bundle_id]: INSPECTED });
    const handleDrop = await dropAndCapture();

    handleDrop({ payload: { type: "drop", paths: [`/Applications/${APP.name}.app`] } });

    // The review sheet actually opened — the same dialog and the same
    // "Uninstall" control the list's Review button reaches.
    await screen.findByRole("button", { name: "Uninstall" });
    expect(mockInvoke).toHaveBeenCalledWith("uninstall_inspect", { bundleId: APP.bundle_id });
  });

  it("refuses a dropped item that is not a .app bundle, naming what was dropped, and never calls uninstall_inspect", async () => {
    respondTo([APP], { [APP.bundle_id]: INSPECTED });
    const handleDrop = await dropAndCapture();

    handleDrop({ payload: { type: "drop", paths: ["/Users/x/Downloads/notes.txt"] } });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("notes.txt");
    expect(screen.queryByRole("button", { name: "Uninstall" })).toBeNull();
    expect(mockInvoke.mock.calls.some(([command]) => command === "uninstall_inspect")).toBe(false);
  });

  it("refuses a dropped Apple application by name and never calls uninstall_inspect", async () => {
    respondTo([APP, APPLE_APP], { [APP.bundle_id]: INSPECTED });
    const handleDrop = await dropAndCapture();

    handleDrop({ payload: { type: "drop", paths: [`/Applications/${APPLE_APP.name}.app`] } });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(APPLE_APP.name);
    expect(screen.queryByRole("button", { name: "Uninstall" })).toBeNull();
    expect(mockInvoke.mock.calls.some(([command]) => command === "uninstall_inspect")).toBe(false);
  });

  it("refuses a dropped .app that is not in the installed applications list, naming it, and never calls uninstall_inspect", async () => {
    respondTo([APP], { [APP.bundle_id]: INSPECTED });
    const handleDrop = await dropAndCapture();

    handleDrop({ payload: { type: "drop", paths: ["/Applications/Unknown.app"] } });

    // Not just "an alert appeared" — the alert must actually name what was
    // dropped, or a regression to a bare error code would pass this test.
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Unknown.app");
    expect(screen.queryByRole("button", { name: "Uninstall" })).toBeNull();
    expect(mockInvoke.mock.calls.some(([command]) => command === "uninstall_inspect")).toBe(false);
  });

  it("refuses a multi-item drop by name, rather than silently acting on only the first item", async () => {
    respondTo([APP], { [APP.bundle_id]: INSPECTED });
    const handleDrop = await dropAndCapture();

    handleDrop({
      payload: {
        type: "drop",
        paths: [`/Applications/${APP.name}.app`, "/Applications/Other.app"],
      },
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("one application at a time");
    expect(screen.queryByRole("button", { name: "Uninstall" })).toBeNull();
    expect(mockInvoke.mock.calls.some(([command]) => command === "uninstall_inspect")).toBe(false);
  });

  // The Critical fix from review: two installed applications sharing a
  // display name at different install locations — exactly the shape M4b
  // Task 1's widened discovery produces (`/Applications/Vendor App.app` and
  // `/Applications/Setapp/Vendor App.app`, both reporting the same
  // `CFBundleName`). The previous implementation matched on name with
  // `.find`, which resolves to whichever entry happens to come first —
  // proven, in review, to invoke `uninstall_inspect` for the *other* app's
  // bundle id than the one actually dropped. `AppSummary` carries no `path`
  // field to disambiguate by (see `handleDroppedPaths`'s comment on why
  // that would need a Rust change this task does not make), so the correct,
  // safe behaviour available today is to refuse rather than guess. This
  // proves the refusal, not a resolution the frontend cannot yet make
  // correctly.
  it("refuses a dropped .app whose display name matches more than one installed application, rather than guessing which one was dropped", async () => {
    const first: AppSummary = {
      name: "Vendor App",
      bundle_id: "com.vendor.app",
      bytes: 1024,
      handoff: null,
      running: false,
    };
    const second: AppSummary = {
      name: "Vendor App",
      bundle_id: "com.vendor.app.setapp",
      bytes: 1024,
      handoff: null,
      running: false,
    };
    respondTo([first, second], {});
    const handleDrop = await dropAndCapture();

    handleDrop({ payload: { type: "drop", paths: ["/Applications/Setapp/Vendor App.app"] } });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Vendor App");
    expect(screen.queryByRole("button", { name: "Uninstall" })).toBeNull();
    // Neither candidate's bundle id may be inspected — an ambiguous match
    // must never fall back to "just pick one."
    expect(mockInvoke.mock.calls.some(([command]) => command === "uninstall_inspect")).toBe(false);
  });
});
