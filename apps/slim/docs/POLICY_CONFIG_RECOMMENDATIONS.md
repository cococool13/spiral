# Policy configuration recommendations

Research date: 2026-07-22

## Scope and compatibility

This review compares the policy keys currently exposed by `slimbrave-mac.py`
against the current official Brave policy guide and Chromium policy templates.
Brave states that it supports Chromium policies in addition to Brave-specific
policies. Desktop support below means Windows, macOS, and Linux unless noted.
Every candidate must still be tested in the oldest supported Brave release and
confirmed in `brave://policy` before it enters a preset, because Brave may trail
Chromium or omit Google-service behavior.

Primary compatibility source: [Brave Group Policy][brave-policy]. Exact types,
values, version floors, and behavior come from Chromium's official templates
and Chrome Enterprise policy pages linked per row.

## Recommended top ten

These do not duplicate the existing keys in `slimbrave-mac.py`.

| Priority | Policy and suggested value | Config use | Desktop support | Risk | Why / caveat |
|---:|---|---|---|---|---|
| 1 | [`PromotionsEnabled: false`][promotions] (boolean) | `debloat-core` | Chrome desktop 128+ | Low | Removes product welcome pages, default-browser promotions, and feature promotions. Verify which Brave surfaces honor it. |
| 2 | [`DefaultNotificationsSetting: 2`][notifications] (integer enum) | `quiet-web` | Chrome desktop 10+ | Medium | Blocks notification prompts and notifications. Add `NotificationsAllowedForUrls` exceptions for calendars, chat, and monitoring tools. |
| 3 | [`NetworkPredictionOptions: 2`][network-prediction] (integer enum; also offer `0`) | `privacy-strict`; `performance` | Chrome desktop 38+ | Medium | `2` disables DNS prefetch, preconnect, and prerender for privacy; `0` enables them for speed. This should be an explicit selector because the goals conflict. |
| 4 | [`TabDiscardingExceptions: [patterns]`][tab-exceptions] (string list) | `memory-balanced` | Chrome desktop 108+ | Low | Keeps calls, music, dashboards, and web editors from being discarded by the existing Memory Saver control. Overbroad patterns negate memory savings. |
| 5 | [`DefaultGeolocationSetting: 2`][geolocation] (integer enum) | `privacy-strict` | Chrome desktop 10+ | Medium | Blocks location by default. Add `GeolocationAllowedForUrls` exceptions; otherwise maps, delivery, and local-search sites can break. |
| 6 | [`DownloadRestrictions: 4`][download-restrictions] (integer enum) | `security-balanced` | Chrome desktop 61+ | Low–Medium | Chromium recommends `4`, which blocks downloads classified as malicious without broadly blocking risky file types. It depends on Safe Browsing; do not advertise protection in a preset that sets `SafeBrowsingProtectionLevel: 0`. |
| 7 | [`ForceYouTubeRestrict: 1`][youtube-restrict] or `2` | `family` | Chrome desktop 55+ | Medium | Adds moderate or strict YouTube Restricted Mode to the existing Google SafeSearch control. It is not a general parental filter and can hide legitimate content. |
| 8 | [`RemoteDebuggingAllowed: false`][remote-debugging] (boolean) | `locked-down` | Chrome desktop 93+ | Medium–High | Blocks command-line remote debugging. Useful on managed/shared systems, but breaks browser automation and debugging; exclude from Developer presets. |
| 9 | [`URLBlocklist: [...]`][url-blocklist] + [`URLAllowlist: [...]`][url-allowlist] (string lists) | `family`, `kiosk`, `focus` | Chrome desktop 86+ | High | Enables composable site blocking and exceptions. Bad wildcard rules can make browsing unusable; the official template caps allowlist exceptions at 1,000 and warns against broad internal-URL blocks. |
| 10 | [`ExtensionSettings: {...}`][extension-settings] (dictionary) | `extension-audit`, `locked-down` | Chrome desktop 62+ | High | Can allow, block, remove, pin, force-install, and restrict host/permission access by extension ID. A bad `"*"` default can disable or remove every extension. Non-store force installs on macOS require a managed environment. |

## Strong opt-in additions

- [`ClearBrowsingDataOnExitList`][clear-on-exit] is valuable as a separate
  `ephemeral-session` tool, not a normal preset. It accepts a list chosen from
  `browsing_history`, `download_history`, `cookies_and_other_site_data`,
  `cached_images_and_files`, `password_signin`, `autofill`, `site_settings`, and
  `hosted_app_data` on Chrome desktop 89+. Chromium explicitly warns that it
  permanently removes local personal data. Mark cookies, passwords, autofill,
  and site settings as destructive; preview the exact data classes and require
  a second confirmation.
- [`BrowsingDataLifetime`][data-lifetime] offers per-data-type TTLs instead of
  exit cleanup, also on desktop 89+. It carries the same permanent-data-loss
  risk and belongs in an advanced privacy/admin tool.
- [`IntensiveWakeUpThrottlingEnabled: true`][wake-throttling] can reduce
  background CPU and battery use on desktop 88+, but background JavaScript
  timers may be delayed to once per minute. Use in a laptop/battery module, not
  the Developer preset.
- [`BrowserGuestModeEnabled: false`][guest-mode] and
  [`BrowserAddPersonEnabled: false`][add-person] are useful for shared-device or
  parental profiles. They are administrative controls, not general debloat.
- [`SafeSitesFilterBehavior: 1`][safe-sites] provides adult-content filtering on
  desktop 69+, but uses Google's Safe Search API and allows `URLAllowlist`
  overrides. Label the external classification dependency and false-positive
  risk.

## Product structure

Prefer composable modules over a growing monolithic preset:

- `debloat-core`: feature and promotion removal.
- `quiet-web`: notification/autoplay controls plus per-site exceptions.
- `privacy-strict`: network prediction off, location blocked, optional cleanup.
- `memory-balanced`: current Memory Saver settings plus discard exceptions.
- `battery-laptop`: wake-up throttling and other battery controls.
- `family`: SafeSearch, YouTube restriction, SafeSites, and explicit URL rules.
- `developer`: DevTools/remote debugging allowed and work-site tabs protected.
- `locked-down`: remote debugging off, extension governance, and URL rules.
- `ephemeral-session`: separately confirmed browsing-data cleanup.

Each module should declare platform/version support, risk level, whether it
deletes data, conflicts with other modules, and the exception policy that can
soften it. Preserve the current preview contract: show exact add/change/remove
counts and values before elevation or application.

## Existing coverage and cautions

SlimBrave already exposes major Brave-native debloat policies (Rewards, Wallet,
VPN, AI Chat, News, Talk, Playlist, Web Discovery, Speedreader, Tor, Sync, and
IPFS), plus Memory Saver, background mode, Cast, autoplay, search suggestions,
translation, printing, DevTools, SafeSearch, third-party cookie blocking, DoH,
and several Brave Shields controls. Additions should therefore focus on
exceptions, selectors, and dedicated admin tools rather than more preset-wide
forced values.

Two current behaviors deserve care when composing future configs:

1. `SafeBrowsingProtectionLevel: 0` conflicts with a security-oriented download
   module; the UI should explain the dependency.
2. Cleanup policies and wildcard URL/extension rules can cause data loss or
   lockout. They should never be silently bundled into a recommended daily
   preset.

[brave-policy]: https://support.brave.com/hc/en-us/articles/360039248271-Group-Policy
[promotions]: https://chromeenterprise.google/policies/promotions-enabled/
[notifications]: https://chromeenterprise.google/policies/default-notifications-setting/
[network-prediction]: https://chromeenterprise.google/policies/network-prediction-options/
[tab-exceptions]: https://chromeenterprise.google/policies/tab-discarding-exceptions/
[geolocation]: https://chromeenterprise.google/policies/default-geolocation-setting/
[download-restrictions]: https://chromeenterprise.google/policies/download-restrictions/
[youtube-restrict]: https://chromeenterprise.google/policies/force-you-tube-restrict/
[remote-debugging]: https://chromeenterprise.google/policies/remote-debugging-allowed/
[url-blocklist]: https://chromeenterprise.google/policies/url-blocklist/
[url-allowlist]: https://chromeenterprise.google/policies/url-allowlist/
[extension-settings]: https://chromeenterprise.google/policies/extension-settings/
[clear-on-exit]: https://chromeenterprise.google/policies/clear-browsing-data-on-exit-list/
[data-lifetime]: https://chromeenterprise.google/policies/browsing-data-lifetime/
[wake-throttling]: https://chromeenterprise.google/policies/intensive-wake-up-throttling-enabled/
[guest-mode]: https://chromeenterprise.google/policies/browser-guest-mode-enabled/
[add-person]: https://chromeenterprise.google/policies/browser-add-person-enabled/
[safe-sites]: https://chromeenterprise.google/policies/safe-sites-filter-behavior/
