/**
 * SlimBrave Neo Collection Foundation Library
 *
 * Provides stable, type-safe interfaces and validation for browser tool collections.
 * All components are read-only, immutable, and deterministic.
 */

// Types and contracts
export type {
  SchemaVersion,
  ToolId,
  PresetId,
  Platform,
  DNSMode,
  BrowserCollectionType,
  PlatformEntrypoint,
  PlatformCapabilities,
  PresetMetadata,
  CollectionMetadata,
  PreviewOutput,
  DiscoveryResult,
} from "./lib/collection-types";

export {
  createSchemaVersion,
  createToolId,
  createPresetId,
  isPlatform,
  isDNSMode,
  isBrowserCollectionType,
  isRiskLevel,
} from "./lib/collection-types";

// Error types
export {
  CollectionError,
  ValidationError,
  SchemaVersionMismatchError,
  MalformedMetadataError,
  InvalidPresetError,
  PresetFileNotFoundError,
  UnsupportedPlatformError,
  PresetPlatformIncompatibilityError,
  PreviewNotSupportedError,
  JsonFormatNotSupportedError,
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
} from "./lib/collection-errors";

// Validators
export {
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
} from "./lib/collection-validation";

// Serialization
export {
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
  hashCollectionMetadata,
} from "./lib/collection-schema";

// Cache
export {
  CollectionCache,
  getGlobalCache,
  resetGlobalCache,
} from "./lib/collection-cache";
