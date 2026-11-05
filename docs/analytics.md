# Analytics

The shared PostHog spec is `~/.agents/posthog/analytics-spec.md` on Cohen's Mac. It is the only copy: events,
super-properties, privacy rules and keys live there. Read it before changing analytics here.

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

`posthog-js` loads only when the key is non-empty, the stored opt-out is off, `navigator.doNotTrack` is not `1`, Global Privacy Control is off, and the run is not a test. Otherwise every call does nothing and the package is not imported. The desktop window is WKWebView. That web view does not expose Do Not Track or Global Privacy Control, so those two gates stay open there. The same gates close the load in a browser that exposes either signal.

Super-properties are `app` `spiral`, `platform` `macOS` or `Windows`, and `version` from `getVersion()`. There is no build number in this app, so the version is the semver. The client never calls `identify`. The distinct id stays anonymous.

Events this app sends:

- `picker_opened` when the first-run picker is shown, and when the Settings tools picker is shown.
- `tool_chosen` with `tool` `wallpaper` or `resume`, once for each tool a successful save turns on.
- `activated` once per install. The property `activation` is `first_wallpaper_applied` or `first_resume_exported`. The first one stored wins. The flag is `spiral.activated` in localStorage.

Spiral has no trial clock. It does not send `trial_started`.

The app does not capture `checkout_started`. The licensing Worker captures `checkout_started` and `purchase` from `?ph=`. A click on `https://licensing.cohencool.workers.dev/buy/spiral` appends `?ph=<distinct_id>` when analytics is on. The resend URL is unchanged. When analytics is off, the buy URL is unchanged.

A successful Resume export calls `noteResumeExported`. The first successful export can send `activated` with `first_resume_exported`. The event has no file name, path, or document text. If a wallpaper was applied first, that activation already won and this export does not send another.

Init uses `person_profiles: 'identified_only'`, `persistence: 'localStorage'`, `respect_dnt: true`, `autocapture: false`, `capture_pageview: false`, `capture_pageleave: false`, `disable_session_recording: true`, `disable_surveys: true`, `advanced_disable_flags: true`, `capture_exceptions: false`, and `disable_external_dependency_loading: true`. Autocapture is off because a button can contain a wallpaper title or resume text. There is no `$pageview`, no `Application Opened`, and no `$exception`.

`before_send` replaces `$current_url`, `$pathname`, `$referrer`, and `$host` with the route name: `picker`, `wallpaper`, `resume`, `settings`, or `activate`. It drops every property that is not on the allowlist. The allowlist is `token`, `distinct_id`, `$process_person_profile`, `$geoip_disable`, `app`, `platform`, `version`, `activation`, `tool`, and the four URL keys after they are replaced. `$set`, `$set_once`, and `$unset` are removed. Every event sets `$geoip_disable` true, so PostHog does not add a country from the IP. This posthog-js version ignores an `ip` init flag, so the client does not set one. Discarding a stored IP address remains the PostHog project setting "Discard client IP data". The "GeoIP country stays on" line in section 5 is the Mac and iOS SDK. It does not apply to this window.

No event property carries an email, a name, a file name, a path, document text, a wallpaper title or id, a search query, a hostname, or a license key.

Opt-out: Settings, General, "Share anonymous usage stats", on by default. The line under it is "Anonymous and privacy-safe. No personal data or content, IP discarded." Turning it off calls `opt_out_capturing()` and stops events in the same turn. At launch the app reads `analytics_opt_out` before init. An opted-out user does not load `posthog-js`. If settings fail to load, analytics stays off.

The Tauri content security policy `connect-src` includes `https://us.i.posthog.com` and `https://us-assets.i.posthog.com`. `script-src` stays `'self'` because the SDK is bundled.

### Where this repo differs from the master spec

Section 5. Privacy:

- IP: PostHog never stores client IPs once the project setting "Discard client IP data" is on (Cohen ticks it
  when he creates the project). The Mac and iOS SDKs leave GeoIP country on. A desktop window that
  sets `$geoip_disable` true does not. Spiral's window does that; see This repo.
