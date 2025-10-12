import * as THREE from 'three';
import { getTextureCache } from '../services/TextureCache.js';

// Billboard loading states
export const BILLBOARD_STATE = {
  UNLOADED: 'unloaded',   // Far away, no resources loaded
  LOADING: 'loading',     // Loading texture
  LOADED: 'loaded',       // Texture loaded, visible
  CULLED: 'culled',       // Behind player, hidden but cached
  ERROR: 'error'          // Failed to load
};

/**
 * Individual billboard with memory-efficient texture loading
 */
export class Billboard {
  constructor(config) {
    this.id = config.id;
    this.name = config.name || `Billboard_${this.id}`;

    // Billboard type: 'large-dual', 'large-single', 'small'
    this.type = config.type || 'large-dual';

    // Position and transform
    this.position = new THREE.Vector3(
      config.position_x || 0,
      config.position_y || 5,
      config.position_z || 0
    );
    this.rotationX = config.rotation_x || 0;
    this.rotationY = config.rotation_y || 0;
    this.scale = new THREE.Vector2(
      config.scale_x || 10,
      config.scale_y || 5
    );

    // Texture URL (can be updated dynamically)
    this.textureUrl = config.texture_url || null;
    this.fallbackUrl = '/textures/billboards/default.png';

    // State management
    this.state = BILLBOARD_STATE.UNLOADED;
    this.loadAttempts = 0;
    this.maxLoadAttempts = 3;

    // Three.js objects (disposables)
    this.mesh = null;
    this.geometry = null;         // Shared geometry reference (don't dispose)
    this.isSharedGeometry = false; // Track if using shared geometry
    this.material = null;
    this.texture = null;
    this.lightLeft = null; // Left ground light
    this.lightRight = null; // Right ground light

    // Memory tracking
    this.textureCache = getTextureCache();
    this.stoppaId = null;

    // Register with Stoppa memory manager
    if (typeof window !== 'undefined' && window.stoppa) {
      this.stoppaId = window.stoppa.register('Billboard', this);
    }
  }

  /**
   * Load billboard resources (geometry, material, texture)
   * @param {THREE.Scene} scene - Scene to add mesh to
   * @param {Object} sharedGeometries - Optional shared geometries object {large, small}
   * @returns {Promise<void>}
   */
  async load(scene, sharedGeometries = null) {
    if (this.state === BILLBOARD_STATE.LOADED || this.state === BILLBOARD_STATE.LOADING) {
      return;
    }

    this.state = BILLBOARD_STATE.LOADING;
    console.log(`Loading billboard: ${this.name}`);

    try {
      // TODO: Enable texture loading when default.png is ready
      // const url = this.textureUrl || this.fallbackUrl;
      // this.texture = await this.textureCache.acquire(url);

      // Use shared geometry if provided, otherwise create new
      if (sharedGeometries) {
        // Determine geometry size based on type
        const isLarge = (this.type === 'large-dual' || this.type === 'large-single');
        this.geometry = isLarge ? sharedGeometries.large : sharedGeometries.small;
        this.isSharedGeometry = true;
      } else {
        // Fallback: create individual geometry
        this.geometry = new THREE.PlaneGeometry(this.scale.x, this.scale.y);
        this.isSharedGeometry = false;
      }

      // Create material - solid white for now
      // TODO: Add texture map when textures are ready
      this.material = new THREE.MeshStandardMaterial({
        color: 0xffffff,  // Solid white
        // map: this.texture,  // TODO: Uncomment when textures ready
        side: THREE.DoubleSide,
        transparent: false,
        metalness: 0.1,
        roughness: 0.8
      });

      // Create mesh
      this.mesh = new THREE.Mesh(this.geometry, this.material);
      this.mesh.position.copy(this.position);
      this.mesh.rotation.x = this.rotationX;
      this.mesh.rotation.y = this.rotationY;
      this.mesh.name = this.name;

      // Add lights based on billboard type
      if (this.type === 'large-dual') {
        // Two spotlights (left and right)
        const lightIntensity = 40;
        const lightDistance = 15;
        const lightAngle = Math.PI / 3;
        const lightPenumbra = 0.5;

        this.lightLeft = new THREE.SpotLight(0xffffff, lightIntensity, lightDistance, lightAngle, lightPenumbra);
        this.lightLeft.position.set(-this.scale.x / 4, -this.scale.y / 2, 3);
        this.lightLeft.target.position.set(-this.scale.x / 4, 0, 0);
        this.lightLeft.castShadow = false;
        this.mesh.add(this.lightLeft);
        this.mesh.add(this.lightLeft.target);

        this.lightRight = new THREE.SpotLight(0xffffff, lightIntensity, lightDistance, lightAngle, lightPenumbra);
        this.lightRight.position.set(this.scale.x / 4, -this.scale.y / 2, 3);
        this.lightRight.target.position.set(this.scale.x / 4, 0, 0);
        this.lightRight.castShadow = false;
        this.mesh.add(this.lightRight);
        this.mesh.add(this.lightRight.target);
      } else if (this.type === 'large-single') {
        // Single spotlight (center)
        const lightIntensity = 60;
        const lightDistance = 15;
        const lightAngle = Math.PI / 2.5;
        const lightPenumbra = 0.5;

        this.lightLeft = new THREE.SpotLight(0xffffff, lightIntensity, lightDistance, lightAngle, lightPenumbra);
        this.lightLeft.position.set(0, -this.scale.y / 2, 3);
        this.lightLeft.target.position.set(0, 0, 0);
        this.lightLeft.castShadow = false;
        this.mesh.add(this.lightLeft);
        this.mesh.add(this.lightLeft.target);
      }
      // type === 'small' has no lights

      // Add to scene
      scene.add(this.mesh);

      this.state = BILLBOARD_STATE.LOADED;
      console.log(`Billboard loaded: ${this.name} at ${this.position.z.toFixed(0)}m`);

    } catch (error) {
      console.error(`Failed to load billboard ${this.name}:`, error);
      this.state = BILLBOARD_STATE.ERROR;
      this.loadAttempts++;

      // Try fallback texture if primary failed
      if (this.loadAttempts < this.maxLoadAttempts && this.textureUrl !== this.fallbackUrl) {
        console.log(`Retrying with fallback texture for ${this.name}`);
        this.textureUrl = this.fallbackUrl;
        this.state = BILLBOARD_STATE.UNLOADED;
      }
    }
  }

  /**
   * Unload billboard resources to free memory
   * @param {THREE.Scene} scene - Scene to remove mesh from
   */
  unload(scene) {
    if (this.state === BILLBOARD_STATE.UNLOADED) {
      return;
    }

    console.log(`Unloading billboard: ${this.name}`);

    // Release texture from cache
    if (this.textureUrl || this.fallbackUrl) {
      const url = this.textureUrl || this.fallbackUrl;
      this.textureCache.release(url);
      this.texture = null;
    }

    // Dispose material
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }

    // Dispose geometry only if NOT shared
    if (this.geometry) {
      if (!this.isSharedGeometry) {
        this.geometry.dispose();
      }
      this.geometry = null;
      this.isSharedGeometry = false;
    }

    // Dispose lights
    if (this.lightLeft) {
      this.lightLeft.dispose();
      this.lightLeft = null;
    }
    if (this.lightRight) {
      this.lightRight.dispose();
      this.lightRight = null;
    }

    // Remove mesh from scene
    if (this.mesh && scene) {
      scene.remove(this.mesh);
      this.mesh = null;
    }

    this.state = BILLBOARD_STATE.UNLOADED;
    console.log(`Billboard unloaded: ${this.name}`);
  }

  /**
   * Hide billboard (keep in memory but not visible)
   */
  hide() {
    if (this.mesh) {
      this.mesh.visible = false;
      this.state = BILLBOARD_STATE.CULLED;
    }
  }

  /**
   * Show billboard
   */
  show() {
    if (this.mesh) {
      this.mesh.visible = true;
      if (this.state === BILLBOARD_STATE.CULLED) {
        this.state = BILLBOARD_STATE.LOADED;
      }
    }
  }

  /**
   * Update billboard texture (for dynamic ads)
   * @param {string} newTextureUrl - New texture URL
   * @param {THREE.Scene} scene - Scene reference
   */
  async updateTexture(newTextureUrl, scene) {
    if (newTextureUrl === this.textureUrl) {
      return; // Same texture, no update needed
    }

    console.log(`Updating billboard texture: ${this.name} -> ${newTextureUrl}`);

    // Store old URL for cleanup
    const oldUrl = this.textureUrl;

    // Unload current resources
    this.unload(scene);

    // Set new texture URL
    this.textureUrl = newTextureUrl;

    // Reload with new texture
    await this.load(scene);

    // Release old texture from cache
    if (oldUrl) {
      this.textureCache.release(oldUrl);
    }
  }

  /**
   * Get distance from a point (usually player position)
   * @param {THREE.Vector3} point
   * @returns {number} Distance in units
   */
  getDistanceFrom(point) {
    return this.position.distanceTo(point);
  }

  /**
   * Check if billboard is in front of a point (not behind player)
   * @param {THREE.Vector3} point
   * @returns {boolean}
   */
  isInFrontOf(point) {
    // In Motosai, Z+ is forward, so billboard is in front if billboard.z > point.z
    return this.position.z > point.z;
  }

  /**
   * Dispose all resources (final cleanup)
   * @param {THREE.Scene} scene - Scene reference
   */
  dispose(scene) {
    console.log(`Disposing billboard: ${this.name}`);

    // Unload resources
    this.unload(scene);

    // Unregister from Stoppa
    if (this.stoppaId && window.stoppa) {
      window.stoppa.unregister(this.stoppaId);
      this.stoppaId = null;
    }
  }

  /**
   * Get billboard info for debugging
   * @returns {Object}
   */
  getInfo() {
    return {
      id: this.id,
      name: this.name,
      state: this.state,
      position: {
        x: this.position.x.toFixed(1),
        y: this.position.y.toFixed(1),
        z: this.position.z.toFixed(1)
      },
      textureUrl: this.textureUrl,
      loaded: this.state === BILLBOARD_STATE.LOADED,
      visible: this.mesh ? this.mesh.visible : false
    };
  }
}
