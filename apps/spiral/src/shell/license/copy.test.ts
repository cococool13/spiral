import { describe, expect, it } from "vitest";
import { activationError, providerError } from "./copy";

describe("license copy", () => {
  it("maps the server sentences the screen is allowed to show", () => {
    expect(activationError("That code is wrong or has expired.")).toBe(
      "That code didn't match. Check the latest email, or send a new code.",
    );
    expect(activationError("That license key is not valid. Copy it again from your purchase email.")).toBe(
      "That key isn't valid. Paste it again, or use your email instead.",
    );
    expect(activationError("Could not reach the license server. Check the network and try again.")).toBe(
      "Spiral couldn't reach its license server. Check your network, then try again.",
    );
    expect(activationError("This license was revoked.")).toBe("This license was revoked.");
  });

  it("drops a provider key that comes back in an error", () => {
    expect(providerError("rejected sk-live-secret", "sk-live-secret")).toBe(
      "Spiral could not save that key. Paste it again.",
    );
  });
});
