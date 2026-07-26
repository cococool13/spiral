/**
 * Plain-language copy for the bundled profiles, modules, and controls.
 *
 * This file describes what the bundled JSON already does. It never decides
 * anything: if a profile changes in apps/slim/profiles/, the description
 * here is wrong and must be corrected, not the other way round. Anything
 * without an entry falls back to its stable id rather than being hidden,
 * so a new module can never quietly go undescribed in the review.
 */

export interface ProfileCopy {
  /** One sentence: what this profile is for. */
  readonly purpose: string;
  /** Scannable highlights for the card. Concrete, never a claim. */
  readonly highlights: readonly string[];
  /** What you give up. Written so nobody is surprised after applying. */
  readonly tradeoffs: readonly string[];
}

export const PROFILE_COPY: Readonly<Record<string, ProfileCopy>> = {
  "balanced-daily": {
    purpose:
      "Brave's safety defaults kept. Its telemetry and promotional features " +
      "turned off. Lighter in the background.",
    highlights: [
      "Telemetry off",
      "Third-party cookies blocked",
      "Rewards, Wallet, VPN, News, Talk, Leo off",
      "Quits properly when you close it",
    ],
    tradeoffs: [
      "Third-party cookies are blocked. A few sites that sign you in through " +
        "another domain will need an exception.",
      "Brave Rewards, Wallet, VPN, News, Talk and Leo AI are switched off and " +
        "cannot be re-enabled from inside Brave while this policy is active.",
      "Background mode is off, so Brave fully quits when you close the last " +
        "window instead of staying resident.",
    ],
  },
  "maximum-performance": {
    purpose:
      "Every setting turned toward responsiveness and low background " +
      "resource use.",
    highlights: [
      "Aggressive memory saver",
      "No background process",
      "Vendor extras off",
      "Privacy left at Brave's defaults",
    ],
    tradeoffs: [
      "Memory saver runs aggressively. Background tabs are discarded sooner " +
        "and reload when you return to them.",
      "This profile does not include the privacy module. Metrics reporting " +
        "and third-party cookies are left exactly as Brave ships them.",
      "Brave Rewards, Wallet, VPN, News, Talk and Leo AI are switched off.",
    ],
  },
  "minimal-debloated": {
    purpose:
      "Brave's extra products removed and the web quietened, with ordinary " +
      "browsing untouched.",
    highlights: [
      "Vendor extras removed",
      "Notification prompts blocked",
      "Autoplay blocked",
      "Ordinary browsing untouched",
    ],
    tradeoffs: [
      "Notification prompts are blocked by default. Sites you genuinely want " +
        "notifications from will need a per-site exception.",
      "Autoplay is blocked, so some video and audio players need an extra click.",
      "This profile does not include the privacy module. Metrics reporting " +
        "and third-party cookies are left exactly as Brave ships them.",
    ],
  },
};

export const MODULE_LABELS: Readonly<Record<string, string>> = {
  "security-foundation": "Security foundation",
  "privacy-balanced": "Balanced privacy",
  "performance-balanced": "Balanced performance",
  "debloat-core": "Core debloat",
  "quiet-web": "Quiet web",
};

export const CONTROL_LABELS: Readonly<Record<string, string>> = {
  "security.safe-browsing": "Safe Browsing",
  "security.downloads.malicious": "Malicious download blocking",
  "security.https-upgrades": "HTTPS upgrades",
  "telemetry.metrics": "Usage metrics reporting",
  "telemetry.url-keyed": "URL-keyed data collection",
  "privacy.third-party-cookies": "Third-party cookies",
  "privacy.global-control": "Global Privacy Control",
  "network.secure-dns": "Secure DNS",
  "performance.background-mode": "Run in background",
  "performance.memory-saver": "Memory saver",
  "performance.media-router": "Media router (Cast)",
  "permissions.notifications.default": "Notification prompts",
  "media.autoplay": "Autoplay",
  "vendor.promotions": "Brave promotions",
  "vendor.rewards": "Brave Rewards",
  "vendor.wallet": "Brave Wallet",
  "vendor.vpn": "Brave VPN",
  "vendor.ai": "Leo AI",
  "vendor.news": "Brave News",
  "vendor.talk": "Brave Talk",
};

export const RISK_LABELS: Readonly<Record<string, string>> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
  destructive: "Destructive",
};

export function moduleLabel(id: string): string {
  return MODULE_LABELS[id] ?? id;
}

export function controlLabel(id: string): string {
  return CONTROL_LABELS[id] ?? id;
}

export function riskLabel(risk: string): string {
  return RISK_LABELS[risk] ?? risk;
}

export function profileCopy(id: string): ProfileCopy | null {
  return PROFILE_COPY[id] ?? null;
}

/** Render a managed policy value the way Brave's policy page shows it. */
export function formatPolicyValue(value: boolean | number | string | null): string {
  if (value === null) return "not set";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
