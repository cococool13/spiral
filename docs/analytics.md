# Analytics spec (PostHog), shared by every Cohen project

Version 1, 2026-10-22, Code & Builds. One copy lives in each repo as `docs/analytics.md` (this text plus a
"This repo" section at the end). The master copy is `~/.agents/posthog/analytics-spec.md` on Cohen's Mac.

## 1. One platform, one project
- Everything goes to PostHog US cloud (`https://us.i.posthog.com`).
- New instrumentation sends to ONE shared PostHog project, "Cohen Apps". PostHog's free plan allows one
  project per organization and extra projects need a paid plan, so products are told apart by the `app`
  super-property instead of separate projects. Filter every insight by `app`.
- Existing projects stay where they are: Azukari (iOS) keeps project 590386, CreditDrop keeps its own project.
- The project API key (`phc_…`) is a public client key and is committed as config. A personal API key
  (`phx_…`) is a secret: it never goes in a repo, a log or a chat.
- No key yet means analytics is a no-op: the placeholder is `REPLACE_ME` (Swift/xcconfig) or `""` (JS/TOML).
  Cohen fills every placeholder at once with `~/.agents/posthog-keys.sh`.

## 2. Events (same names everywhere)
| Event | Where | When | Properties |
|---|---|---|---|
| `$pageview` | web (posthog-js) | every page / route view | automatic |
| `signup` | web apps with accounts | account created | `method` (`passkey`, `email`, …) |
| `trial_started` | apps/web apps with a trial | the trial clock starts (once) | `trial_days` |
| `checkout_started` | licensing Worker `/buy/:app` (server) for Stripe-sold Mac apps; client side only where checkout does not go through the licensing Worker | a Stripe Checkout Session is created | `plan` (`one_time`/`monthly`/`yearly`/`lifetime`) |
| `purchase` | server: licensing Worker Stripe webhook (or the product's own webhook) | payment confirmed | `plan`, `revenue` (major units, e.g. 19.0), `currency`, `$insert_id` = Stripe event id |
| `activated` | the product | the user first gets the core value (once per install/user) | `activation`: short snake_case meaning, e.g. `first_playback` |
| `picker_opened` | Spiral | the first-run picker or the Settings tools picker is shown | none |
| `tool_chosen` | Spiral | a tool is enabled | `tool` (`wallpaper` or `resume`) |
| `Application Opened` / `Application Installed` / `Application Updated` | Mac/iOS (SDK lifecycle) | automatic | automatic |
| `$exception` | Mac/iOS (SDK error tracking) | crash on previous run | automatic |

Rules: no other custom events without adding them here first. Property names are snake_case.
Never put PII in properties: no emails, names, file names, paths, document text, song titles, hostnames,
license keys or IP addresses.

## 3. Super-properties (registered on every event)
- `app`: product slug, the same slug as Daybook `worker/projects.ts` and the licensing Worker `app_id`
  (`ember`, `lumen`, `unboxed`, `berth`, `quire`, `utter`, `cesura`, `pivot`, `mothlight`, `aftersay`,
  `halo`, `spiral`, `candor`, `portfolio`, `spiral-ship`, `entr`, `agentshelf`, `gallery`, `stacks`,
  `stacks-cloud`, `overheard`, `jcc`, `daybook`, `slatepick`, `reel`, …).
- `platform`: `web`, `macOS`, `iOS` or `server`.
- `version`: app `CFBundleShortVersionString (CFBundleVersion)`, or the site's package version / build id.

## 4. Joining site, app and purchase
Links to `https://licensing.cohencool.workers.dev/buy/<app>` get `?ph=<distinct_id>` added at click time
(web snippet and Mac `Analytics.checkoutURL`). The licensing Worker validates it (`^[A-Za-z0-9._:-]{1,200}$`),
stores it in the Checkout Session metadata as `ph_distinct_id`, and uses it as the distinct id for
`checkout_started` and `purchase`. Without it the server uses `stripe:<session id>` and
`$process_person_profile: false`. When analytics is off (opt-out, DNT, no key) no `ph` is added.

## 5. Privacy
Mac and iOS (posthog-ios / PostHog Swift SDK, one `PostHogSDK.shared.setup` per app, never two):
- `personProfiles = .identifiedOnly`, and the apps never call `identify`, so every user is anonymous.
- No session replay, no surveys, no screen views, no element autocapture, no feature-flag preload.
- Opt-out toggle in Settings ("Share anonymous usage and crash reports", on by default for direct-download
  apps, key `analyticsOptOut` in UserDefaults). Off calls `PostHogSDK.shared.optOut()` and stops every event,
  crash reports included; the SDK is still configured with `config.optOut` from the stored choice at launch.
- The SDK sends the Mac model name (e.g. "MacBook Pro"), OS version, locale and app version; never the
  computer name.
- IP: PostHog never stores client IPs once the project setting "Discard client IP data" is on (Cohen ticks it
  when he creates the project). GeoIP country stays on.
- Test runs (XCTest) never start the SDK.

Web (posthog-js; `analytics.js` snippet for static sites, the npm package for bundled apps):
- `person_profiles: 'identified_only'`, `persistence: 'localStorage'` (no cookies, so no cookie banner),
  `respect_dnt: true`, and nothing loads when `navigator.doNotTrack === '1'` or Global Privacy Control is on.
- `autocapture` only for clicks on `a` and `button`, `capture_copied_text: false`; form values are never
  captured (posthog-js never reads input values in autocapture; add `ph-no-capture` to sensitive regions).
- `disable_session_recording: true`, `disable_surveys: true`, `advanced_disable_flags: true`.
- CSP: `script-src https://us-assets.i.posthog.com`, `connect-src https://us.i.posthog.com https://us-assets.i.posthog.com`.

Server (licensing Worker and other Workers): `fetch` to `https://us.i.posthog.com/i/v0/e/` inside
`ctx.waitUntil`, never blocking or failing the request; no email or customer data; `$ip` never forwarded.

## 6. App Store / privacy docs
Only Azukari ships through the App Store. For it the label stays "Data Not Linked to You: Usage Data,
Diagnostics" (no tracking). Direct-download Mac apps have no App Store label; each site's privacy page must say:
anonymous usage events and crash reports go to PostHog (US), no account, no personal data, IPs discarded,
turn it off in Settings. No App Store submission is part of this work.

## 7. Daybook
Each product is in Daybook `worker/projects.ts` with `posthog: { projectId: COHEN_APPS_PROJECT_ID, app: '<slug>', … }`.
`app` makes the Daybook query filter on `properties.app`. The placeholder id is `PENDING`, which Daybook skips.

## 8. Keys
`~/.agents/posthog-keys.sh` (Cohen runs it once): asks, with hidden input, for the shared `phc_` key and the
project id, writes them into every repo listed in `~/.agents/posthog/targets.tsv` and into Daybook, commits on
each repo's PostHog branch (or a new `chore/posthog-key` branch if that PR has merged) and pushes. It refuses
`phx_` keys.


## This repo

Spiral sends anonymous usage events from the desktop window to PostHog US when every gate below is open. The site does not load PostHog.

The project key is the empty string in `apps/spiral/src/shell/analytics/config.ts`. The host is `https://us.i.posthog.com`. `~/.agents/posthog-keys.sh` fills the key. A `phx_` key is never committed.

Code:

- `apps/spiral/src/shell/analytics/config.ts` holds the key and host.
- `apps/spiral/src/shell/analytics/privacy.ts` holds the gates, the checkout `ph` join, and `before_send`.
- `apps/spiral/src/shell/analytics/client.ts` loads `posthog-js` and sends events.
- `apps/spiral/src/shell/Shell.tsx` starts analytics after general settings load, and sends `tool_chosen` after a tool is saved.
- `apps/spiral/src/shell/Picker.tsx` and `apps/spiral/src/shell/settings/Tools.tsx` send `picker_opened`.
- `apps/spiral/src/modules/wallpaper/Tile.tsx` sends `activated` after a wallpaper applies.
- `apps/spiral/src/shell/license/open.ts` adds `ph` to a buy link.
- `apps/spiral/src/shell/settings/General.tsx` is the opt-out toggle.
- Rust stores `analytics_opt_out` with the other general settings in `spiral.json`.

`posthog-js` loads only when the key is non-empty, the stored opt-out is off, `navigator.doNotTrack` is not `1`, Global Privacy Control is off, and the run is not a test. Otherwise every call does nothing and the package is not imported.

Super-properties are `app` `spiral`, `platform` `macOS` or `Windows`, and `version` from `getVersion()`. There is no build number in this app, so the version is the semver. The client never calls `identify`. The distinct id stays anonymous.

Events this app sends:

- `picker_opened` when the first-run picker is shown, and when the Settings tools picker is shown.
- `tool_chosen` with `tool` `wallpaper` or `resume`, once for each tool a successful save turns on.
- `activated` once per install. The property `activation` is `first_wallpaper_applied` or `first_resume_exported`. The first one stored wins. The flag is `spiral.activated` in localStorage.

Spiral has no trial clock. It does not send `trial_started`.

The app does not capture `checkout_started`. The licensing Worker captures `checkout_started` and `purchase` from `?ph=`. A click on `https://licensing.cohencool.workers.dev/buy/spiral` appends `?ph=<distinct_id>` when analytics is on. The resend URL is unchanged. When analytics is off, the buy URL is unchanged.

The Resume screen in this build has no export control. `noteResumeExported` is the call an export success must use. Nothing in that screen calls it, so `first_resume_exported` does not fire today.

Init uses `person_profiles: 'identified_only'`, `persistence: 'localStorage'`, `respect_dnt: true`, `autocapture: false`, `capture_pageview: false`, `capture_pageleave: false`, `disable_session_recording: true`, `disable_surveys: true`, `advanced_disable_flags: true`, `capture_exceptions: false`, and `disable_external_dependency_loading: true`. Autocapture is off because a button can contain a wallpaper title or resume text. There is no `$pageview`, no `Application Opened`, and no `$exception`.

`before_send` replaces `$current_url`, `$pathname`, `$referrer`, and `$host` with the route name: `picker`, `wallpaper`, `resume`, `settings`, or `activate`. It drops every property that is not on the allowlist. The allowlist is `token`, `distinct_id`, `$process_person_profile`, `$geoip_disable`, `app`, `platform`, `version`, `activation`, `tool`, and the four URL keys after they are replaced. `$set`, `$set_once`, and `$unset` are removed. Events set `$geoip_disable` true. This posthog-js version ignores an `ip` init flag, so the client does not set one. Discarding stored IP addresses is the PostHog project setting.

No event property carries an email, a name, a file name, a path, document text, a wallpaper title or id, a search query, a hostname, or a license key.

Opt-out: Settings, General, "Share anonymous usage stats", on by default. The line under it is "Anonymous and privacy-safe. No personal data or content, IP discarded." Turning it off calls `opt_out_capturing()` and stops events in the same turn. At launch the app reads `analytics_opt_out` before init. An opted-out user does not load `posthog-js`. If settings fail to load, analytics stays off.

The Tauri content security policy `connect-src` includes `https://us.i.posthog.com` and `https://us-assets.i.posthog.com`. `script-src` stays `'self'` because the SDK is bundled.
