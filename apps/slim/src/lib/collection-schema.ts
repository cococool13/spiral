/**
 * Deterministic serialization and deserialization for collection data.
 * Guarantees: same input → same JSON output (every time), safe parsing with error recovery.
 * Uses a custom replacer for deterministic field ordering and type preservation.
 */

import type {
  CollectionMetadata,
  PreviewOutput,
  PresetMetadata,
} from "./collection-types";

import {
  parseCollectionMetadata,
  parsePreviewOutput,
  presetMetadataSchema,
  validateData,
} from "./collection-validation";

import {
  SerializationError,
  DeserializationError,
} from "./collection-errors";

/**
 * Deterministic JSON replacer: ensures consistent field ordering.
 * Skips undefined and non-serializable values.
 */
const deterministicReplacer = (_key: string, value: unknown): unknown => {
  if (value === undefined) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Set) {
    return Array.from(value);
  }
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }
  if (typeof value === "function") {
    return undefined;
  }
  if (value === null || typeof value === "object") {
    if (Array.isArray(value)) {
      return value;
    }
    const isReadonly = (obj: any) => Object.isFrozen(obj);
    if (isReadonly(value)) {
      return { ...value };
    }
  }
  return value;
};

/**
 * Sort object keys deterministically for consistent output.
 */
const sortKeys = (obj: unknown): unknown => {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    const value = (obj as Record<string, unknown>)[key];
    sorted[key] = sortKeys(value);
  }
  return sorted;
};

/**
 * Serialize collection metadata to JSON string with deterministic ordering.
 * Postcondition: output is valid JSON, same input always produces same output.
 */
export function serializeCollectionMetadata(metadata: CollectionMetadata): string {
  try {
    const sorted = sortKeys(metadata) as CollectionMetadata;
    const json = JSON.stringify(sorted, deterministicReplacer, 2);
    if (!json || json.length === 0) {
      throw new SerializationError(
        "CollectionMetadata",
        "JSON output is empty"
      );
    }
    return json;
  } catch (error) {
    if (error instanceof SerializationError) {
      throw error;
    }
    throw new SerializationError(
      "CollectionMetadata",
      error instanceof Error ? error.message : String(error),
      { originalError: error }
    );
  }
}

/**
 * Serialize preview output to JSON string with deterministic ordering.
 * Postcondition: output is valid JSON, same input always produces same output.
 */
export function serializePreviewOutput(output: PreviewOutput): string {
  try {
    const sorted = sortKeys(output) as PreviewOutput;
    const json = JSON.stringify(sorted, deterministicReplacer, 2);
    if (!json || json.length === 0) {
      throw new SerializationError(
        "PreviewOutput",
        "JSON output is empty"
      );
    }
    return json;
  } catch (error) {
    if (error instanceof SerializationError) {
      throw error;
    }
    throw new SerializationError(
      "PreviewOutput",
      error instanceof Error ? error.message : String(error),
      { originalError: error }
    );
  }
}

/**
 * Serialize preset metadata to JSON string with deterministic ordering.
 */
export function serializePresetMetadata(preset: PresetMetadata): string {
  try {
    const sorted = sortKeys(preset) as PresetMetadata;
    const json = JSON.stringify(sorted, deterministicReplacer, 2);
    if (!json || json.length === 0) {
      throw new SerializationError(
        "PresetMetadata",
        "JSON output is empty"
      );
    }
    return json;
  } catch (error) {
    if (error instanceof SerializationError) {
      throw error;
    }
    throw new SerializationError(
      "PresetMetadata",
      error instanceof Error ? error.message : String(error),
      { originalError: error }
    );
  }
}

/**
 * Deserialize and validate JSON string to collection metadata.
 * Precondition: jsonString is valid UTF-8.
 * Postcondition: returned object passes full schema validation.
 */
export function deserializeCollectionMetadata(jsonString: string): CollectionMetadata {
  if (!jsonString || typeof jsonString !== "string") {
    throw new DeserializationError(
      "CollectionMetadata",
      "Input must be a non-empty string"
    );
  }
  try {
    return parseCollectionMetadata(jsonString);
  } catch (error) {
    throw new DeserializationError(
      "CollectionMetadata",
      error instanceof Error ? error.message : String(error),
      { originalError: error }
    );
  }
}

/**
 * Deserialize and validate JSON string to preview output.
 * Precondition: jsonString is valid UTF-8.
 * Postcondition: returned object passes full schema validation.
 */
export function deserializePreviewOutput(jsonString: string): PreviewOutput {
  if (!jsonString || typeof jsonString !== "string") {
    throw new DeserializationError(
      "PreviewOutput",
      "Input must be a non-empty string"
    );
  }
  try {
    return parsePreviewOutput(jsonString);
  } catch (error) {
    throw new DeserializationError(
      "PreviewOutput",
      error instanceof Error ? error.message : String(error),
      { originalError: error }
    );
  }
}

/**
 * Deserialize and validate JSON string to preset metadata.
 */
export function deserializePresetMetadata(jsonString: string): PresetMetadata {
  if (!jsonString || typeof jsonString !== "string") {
    throw new DeserializationError(
      "PresetMetadata",
      "Input must be a non-empty string"
    );
  }
  try {
    const parsed = JSON.parse(jsonString);
    return validateData(presetMetadataSchema, parsed, "PresetMetadata");
  } catch (error) {
    throw new DeserializationError(
      "PresetMetadata",
      error instanceof Error ? error.message : String(error),
      { originalError: error }
    );
  }
}

/**
 * Compute deterministic SHA256 hash of serialized metadata.
 * Precondition: metadata is a valid CollectionMetadata.
 * Postcondition: returns 64-character hex string.
 * Note: This is for integrity checking, not cryptographic security.
 */
export async function hashCollectionMetadata(metadata: CollectionMetadata): Promise<string> {
  try {
    const serialized = serializeCollectionMetadata(metadata);
    if (typeof globalThis === "undefined" || !("crypto" in globalThis)) {
      throw new SerializationError(
        "CollectionMetadata hash",
        "Crypto API not available (WebCrypto required)"
      );
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(serialized);
    const buffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(buffer);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex;
  } catch (error) {
    throw new SerializationError(
      "CollectionMetadata hash",
      error instanceof Error ? error.message : String(error),
      { originalError: error }
    );
  }
}

/**
 * Compare two collection metadata objects for deep equality.
 * Returns true only if all fields and nested objects are equal.
 */
export function areCollectionMetadataEqual(
  a: CollectionMetadata,
  b: CollectionMetadata
): boolean {
  try {
    const aJson = serializeCollectionMetadata(a);
    const bJson = serializeCollectionMetadata(b);
    return aJson === bJson;
  } catch {
    return false;
  }
}

/**
 * Clone collection metadata (deep copy).
 * Precondition: metadata is valid.
 * Postcondition: returned object is independent and fully immutable.
 */
export function cloneCollectionMetadata(metadata: CollectionMetadata): CollectionMetadata {
  try {
    const json = serializeCollectionMetadata(metadata);
    return deserializeCollectionMetadata(json);
  } catch (error) {
    throw new DeserializationError(
      "CollectionMetadata clone",
      error instanceof Error ? error.message : String(error),
      { originalError: error }
    );
  }
}

/**
 * Clone preset metadata (deep copy).
 */
export function clonePresetMetadata(preset: PresetMetadata): PresetMetadata {
  try {
    const json = serializePresetMetadata(preset);
    return deserializePresetMetadata(json);
  } catch (error) {
    throw new DeserializationError(
      "PresetMetadata clone",
      error instanceof Error ? error.message : String(error),
      { originalError: error }
    );
  }
}

/**
 * Clone preview output (deep copy).
 */
export function clonePreviewOutput(output: PreviewOutput): PreviewOutput {
  try {
    const json = serializePreviewOutput(output);
    return deserializePreviewOutput(json);
  } catch (error) {
    throw new DeserializationError(
      "PreviewOutput clone",
      error instanceof Error ? error.message : String(error),
      { originalError: error }
    );
  }
}
