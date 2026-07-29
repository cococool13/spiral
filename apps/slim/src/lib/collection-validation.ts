/**
 * Strict Zod validators for all external input.
 * Validates collection names, metadata, URLs, and user input with clear error messages.
 * All validators fail fast on invalid input with no silent defaults.
 */

import {
  z,
  ZodError,
  ZodSchema,
} from "zod";

import {
  createPresetId,
  createSchemaVersion,
  createToolId,
} from "./collection-types";

import type {
  CollectionMetadata,
  PresetMetadata,
  PreviewOutput,
  PlatformCapabilities,
  PlatformEntrypoint,
} from "./collection-types";

import {
  ValidationError,
  TypeCheckError,
} from "./collection-errors";

/**
 * ISO 8601 timestamp validator.
 * Accepts: "2026-07-23T12:34:56Z", "2026-07-23T12:34:56+00:00", "2026-07-23T12:34:56"
 */
export const iso8601Timestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})?$/, {
    message: "Must be valid ISO 8601 timestamp (e.g. 2026-07-23T12:34:56Z)",
  })
  .describe("ISO 8601 timestamp with optional timezone");

/**
 * Semantic version validator (loose: allows pre-release and build metadata).
 * Accepts: "1.0.0", "2.1.3-alpha", "3.0.0-rc.1+build.123"
 */
export const semanticVersion = z
  .string()
  .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/, {
    message: "Must be valid semantic version (e.g. 1.0.0, 2.1.0-alpha)",
  })
  .describe("Semantic version string");

/**
 * Collection name validator: alphanumerics, hyphens, underscores, 1-64 chars.
 */
export const collectionName = z
  .string()
  .min(1, "Collection name is required")
  .max(64, "Collection name must be 64 characters or less")
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: "Use only alphanumerics, hyphens, and underscores",
  })
  .describe("Collection name");

/**
 * Tool ID validator: similar rules as collection name.
 */
export const toolId = z
  .string()
  .min(1, "Tool ID is required")
  .max(64, "Tool ID must be 64 characters or less")
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: "Use only alphanumerics, hyphens, and underscores",
  })
  .transform((id) => createToolId(id))
  .describe("Tool ID");

/**
 * Preset ID validator: similar rules as collection name.
 */
export const presetId = z
  .string()
  .min(1, "Preset ID is required")
  .max(64, "Preset ID must be 64 characters or less")
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: "Use only alphanumerics, hyphens, and underscores",
  })
  .transform((id) => createPresetId(id))
  .describe("Preset ID");

/**
 * URL validator: accepts http, https, file URLs.
 */
export const urlString = z
  .string()
  .url("Must be a valid URL")
  .refine((url) => /^(https?|file):\/\/.+/.test(url), {
    message: "URL must use http, https, or file protocol",
  })
  .describe("URL string");

/**
 * File path validator: non-empty relative or absolute paths.
 */
export const filePath = z
  .string()
  .min(1, "File path is required")
  .refine((path) => !path.includes(".."), {
    message: "File path must not contain .. traversal",
  })
  .describe("File path");

/**
 * Platform validator.
 */
export const platformSchema = z
  .enum(["linux", "darwin", "win32"])
  .describe("Platform (linux, darwin, win32)");

/**
 * DNS mode validator.
 */
export const dnsModeSchema = z
  .enum(["default", "strict", "quad9", "opendns", "custom"])
  .describe("DNS mode");

/**
 * Collection type validator.
 */
export const collectionTypeSchema = z
  .enum(["debloat", "hardening", "optimization", "configuration"])
  .describe("Collection type");

/**
 * Risk level validator.
 */
export const riskLevelSchema = z
  .enum(["low", "medium", "high"])
  .describe("Risk level");

/**
 * Policy count validator: 0-10000.
 */
export const policyCount = z
  .number()
  .int()
  .min(0, "Policy count must be >= 0")
  .max(10000, "Policy count must be <= 10000")
  .describe("Number of policies");

/**
 * Impact level validator.
 */
export const impactLevelSchema = z
  .enum(["low", "medium", "high"])
  .describe("Impact level");

/**
 * Schema version validator.
 */
export const schemaVersionSchema = z
  .string()
  .min(1, "Schema version is required")
  .transform((version) => createSchemaVersion(version))
  .describe("Schema version");

/**
 * Platform entrypoint validator.
 */
export const platformEntrypointSchema = z
  .object({
    command: z
      .string()
      .min(1, "Command is required")
      .max(256, "Command is too long")
      .describe("CLI command"),
    supportsPreview: z.boolean().describe("Supports --preview mode"),
    supportsJson: z.boolean().describe("Supports --format json"),
    requiresElevation: z.boolean().describe("Requires elevation/admin"),
  })
  .strict()
  .describe("Platform entrypoint") as ZodSchema<PlatformEntrypoint>;

/**
 * Platform capabilities validator.
 */
export const platformCapabilitiesSchema = z
  .object({
    platform: platformSchema,
    entrypoint: platformEntrypointSchema,
    supportedDnsModes: z.array(dnsModeSchema).min(1),
    maxPolicies: z.number().int().min(1),
    supportsProfilePersistence: z.boolean(),
    policiesVersion: z.string().min(1).max(16),
  })
  .strict()
  .describe("Platform capabilities") as ZodSchema<PlatformCapabilities>;

/**
 * Preset metadata validator.
 */
export const presetMetadataSchema = z
  .object({
    id: presetId,
    name: z
      .string()
      .min(1, "Name is required")
      .max(128, "Name is too long"),
    description: z
      .string()
      .min(1, "Description is required")
      .max(1024, "Description is too long"),
    filePath: filePath,
    policyCount: policyCount,
    dnsModes: z.array(dnsModeSchema).min(0),
    compatiblePlatforms: z.array(platformSchema).min(1),
    riskLevel: riskLevelSchema,
    version: semanticVersion,
    lastModified: iso8601Timestamp,
  })
  .strict()
  .describe("Preset metadata") as unknown as ZodSchema<PresetMetadata>;

/**
 * Collection metadata validator.
 */
export const collectionMetadataSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    toolId: toolId,
    toolName: z
      .string()
      .min(1, "Tool name is required")
      .max(128, "Tool name is too long"),
    toolUrl: urlString,
    toolVersion: semanticVersion,
    collectionType: collectionTypeSchema,
    platformCapabilities: z.array(platformCapabilitiesSchema).min(1),
    presets: z.array(presetMetadataSchema).min(1),
    summary: z
      .string()
      .min(1, "Summary is required")
      .max(512, "Summary is too long"),
    generatedAt: iso8601Timestamp,
  })
  .strict()
  .describe("Collection metadata") as unknown as ZodSchema<CollectionMetadata>;

/**
 * Preview output validator.
 */
export const previewOutputSchema = z
  .object({
    mutatesSystem: z.literal(false),
    preset: presetMetadataSchema,
    platform: platformSchema,
    changes: z
      .object({
        added: z.array(z.string()),
        modified: z.array(z.string()),
        removed: z.array(z.string()),
      })
      .strict(),
    affectedPolicyCount: z.number().int().min(0),
    dnsChanges: z
      .object({
        from: dnsModeSchema,
        to: dnsModeSchema,
      })
      .strict()
      .optional(),
    impactLevel: impactLevelSchema,
    generatedAt: iso8601Timestamp,
  })
  .strict()
  .describe("Preview output") as ZodSchema<PreviewOutput>;

/**
 * Validate any data against a schema.
 * Throws ValidationError on failure.
 */
export function validateData<T>(
  schema: ZodSchema<T>,
  data: unknown,
  fieldName: string = "data"
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      throw new ValidationError(
        `Invalid ${fieldName}: ${issues}`,
        fieldName,
        issues,
        { originalError: error.message, zodError: error.errors }
      );
    }
    throw error;
  }
}

/**
 * Safely validate data without throwing.
 * Returns { success: true, data: T } or { success: false, error: ValidationError }.
 */
export function tryValidateData<T>(
  schema: ZodSchema<T>,
  data: unknown,
  fieldName: string = "data"
): { success: true; data: T } | { success: false; error: ValidationError } {
  try {
    return { success: true, data: validateData(schema, data, fieldName) };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { success: false, error };
    }
    return {
      success: false,
      error: new ValidationError(
        `Validation error for ${fieldName}`,
        fieldName,
        String(error),
        { originalError: error }
      ),
    };
  }
}

/**
 * Ensure a value is of an expected type.
 * Throws TypeCheckError on mismatch.
 */
export function assertType<T>(
  value: unknown,
  predicate: (v: unknown) => v is T,
  expectedType: string
): T {
  if (!predicate(value)) {
    const actualType = Array.isArray(value) ? "array" : typeof value;
    throw new TypeCheckError(expectedType, actualType, value, {
      value: String(value).slice(0, 100),
    });
  }
  return value;
}

/**
 * Validate and parse JSON string to collection metadata.
 */
export function parseCollectionMetadata(jsonString: string): CollectionMetadata {
  try {
    const parsed = JSON.parse(jsonString);
    return validateData(collectionMetadataSchema, parsed, "CollectionMetadata");
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ValidationError(
        `JSON parse error: ${error.message}`,
        "collectionMetadata",
        "Invalid JSON format",
        { originalError: error.message }
      );
    }
    throw error;
  }
}

/**
 * Validate and parse JSON string to preview output.
 */
export function parsePreviewOutput(jsonString: string): PreviewOutput {
  try {
    const parsed = JSON.parse(jsonString);
    return validateData(previewOutputSchema, parsed, "PreviewOutput");
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ValidationError(
        `JSON parse error: ${error.message}`,
        "previewOutput",
        "Invalid JSON format",
        { originalError: error.message }
      );
    }
    throw error;
  }
}
