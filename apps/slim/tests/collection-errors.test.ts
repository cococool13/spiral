/**
 * Unit tests for collection-errors.ts
 * Tests error types, error handling, and error context.
 */

import { describe, it, expect } from "vitest";

import {
  CollectionError,
  ValidationError,
  SchemaVersionMismatchError,
  MalformedMetadataError,
  InvalidPresetError,
  PresetFileNotFoundError,
  UnsupportedPlatformError,
  PresetPlatformIncompatibilityError,
  PreviewNotSupportedError,
  UnsupportedDnsModeError,
  PolicyLimitExceededError,
  InvalidCollectionNameError,
  InvalidUrlError,
  InvalidVersionError,
  InvalidTimestampError,
  CacheMissError,
  CacheCorruptionError,
  ImmutabilityViolationError,
  DeserializationError,
  SerializationError,
  TypeCheckError,
  ContractViolationError,
  isCollectionError,
  getErrorContext,
} from "../src/lib/collection-errors";

describe("collection-errors", () => {
  describe("CollectionError base class", () => {
    it("should create error with code and message", () => {
      const error = new ValidationError(
        "Invalid input",
        "fieldName",
        "reason",
        { context: "value" }
      );
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.message).toBe("Invalid input");
      expect(error.isCollectionError).toBe(true);
      expect(error.context?.context).toBe("value");
    });

    it("should serialize to JSON correctly", () => {
      const error = new ValidationError(
        "Invalid field",
        "name",
        "too short"
      );
      const json = error.toJSON();
      expect(json.error).toBe("ValidationError");
      expect(json.code).toBe("VALIDATION_ERROR");
      expect(json.message).toBe("Invalid field");
    });
  });

  describe("ValidationError", () => {
    it("should store field name and reason", () => {
      const error = new ValidationError(
        "Name is required",
        "toolName",
        "empty string"
      );
      expect(error.fieldName).toBe("toolName");
      expect(error.reason).toBe("empty string");
    });
  });

  describe("SchemaVersionMismatchError", () => {
    it("should list supported and received versions", () => {
      const error = new SchemaVersionMismatchError(
        ["1.0", "1.1"],
        "2.0"
      );
      expect(error.supportedVersions).toEqual(["1.0", "1.1"]);
      expect(error.receivedVersion).toBe("2.0");
      expect(error.message).toContain("1.0");
      expect(error.message).toContain("2.0");
    });
  });

  describe("MalformedMetadataError", () => {
    it("should list missing fields", () => {
      const error = new MalformedMetadataError(
        "Missing required fields",
        ["toolId", "toolName"]
      );
      expect(error.missingFields).toEqual(["toolId", "toolName"]);
    });
  });

  describe("InvalidPresetError", () => {
    it("should include preset ID", () => {
      const error = new InvalidPresetError(
        "max-privacy-1.0",
        "Invalid policy count"
      );
      expect(error.presetId).toBe("max-privacy-1.0");
    });
  });

  describe("PresetFileNotFoundError", () => {
    it("should include file path", () => {
      const error = new PresetFileNotFoundError("Presets/My Preset.json");
      expect(error.filePath).toBe("Presets/My Preset.json");
      expect(error.message).toContain("Presets/My Preset.json");
    });
  });

  describe("UnsupportedPlatformError", () => {
    it("should list platform and supported platforms", () => {
      const error = new UnsupportedPlatformError(
        "freebsd",
        ["linux", "darwin", "win32"]
      );
      expect(error.platform).toBe("freebsd");
      expect(error.supportedPlatforms).toEqual(["linux", "darwin", "win32"]);
      expect(error.message).toContain("freebsd");
    });

    it("should handle no supported platforms", () => {
      const error = new UnsupportedPlatformError("unknown", []);
      expect(error.message).toContain("none");
    });
  });

  describe("PresetPlatformIncompatibilityError", () => {
    it("should include preset and compatible platforms", () => {
      const error = new PresetPlatformIncompatibilityError(
        "linux-only",
        "darwin",
        ["linux"]
      );
      expect(error.presetId).toBe("linux-only");
      expect(error.requestedPlatform).toBe("darwin");
      expect(error.compatiblePlatforms).toEqual(["linux"]);
    });
  });

  describe("PreviewNotSupportedError", () => {
    it("should include platform and entrypoint", () => {
      const error = new PreviewNotSupportedError(
        "darwin",
        "python3 slimbrave-mac.py"
      );
      expect(error.platform).toBe("darwin");
      expect(error.entrypoint).toBe("python3 slimbrave-mac.py");
    });
  });

  describe("UnsupportedDnsModeError", () => {
    it("should list DNS mode and supported modes", () => {
      const error = new UnsupportedDnsModeError(
        "cloudflare",
        "linux",
        ["default", "quad9"]
      );
      expect(error.dnsMode).toBe("cloudflare");
      expect(error.platform).toBe("linux");
      expect(error.supportedModes).toEqual(["default", "quad9"]);
    });
  });

  describe("PolicyLimitExceededError", () => {
    it("should include policy count and max", () => {
      const error = new PolicyLimitExceededError("darwin", 5001, 5000);
      expect(error.platform).toBe("darwin");
      expect(error.policyCount).toBe(5001);
      expect(error.maxPolicies).toBe(5000);
      expect(error.message).toContain("5001");
      expect(error.message).toContain("5000");
    });
  });

  describe("InvalidCollectionNameError", () => {
    it("should include invalid name", () => {
      const error = new InvalidCollectionNameError("My Tool!");
      expect(error instanceof InvalidCollectionNameError).toBe(true);
      expect(error.code).toBe("INVALID_COLLECTION_NAME");
      expect(error.message).toContain("My Tool!");
    });
  });

  describe("InvalidUrlError", () => {
    it("should include URL and reason", () => {
      const error = new InvalidUrlError("not-a-url", "malformed");
      expect(error.url).toBe("not-a-url");
      expect(error.reason).toBe("malformed");
    });
  });

  describe("InvalidVersionError", () => {
    it("should include invalid version", () => {
      const error = new InvalidVersionError("1.0");
      expect(error.version).toBe("1.0");
      expect(error.message).toContain("1.0");
    });
  });

  describe("InvalidTimestampError", () => {
    it("should include invalid timestamp", () => {
      const error = new InvalidTimestampError("2026-07-23");
      expect(error.timestamp).toBe("2026-07-23");
    });
  });

  describe("CacheMissError", () => {
    it("should include cache key", () => {
      const error = new CacheMissError("metadata.slimbrave");
      expect(error.key).toBe("metadata.slimbrave");
    });
  });

  describe("CacheCorruptionError", () => {
    it("should include key and reason", () => {
      const error = new CacheCorruptionError(
        "preset.max-privacy",
        "invalid schema"
      );
      expect(error.key).toBe("preset.max-privacy");
      expect(error.reason).toBe("invalid schema");
    });
  });

  describe("ImmutabilityViolationError", () => {
    it("should include object type", () => {
      const error = new ImmutabilityViolationError("CollectionMetadata");
      expect(error.objectType).toBe("CollectionMetadata");
      expect(error.message).toContain("CollectionMetadata");
    });
  });

  describe("DeserializationError", () => {
    it("should include data type and reason", () => {
      const error = new DeserializationError(
        "PreviewOutput",
        "unexpected field"
      );
      expect(error.dataType).toBe("PreviewOutput");
      expect(error.reason).toBe("unexpected field");
    });
  });

  describe("SerializationError", () => {
    it("should include data type and reason", () => {
      const error = new SerializationError(
        "CollectionMetadata",
        "circular reference"
      );
      expect(error.dataType).toBe("CollectionMetadata");
      expect(error.reason).toBe("circular reference");
    });
  });

  describe("TypeCheckError", () => {
    it("should include expected, actual, and value", () => {
      const error = new TypeCheckError("string", "number", 123);
      expect(error.expectedType).toBe("string");
      expect(error.actualType).toBe("number");
      expect(error.value).toBe(123);
    });
  });

  describe("ContractViolationError", () => {
    it("should include function, violation type, and reason", () => {
      const error = new ContractViolationError(
        "getMetadata",
        "precondition",
        "toolId must not be empty"
      );
      expect(error.functionName).toBe("getMetadata");
      expect(error.violationType).toBe("precondition");
      expect(error.reason).toBe("toolId must not be empty");
      expect(error.message).toContain("Precondition");
    });
  });

  describe("isCollectionError predicate", () => {
    it("should identify collection errors", () => {
      const error = new ValidationError("test", "field", "reason");
      expect(isCollectionError(error)).toBe(true);
    });

    it("should reject non-collection errors", () => {
      expect(isCollectionError(new Error("generic"))).toBe(false);
      expect(isCollectionError("string")).toBe(false);
      expect(isCollectionError(null)).toBe(false);
      expect(isCollectionError(undefined)).toBe(false);
    });
  });

  describe("getErrorContext helper", () => {
    it("should extract context from collection error", () => {
      const error = new ValidationError("test", "field", "reason", {
        customKey: "customValue",
      });
      const context = getErrorContext(error);
      expect(context.errorType).toBe("ValidationError");
      expect(context.code).toBe("VALIDATION_ERROR");
      expect(context.message).toBe("test");
    });

    it("should handle generic Error", () => {
      const error = new Error("generic error");
      const context = getErrorContext(error);
      expect(context.errorType).toBe("Error");
      expect(context.message).toBe("generic error");
      expect(context.stack).toBeDefined();
    });

    it("should handle non-Error values", () => {
      const context = getErrorContext("string error");
      expect(context.value).toBe("string error");
      expect(context.type).toBe("string");
    });
  });
});
