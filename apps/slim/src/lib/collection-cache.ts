/**
 * In-memory, read-only cache with TTL, no mutations, no side effects.
 * Guarantees: cache entries are immutable, expired entries are auto-cleaned.
 * Never called from cache entries and no external I/O.
 */

import {
  CollectionMetadata,
  PreviewOutput,
  PresetMetadata,
  DiscoveryResult,
} from "./collection-types";

import {
  cloneCollectionMetadata,
  clonePresetMetadata,
  clonePreviewOutput,
} from "./collection-schema";

import {
  CacheMissError,
  ContractViolationError,
} from "./collection-errors";

/**
 * Cache entry: versioned, timestamped, with TTL.
 */
interface CacheEntry<T> {
  readonly key: string;
  readonly value: T;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly version: number;
}

/**
 * Collection cache: stores metadata, presets, and previews with TTL.
 * Thread-safe (within single-threaded JS) and immutable by contract.
 */
export class CollectionCache {
  private readonly metadataCache = new Map<string, CacheEntry<CollectionMetadata>>();
  private readonly presetCache = new Map<string, CacheEntry<PresetMetadata>>();
  private readonly previewCache = new Map<string, CacheEntry<PreviewOutput>>();
  private readonly discoveryCache = new Map<string, CacheEntry<DiscoveryResult>>();

  private entryVersion = 0;

  constructor(readonly ttlMs: number = 5 * 60 * 1000) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new ContractViolationError(
        "CollectionCache.constructor",
        "precondition",
        "ttlMs must be positive number"
      );
    }
  }

  /**
   * Set collection metadata in cache.
   * Precondition: metadata is fully valid.
   * Postcondition: entry is immutable and will expire after ttlMs.
   */
  setMetadata(toolId: string, metadata: CollectionMetadata): void {
    this.validateKey(toolId);
    const clone = cloneCollectionMetadata(metadata);
    const now = Date.now();
    const entry: CacheEntry<CollectionMetadata> = {
      key: toolId,
      value: Object.freeze(clone),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      version: ++this.entryVersion,
    };
    this.metadataCache.set(toolId, entry);
  }

  /**
   * Get collection metadata from cache.
   * Returns a deep copy to prevent accidental mutations.
   * Throws CacheMissError if not found or expired.
   */
  getMetadata(toolId: string): CollectionMetadata {
    this.validateKey(toolId);
    const entry = this.metadataCache.get(toolId);
    if (!entry) {
      throw new CacheMissError(`metadata.${toolId}`);
    }
    if (Date.now() > entry.expiresAt) {
      this.metadataCache.delete(toolId);
      throw new CacheMissError(`metadata.${toolId} (expired)`);
    }
    return cloneCollectionMetadata(entry.value);
  }

  /**
   * Check if metadata is cached and not expired.
   */
  hasMetadata(toolId: string): boolean {
    this.validateKey(toolId);
    const entry = this.metadataCache.get(toolId);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.metadataCache.delete(toolId);
      return false;
    }
    return true;
  }

  /**
   * Set preset metadata in cache.
   */
  setPreset(presetId: string, preset: PresetMetadata): void {
    this.validateKey(presetId);
    const clone = clonePresetMetadata(preset);
    const now = Date.now();
    const entry: CacheEntry<PresetMetadata> = {
      key: presetId,
      value: Object.freeze(clone),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      version: ++this.entryVersion,
    };
    this.presetCache.set(presetId, entry);
  }

  /**
   * Get preset metadata from cache.
   * Returns a deep copy to prevent accidental mutations.
   */
  getPreset(presetId: string): PresetMetadata {
    this.validateKey(presetId);
    const entry = this.presetCache.get(presetId);
    if (!entry) {
      throw new CacheMissError(`preset.${presetId}`);
    }
    if (Date.now() > entry.expiresAt) {
      this.presetCache.delete(presetId);
      throw new CacheMissError(`preset.${presetId} (expired)`);
    }
    return clonePresetMetadata(entry.value);
  }

  /**
   * Check if preset is cached and not expired.
   */
  hasPreset(presetId: string): boolean {
    this.validateKey(presetId);
    const entry = this.presetCache.get(presetId);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.presetCache.delete(presetId);
      return false;
    }
    return true;
  }

  /**
   * Set preview output in cache.
   */
  setPreview(previewKey: string, preview: PreviewOutput): void {
    this.validateKey(previewKey);
    const clone = clonePreviewOutput(preview);
    const now = Date.now();
    const entry: CacheEntry<PreviewOutput> = {
      key: previewKey,
      value: Object.freeze(clone),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      version: ++this.entryVersion,
    };
    this.previewCache.set(previewKey, entry);
  }

  /**
   * Get preview output from cache.
   * Returns a deep copy to prevent accidental mutations.
   */
  getPreview(previewKey: string): PreviewOutput {
    this.validateKey(previewKey);
    const entry = this.previewCache.get(previewKey);
    if (!entry) {
      throw new CacheMissError(`preview.${previewKey}`);
    }
    if (Date.now() > entry.expiresAt) {
      this.previewCache.delete(previewKey);
      throw new CacheMissError(`preview.${previewKey} (expired)`);
    }
    return clonePreviewOutput(entry.value);
  }

  /**
   * Check if preview is cached and not expired.
   */
  hasPreview(previewKey: string): boolean {
    this.validateKey(previewKey);
    const entry = this.previewCache.get(previewKey);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.previewCache.delete(previewKey);
      return false;
    }
    return true;
  }

  /**
   * Set discovery result in cache.
   */
  setDiscovery(discoveryKey: string, discovery: DiscoveryResult): void {
    this.validateKey(discoveryKey);
    const clone: DiscoveryResult = {
      metadata: cloneCollectionMetadata(discovery.metadata),
      currentPlatform: { ...discovery.currentPlatform },
      compatiblePresets: discovery.compatiblePresets.map((p) => clonePresetMetadata(p)),
    };
    const now = Date.now();
    const entry: CacheEntry<DiscoveryResult> = {
      key: discoveryKey,
      value: Object.freeze(clone),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      version: ++this.entryVersion,
    };
    this.discoveryCache.set(discoveryKey, entry);
  }

  /**
   * Get discovery result from cache.
   * Returns a deep copy to prevent accidental mutations.
   */
  getDiscovery(discoveryKey: string): DiscoveryResult {
    this.validateKey(discoveryKey);
    const entry = this.discoveryCache.get(discoveryKey);
    if (!entry) {
      throw new CacheMissError(`discovery.${discoveryKey}`);
    }
    if (Date.now() > entry.expiresAt) {
      this.discoveryCache.delete(discoveryKey);
      throw new CacheMissError(`discovery.${discoveryKey} (expired)`);
    }
    return {
      metadata: cloneCollectionMetadata(entry.value.metadata),
      currentPlatform: { ...entry.value.currentPlatform },
      compatiblePresets: entry.value.compatiblePresets.map((p) => clonePresetMetadata(p)),
    };
  }

  /**
   * Check if discovery result is cached and not expired.
   */
  hasDiscovery(discoveryKey: string): boolean {
    this.validateKey(discoveryKey);
    const entry = this.discoveryCache.get(discoveryKey);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.discoveryCache.delete(discoveryKey);
      return false;
    }
    return true;
  }

  /**
   * Clear a specific metadata entry.
   */
  clearMetadata(toolId: string): void {
    this.validateKey(toolId);
    this.metadataCache.delete(toolId);
  }

  /**
   * Clear a specific preset entry.
   */
  clearPreset(presetId: string): void {
    this.validateKey(presetId);
    this.presetCache.delete(presetId);
  }

  /**
   * Clear a specific preview entry.
   */
  clearPreview(previewKey: string): void {
    this.validateKey(previewKey);
    this.previewCache.delete(previewKey);
  }

  /**
   * Clear all cache entries (nuclear option).
   */
  clear(): void {
    this.metadataCache.clear();
    this.presetCache.clear();
    this.previewCache.clear();
    this.discoveryCache.clear();
  }

  /**
   * Return cache statistics (for monitoring/debugging).
   */
  getStats() {
    const now = Date.now();
    const countValid = (cache: Map<string, CacheEntry<any>>) => {
      return Array.from(cache.values()).filter((e) => e.expiresAt > now).length;
    };
    return Object.freeze({
      metadata: { total: this.metadataCache.size, valid: countValid(this.metadataCache) },
      presets: { total: this.presetCache.size, valid: countValid(this.presetCache) },
      previews: { total: this.previewCache.size, valid: countValid(this.previewCache) },
      discoveries: {
        total: this.discoveryCache.size,
        valid: countValid(this.discoveryCache),
      },
      ttlMs: this.ttlMs,
    });
  }

  /**
   * Private: validate cache key format.
   */
  private validateKey(key: string): void {
    if (!key || typeof key !== "string" || key.length === 0 || key.length > 256) {
      throw new ContractViolationError(
        "CollectionCache key validation",
        "precondition",
        "Key must be non-empty string, max 256 chars"
      );
    }
  }
}

/**
 * Global singleton cache instance.
 * Precondition: must only be accessed from single thread (JS runtime guarantee).
 */
let globalCache: CollectionCache | null = null;

/**
 * Get or initialize the global cache.
 * Idempotent: returns same instance on every call.
 */
export function getGlobalCache(ttlMs?: number): CollectionCache {
  if (!globalCache) {
    globalCache = new CollectionCache(ttlMs);
  }
  return globalCache;
}

/**
 * Reset the global cache (for testing).
 */
export function resetGlobalCache(): void {
  if (globalCache) {
    globalCache.clear();
    globalCache = null;
  }
}
