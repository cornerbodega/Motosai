import * as THREE from "three";
import { getTextureCache } from "../services/TextureCache.js";

// Billboard loading states
export const BILLBOARD_STATE = {
  UNLOADED: "unloaded", // Far away, no resources loaded
  LOADING: "loading", // Loading texture
  LOADED: "loaded", // Texture loaded, visible
  CULLED: "culled", // Behind player, hidden but cached
  ERROR: "error", // Failed to load
};

/**
 * Individual billboard with memory-efficient texture loading
 */
export class Billboard {
  constructor(config) {
    this.id = config.id;
    this.name = config.name || `Billboard_${this.id}`;

    // Billboard type: 'large-dual', 'large-single', 'small'
    this.type = config.type || "large-dual";

    // Position and transform
    this.position = new THREE.Vector3(
      config.position_x || 0,
      config.position_y || 5,
      config.position_z || 0
    );
    this.rotationX = config.rotation_x || 0;
    this.rotationY = config.rotation_y || 0;
    this.scale = new THREE.Vector2(config.scale_x || 10, config.scale_y || 5);

    // Texture URL (can be updated dynamically)
    this.textureUrl = config.texture_url || null;
    this.fallbackUrl = "/textures/billboards/default.png";

    // State management
    this.state = BILLBOARD_STATE.UNLOADED;
    this.loadAttempts = 0;
    this.maxLoadAttempts = 3;

    // Three.js objects (disposables)
    this.mesh = null;
    this.geometry = null; // Shared geometry reference (don't dispose)
    this.isSharedGeometry = false; // Track if using shared geometry
    this.material = null;
    this.texture = null;
    this.lightLeft = null; // Left ground light
    this.lightRight = null; // Right ground light
    this.postLeft = null; // Left support post
    this.postRight = null; // Right support post
    this.isSharedPostResources = false; // Track if using shared post geometry/material

    // Memory tracking
    this.textureCache = getTextureCache();
    this.stoppaId = null;

    // Register with Stoppa memory manager
    if (typeof window !== "undefined" && window.stoppa) {
      this.stoppaId = window.stoppa.register("Billboard", this);
    }
  }

  /**
   * Load billboard resources (geometry, material, texture)
   * @param {THREE.Scene} scene - Scene to add mesh to
   * @param {Object} sharedGeometries - Optional shared geometries object {large, small}
   * @param {THREE.CylinderGeometry} sharedPostGeometry - Optional shared post geometry
   * @param {THREE.Material} sharedPostMaterial - Optional shared post material
   * @param {string} timeOfDay - Current time of day for initial light state
   * @returns {Promise<void>}
   */
  async load(
    scene,
    sharedGeometries = null,
    sharedPostGeometry = null,
    sharedPostMaterial = null,
    timeOfDay = "day"
  ) {
    if (
      this.state === BILLBOARD_STATE.LOADED ||
      this.state === BILLBOARD_STATE.LOADING
    ) {
      return;
    }

    this.state = BILLBOARD_STATE.LOADING;

    try {
      // Load texture from cache
      const url = this.textureUrl || this.fallbackUrl;
      this.texture = await this.textureCache.acquire(url);

      // Use shared geometry if provided, otherwise create new
      if (sharedGeometries) {
        // Determine geometry size based on type
        const isLarge =
          this.type === "large-dual" || this.type === "large-single";
        this.geometry = isLarge
          ? sharedGeometries.large
          : sharedGeometries.small;
        this.isSharedGeometry = true;
      } else {
        // Fallback: create individual geometry with minimal segments
        this.geometry = new THREE.PlaneGeometry(
          this.scale.x,
          this.scale.y,
          1,
          1
        );
        this.isSharedGeometry = false;
      }

      // Create material with texture
      this.material = new THREE.MeshStandardMaterial({
        map: this.texture,
        color: 0xffffff, // White base color (multiplied with texture)
        side: THREE.DoubleSide,
        transparent: false,
        metalness: 0.1,
        roughness: 0.8,
        depthWrite: true,
        depthTest: true,
      });

      // Ensure texture updates when loaded
      if (this.texture) {
        this.texture.needsUpdate = true;
      }

      // Create mesh
      this.mesh = new THREE.Mesh(this.geometry, this.material);
      this.mesh.position.copy(this.position);
      this.mesh.rotation.x = this.rotationX;
      this.mesh.rotation.y = this.rotationY;
      this.mesh.name = this.name;

      // Add lights and support posts based on billboard type
      const postHeight = this.scale.y / 2; // From bottom of billboard to ground

      // Use shared post resources if available, otherwise create new
      const useSharedPosts = sharedPostGeometry && sharedPostMaterial;
      const postGeometry = useSharedPosts
        ? sharedPostGeometry
        : new THREE.CylinderGeometry(0.3, 0.3, postHeight, 6); // Minimal 6 segments
      const postMaterial = useSharedPosts
        ? sharedPostMaterial
        : new THREE.MeshStandardMaterial({
            color: 0x444444,
            metalness: 0.6,
            roughness: 0.4,
          });

      if (this.type === "large-dual") {
        // Two spotlights (left and right)
        const lightIntensity = 40;
        const lightDistance = 15;
        const lightAngle = Math.PI / 3;
        const lightPenumbra = 0.5;

        this.lightLeft = new THREE.SpotLight(
          0xffffff,
          lightIntensity,
          lightDistance,
          lightAngle,
          lightPenumbra
        );
        this.lightLeft.position.set(-this.scale.x / 4, -this.scale.y / 2, 3);
        this.lightLeft.target.position.set(-this.scale.x / 4, 0, 0);
        this.lightLeft.castShadow = false;
        this.mesh.add(this.lightLeft);
        this.mesh.add(this.lightLeft.target);

        this.lightRight = new THREE.SpotLight(
          0xffffff,
          lightIntensity,
          lightDistance,
          lightAngle,
          lightPenumbra
        );
        this.lightRight.position.set(this.scale.x / 4, -this.scale.y / 2, 3);
        this.lightRight.target.position.set(this.scale.x / 4, 0, 0);
        this.lightRight.castShadow = false;
        this.mesh.add(this.lightRight);
        this.mesh.add(this.lightRight.target);

        // Two support posts
        this.postLeft = new THREE.Mesh(postGeometry, postMaterial);
        this.postLeft.position.set(
          -this.scale.x / 4,
          -this.scale.y / 2 - postHeight / 2,
          0
        );
        this.postLeft.scale.y = postHeight / 5; // Scale to correct height (shared geo is 5 units)
        this.mesh.add(this.postLeft);

        this.postRight = new THREE.Mesh(postGeometry, postMaterial);
        this.postRight.position.set(
          this.scale.x / 4,
          -this.scale.y / 2 - postHeight / 2,
          0
        );
        this.postRight.scale.y = postHeight / 5; // Scale to correct height
        this.mesh.add(this.postRight);
      } else if (this.type === "large-single") {
        // Single spotlight (center)
        const lightIntensity = 60;
        const lightDistance = 15;
        const lightAngle = Math.PI / 2.5;
        const lightPenumbra = 0.5;

        this.lightLeft = new THREE.SpotLight(
          0xffffff,
          lightIntensity,
          lightDistance,
          lightAngle,
          lightPenumbra
        );
        this.lightLeft.position.set(0, -this.scale.y / 2, 3);
        this.lightLeft.target.position.set(0, 0, 0);
        this.lightLeft.castShadow = false;
        this.mesh.add(this.lightLeft);
        this.mesh.add(this.lightLeft.target);

        // Single center support post
        this.postLeft = new THREE.Mesh(postGeometry, postMaterial);
        this.postLeft.position.set(0, -this.scale.y / 2 - postHeight / 2, 0);
        this.postLeft.scale.y = postHeight / 5; // Scale to correct height
        this.mesh.add(this.postLeft);
      } else if (this.type === "small") {
        // Small billboards have one post but no lights
        this.postLeft = new THREE.Mesh(postGeometry, postMaterial);
        this.postLeft.position.set(0, -this.scale.y / 2 - postHeight / 2, 0);
        this.postLeft.scale.y = postHeight / 5; // Scale to correct height
        this.mesh.add(this.postLeft);
      }

      // Track if using shared post resources
      this.isSharedPostResources = useSharedPosts;

      // Add to scene
      scene.add(this.mesh);

      // Set initial light state based on time of day
      this.updateLights(timeOfDay);

      this.state = BILLBOARD_STATE.LOADED;
    } catch (error) {
      console.error(`Failed to load billboard ${this.name}:`, error);
      this.state = BILLBOARD_STATE.ERROR;
      this.loadAttempts++;

      // Try fallback texture if primary failed
      if (
        this.loadAttempts < this.maxLoadAttempts &&
        this.textureUrl !== this.fallbackUrl
      ) {
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
      // Remove light and target from parent mesh
      if (this.mesh) {
        this.mesh.remove(this.lightLeft);
        if (this.lightLeft.target) {
          this.mesh.remove(this.lightLeft.target);
        }
      }
      this.lightLeft.dispose();
      this.lightLeft = null;
    }
    if (this.lightRight) {
      // Remove light and target from parent mesh
      if (this.mesh) {
        this.mesh.remove(this.lightRight);
        if (this.lightRight.target) {
          this.mesh.remove(this.lightRight.target);
        }
      }
      this.lightRight.dispose();
      this.lightRight = null;
    }

    // Dispose support posts
    if (this.postLeft) {
      // Remove from parent mesh first
      if (this.mesh) {
        this.mesh.remove(this.postLeft);
      }
      // Only dispose geometry/material if NOT shared
      if (!this.isSharedPostResources) {
        if (this.postLeft.geometry) this.postLeft.geometry.dispose();
        if (this.postLeft.material) this.postLeft.material.dispose();
      }
      this.postLeft = null;
    }
    if (this.postRight) {
      // Remove from parent mesh first
      if (this.mesh) {
        this.mesh.remove(this.postRight);
      }
      // Only dispose geometry/material if NOT shared
      if (!this.isSharedPostResources) {
        if (this.postRight.geometry) this.postRight.geometry.dispose();
        if (this.postRight.material) this.postRight.material.dispose();
      }
      this.postRight = null;
    }
    this.isSharedPostResources = false;

    // Remove mesh from scene
    if (this.mesh && scene) {
      scene.remove(this.mesh);
      this.mesh = null;
    }

    this.state = BILLBOARD_STATE.UNLOADED;
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
   * Update billboard lights based on time of day
   * Lights are ON during dusk and night (dusk to dawn)
   * Lights are OFF during dawn and day
   * @param {string} timeOfDay - Current time of day ('dawn', 'day', 'dusk', 'night')
   */
  updateLights(timeOfDay) {
    // Determine if lights should be on (dusk and night only)
    const lightsOn = timeOfDay === "dusk" || timeOfDay === "night";

    // Update left light if it exists
    if (this.lightLeft) {
      this.lightLeft.visible = lightsOn;
    }

    // Update right light if it exists (for dual billboards)
    if (this.lightRight) {
      this.lightRight.visible = lightsOn;
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
        z: this.position.z.toFixed(1),
      },
      textureUrl: this.textureUrl,
      loaded: this.state === BILLBOARD_STATE.LOADED,
      visible: this.mesh ? this.mesh.visible : false,
    };
  }
}
