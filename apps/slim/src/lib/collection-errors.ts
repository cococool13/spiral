/**
 * Exhaustive, named error types for every failure path in the collection system.
 * Each error type documents its cause, recovery action, and context.
 * Use these in place of generic Error objects for precise error handling.
 */

/**
 * Base class for all collection errors.
 * Subclasses MUST define error codes and human-readable messages.
 */
export abstract class CollectionError extends Error {
  readonly code: string;
  readonly isCollectionError = true;
  override readonly name: string;

  constructor(code: string, message: string, readonly context?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, CollectionError.prototype);
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

/**
 * Validation errors: input failed schema or constraint checks.
 */
export class ValidationError extends CollectionError {
  constructor(message: string, readonly fieldName: string, readonly reason: string, context?: Record<string, unknown>) {
    super("VALIDATION_ERROR", message, context);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Schema version mismatch: the collection uses an unsupported or incompatible schema version.
 * Recovery: upgrade the collection consumer or check with the maintainer.
 */
export class SchemaVersionMismatchError extends CollectionError {
  constructor(
    readonly supportedVersions: readonly string[],
    readonly receivedVersion: string,
    context?: Record<string, unknown>
  ) {
    const message = `Schema version ${receivedVersion} not supported. Supported versions: ${supportedVersions.join(", ")}`;
    super("SCHEMA_VERSION_MISMATCH", message, context);
    Object.setPrototypeOf(this, SchemaVersionMismatchError.prototype);
  }
}

/**
 * Collection metadata is malformed or missing required fields.
 * Recovery: check the source collection and ensure it exports valid metadata.
 */
export class MalformedMetadataError extends CollectionError {
  constructor(message: string, readonly missingFields: readonly string[] = [], context?: Record<string, unknown>) {
    super("MALFORMED_METADATA", message, context);
    Object.setPrototypeOf(this, MalformedMetadataError.prototype);
  }
}

/**
 * Preset metadata is invalid or incomplete.
 * Recovery: verify the preset file exists and contains required fields.
 */
export class InvalidPresetError extends CollectionError {
  constructor(readonly presetId: string, message: string, context?: Record<string, unknown>) {
    super("INVALID_PRESET", message, context);
    Object.setPrototypeOf(this, InvalidPresetError.prototype);
  }
}

/**
 * Preset file path does not exist or is inaccessible.
 * Recovery: check the file path and ensure the preset file is readable.
 */
export class PresetFileNotFoundError extends CollectionError {
  constructor(readonly filePath: string, context?: Record<string, unknown>) {
    const message = `Preset file not found: ${filePath}`;
    super("PRESET_FILE_NOT_FOUND", message, context);
    Object.setPrototypeOf(this, PresetFileNotFoundError.prototype);
  }
}

/**
 * Platform is not supported by this collection.
 * Recovery: check the platform capabilities or switch to a compatible tool.
 */
export class UnsupportedPlatformError extends CollectionError {
  constructor(
    readonly platform: string,
    readonly supportedPlatforms: readonly string[] = [],
    context?: Record<string, unknown>
  ) {
    const supported = supportedPlatforms.length > 0 ? supportedPlatforms.join(", ") : "none";
    const message = `Platform "${platform}" is not supported. Supported platforms: ${supported}`;
    super("UNSUPPORTED_PLATFORM", message, context);
    Object.setPrototypeOf(this, UnsupportedPlatformError.prototype);
  }
}

/**
 * Preset is not compatible with the requested platform.
 * Recovery: select a preset with platform support or try a different tool.
 */
export class PresetPlatformIncompatibilityError extends CollectionError {
  constructor(
    readonly presetId: string,
    readonly requestedPlatform: string,
    readonly compatiblePlatforms: readonly string[] = [],
    context?: Record<string, unknown>
  ) {
    const compatible = compatiblePlatforms.join(", ") || "none";
    const message = `Preset "${presetId}" is not compatible with "${requestedPlatform}". Compatible platforms: ${compatible}`;
    super("PRESET_PLATFORM_INCOMPATIBILITY", message, context);
    Object.setPrototypeOf(this, PresetPlatformIncompatibilityError.prototype);
  }
}

/**
 * Preview mode is not supported for this platform or entrypoint.
 * Recovery: use the apply path instead or use a tool that supports preview.
 */
export class PreviewNotSupportedError extends CollectionError {
  constructor(
    readonly platform: string,
    readonly entrypoint: string,
    context?: Record<string, unknown>
  ) {
    const message = `Preview mode is not supported for platform "${platform}" (entrypoint: ${entrypoint})`;
    super("PREVIEW_NOT_SUPPORTED", message, context);
    Object.setPrototypeOf(this, PreviewNotSupportedError.prototype);
  }
}

/**
 * JSON output format is not supported for this platform.
 * Recovery: request the tool to output in a different format or upgrade it.
 */
export class JsonFormatNotSupportedError extends CollectionError {
  constructor(
    readonly platform: string,
    readonly entrypoint: string,
    context?: Record<string, unknown>
  ) {
    const message = `JSON format is not supported for platform "${platform}" (entrypoint: ${entrypoint})`;
    super("JSON_FORMAT_NOT_SUPPORTED", message, context);
    Object.setPrototypeOf(this, JsonFormatNotSupportedError.prototype);
  }
}

/**
 * DNS mode is not supported on this platform.
 * Recovery: select a different DNS mode or use a tool with broader DNS support.
 */
export class UnsupportedDnsModeError extends CollectionError {
  constructor(
    readonly dnsMode: string,
    readonly platform: string,
    readonly supportedModes: readonly string[] = [],
    context?: Record<string, unknown>
  ) {
    const supported = supportedModes.join(", ") || "none";
    const message = `DNS mode "${dnsMode}" is not supported on "${platform}". Supported modes: ${supported}`;
    super("UNSUPPORTED_DNS_MODE", message, context);
    Object.setPrototypeOf(this, UnsupportedDnsModeError.prototype);
  }
}

/**
 * Policy limit exceeded: the preset or configuration exceeds platform limits.
 * Recovery: reduce the number of policies or split into multiple presets.
 */
export class PolicyLimitExceededError extends CollectionError {
  constructor(
    readonly platform: string,
    readonly policyCount: number,
    readonly maxPolicies: number,
    context?: Record<string, unknown>
  ) {
    const message = `Policy limit exceeded on "${platform}": ${policyCount} policies > max ${maxPolicies}`;
    super("POLICY_LIMIT_EXCEEDED", message, context);
    Object.setPrototypeOf(this, PolicyLimitExceededError.prototype);
  }
}

/**
 * Collection name is invalid: does not match naming rules.
 * Recovery: use a valid collection name with alphanumerics, hyphens, and underscores.
 */
export class InvalidCollectionNameError extends CollectionError {
  constructor(readonly name: string, context?: Record<string, unknown>) {
    const message = `Collection name "${name}" is invalid. Use only alphanumerics, hyphens, and underscores`;
    super("INVALID_COLLECTION_NAME", message, context);
    Object.setPrototypeOf(this, InvalidCollectionNameError.prototype);
  }
}

/**
 * URL validation failed: the URL is malformed or unreachable.
 * Recovery: verify the URL format or check internet connectivity.
 */
export class InvalidUrlError extends CollectionError {
  constructor(readonly url: string, readonly reason: string = "malformed", context?: Record<string, unknown>) {
    const message = `URL is invalid: ${url} (${reason})`;
    super("INVALID_URL", message, context);
    Object.setPrototypeOf(this, InvalidUrlError.prototype);
  }
}

/**
 * Semantic version is malformed or invalid.
 * Recovery: use valid semantic versioning (e.g. "1.0.0", "2.1.3-alpha").
 */
export class InvalidVersionError extends CollectionError {
  constructor(readonly version: string, context?: Record<string, unknown>) {
    const message = `Version "${version}" is not valid semantic versioning`;
    super("INVALID_VERSION", message, context);
    Object.setPrototypeOf(this, InvalidVersionError.prototype);
  }
}

/**
 * ISO 8601 timestamp is invalid or unparseable.
 * Recovery: use ISO 8601 format (e.g. "2026-07-23T12:34:56Z").
 */
export class InvalidTimestampError extends CollectionError {
  constructor(readonly timestamp: string, context?: Record<string, unknown>) {
    const message = `Timestamp "${timestamp}" is not valid ISO 8601 format`;
    super("INVALID_TIMESTAMP", message, context);
    Object.setPrototypeOf(this, InvalidTimestampError.prototype);
  }
}

/**
 * Cache miss or cache invalidation: the requested item is not in cache.
 * Recovery: rebuild the cache from source or re-fetch the data.
 */
export class CacheMissError extends CollectionError {
  constructor(readonly key: string, context?: Record<string, unknown>) {
    const message = `Cache miss for key: ${key}`;
    super("CACHE_MISS", message, context);
    Object.setPrototypeOf(this, CacheMissError.prototype);
  }
}

/**
 * Cache corruption: the cached data is malformed or inconsistent.
 * Recovery: clear the cache and rebuild from source.
 */
export class CacheCorruptionError extends CollectionError {
  constructor(readonly key: string, readonly reason: string, context?: Record<string, unknown>) {
    const message = `Cache corruption for key "${key}": ${reason}`;
    super("CACHE_CORRUPTION", message, context);
    Object.setPrototypeOf(this, CacheCorruptionError.prototype);
  }
}

/**
 * Mutation attempted on immutable object.
 * Recovery: use copy or create a new object instead of mutating.
 */
export class ImmutabilityViolationError extends CollectionError {
  constructor(readonly objectType: string, context?: Record<string, unknown>) {
    const message = `Attempted mutation on immutable ${objectType}. Use copy or create a new instance`;
    super("IMMUTABILITY_VIOLATION", message, context);
    Object.setPrototypeOf(this, ImmutabilityViolationError.prototype);
  }
}

/**
 * Deserialization failed: the data format is corrupted or incompatible.
 * Recovery: verify the data source or re-export from the collection.
 */
export class DeserializationError extends CollectionError {
  constructor(readonly dataType: string, readonly reason: string, context?: Record<string, unknown>) {
    const message = `Deserialization failed for ${dataType}: ${reason}`;
    super("DESERIALIZATION_ERROR", message, context);
    Object.setPrototypeOf(this, DeserializationError.prototype);
  }
}

/**
 * Serialization failed: the object cannot be serialized to the requested format.
 * Recovery: check that the object is fully serializable and contains no circular references.
 */
export class SerializationError extends CollectionError {
  constructor(readonly dataType: string, readonly reason: string, context?: Record<string, unknown>) {
    const message = `Serialization failed for ${dataType}: ${reason}`;
    super("SERIALIZATION_ERROR", message, context);
    Object.setPrototypeOf(this, SerializationError.prototype);
  }
}

/**
 * Type check failed: the value is not of the expected type.
 * Recovery: verify the data type and convert if necessary.
 */
export class TypeCheckError extends CollectionError {
  constructor(
    readonly expectedType: string,
    readonly actualType: string,
    readonly value: unknown,
    context?: Record<string, unknown>
  ) {
    const message = `Type mismatch: expected ${expectedType}, got ${actualType}`;
    super("TYPE_CHECK_ERROR", message, context);
    Object.setPrototypeOf(this, TypeCheckError.prototype);
  }
}

/**
 * Runtime contract violation: a function precondition or postcondition failed.
 * Recovery: review the function documentation and ensure inputs are valid.
 */
export class ContractViolationError extends CollectionError {
  constructor(
    readonly functionName: string,
    readonly violationType: "precondition" | "postcondition",
    readonly reason: string,
    context?: Record<string, unknown>
  ) {
    const message = `${violationType.charAt(0).toUpperCase()}${violationType.slice(1)} violation in ${functionName}: ${reason}`;
    super("CONTRACT_VIOLATION", message, context);
    Object.setPrototypeOf(this, ContractViolationError.prototype);
  }
}

/**
 * Type predicate to check if an error is a CollectionError.
 */
export const isCollectionError = (error: unknown): error is CollectionError => {
  return (
    error instanceof Error &&
    (error instanceof CollectionError || (error as any).isCollectionError === true)
  );
};

/**
 * Extract error context for logging and debugging.
 */
export const getErrorContext = (error: unknown): Record<string, unknown> => {
  if (isCollectionError(error)) {
    return {
      errorType: error.name,
      code: error.code,
      message: error.message,
      context: error.context,
    };
  }
  if (error instanceof Error) {
    return {
      errorType: error.constructor.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    value: error,
    type: typeof error,
  };
};
