/**
 * Unit tests for collection-validation.ts
 * Tests Zod validators, validation logic, and error handling.
 */

import { describe, it, expect } from "vitest";

import {
  collectionName,
  toolId,
  presetId,
  urlString,
  filePath,
  platformSchema,
  dnsModeSchema,
  collectionTypeSchema,
  riskLevelSchema,
  policyCount,
  semanticVersion,
  iso8601Timestamp,
  collectionMetadataSchema,
  presetMetadataSchema,
  previewOutputSchema,
  validateData,
  tryValidateData,
  assertType,
  parseCollectionMetadata,
  parsePreviewOutput,
} from "../src/lib/collection-validation";

import {
  createPresetId,
  createToolId,
  createSchemaVersion,
} from "../src/lib/collection-types";

import {
  ValidationError,
  TypeCheckError,
} from "../src/lib/collection-errors";

describe("collection-validation", () => {
  describe("collectionName validator", () => {
    it("should accept valid names", () => {
      const result = collectionName.safeParse("slimbrave-neo");
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe("slimbrave-neo");
    });

    it("should accept names with underscores", () => {
      const result = collectionName.safeParse("slim_brave_neo");
      expect(result.success).toBe(true);
    });

    it("should accept names with numbers", () => {
      const result = collectionName.safeParse("tool123");
      expect(result.success).toBe(true);
    });

    it("should reject empty names", () => {
      const result = collectionName.safeParse("");
      expect(result.success).toBe(false);
    });

    it("should reject names with spaces", () => {
      const result = collectionName.safeParse("slim brave");
      expect(result.success).toBe(false);
    });

    it("should reject names with special characters", () => {
      const result = collectionName.safeParse("slimbrave!");
      expect(result.success).toBe(false);
    });

    it("should reject names over 64 chars", () => {
      const longName = "a".repeat(65);
      const result = collectionName.safeParse(longName);
      expect(result.success).toBe(false);
    });
  });

  describe("toolId validator", () => {
    it("should accept valid tool IDs", () => {
      const result = toolId.safeParse("slimbrave-neo");
      expect(result.success).toBe(true);
    });

    it("should transform to ToolId brand", () => {
      const result = toolId.safeParse("my-tool");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("my-tool");
      }
    });
  });

  describe("presetId validator", () => {
    it("should accept valid preset IDs", () => {
      const result = presetId.safeParse("maximum-privacy");
      expect(result.success).toBe(true);
    });

    it("should transform to PresetId brand", () => {
      const result = presetId.safeParse("my-preset");
      expect(result.success).toBe(true);
    });
  });

  describe("urlString validator", () => {
    it("should accept HTTP URLs", () => {
      const result = urlString.safeParse("http://example.com");
      expect(result.success).toBe(true);
    });

    it("should accept HTTPS URLs", () => {
      const result = urlString.safeParse("https://example.com");
      expect(result.success).toBe(true);
    });

    it("should accept file URLs", () => {
      const result = urlString.safeParse("file:///path/to/file");
      expect(result.success).toBe(true);
    });

    it("should reject FTP URLs", () => {
      const result = urlString.safeParse("ftp://example.com");
      expect(result.success).toBe(false);
    });

    it("should reject invalid URLs", () => {
      const result = urlString.safeParse("not a url");
      expect(result.success).toBe(false);
    });
  });

  describe("filePath validator", () => {
    it("should accept relative paths", () => {
      const result = filePath.safeParse("Presets/Maximum Privacy Preset.json");
      expect(result.success).toBe(true);
    });

    it("should accept absolute paths", () => {
      const result = filePath.safeParse("/etc/slimbrave/config.json");
      expect(result.success).toBe(true);
    });

    it("should reject path traversal", () => {
      const result = filePath.safeParse("../../../etc/passwd");
      expect(result.success).toBe(false);
    });

    it("should reject empty paths", () => {
      const result = filePath.safeParse("");
      expect(result.success).toBe(false);
    });
  });

  describe("platformSchema validator", () => {
    it("should accept valid platforms", () => {
      expect(platformSchema.safeParse("linux").success).toBe(true);
      expect(platformSchema.safeParse("darwin").success).toBe(true);
      expect(platformSchema.safeParse("win32").success).toBe(true);
    });

    it("should reject invalid platforms", () => {
      expect(platformSchema.safeParse("macos").success).toBe(false);
      expect(platformSchema.safeParse("windows").success).toBe(false);
    });
  });

  describe("dnsModeSchema validator", () => {
    it("should accept valid DNS modes", () => {
      expect(dnsModeSchema.safeParse("default").success).toBe(true);
      expect(dnsModeSchema.safeParse("strict").success).toBe(true);
      expect(dnsModeSchema.safeParse("quad9").success).toBe(true);
      expect(dnsModeSchema.safeParse("opendns").success).toBe(true);
      expect(dnsModeSchema.safeParse("custom").success).toBe(true);
    });

    it("should reject invalid DNS modes", () => {
      expect(dnsModeSchema.safeParse("cloudflare").success).toBe(false);
    });
  });

  describe("collectionTypeSchema validator", () => {
    it("should accept valid collection types", () => {
      expect(collectionTypeSchema.safeParse("debloat").success).toBe(true);
      expect(collectionTypeSchema.safeParse("hardening").success).toBe(true);
      expect(collectionTypeSchema.safeParse("optimization").success).toBe(true);
      expect(collectionTypeSchema.safeParse("configuration").success).toBe(true);
    });

    it("should reject invalid types", () => {
      expect(collectionTypeSchema.safeParse("tuning").success).toBe(false);
    });
  });

  describe("riskLevelSchema validator", () => {
    it("should accept valid risk levels", () => {
      expect(riskLevelSchema.safeParse("low").success).toBe(true);
      expect(riskLevelSchema.safeParse("medium").success).toBe(true);
      expect(riskLevelSchema.safeParse("high").success).toBe(true);
    });

    it("should reject invalid levels", () => {
      expect(riskLevelSchema.safeParse("critical").success).toBe(false);
    });
  });

  describe("policyCount validator", () => {
    it("should accept valid counts", () => {
      expect(policyCount.safeParse(0).success).toBe(true);
      expect(policyCount.safeParse(100).success).toBe(true);
      expect(policyCount.safeParse(10000).success).toBe(true);
    });

    it("should reject negative counts", () => {
      expect(policyCount.safeParse(-1).success).toBe(false);
    });

    it("should reject counts over 10000", () => {
      expect(policyCount.safeParse(10001).success).toBe(false);
    });

    it("should reject non-integers", () => {
      expect(policyCount.safeParse(100.5).success).toBe(false);
    });
  });

  describe("semanticVersion validator", () => {
    it("should accept valid versions", () => {
      expect(semanticVersion.safeParse("1.0.0").success).toBe(true);
      expect(semanticVersion.safeParse("2.1.3").success).toBe(true);
    });

    it("should accept pre-release versions", () => {
      expect(semanticVersion.safeParse("2.0.0-alpha").success).toBe(true);
      expect(semanticVersion.safeParse("2.0.0-rc.1").success).toBe(true);
    });

    it("should accept build metadata", () => {
      expect(semanticVersion.safeParse("1.0.0+build.123").success).toBe(true);
    });

    it("should reject invalid versions", () => {
      expect(semanticVersion.safeParse("1.0").success).toBe(false);
      expect(semanticVersion.safeParse("v1.0.0").success).toBe(false);
    });
  });

  describe("iso8601Timestamp validator", () => {
    it("should accept ISO 8601 timestamps", () => {
      expect(iso8601Timestamp.safeParse("2026-07-23T12:34:56Z").success).toBe(true);
      expect(iso8601Timestamp.safeParse("2026-07-23T12:34:56+00:00").success).toBe(true);
    });

    it("should reject invalid timestamps", () => {
      expect(iso8601Timestamp.safeParse("2026-07-23").success).toBe(false);
      expect(iso8601Timestamp.safeParse("not a timestamp").success).toBe(false);
    });
  });

  describe("validateData function", () => {
    it("should validate and return data", () => {
      const result = validateData(collectionName, "my-tool");
      expect(result).toBe("my-tool");
    });

    it("should throw ValidationError on failure", () => {
      expect(() => validateData(collectionName, "invalid!")).toThrow(
        ValidationError
      );
    });

    it("should include field name in error", () => {
      try {
        validateData(collectionName, "", "myField");
      } catch (error) {
        if (error instanceof ValidationError) {
          expect(error.fieldName).toBe("myField");
        }
      }
    });
  });

  describe("tryValidateData function", () => {
    it("should return success with valid data", () => {
      const result = tryValidateData(collectionName, "my-tool");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("my-tool");
      }
    });

    it("should return error on failure", () => {
      const result = tryValidateData(collectionName, "invalid!");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ValidationError);
      }
    });

    it("should never throw", () => {
      expect(() => tryValidateData(collectionName, "invalid!")).not.toThrow();
    });
  });

  describe("assertType function", () => {
    it("should return value if predicate passes", () => {
      const result = assertType(
        "hello",
        (v): v is string => typeof v === "string",
        "string"
      );
      expect(result).toBe("hello");
    });

    it("should throw TypeCheckError if predicate fails", () => {
      expect(() =>
        assertType(
          123,
          (v): v is string => typeof v === "string",
          "string"
        )
      ).toThrow(TypeCheckError);
    });
  });

  describe("parseCollectionMetadata function", () => {
    it("should parse valid JSON", () => {
      const json = JSON.stringify({
        schemaVersion: "1.0.0",
        toolId: "test-tool",
        toolName: "Test Tool",
        toolUrl: "https://example.com",
        toolVersion: "1.0.0",
        collectionType: "debloat",
        platformCapabilities: [
          {
            platform: "linux",
            entrypoint: {
              command: "test",
              supportsPreview: true,
              supportsJson: true,
              requiresElevation: true,
            },
            supportedDnsModes: ["default"],
            maxPolicies: 100,
            supportsProfilePersistence: false,
            policiesVersion: "v1",
          },
        ],
        presets: [
          {
            id: "preset-1",
            name: "Preset 1",
            description: "Test preset",
            filePath: "test.json",
            policyCount: 10,
            dnsModes: [],
            compatiblePlatforms: ["linux"],
            riskLevel: "low",
            version: "1.0.0",
            lastModified: "2026-07-23T12:34:56Z",
          },
        ],
        summary: "Test collection",
        generatedAt: "2026-07-23T12:34:56Z",
      });
      const result = parseCollectionMetadata(json);
      expect(result.toolId).toBe("test-tool");
    });

    it("should throw ValidationError on invalid JSON", () => {
      expect(() => parseCollectionMetadata("{invalid}")).toThrow(
        ValidationError
      );
    });

    it("should throw ValidationError on invalid schema", () => {
      const json = JSON.stringify({ toolId: "test" });
      expect(() => parseCollectionMetadata(json)).toThrow(ValidationError);
    });
  });

  describe("parsePreviewOutput function", () => {
    it("should parse valid preview JSON", () => {
      const json = JSON.stringify({
        mutatesSystem: false,
        preset: {
          id: "preset-1",
          name: "Preset",
          description: "Test",
          filePath: "test.json",
          policyCount: 5,
          dnsModes: [],
          compatiblePlatforms: ["linux"],
          riskLevel: "low",
          version: "1.0.0",
          lastModified: "2026-07-23T12:34:56Z",
        },
        platform: "linux",
        changes: {
          added: ["policy1"],
          modified: ["policy2"],
          removed: ["policy3"],
        },
        affectedPolicyCount: 3,
        impactLevel: "low",
        generatedAt: "2026-07-23T12:34:56Z",
      });
      const result = parsePreviewOutput(json);
      expect(result.platform).toBe("linux");
      expect(result.affectedPolicyCount).toBe(3);
    });

    it("should throw ValidationError on invalid JSON", () => {
      expect(() => parsePreviewOutput("{invalid}")).toThrow(
        ValidationError
      );
    });
  });
});
