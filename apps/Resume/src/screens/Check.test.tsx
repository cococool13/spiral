import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyDoc, emptyRole, type ResumeDoc } from "../lib/types";
import { Check } from "./Check";

// The wording review is a Rust call; jsdom has no backend.
const reviewWording = vi.fn(async () => [
  {
    bulletId: "exp-0-b-0",
    tightened: "Wrote the algorithm",
    notes: ["No number in this one — can you quantify it?"],
  },
]);
vi.mock("../lib/ipc", () => ({ reviewWording: () => reviewWording() }));

function docWithRole(): ResumeDoc {
  const role = emptyRole("exp-0");
  role.title = "Analyst";
  role.organization = "Admiralty";
  role.bullets = [{ id: "exp-0-b-0", text: "Wrote the first algorithm" }];
  return { ...emptyDoc(), contact: { ...emptyDoc().contact, name: "Ada" }, experience: [role] };
}

describe("Check", () => {
  it("shows every extracted fact in an editable field", () => {
    render(<Check doc={docWithRole()} tighten={false} onChange={vi.fn()} onTighten={vi.fn()} onContinue={vi.fn()} />);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Ada");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Analyst");
    expect((screen.getByLabelText("Employer") as HTMLInputElement).value).toBe("Admiralty");
  });

  it("reports an edited fact upward without keeping its own copy", () => {
    const onChange = vi.fn();
    render(<Check doc={docWithRole()} tighten={false} onChange={onChange} onTighten={vi.fn()} onContinue={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Grace" } });
    expect(onChange.mock.calls[0][0].contact.name).toBe("Grace");
  });

  it("edits a bullet by id", () => {
    const onChange = vi.fn();
    render(<Check doc={docWithRole()} tighten={false} onChange={onChange} onTighten={vi.fn()} onContinue={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue("Wrote the first algorithm"), {
      target: { value: "Wrote the algorithm" },
    });
    expect(onChange.mock.calls[0][0].experience[0].bullets[0].text).toBe("Wrote the algorithm");
    expect(onChange.mock.calls[0][0].experience[0].bullets[0].id).toBe("exp-0-b-0");
  });

  it("shows what tightening would do, and its advice, when it is on", async () => {
    render(
      <Check doc={docWithRole()} tighten={true} onChange={vi.fn()} onTighten={vi.fn()} onContinue={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText(/Will become/)).toBeTruthy());
    expect(screen.getByText(/quantify it/)).toBeTruthy();
  });

  it("says nothing about wording when tightening is off", async () => {
    render(
      <Check doc={docWithRole()} tighten={false} onChange={vi.fn()} onTighten={vi.fn()} onContinue={vi.fn()} />,
    );
    await waitFor(() => expect(reviewWording).toHaveBeenCalled());
    expect(screen.queryByText(/Will become/)).toBeNull();
    expect(screen.queryByText(/quantify it/)).toBeNull();
  });

  it("applies a single suggestion without touching the others", async () => {
    const onChange = vi.fn();
    render(
      <Check doc={docWithRole()} tighten={true} onChange={onChange} onTighten={vi.fn()} onContinue={vi.fn()} />,
    );
    await waitFor(() => screen.getByRole("button", { name: "Use it now" }));
    fireEvent.click(screen.getByRole("button", { name: "Use it now" }));
    expect(onChange.mock.calls[0][0].experience[0].bullets[0].text).toBe("Wrote the algorithm");
  });

  it("reports the toggle upward", () => {
    const onTighten = vi.fn();
    render(
      <Check doc={docWithRole()} tighten={true} onChange={vi.fn()} onTighten={onTighten} onContinue={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText(/Tighten my wording/));
    expect(onTighten).toHaveBeenCalledWith(false);
  });

  it("adds an empty role for a resume that parsed nothing", () => {
    const onChange = vi.fn();
    render(<Check doc={emptyDoc()} tighten={false} onChange={onChange} onTighten={vi.fn()} onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a role" }));
    expect(onChange.mock.calls[0][0].experience[0].id).toBe("exp-0");
  });
});
