const COMMAND_ARGS: Record<string, readonly string[]> = {
  license_view: [],
  license_retry: [],
  license_use_legacy: ["legacy"],
  license_activate: ["key"],
  license_request_code: ["email"],
  license_activate_email: ["email", "code"],
  license_clear: [],
  provider_view: ["provider"],
  provider_set: ["provider", "key"],
  provider_clear: ["provider"],
  module_activate: ["id"],
  resume: ["call", "events"],
  modules_set: ["modules"],
  general_view: [],
  general_update: ["settings"],
  thumb_cache_size: [],
  clear_thumb_cache: [],
  rename_offer: [],
  rename_decline: [],
  rename_apply: [],
  bundle_trash: ["path"],
  wallpaper_cached_page: [],
  wallpaper_search: ["params"],
  wallpaper_prefetch_page: ["params"],
  wallpaper_stage_full: ["id"],
  wallpaper_apply: ["id"],
  wallpaper_pin_state: [],
  wallpaper_pin_all_spaces: ["enabled"],
  wallpaper_pin_keep: ["enabled"],
  wallpaper_pin_resume: [],
  bench_mark: ["mark"],
  "plugin:opener|open_url": ["url"],
};

export function assertCommandArgs(cmd: string, args: Record<string, unknown>): void {
  const expected = COMMAND_ARGS[cmd];
  if (!expected) return;
  const keys = Object.keys(args).filter((key) => args[key] !== undefined);
  const missing = expected.filter((name) => !keys.includes(name));
  const extra = keys.filter((name) => !expected.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    const names = expected.length > 0 ? expected.join(", ") : "none";
    throw new Error(`bad_response:${cmd} arguments must be ${names}`);
  }
}
