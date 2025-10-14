import * as THREE from "three";

/**
 * Shared texture cache with reference counting and LRU eviction
 * Memory-efficient texture management for billboards
 */
export class TextureCache {
  constructor() {
    // url -> {texture, refCount, lastUsed, size}
    this.cache = new Map();

    // Conservative memory limits
    this.maxCacheSize = 15 * 1024 * 1024; // 15MB max
    this.currentSize = 0;
    this.textureLoader = new THREE.TextureLoader();

    // Stats tracking
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      loads: 0,
      errors: 0,
    };
  }

  /**
   * Acquire a texture (load or return cached)
   * @param {string} url - Texture URL
   * @returns {Promise<THREE.Texture>}
   */
  async acquire(url) {
    // Return cached texture if available
    if (this.cache.has(url)) {
      const entry = this.cache.get(url);
      entry.refCount++;
      entry.lastUsed = Date.now();
      this.stats.hits++;

      return entry.texture;
    }

    // Cache miss - load new texture
    this.stats.misses++;

    return this.load(url);
  }

  /**
   * Load a new texture with memory-optimized settings
   * @param {string} url - Texture URL
   * @returns {Promise<THREE.Texture>}
   */
  async load(url) {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          // Optimize texture for memory efficiency
          texture.minFilter = THREE.LinearFilter; // No mipmaps
          texture.magFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          texture.anisotropy = 1; // Disable anisotropic filtering for billboards
          // Don't force RGB format - let THREE.js detect it automatically
          texture.needsUpdate = true;

          // Estimate texture size (width * height * 3 bytes for RGB)
          const size = this.estimateTextureSize(texture);

          // Check if we need to evict textures to make room
          while (
            this.currentSize + size > this.maxCacheSize &&
            this.cache.size > 0
          ) {
            console.warn(
              `TextureCache full (${this.formatBytes(
                this.currentSize
              )}/${this.formatBytes(this.maxCacheSize)}) - evicting LRU`
            );
            this.evictLRU();
          }

          // Add to cache
          this.cache.set(url, {
            texture,
            refCount: 1,
            lastUsed: Date.now(),
            size,
          });

          this.currentSize += size;
          this.stats.loads++;

          resolve(texture);
        },
        (progress) => {
          // Optional: track loading progress
        },
        (error) => {
          console.error(`TextureCache failed to load: ${url}`, error);
          this.stats.errors++;
          reject(error);
        }
      );
    });
  }

  /**
   * Release a texture reference
   * @param {string} url - Texture URL
   */
  release(url) {
    if (!this.cache.has(url)) {
      console.warn(
        `TextureCache: Attempted to release non-cached texture: ${url}`
      );
      return;
    }

    const entry = this.cache.get(url);
    entry.refCount--;

    // If no more references, dispose immediately
    if (entry.refCount <= 0) {
      this.dispose(url);
    }
  }

  /**
   * Dispose a texture and free memory
   * @param {string} url - Texture URL
   */
  dispose(url) {
    if (!this.cache.has(url)) {
      return;
    }

    const entry = this.cache.get(url);

    // Dispose the texture
    if (entry.texture) {
      entry.texture.dispose();
    }

    // Update memory tracking
    this.currentSize -= entry.size;
    this.cache.delete(url);
  }

  /**
   * Evict least recently used texture with zero references
   */
  evictLRU() {
    let oldestEntry = null;
    let oldestUrl = null;
    let oldestTime = Infinity;

    // Find LRU texture with no references
    for (const [url, entry] of this.cache.entries()) {
      if (entry.refCount === 0 && entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestEntry = entry;
        oldestUrl = url;
      }
    }

    if (oldestUrl) {
      this.dispose(oldestUrl);
      this.stats.evictions++;
    } else {
      console.warn(
        "TextureCache: Cannot evict - all textures have active references!"
      );
    }
  }

  /**
   * Estimate texture memory size
   * @param {THREE.Texture} texture
   * @returns {number} Size in bytes
   */
  estimateTextureSize(texture) {
    if (!texture.image) {
      return 512 * 1024; // Default estimate: 512KB
    }

    const width = texture.image.width || 1024;
    const height = texture.image.height || 512;

    // RGB format = 3 bytes per pixel
    return width * height * 3;
  }

  /**
   * Get cache statistics
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      cachedTextures: this.cache.size,
      memoryUsed: this.currentSize,
      memoryMax: this.maxCacheSize,
      memoryPercent: ((this.currentSize / this.maxCacheSize) * 100).toFixed(1),
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate:
        this.stats.hits + this.stats.misses > 0
          ? (
              (this.stats.hits / (this.stats.hits + this.stats.misses)) *
              100
            ).toFixed(1)
          : 0,
      evictions: this.stats.evictions,
      loads: this.stats.loads,
      errors: this.stats.errors,
    };
  }

  /**
   * Log cache statistics
   */
  logStats() {
    const stats = this.getStats();
    console.log("📊 TextureCache Stats:", {
      cached: stats.cachedTextures,
      memory: `${this.formatBytes(stats.memoryUsed)} / ${this.formatBytes(
        stats.memoryMax
      )} (${stats.memoryPercent}%)`,
      hitRate: `${stats.hitRate}%`,
      hits: stats.hits,
      misses: stats.misses,
      evictions: stats.evictions,
      errors: stats.errors,
    });
  }

  /**
   * Format bytes for display
   * @param {number} bytes
   * @returns {string}
   */
  formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  /**
   * Clear entire cache (use with caution!)
   */
  clear() {
    for (const url of this.cache.keys()) {
      this.dispose(url);
    }
    this.cache.clear();
    this.currentSize = 0;
  }
}

// Singleton instance
let instance = null;

export function getTextureCache() {
  if (!instance) {
    instance = new TextureCache();

    // Make available for debugging
    if (typeof window !== "undefined") {
      window.textureCache = instance;
    }
  }
  return instance;
}

export function resetTextureCache() {
  if (instance) {
    instance.clear();
  }
  instance = null;
}
