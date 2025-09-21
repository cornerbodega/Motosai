import * as THREE from 'three';

/**
 * MaterialManager - Centralized material management to prevent memory leaks
 * Handles material pooling, sharing, and proper disposal
 */
export class MaterialManager {
  constructor() {
    // Shared materials cache - these are reused across many objects
    this.sharedMaterials = new Map();

    // Cloned materials tracking - these need disposal
    this.clonedMaterials = new Set();

    // Vehicle material pool
    this.vehicleMaterialPool = new Map();

    // Road material cache
    this.roadMaterials = null;

    // Particle material cache
    this.particleMaterials = null;

    // Statistics for monitoring
    this.stats = {
      shared: 0,
      cloned: 0,
      disposed: 0,
      reused: 0
    };

    this.initializeCommonMaterials();
  }

  /**
   * Initialize commonly used materials
   */
  initializeCommonMaterials() {
    // Road materials
    this.roadMaterials = {
      asphalt: new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.8,
        metalness: 0.1
      }),
      line: new THREE.MeshBasicMaterial({
        color: 0xffff00
      }),
      whiteLine: new THREE.MeshBasicMaterial({
        color: 0xffffff
      }),
      shoulder: new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.9
      })
    };

    // Particle materials
    this.particleMaterials = {
      blood: new THREE.MeshBasicMaterial({
        color: 0x660000,  // Darker red for better visibility
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide  // Visible from both sides
      }),
      smoke: new THREE.MeshBasicMaterial({
        color: 0x333333,
        transparent: true,
        opacity: 0.5
      }),
      spark: new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.9
      }),
      fire: new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.7
      })
    };

    // Common vehicle colors
    const vehicleColors = [
      0xff0000, // Red
      0x0000ff, // Blue
      0x00ff00, // Green
      0xffff00, // Yellow
      0xff00ff, // Magenta
      0x00ffff, // Cyan
      0xffffff, // White
      0x000000, // Black
      0x808080, // Gray
      0xff8800, // Orange
      0x8800ff, // Purple
      0x88ff00  // Lime
    ];

    // Pre-create vehicle materials
    vehicleColors.forEach(color => {
      const key = `vehicle_${color.toString(16)}`;

      // Car body material
      this.vehicleMaterialPool.set(`${key}_body`, new THREE.MeshStandardMaterial({
        color,
        metalness: 0.6,
        roughness: 0.3
      }));

      // Car window material
      this.vehicleMaterialPool.set(`${key}_window`, new THREE.MeshStandardMaterial({
        color: 0x333344,
        metalness: 0.9,
        roughness: 0.1,
        transparent: true,
        opacity: 0.7
      }));

      // Car wheel material
      this.vehicleMaterialPool.set(`${key}_wheel`, new THREE.MeshStandardMaterial({
        color: 0x222222,
        metalness: 0.7,
        roughness: 0.5
      }));
    });

    this.stats.shared = this.sharedMaterials.size +
                       this.vehicleMaterialPool.size +
                       Object.keys(this.roadMaterials).length +
                       Object.keys(this.particleMaterials).length;
  }

  /**
   * Get or create a shared material
   */
  getMaterial(type, options = {}) {
    const key = `${type}_${JSON.stringify(options)}`;

    if (!this.sharedMaterials.has(key)) {
      const material = this.createMaterial(type, options);
      this.sharedMaterials.set(key, material);
      this.stats.shared++;
    } else {
      this.stats.reused++;
    }

    return this.sharedMaterials.get(key);
  }

  /**
   * Create a new material based on type
   */
  createMaterial(type, options) {
    switch (type) {
      case 'standard':
        return new THREE.MeshStandardMaterial(options);
      case 'basic':
        return new THREE.MeshBasicMaterial(options);
      case 'phong':
        return new THREE.MeshPhongMaterial(options);
      case 'lambert':
        return new THREE.MeshLambertMaterial(options);
      case 'physical':
        return new THREE.MeshPhysicalMaterial(options);
      default:
        return new THREE.MeshStandardMaterial(options);
    }
  }

  /**
   * Get a vehicle material from the pool
   */
  getVehicleMaterial(color, part = 'body') {
    const colorHex = typeof color === 'number' ? color : parseInt(color, 16);
    const key = `vehicle_${colorHex.toString(16)}_${part}`;

    if (this.vehicleMaterialPool.has(key)) {
      this.stats.reused++;
      return this.vehicleMaterialPool.get(key);
    }

    // Fallback to closest color
    const keys = Array.from(this.vehicleMaterialPool.keys());
    const fallbackKey = keys.find(k => k.includes(part)) || keys[0];
    this.stats.reused++;
    return this.vehicleMaterialPool.get(fallbackKey);
  }

  /**
   * Get road materials
   */
  getRoadMaterial(type = 'asphalt') {
    this.stats.reused++;
    return this.roadMaterials[type] || this.roadMaterials.asphalt;
  }

  /**
   * Get particle materials
   */
  getParticleMaterial(type = 'smoke') {
    this.stats.reused++;
    return this.particleMaterials[type] || this.particleMaterials.smoke;
  }

  /**
   * Clone a material with tracking for disposal
   */
  cloneMaterial(original) {
    if (!original) return null;

    const clone = original.clone();
    this.clonedMaterials.add(clone);
    this.stats.cloned++;

    return clone;
  }

  /**
   * Dispose a specific material
   */
  disposeMaterial(material) {
    if (!material) return;

    // Check if it's a cloned material
    if (this.clonedMaterials.has(material)) {
      this.disposeTexturesInMaterial(material);
      material.dispose();
      this.clonedMaterials.delete(material);
      this.stats.disposed++;
      return true;
    }

    // Check if it's a shared material (shouldn't dispose these normally)
    for (const [key, mat] of this.sharedMaterials) {
      if (mat === material) {
        console.warn('Attempting to dispose shared material:', key);
        return false;
      }
    }

    // Unknown material, dispose it anyway
    this.disposeTexturesInMaterial(material);
    material.dispose();
    this.stats.disposed++;
    return true;
  }

  /**
   * Dispose all textures in a material
   */
  disposeTexturesInMaterial(material) {
    const textureProperties = [
      'map', 'normalMap', 'roughnessMap', 'metalnessMap',
      'aoMap', 'emissiveMap', 'bumpMap', 'displacementMap',
      'alphaMap', 'envMap', 'lightMap', 'specularMap'
    ];

    textureProperties.forEach(prop => {
      if (material[prop] && material[prop].dispose) {
        material[prop].dispose();
      }
    });
  }

  /**
   * Dispose materials from an object/mesh
   */
  disposeMeshMaterials(mesh) {
    if (!mesh) return;

    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(mat => this.disposeMaterial(mat));
      } else {
        this.disposeMaterial(mesh.material);
      }
    }

    // Recursively dispose children materials
    if (mesh.children) {
      mesh.children.forEach(child => this.disposeMeshMaterials(child));
    }
  }

  /**
   * Clean up all cloned materials
   */
  disposeClonedMaterials() {
    this.clonedMaterials.forEach(material => {
      this.disposeTexturesInMaterial(material);
      material.dispose();
      this.stats.disposed++;
    });
    this.clonedMaterials.clear();
  }

  /**
   * Complete disposal of all materials
   */
  dispose() {
    // Dispose cloned materials
    this.disposeClonedMaterials();

    // Dispose shared materials
    this.sharedMaterials.forEach(material => {
      this.disposeTexturesInMaterial(material);
      material.dispose();
    });
    this.sharedMaterials.clear();

    // Dispose vehicle materials
    this.vehicleMaterialPool.forEach(material => {
      this.disposeTexturesInMaterial(material);
      material.dispose();
    });
    this.vehicleMaterialPool.clear();

    // Dispose road materials
    if (this.roadMaterials) {
      Object.values(this.roadMaterials).forEach(material => {
        this.disposeTexturesInMaterial(material);
        material.dispose();
      });
      this.roadMaterials = null;
    }

    // Dispose particle materials
    if (this.particleMaterials) {
      Object.values(this.particleMaterials).forEach(material => {
        this.disposeTexturesInMaterial(material);
        material.dispose();
      });
      this.particleMaterials = null;
    }

    console.log('MaterialManager disposed. Stats:', this.stats);
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentShared: this.sharedMaterials.size,
      currentCloned: this.clonedMaterials.size,
      vehiclePoolSize: this.vehicleMaterialPool.size,
      totalActive: this.sharedMaterials.size + this.clonedMaterials.size + this.vehicleMaterialPool.size
    };
  }

  /**
   * Log current material usage
   */
  logStats() {
    const stats = this.getStats();
    console.log('%c📊 Material Manager Stats', 'color: #00ff00; font-weight: bold');
    console.log(`Shared Materials: ${stats.currentShared}`);
    console.log(`Cloned Materials: ${stats.currentCloned}`);
    console.log(`Vehicle Pool: ${stats.vehiclePoolSize}`);
    console.log(`Total Active: ${stats.totalActive}`);
    console.log(`Times Reused: ${stats.reused}`);
    console.log(`Total Disposed: ${stats.disposed}`);
  }
}

// Singleton instance
let materialManagerInstance = null;

export function getMaterialManager() {
  if (!materialManagerInstance) {
    materialManagerInstance = new MaterialManager();
  }
  return materialManagerInstance;
}

export function resetMaterialManager() {
  if (materialManagerInstance) {
    materialManagerInstance.dispose();
    materialManagerInstance = null;
  }
}