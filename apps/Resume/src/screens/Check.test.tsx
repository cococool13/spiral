import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyDoc, emptyRole, type ResumeDoc } from "../lib/types";
import { Check } from "./Check";

function docWithRole(): ResumeDoc {
  const role = emptyRole("exp-0");
  role.title = "Analyst";
  role.organization = "Admiralty";
  role.bullets = [{ id: "exp-0-b-0", text: "Wrote the first algorithm" }];
  return { ...emptyDoc(), contact: { ...emptyDoc().contact, name: "Ada" }, experience: [role] };
}

describe("Check", () => {
  it("shows every extracted fact in an editable field", () => {
    render(<Check doc={docWithRole()} onChange={vi.fn()} onContinue={vi.fn()} />);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Ada");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Analyst");
    expect((screen.getByLabelText("Employer") as HTMLInputElement).value).toBe("Admiralty");
  });

  it("reports an edited fact upward without keeping its own copy", () => {
    const onChange = vi.fn();
    render(<Check doc={docWithRole()} onChange={onChange} onContinue={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Grace" } });
    expect(onChange.mock.calls[0][0].contact.name).toBe("Grace");
  });

  it("edits a bullet by id", () => {
    const onChange = vi.fn();
    render(<Check doc={docWithRole()} onChange={onChange} onContinue={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue("Wrote the first algorithm"), {
      target: { value: "Wrote the algorithm" },
    });
    expect(onChange.mock.calls[0][0].experience[0].bullets[0].text).toBe("Wrote the algorithm");
    expect(onChange.mock.calls[0][0].experience[0].bullets[0].id).toBe("exp-0-b-0");
  });

  it("adds an empty role for a resume that parsed nothing", () => {
    const onChange = vi.fn();
    render(<Check doc={emptyDoc()} onChange={onChange} onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a role" }));
    expect(onChange.mock.calls[0][0].experience[0].id).toBe("exp-0");
  });
});
