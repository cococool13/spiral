/**
 * Words that change with the operating system.
 *
 * The app runs on macOS and Windows and the two differ in ways a person
 * reads, not just ways the code branches: what the machine is called, which
 * dialog asks for permission, and whether there is a second approval step
 * after applying. Hardcoding the macOS wording would leave a Windows user
 * hunting System Settings for a Configuration Profile that does not exist.
 *
 * Everything here keys off the platform the *detection* reported, not off the
 * build target. They agree in practice, but detection is the thing that
 * actually looked.
 */
import type { Platform } from "./contract";

/** What to call the machine in front of the person. */
export function deviceNoun(platform: Platform): string {
  if (platform === "macos") return "Mac";
  if (platform === "windows") return "PC";
  return "computer";
}

/** The operating system's own name. */
export function osName(platform: Platform): string {
  if (platform === "macos") return "macOS";
  if (platform === "windows") return "Windows";
  return platform;
}

/** How the OS will ask permission, as a sentence fragment. */
export function authSentence(platform: Platform): string {
  if (platform === "windows") {
    return "Windows will ask you to allow the change.";
  }
  return "macOS will ask for your password in its own dialog.";
}

/** What the app is waiting for while a privileged step runs. */
export function waitingSentence(platform: Platform): string {
  return `Waiting for ${osName(platform)} to authorise the change`;
}

/**
 * True when applying leaves a second step the person still has to do.
 *
 * macOS needs the Configuration Profile approved in System Settings before
 * the policy is durable. The Windows registry is already persistent, so there
 * is nothing to approve and claiming otherwise would be a lie.
 */
export function needsProfileApproval(platform: Platform): boolean {
  return platform === "macos";
}

/**
 * Undo copy for the Done screen.
 *
 * macOS removes plist files, the Configuration Profile, and leaked profile
 * prefs. Windows only deletes the managed-policy registry key, and the
 * fallback command is `slimbrave-windows.py`, not the Mac profile script.
 */
export function undoCopy(platform: Platform): {
  readonly summary: string;
  readonly confirm: string;
  readonly fallbackLead: string;
  readonly fallbackCommand: string;
} {
  if (platform === "windows") {
    return {
      summary:
        "Removing the policies puts Brave back to its own defaults. It deletes the managed policies from the registry.",
      confirm: "I want Spiral Slim to remove every policy it wrote.",
      fallbackLead:
        "You can remove the policies from an Administrator PowerShell with",
      fallbackCommand: "python slimbrave-windows.py --reset",
    };
  }
  return {
    summary:
      "Removing the policies puts Brave back to its own defaults. It deletes the managed policy files, removes the Configuration Profile, and repairs the per-site exceptions SlimBrave writes into your Brave profile.",
    confirm:
      "I want Spiral Slim to remove every policy it wrote and the Configuration Profile with it.",
    fallbackLead: "You can remove the policies from Terminal with",
    fallbackCommand: "sudo python3 spiral-slim-mac.py --reset",
  };
}
