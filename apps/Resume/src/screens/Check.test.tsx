import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyDoc, emptyRole, emptySchool, scratchDoc, type ResumeDoc, type School } from "../lib/types";
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

function school(): School {
  const next = emptySchool("edu-0");
  next.institution = "University of London";
  next.credential = "BSc Mathematics";
  next.notes = [{ id: "edu-0-b-0", text: "GPA 3.9" }];
  return next;
}

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

  /** Decision 9: Check is the only place a mis-parse can be caught. Summary,
   *  links and a role's place were typeset but had no editor, so a wrong one
   *  went to the page. */
  it("edits the summary, a link, and a role's place", () => {
    const onChange = vi.fn();
    const role = emptyRole("exp-0");
    role.title = "Analyst";
    role.organization = "Admiralty";
    role.location = "Portsmouth";
    const doc: ResumeDoc = {
      ...emptyDoc(),
      contact: { ...emptyDoc().contact, name: "Ada", links: ["github.com/ada"] },
      summary: "Analytical engine programmer.",
      experience: [role],
    };
    render(
      <Check doc={doc} tighten={false} onChange={onChange} onTighten={vi.fn()} onContinue={vi.fn()} />,
    );

    expect((screen.getByLabelText("Summary") as HTMLTextAreaElement).value).toBe(
      "Analytical engine programmer.",
    );
    fireEvent.change(screen.getByLabelText("Summary"), {
      target: { value: "Wrote the first algorithm." },
    });
    expect(onChange.mock.calls[0][0].summary).toBe("Wrote the first algorithm.");

    expect((screen.getByLabelText("Links 1") as HTMLInputElement).value).toBe("github.com/ada");
    fireEvent.change(screen.getByLabelText("Links 1"), {
      target: { value: "linkedin.com/in/ada" },
    });
    expect(onChange.mock.calls[1][0].contact.links).toEqual(["linkedin.com/in/ada"]);

    expect((screen.getByLabelText("Place") as HTMLInputElement).value).toBe("Portsmouth");
    fireEvent.change(screen.getByLabelText("Place"), { target: { value: "London" } });
    expect(onChange.mock.calls[2][0].experience[0].location).toBe("London");
  });

  it("edits a school's place", () => {
    const onChange = vi.fn();
    const next = school();
    next.location = "Cambridge";
    const doc = { ...docWithRole(), education: [next] };
    render(
      <Check doc={doc} tighten={false} onChange={onChange} onTighten={vi.fn()} onContinue={vi.fn()} />,
    );
    fireEvent.change(screen.getByDisplayValue("Cambridge"), { target: { value: "London" } });
    expect(onChange.mock.calls[0][0].education[0].location).toBe("London");
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
    const described = screen.getByLabelText("Bullet in Analyst").getAttribute("aria-describedby");
    expect(described).toContain("exp-0-b-0-preview");
    expect(described).toContain("exp-0-b-0-note-0");
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
    fireEvent.click(screen.getByLabelText(/Tighten wording/));
    expect(onTighten).toHaveBeenCalledWith(false);
  });

  /** An id derived from the list length repeats after a removal, and duplicate
   *  bullet ids let a model rewrite land on the wrong role's bullet. */
  it("never reuses a role id after an earlier role is removed", () => {
    const first = emptyRole("exp-0");
    const second = emptyRole("exp-1");
    const doc: ResumeDoc = { ...emptyDoc(), experience: [first, second] };
    const onChange = vi.fn();

    const { rerender } = render(
      <Check doc={doc} tighten={false} onChange={onChange} onTighten={vi.fn()} onContinue={vi.fn()} />,
    );
    // Remove the first role, leaving [exp-1].
    fireEvent.click(screen.getAllByRole("button", { name: "Remove this role" })[0]);
    const afterRemoval: ResumeDoc = onChange.mock.calls[0][0];
    expect(afterRemoval.experience.map((r) => r.id)).toEqual(["exp-1"]);

    onChange.mockClear();
    rerender(
      <Check
        doc={afterRemoval}
        tighten={false}
        onChange={onChange}
        onTighten={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add a role" }));

    const ids = onChange.mock.calls[0][0].experience.map((r: { id: string }) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["exp-1", "exp-2"]);
    expect(onChange.mock.calls[0][0].experience[1].bullets[0].id).toBe("exp-2-b-0");
  });

  it("adds an empty role for a resume that parsed nothing", () => {
    const onChange = vi.fn();
    render(<Check doc={emptyDoc()} tighten={false} onChange={onChange} onTighten={vi.fn()} onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a role" }));
    expect(onChange.mock.calls[0][0].experience[0].id).toBe("exp-0");
    expect(onChange.mock.calls[0][0].experience[0].bullets).toEqual([
      { id: "exp-0-b-0", text: "" },
    ]);
  });

  it("opens as a form when the person is typing from scratch", () => {
    render(
      <Check
        doc={scratchDoc()}
        fromScratch
        tighten={false}
        onChange={vi.fn()}
        onTighten={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Fill in the facts" })).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect(screen.getByLabelText("Title")).toBeTruthy();
    expect(screen.getByLabelText("Employer")).toBeTruthy();
    expect(screen.getByLabelText(/Bullet in Title/)).toBeTruthy();
  });

  /** Education and Projects parsed but had no editor at all: a school read out
   *  of a PDF could not be corrected, and a wrong graduation year went to the
   *  printed page. */
  it("edits a school the parser produced", () => {
    const onChange = vi.fn();
    const doc = { ...docWithRole(), education: [school()] };
    render(<Check doc={doc} tighten={false} onChange={onChange} onTighten={vi.fn()} onContinue={vi.fn()} />);

    expect((screen.getByLabelText("Institution") as HTMLInputElement).value).toBe(
      "University of London",
    );
    fireEvent.change(screen.getByLabelText("Qualification"), { target: { value: "BSc Maths" } });
    expect(onChange.mock.calls[0][0].education[0].credential).toBe("BSc Maths");
  });

  it("edits a project, and calls its fields by project words", () => {
    const onChange = vi.fn();
    const project = emptyRole("proj-0");
    project.title = "Difference Engine";
    const doc = { ...docWithRole(), projects: [project] };
    render(<Check doc={doc} tighten={false} onChange={onChange} onTighten={vi.fn()} onContinue={vi.fn()} />);

    expect((screen.getByLabelText("Project") as HTMLInputElement).value).toBe("Difference Engine");
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "Analytical Engine" } });
    expect(onChange.mock.calls[0][0].projects[0].title).toBe("Analytical Engine");
  });

  /** An entry added here has to be indistinguishable from a parsed one, or a
   *  model rewrite cannot find its way back to the bullet it rewrote. */
  it("mints ids in the shapes Rust mints", () => {
    const onChange = vi.fn();
    const doc = { ...docWithRole(), projects: [], education: [] };
    render(<Check doc={doc} tighten={false} onChange={onChange} onTighten={vi.fn()} onContinue={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add a project" }));
    expect(onChange.mock.calls[0][0].projects[0].id).toBe("proj-0");
    expect(onChange.mock.calls[0][0].projects[0].bullets[0].id).toBe("proj-0-b-0");

    fireEvent.click(screen.getByRole("button", { name: "Add a school" }));
    expect(onChange.mock.calls[1][0].education[0].id).toBe("edu-0");
  });

  it("keeps empty optional sections off the page until they are asked for", () => {
    render(
      <Check doc={docWithRole()} tighten={false} onChange={vi.fn()} onTighten={vi.fn()} onContinue={vi.fn()} />,
    );
    expect(screen.queryByRole("heading", { name: "Projects" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Awards" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add a project" })).toBeTruthy();
  });

  it("adds a note to a school under that school's id", () => {
    const onChange = vi.fn();
    const doc = { ...docWithRole(), education: [school()] };
    render(<Check doc={doc} tighten={false} onChange={onChange} onTighten={vi.fn()} onContinue={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    expect(onChange.mock.calls[0][0].education[0].notes[1].id).toBe("edu-0-b-1");
  });

  it("removes a school", () => {
    const onChange = vi.fn();
    const doc = { ...docWithRole(), education: [school()] };
    render(<Check doc={doc} tighten={false} onChange={onChange} onTighten={vi.fn()} onContinue={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove this school" }));
    expect(onChange.mock.calls[0][0].education).toEqual([]);
  });
});
