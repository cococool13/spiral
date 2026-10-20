// Scope: unlock with email. The key form is the fallback and stays the default;
// the email path is two steps (send a code, then trade it for the key).
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { Activate } from "./Activate";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

afterEach(() => {
  vi.clearAllMocks();
});

function openEmail() {
  const onDone = vi.fn();
  render(<Activate onDone={onDone} />);
  fireEvent.click(screen.getByRole("radio", { name: "Email" }));
  return onDone;
}

async function sendCode(email = "buyer@example.com") {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: ` ${email} ` } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByLabelText("6-digit code");
}

describe("Unlock with", () => {
  it("defaults to the license key and switches to email", () => {
    render(<Activate onDone={vi.fn()} />);
    const key = screen.getByRole("radio", { name: "License key" });
    const email = screen.getByRole("radio", { name: "Email" });
    expect(key.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText("License key")).toBeTruthy();

    fireEvent.click(email);
    expect(email.getAttribute("aria-checked")).toBe("true");
    expect(key.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByLabelText("License key")).toBeNull();
    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
  });

  it("moves between options with the arrow keys", () => {
    render(<Activate onDone={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "License key" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Email" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("Email unlock", () => {
  it("sends a code to the trimmed email and asks for it", async () => {
    mockInvoke.mockResolvedValue(undefined);
    openEmail();
    await sendCode();
    expect(mockInvoke).toHaveBeenCalledWith("license_request_code", { email: "buyer@example.com" });
    expect(screen.getByText("Enter the code sent to buyer@example.com.")).toBeTruthy();
    expect(screen.getByLabelText("6-digit code").getAttribute("autocomplete")).toBe("one-time-code");
  });

  it("unlocks with the code and calls onDone", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const onDone = openEmail();
    await sendCode();
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123 456" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(mockInvoke).toHaveBeenCalledWith("license_activate_email", {
      email: "buyer@example.com",
      code: "123456",
    });
  });

  it("shows the server's message and stays on the code step", async () => {
    mockInvoke.mockImplementation((cmd: string) =>
      cmd === "license_activate_email"
        ? Promise.reject("That code is wrong or has expired.")
        : Promise.resolve(undefined),
    );
    const onDone = openEmail();
    await sendCode();
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    const error = await screen.findByText("That code is wrong or has expired.");
    expect(error.getAttribute("aria-live")).toBe("polite");
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByLabelText("6-digit code")).toBeTruthy();
  });

  it("shows a send error on the email step", async () => {
    mockInvoke.mockRejectedValue("Too many tries. Wait a few minutes and try again.");
    openEmail();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "buyer@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Too many tries. Wait a few minutes and try again.")).toBeTruthy();
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });

  it("sends again to the same email", async () => {
    mockInvoke.mockResolvedValue(undefined);
    openEmail();
    await sendCode();
    fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    expect(await screen.findByText("Enter the new code sent to buyer@example.com.")).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenLastCalledWith("license_request_code", { email: "buyer@example.com" });
  });

  it("goes back to the email step for a different email", async () => {
    mockInvoke.mockResolvedValue(undefined);
    openEmail();
    await sendCode();
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });
});
