import * as THREE from 'three';

/**
 * ResourcePool - Manages Three.js resources with reference counting
 * Prevents memory leaks by tracking resource usage and disposing when no longer needed
 */
export class ResourcePool {
  constructor() {
    // Separate pools for different resource types
    this.geometries = new Map();
    this.materials = new Map();
    this.textures = new Map();

    // Reference counting for shared resources
    this.refCounts = new Map();

    // Track resource metadata
    this.metadata = new Map();

    // Statistics tracking
    this.stats = {
      geometriesCreated: 0,
      geometriesDisposed: 0,
      materialsCreated: 0,
      materialsDisposed: 0,
      texturesCreated: 0,
      texturesDisposed: 0
    };
  }

  /**
   * Get or create a geometry
   * @param {string} key - Unique identifier for the geometry
   * @param {Function} factory - Factory function to create the geometry if it doesn't exist
   * @returns {THREE.BufferGeometry} The geometry instance
   */
  getGeometry(key, factory) {
    if (!this.geometries.has(key)) {
      const geometry = factory();
      this.geometries.set(key, geometry);
      this.refCounts.set(geometry, 0);
      this.metadata.set(geometry, {
        key,
        type: 'geometry',
        createdAt: Date.now(),
        memoryUsage: this.estimateGeometryMemory(geometry)
      });
      this.stats.geometriesCreated++;
    }

    const geometry = this.geometries.get(key);
    this.incrementRef(geometry);
    return geometry;
  }

  /**
   * Get or create a material
   * @param {string} key - Unique identifier for the material
   * @param {Function} factory - Factory function to create the material if it doesn't exist
   * @returns {THREE.Material} The material instance
   */
  getMaterial(key, factory) {
    if (!this.materials.has(key)) {
      const material = factory();
      this.materials.set(key, material);
      this.refCounts.set(material, 0);
      this.metadata.set(material, {
        key,
        type: 'material',
        createdAt: Date.now(),
        memoryUsage: this.estimateMaterialMemory(material)
      });
      this.stats.materialsCreated++;
    }

    const material = this.materials.get(key);
    this.incrementRef(material);
    return material;
  }

  /**
   * Get or create a texture
   * @param {string} key - Unique identifier for the texture
   * @param {Function} factory - Factory function to create/load the texture
   * @returns {THREE.Texture} The texture instance
   */
  getTexture(key, factory) {
    if (!this.textures.has(key)) {
      const texture = factory();
      this.textures.set(key, texture);
      this.refCounts.set(texture, 0);
      this.metadata.set(texture, {
        key,
        type: 'texture',
        createdAt: Date.now(),
        memoryUsage: this.estimateTextureMemory(texture)
      });
      this.stats.texturesCreated++;
    }

    const texture = this.textures.get(key);
    this.incrementRef(texture);
    return texture;
  }

  /**
   * Increment reference count for a resource
   * @param {Object} resource - The resource to increment
   */
  incrementRef(resource) {
    const count = this.refCounts.get(resource) || 0;
    this.refCounts.set(resource, count + 1);
  }

  /**
   * Release a resource (decrement reference count)
   * @param {Object} resource - The resource to release
   * @param {boolean} forceDispose - Force disposal regardless of ref count
   */
  release(resource, forceDispose = false) {
    if (!this.refCounts.has(resource)) {
      console.warn('ResourcePool: Attempting to release untracked resource');
      return;
    }

    const count = this.refCounts.get(resource) - 1;

    if (count <= 0 || forceDispose) {
      // Dispose the resource
      this.disposeResource(resource);
    } else {
      this.refCounts.set(resource, count);
    }
  }

  /**
   * Release multiple resources at once
   * @param {Array} resources - Array of resources to release
   */
  releaseMultiple(resources) {
    for (const resource of resources) {
      this.release(resource);
    }
  }

  /**
   * Dispose a resource and remove from pools
   * @param {Object} resource - The resource to dispose
   */
  disposeResource(resource) {
    const meta = this.metadata.get(resource);
    if (!meta) return;

    // Call Three.js dispose method
    if (typeof resource.dispose === 'function') {
      resource.dispose();
    }

    // Remove from appropriate pool
    switch (meta.type) {
      case 'geometry':
        this.geometries.delete(meta.key);
        this.stats.geometriesDisposed++;
        break;
      case 'material':
        this.materials.delete(meta.key);
        this.stats.materialsDisposed++;
        break;
      case 'texture':
        this.textures.delete(meta.key);
        this.stats.texturesDisposed++;
        break;
    }

    // Clean up tracking
    this.refCounts.delete(resource);
    this.metadata.delete(resource);
  }

  /**
   * Force dispose all resources with zero references
   */
  cleanupUnused() {
    let cleaned = 0;

    for (const [resource, count] of this.refCounts.entries()) {
      if (count === 0) {
        this.disposeResource(resource);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get a shared material by type with caching
   * @param {string} type - Material type (e.g., 'car', 'road', 'tree')
   * @param {Object} config - Material configuration
   * @returns {THREE.Material} The material instance
   */
  getSharedMaterial(type, config = {}) {
    const key = `${type}_${JSON.stringify(config)}`;

    return this.getMaterial(key, () => {
      switch (type) {
        case 'car':
          return new THREE.MeshStandardMaterial({
            color: config.color || 0xcccccc,
            metalness: config.metalness || 0.3,
            roughness: config.roughness || 0.4,
            envMapIntensity: config.envMapIntensity || 0.5
          });

        case 'road':
          return new THREE.MeshStandardMaterial({
            color: config.color || 0x333333,
            roughness: config.roughness || 0.9,
            metalness: config.metalness || 0.1
          });

        case 'tree':
          return new THREE.MeshLambertMaterial({
            color: config.color || 0x0d5f07
          });

        default:
          return new THREE.MeshStandardMaterial(config);
      }
    });
  }

  /**
   * Get a shared geometry by type with caching
   * @param {string} type - Geometry type (e.g., 'box', 'sphere', 'cylinder')
   * @param {Object} params - Geometry parameters
   * @returns {THREE.BufferGeometry} The geometry instance
   */
  getSharedGeometry(type, params = {}) {
    const key = `${type}_${JSON.stringify(params)}`;

    return this.getGeometry(key, () => {
      switch (type) {
        case 'box':
          return new THREE.BoxGeometry(
            params.width || 1,
            params.height || 1,
            params.depth || 1
          );

        case 'sphere':
          return new THREE.SphereGeometry(
            params.radius || 1,
            params.widthSegments || 32,
            params.heightSegments || 16
          );

        case 'cylinder':
          return new THREE.CylinderGeometry(
            params.radiusTop || 1,
            params.radiusBottom || 1,
            params.height || 1,
            params.radialSegments || 32
          );

        case 'plane':
          return new THREE.PlaneGeometry(
            params.width || 1,
            params.height || 1,
            params.widthSegments || 1,
            params.heightSegments || 1
          );

        default:
          return new THREE.BufferGeometry();
      }
    });
  }

  /**
   * Estimate memory usage of a geometry
   * @param {THREE.BufferGeometry} geometry - The geometry to estimate
   * @returns {number} Estimated memory in bytes
   */
  estimateGeometryMemory(geometry) {
    let bytes = 0;

    if (geometry.attributes) {
      for (const attribute of Object.values(geometry.attributes)) {
        if (attribute.array) {
          bytes += attribute.array.byteLength;
        }
      }
    }

    if (geometry.index && geometry.index.array) {
      bytes += geometry.index.array.byteLength;
    }

    return bytes;
  }

  /**
   * Estimate memory usage of a material
   * @param {THREE.Material} material - The material to estimate
   * @returns {number} Estimated memory in bytes
   */
  estimateMaterialMemory(material) {
    // Basic estimate - materials don't use much memory
    // Main memory usage is in textures
    return 1024; // 1KB base estimate
  }

  /**
   * Estimate memory usage of a texture
   * @param {THREE.Texture} texture - The texture to estimate
   * @returns {number} Estimated memory in bytes
   */
  estimateTextureMemory(texture) {
    if (!texture.image) return 0;

    const width = texture.image.width || 0;
    const height = texture.image.height || 0;

    // Assume 4 bytes per pixel (RGBA)
    return width * height * 4;
  }

  /**
   * Get total memory usage estimate
   * @returns {number} Total estimated memory in bytes
   */
  getTotalMemory() {
    let total = 0;

    for (const meta of this.metadata.values()) {
      total += meta.memoryUsage || 0;
    }

    return total;
  }

  /**
   * Get pool statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      currentGeometries: this.geometries.size,
      currentMaterials: this.materials.size,
      currentTextures: this.textures.size,
      totalResources: this.refCounts.size,
      totalMemoryMB: (this.getTotalMemory() / 1024 / 1024).toFixed(2),
      resourcesWithZeroRefs: Array.from(this.refCounts.values()).filter(c => c === 0).length
    };
  }

  /**
   * Dispose all resources and clear pools
   */
  dispose() {
    // Dispose all geometries
    for (const geometry of this.geometries.values()) {
      if (geometry.dispose) geometry.dispose();
    }

    // Dispose all materials
    for (const material of this.materials.values()) {
      if (material.dispose) material.dispose();
    }

    // Dispose all textures
    for (const texture of this.textures.values()) {
      if (texture.dispose) texture.dispose();
    }

    // Clear all maps
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
    this.refCounts.clear();
    this.metadata.clear();
  }
}

// Singleton instance for global resource management
let globalInstance = null;

/**
 * Get or create the global ResourcePool instance
 * @returns {ResourcePool} The global instance
 */
export function getGlobalResourcePool() {
  if (!globalInstance) {
    globalInstance = new ResourcePool();
  }
  return globalInstance;
}