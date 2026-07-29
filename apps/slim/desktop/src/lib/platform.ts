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

/** Where to look to confirm the change outside Brave itself. */
export function policyLocation(platform: Platform): string {
  if (platform === "windows") {
    return "HKLM\\SOFTWARE\\Policies\\BraveSoftware\\Brave";
  }
  return "/Library/Managed Preferences";
}
