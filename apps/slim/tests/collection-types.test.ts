/**
 * Unit tests for collection-types.ts
 * Tests branded types, type guards, and type safety.
 */

import { describe, it, expect } from "vitest";

import {
  createSchemaVersion,
  createToolId,
  createPresetId,
  isPlatform,
  isDNSMode,
  isBrowserCollectionType,
  isRiskLevel,
  SchemaVersion,
  ToolId,
  PresetId,
  Platform,
  DNSMode,
  BrowserCollectionType,
  CollectionMetadata,
  PresetMetadata,
  PlatformEntrypoint,
  PlatformCapabilities,
} from "../src/lib/collection-types";

describe("collection-types", () => {
  describe("branded type creators", () => {
    it("should create SchemaVersion", () => {
      const version = createSchemaVersion("1.0.0");
      expect(version).toBe("1.0.0");
    });

    it("should create ToolId", () => {
      const id = createToolId("slimbrave-neo");
      expect(id).toBe("slimbrave-neo");
    });

    it("should create PresetId", () => {
      const id = createPresetId("maximum-privacy");
      expect(id).toBe("maximum-privacy");
    });
  });

  describe("isPlatform type guard", () => {
    it("should recognize valid platforms", () => {
      expect(isPlatform("linux")).toBe(true);
      expect(isPlatform("darwin")).toBe(true);
      expect(isPlatform("win32")).toBe(true);
    });

    it("should reject invalid platforms", () => {
      expect(isPlatform("macos")).toBe(false);
      expect(isPlatform("windows")).toBe(false);
      expect(isPlatform("")).toBe(false);
      expect(isPlatform(null)).toBe(false);
      expect(isPlatform(undefined)).toBe(false);
      expect(isPlatform(123)).toBe(false);
    });
  });

  describe("isDNSMode type guard", () => {
    it("should recognize valid DNS modes", () => {
      expect(isDNSMode("default")).toBe(true);
      expect(isDNSMode("strict")).toBe(true);
      expect(isDNSMode("quad9")).toBe(true);
      expect(isDNSMode("opendns")).toBe(true);
      expect(isDNSMode("custom")).toBe(true);
    });

    it("should reject invalid DNS modes", () => {
      expect(isDNSMode("cloudflare")).toBe(false);
      expect(isDNSMode("")).toBe(false);
      expect(isDNSMode(null)).toBe(false);
      expect(isDNSMode(123)).toBe(false);
    });
  });

  describe("isBrowserCollectionType type guard", () => {
    it("should recognize valid collection types", () => {
      expect(isBrowserCollectionType("debloat")).toBe(true);
      expect(isBrowserCollectionType("hardening")).toBe(true);
      expect(isBrowserCollectionType("optimization")).toBe(true);
      expect(isBrowserCollectionType("configuration")).toBe(true);
    });

    it("should reject invalid collection types", () => {
      expect(isBrowserCollectionType("tuning")).toBe(false);
      expect(isBrowserCollectionType("")).toBe(false);
      expect(isBrowserCollectionType(null)).toBe(false);
    });
  });

  describe("isRiskLevel type guard", () => {
    it("should recognize valid risk levels", () => {
      expect(isRiskLevel("low")).toBe(true);
      expect(isRiskLevel("medium")).toBe(true);
      expect(isRiskLevel("high")).toBe(true);
    });

    it("should reject invalid risk levels", () => {
      expect(isRiskLevel("critical")).toBe(false);
      expect(isRiskLevel("")).toBe(false);
      expect(isRiskLevel(null)).toBe(false);
    });
  });

  describe("type consistency", () => {
    it("should create immutable readonly interfaces", () => {
      const entrypoint: PlatformEntrypoint = {
        command: "python3 slimbrave-mac.py",
        supportsPreview: true,
        supportsJson: true,
        requiresElevation: true,
      };
      expect(entrypoint.command).toBe("python3 slimbrave-mac.py");
    });

    it("should allow readonly arrays", () => {
      const platforms: readonly Platform[] = ["linux", "darwin"] as const;
      expect(platforms.length).toBe(2);
      expect(platforms[0]).toBe("linux");
    });
  });
});
