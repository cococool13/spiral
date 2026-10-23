import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRadioGroup } from "./useRadioGroup";

function Group({
  chosen,
  onChoose,
}: {
  chosen: string;
  onChoose: (value: string) => void;
}) {
  const props = useRadioGroup(["column", "ledger", "sheet"], chosen, onChoose);
  return (
    <div role="radiogroup" aria-label="Style">
      {["column", "ledger", "sheet"].map((id) => (
        <button key={id} type="button" {...props(id)}>
          {id}
        </button>
      ))}
    </div>
  );
}

describe("useRadioGroup", () => {
  /** A radiogroup is one Tab stop. Twelve style cards as twelve stops is both
   *  slower and not what "radio, 1 of 12" tells a screen-reader user to expect. */
  it("puts exactly one option in the tab order", () => {
    render(<Group chosen="ledger" onChoose={vi.fn()} />);
    const stops = screen
      .getAllByRole("radio")
      .filter((option) => option.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
    expect(stops[0].textContent).toBe("ledger");
  });

  /** Before anything is chosen Tab still has to land somewhere. */
  it("falls back to the first option when nothing is chosen", () => {
    render(<Group chosen="" onChoose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "column" }).getAttribute("tabindex")).toBe("0");
  });

  it("moves with the arrow keys and wraps at both ends", () => {
    const onChoose = vi.fn();
    render(<Group chosen="ledger" onChoose={onChoose} />);
    const current = screen.getByRole("radio", { name: "ledger" });

    fireEvent.keyDown(current, { key: "ArrowRight" });
    expect(onChoose).toHaveBeenLastCalledWith("sheet");

    fireEvent.keyDown(current, { key: "ArrowLeft" });
    expect(onChoose).toHaveBeenLastCalledWith("column");

    fireEvent.keyDown(screen.getByRole("radio", { name: "column" }), { key: "ArrowLeft" });
    expect(onChoose).toHaveBeenLastCalledWith("sheet");
  });

  it("jumps to the ends with Home and End", () => {
    const onChoose = vi.fn();
    render(<Group chosen="ledger" onChoose={onChoose} />);
    const current = screen.getByRole("radio", { name: "ledger" });

    fireEvent.keyDown(current, { key: "End" });
    expect(onChoose).toHaveBeenLastCalledWith("sheet");

    fireEvent.keyDown(current, { key: "Home" });
    expect(onChoose).toHaveBeenLastCalledWith("column");
  });

  it("leaves other keys alone", () => {
    const onChoose = vi.fn();
    render(<Group chosen="ledger" onChoose={onChoose} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "ledger" }), { key: "a" });
    expect(onChoose).not.toHaveBeenCalled();
  });
});
