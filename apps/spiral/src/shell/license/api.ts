import { invoke } from "@tauri-apps/api/core";
import {
  parseLicenseView,
  parseProviderView,
  type LegacyApp,
  type LicenseView,
  type ProviderId,
  type ProviderView,
} from "./types";

export function licenseView(): Promise<LicenseView> {
  return invoke("license_view").then(parseLicenseView);
}

export function licenseRetry(): Promise<LicenseView> {
  return invoke("license_retry").then(parseLicenseView);
}

export function licenseUseLegacy(app: LegacyApp): Promise<LicenseView> {
  return invoke("license_use_legacy", { app }).then(parseLicenseView);
}

export function providerView(provider: ProviderId): Promise<ProviderView> {
  return invoke("provider_view", { provider }).then(parseProviderView);
}

export function providerSet(provider: ProviderId, key: string): Promise<ProviderView> {
  return invoke("provider_set", { provider, key }).then(parseProviderView);
}

export function providerClear(provider: ProviderId): Promise<ProviderView> {
  return invoke("provider_clear", { provider }).then(parseProviderView);
}
