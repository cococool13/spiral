/**
 * Unit tests for collection-schema.ts
 * Tests deterministic serialization, deserialization, and data integrity.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  serializeCollectionMetadata,
  serializePresetMetadata,
  serializePreviewOutput,
  deserializeCollectionMetadata,
  deserializePresetMetadata,
  deserializePreviewOutput,
  areCollectionMetadataEqual,
  cloneCollectionMetadata,
  clonePresetMetadata,
  clonePreviewOutput,
} from "../src/lib/collection-schema";

import {
  createToolId,
  createSchemaVersion,
  createPresetId,
  CollectionMetadata,
  PresetMetadata,
  PreviewOutput,
} from "../src/lib/collection-types";

import {
  SerializationError,
  DeserializationError,
} from "../src/lib/collection-errors";

const mockPresetMetadata: PresetMetadata = {
  id: createPresetId("test-preset"),
  name: "Test Preset",
  description: "A test preset for testing",
  filePath: "Presets/test.json",
  policyCount: 42,
  dnsModes: ["default", "strict"],
  compatiblePlatforms: ["linux", "darwin"],
  riskLevel: "medium",
  version: "1.0.0",
  lastModified: "2026-07-23T12:34:56Z",
};

const mockCollectionMetadata: CollectionMetadata = {
  schemaVersion: createSchemaVersion("1.0.0"),
  toolId: createToolId("test-tool"),
  toolName: "Test Tool",
  toolUrl: "https://example.com",
  toolVersion: "1.0.0",
  collectionType: "debloat",
  platformCapabilities: [
    {
      platform: "linux",
      entrypoint: {
        command: "test-tool linux",
        supportsPreview: true,
        supportsJson: true,
        requiresElevation: true,
      },
      supportedDnsModes: ["default", "strict"],
      maxPolicies: 1000,
      supportsProfilePersistence: false,
      policiesVersion: "v1",
    },
  ],
  presets: [mockPresetMetadata],
  summary: "A test collection",
  generatedAt: "2026-07-23T12:34:56Z",
};

const mockPreviewOutput: PreviewOutput = {
  mutatesSystem: false,
  preset: mockPresetMetadata,
  platform: "linux",
  changes: {
    added: ["policy1", "policy2"],
    modified: ["policy3"],
    removed: ["policy4"],
  },
  affectedPolicyCount: 4,
  impactLevel: "medium",
  generatedAt: "2026-07-23T12:34:56Z",
};

describe("collection-schema", () => {
  describe("serializeCollectionMetadata", () => {
    it("should produce valid JSON string", () => {
      const json = serializeCollectionMetadata(mockCollectionMetadata);
      expect(typeof json).toBe("string");
      expect(json.length).toBeGreaterThan(0);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("should be deterministic (same input → same output)", () => {
      const json1 = serializeCollectionMetadata(mockCollectionMetadata);
      const json2 = serializeCollectionMetadata(mockCollectionMetadata);
      expect(json1).toBe(json2);
    });

    it("should be indented for readability", () => {
      const json = serializeCollectionMetadata(mockCollectionMetadata);
      expect(json).toContain("\n");
      expect(json).toContain("  ");
    });

    it("should throw on circular references", () => {
      const circular: any = { ...mockCollectionMetadata };
      circular.self = circular;
      expect(() => serializeCollectionMetadata(circular as any)).toThrow();
    });
  });

  describe("serializePresetMetadata", () => {
    it("should produce valid JSON", () => {
      const json = serializePresetMetadata(mockPresetMetadata);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("should be deterministic", () => {
      const json1 = serializePresetMetadata(mockPresetMetadata);
      const json2 = serializePresetMetadata(mockPresetMetadata);
      expect(json1).toBe(json2);
    });
  });

  describe("serializePreviewOutput", () => {
    it("should produce valid JSON", () => {
      const json = serializePreviewOutput(mockPreviewOutput);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("should be deterministic", () => {
      const json1 = serializePreviewOutput(mockPreviewOutput);
      const json2 = serializePreviewOutput(mockPreviewOutput);
      expect(json1).toBe(json2);
    });
  });

  describe("deserializeCollectionMetadata", () => {
    it("should parse valid JSON", () => {
      const json = serializeCollectionMetadata(mockCollectionMetadata);
      const result = deserializeCollectionMetadata(json);
      expect(result.toolId).toBe(mockCollectionMetadata.toolId);
      expect(result.toolName).toBe(mockCollectionMetadata.toolName);
    });

    it("should throw DeserializationError on invalid JSON", () => {
      expect(() => deserializeCollectionMetadata("{invalid}")).toThrow(
        DeserializationError
      );
    });

    it("should throw on empty string", () => {
      expect(() => deserializeCollectionMetadata("")).toThrow(
        DeserializationError
      );
    });

    it("should throw on non-string input", () => {
      expect(() =>
        deserializeCollectionMetadata(null as any)
      ).toThrow(DeserializationError);
    });
  });

  describe("deserializePresetMetadata", () => {
    it("should parse valid JSON", () => {
      const json = serializePresetMetadata(mockPresetMetadata);
      const result = deserializePresetMetadata(json);
      expect(result.id).toBe(mockPresetMetadata.id);
      expect(result.name).toBe(mockPresetMetadata.name);
    });

    it("should throw DeserializationError on invalid data", () => {
      expect(() => deserializePresetMetadata("{}")).toThrow(
        DeserializationError
      );
    });
  });

  describe("deserializePreviewOutput", () => {
    it("should parse valid JSON", () => {
      const json = serializePreviewOutput(mockPreviewOutput);
      const result = deserializePreviewOutput(json);
      expect(result.platform).toBe("linux");
      expect(result.affectedPolicyCount).toBe(4);
    });

    it("should throw DeserializationError on invalid data", () => {
      expect(() => deserializePreviewOutput("{}")).toThrow(
        DeserializationError
      );
    });
  });

  describe("round-trip serialization", () => {
    it("should preserve collection metadata", () => {
      const json = serializeCollectionMetadata(mockCollectionMetadata);
      const deserialized = deserializeCollectionMetadata(json);
      expect(deserialized.toolId).toBe(mockCollectionMetadata.toolId);
      expect(deserialized.presets.length).toBe(1);
      expect(deserialized.presets[0].name).toBe("Test Preset");
    });

    it("should preserve preset metadata", () => {
      const json = serializePresetMetadata(mockPresetMetadata);
      const deserialized = deserializePresetMetadata(json);
      expect(deserialized.id).toBe(mockPresetMetadata.id);
      expect(deserialized.policyCount).toBe(42);
      expect(deserialized.dnsModes).toEqual(["default", "strict"]);
    });

    it("should preserve preview output", () => {
      const json = serializePreviewOutput(mockPreviewOutput);
      const deserialized = deserializePreviewOutput(json);
      expect(deserialized.changes.added).toEqual(["policy1", "policy2"]);
      expect(deserialized.changes.modified).toEqual(["policy3"]);
      expect(deserialized.changes.removed).toEqual(["policy4"]);
    });
  });

  describe("areCollectionMetadataEqual", () => {
    it("should return true for identical metadata", () => {
      const result = areCollectionMetadataEqual(
        mockCollectionMetadata,
        mockCollectionMetadata
      );
      expect(result).toBe(true);
    });

    it("should return true for cloned metadata", () => {
      const clone = cloneCollectionMetadata(mockCollectionMetadata);
      const result = areCollectionMetadataEqual(mockCollectionMetadata, clone);
      expect(result).toBe(true);
    });

    it("should return false for different metadata", () => {
      const different: CollectionMetadata = {
        ...mockCollectionMetadata,
        toolName: "Different Tool",
      };
      const result = areCollectionMetadataEqual(
        mockCollectionMetadata,
        different
      );
      expect(result).toBe(false);
    });

    it("should handle non-serializable objects gracefully", () => {
      const withCircular: any = { ...mockCollectionMetadata };
      withCircular.self = withCircular;
      expect(() =>
        areCollectionMetadataEqual(withCircular, mockCollectionMetadata)
      ).not.toThrow();
    });
  });

  describe("cloneCollectionMetadata", () => {
    it("should create a deep copy", () => {
      const clone = cloneCollectionMetadata(mockCollectionMetadata);
      expect(clone).toEqual(mockCollectionMetadata);
      expect(clone).not.toBe(mockCollectionMetadata);
    });

    it("should create independent copy of nested arrays", () => {
      const clone = cloneCollectionMetadata(mockCollectionMetadata);
      expect(clone.presets).not.toBe(mockCollectionMetadata.presets);
      expect(clone.platformCapabilities).not.toBe(
        mockCollectionMetadata.platformCapabilities
      );
    });

    it("should create independent copy of nested objects", () => {
      const clone = cloneCollectionMetadata(mockCollectionMetadata);
      expect(clone.presets[0]).not.toBe(mockCollectionMetadata.presets[0]);
    });
  });

  describe("clonePresetMetadata", () => {
    it("should create a deep copy", () => {
      const clone = clonePresetMetadata(mockPresetMetadata);
      expect(clone).toEqual(mockPresetMetadata);
      expect(clone).not.toBe(mockPresetMetadata);
    });

    it("should preserve array values", () => {
      const clone = clonePresetMetadata(mockPresetMetadata);
      expect(clone.dnsModes).toEqual(mockPresetMetadata.dnsModes);
      expect(clone.compatiblePlatforms).toEqual(
        mockPresetMetadata.compatiblePlatforms
      );
    });
  });

  describe("clonePreviewOutput", () => {
    it("should create a deep copy", () => {
      const clone = clonePreviewOutput(mockPreviewOutput);
      expect(clone).toEqual(mockPreviewOutput);
      expect(clone).not.toBe(mockPreviewOutput);
    });

    it("should create independent copy of changes", () => {
      const clone = clonePreviewOutput(mockPreviewOutput);
      expect(clone.changes).not.toBe(mockPreviewOutput.changes);
      expect(clone.changes.added).not.toBe(mockPreviewOutput.changes.added);
    });
  });

  describe("deterministic field ordering", () => {
    it("should sort keys in JSON output", () => {
      const json = serializeCollectionMetadata(mockCollectionMetadata);
      const parsed = JSON.parse(json);
      const keys = Object.keys(parsed);
      const sortedKeys = [...keys].sort();
      expect(keys).toEqual(sortedKeys);
    });

    it("should produce same JSON regardless of input object key order", () => {
      const obj1 = {
        toolId: createToolId("test"),
        toolName: "Test",
        toolUrl: "https://example.com",
        toolVersion: "1.0.0",
        schemaVersion: createSchemaVersion("1.0.0"),
        collectionType: "debloat" as const,
        summary: "Test",
        generatedAt: "2026-07-23T12:34:56Z",
        platformCapabilities: mockCollectionMetadata.platformCapabilities,
        presets: mockCollectionMetadata.presets,
      };

      const obj2 = {
        presets: mockCollectionMetadata.presets,
        collectionType: "debloat" as const,
        toolUrl: "https://example.com",
        toolVersion: "1.0.0",
        toolId: createToolId("test"),
        schemaVersion: createSchemaVersion("1.0.0"),
        platformCapabilities: mockCollectionMetadata.platformCapabilities,
        toolName: "Test",
        summary: "Test",
        generatedAt: "2026-07-23T12:34:56Z",
      };

      const json1 = serializeCollectionMetadata(obj1 as any);
      const json2 = serializeCollectionMetadata(obj2 as any);
      expect(json1).toBe(json2);
    });
  });

  describe("error conditions", () => {
    it("should throw SerializationError on invalid input to serialize", () => {
      expect(() =>
        serializeCollectionMetadata(undefined as any)
      ).toThrow();
    });

    it("should throw DeserializationError on non-JSON string", () => {
      expect(() => deserializeCollectionMetadata("not json")).toThrow(
        DeserializationError
      );
    });
  });
});
