import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppBar from "./AppBar";

const items = [
  { id: "browse", label: "Browse", onSelect: vi.fn() },
  { id: "settings", label: "Settings", onSelect: vi.fn() },
];

describe("AppBar", () => {
  it("shows the collection and the app as one name", () => {
    render(<AppBar app="Resume" items={items} />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Spiral Resume");
  });

  it("keeps the menu shut until it is asked for", () => {
    render(<AppBar app="Resume" items={items} />);
    expect(screen.queryByText("Browse")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByText("Browse")).toBeTruthy();
  });

  it("reports whether it is open, for anyone who cannot see it", () => {
    render(<AppBar app="Resume" items={items} />);
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
  });

  it("chooses a destination and closes behind itself", () => {
    const onSelect = vi.fn();
    render(<AppBar app="Resume" items={[{ id: "settings", label: "Settings", onSelect }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByText("Settings"));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("marks the destination you are already on", () => {
    render(<AppBar app="Clean" items={items} current="browse" />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByText("Browse").getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Settings").getAttribute("aria-current")).toBeNull();
  });

  /// Escape is the way out of a menu for anyone not using a mouse, and focus
  /// has to come back to the control that opened it rather than the document.
  it("closes on Escape and gives the button its focus back", () => {
    render(<AppBar app="Resume" items={items} />);
    const menu = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(menu);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Browse")).toBeNull();
    expect(document.activeElement).toBe(menu);
  });

  it("closes when the click lands somewhere else", () => {
    render(<AppBar app="Resume" items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Browse")).toBeNull();
  });

  /// A red square is not information on its own: whatever the dot says has to
  /// be said in words too, on the button and on the item it belongs to.
  it("says what the dot means in words as well as colour", () => {
    render(
      <AppBar
        app="Wallpaper"
        items={[{ id: "settings", label: "Settings", dot: true, onSelect: vi.fn() }]}
      />,
    );
    expect(screen.getByText(/something needs attention/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Menu/ }));
    expect(screen.getByText(/update available/)).toBeTruthy();
  });

  /// The words next to the dot are for screen readers, and the stylesheet is
  /// the only thing that keeps them off the page. Without the rule, the header
  /// reads "— something needs attention" in plain sight.
  it("hides the dot's words with a class the app actually defines", () => {
    render(
      <AppBar
        app="Resume"
        items={[{ id: "settings", label: "Settings", dot: true, onSelect: vi.fn() }]}
      />,
    );
    const words = screen.getByText(/something needs attention/);
    expect(words.className).toBe("visually-hidden");
  });

  it("says nothing about attention when nothing wants it", () => {
    render(<AppBar app="Resume" items={items} />);
    expect(screen.queryByText(/needs attention/)).toBeNull();
  });
});
