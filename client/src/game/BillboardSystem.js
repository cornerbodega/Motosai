import * as THREE from "three";
import { Billboard, BILLBOARD_STATE } from "./Billboard.js";
import { getTextureCache } from "../services/TextureCache.js";

/**
 * BillboardSystem - Manages all billboards with aggressive distance-based culling
 * Memory-efficient loading/unloading based on player distance
 */
export class BillboardSystem {
  constructor(scene) {
    this.scene = scene;
    this.billboards = [];
    this.textureCache = getTextureCache();

    // Conservative distance thresholds (in meters)
    this.loadDistance = 400; // Load billboards within 400m
    this.unloadDistance = 600; // Unload billboards beyond 600m
    this.cullDistance = -50; // Hide billboards 50m behind player

    // Performance settings
    this.maxLoadedBillboards = 5; // Max 5 billboards loaded at once (reduced for memory)
    this.updateInterval = 0.5; // Check distances every 0.5 seconds
    this.timeSinceUpdate = 0;

    // Shared geometries (memory optimization - reuse across all billboards)
    // Use minimal segments for low-poly optimization (1x1 segments for flat planes)
    this.sharedGeometries = {
      large: new THREE.PlaneGeometry(20, 10, 1, 1),
      small: new THREE.PlaneGeometry(12, 6, 1, 1),
    };

    // Shared post geometry and material (all posts use same size)
    // Use minimal segments for low-poly optimization
    this.sharedPostGeometry = new THREE.CylinderGeometry(0.3, 0.3, 5, 6); // Only 6 segments
    this.sharedPostMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444, // Dark gray metal
      metalness: 0.6,
      roughness: 0.4,
    });

    // Stats tracking
    this.stats = {
      total: 0,
      loaded: 0,
      unloaded: 0,
      culled: 0,
      visible: 0,
    };

    // Register with Stoppa
    if (typeof window !== "undefined" && window.stoppa) {
      this.stoppaId = window.stoppa.register("BillboardSystem", this);
    }
  }

  /**
   * Add a billboard to the system
   * @param {Object} config - Billboard configuration
   * @returns {Billboard}
   */
  addBillboard(config) {
    const billboard = new Billboard(config);
    this.billboards.push(billboard);
    this.stats.total++;
    return billboard;
  }

  /**
   * Load billboards from configuration array
   * @param {Array} billboardConfigs - Array of billboard configurations
   */
  loadBillboards(billboardConfigs) {
    for (const config of billboardConfigs) {
      this.addBillboard(config);
    }

    // Sort by Z position for efficient culling
    this.billboards.sort((a, b) => a.position.z - b.position.z);
  }

  /**
   * Update billboard loading/unloading based on player position
   * @param {number} deltaTime - Time since last frame
   * @param {THREE.Vector3} playerPosition - Current player position
   * @param {string} timeOfDay - Current time of day ('dawn', 'day', 'dusk', 'night')
   */
  update(deltaTime, playerPosition, timeOfDay = "day") {
    // Throttle distance checks for performance
    this.timeSinceUpdate += deltaTime;
    if (this.timeSinceUpdate < this.updateInterval) {
      return;
    }
    this.timeSinceUpdate = 0;

    // Reset stats
    this.stats.loaded = 0;
    this.stats.unloaded = 0;
    this.stats.culled = 0;
    this.stats.visible = 0;

    // Track billboards to load (sorted by distance)
    const billboardsToLoad = [];

    for (const billboard of this.billboards) {
      const distance = billboard.getDistanceFrom(playerPosition);
      const isInFront = billboard.isInFrontOf(playerPosition);

      // Count current state
      switch (billboard.state) {
        case BILLBOARD_STATE.LOADED:
          this.stats.loaded++;
          if (billboard.mesh && billboard.mesh.visible) {
            this.stats.visible++;
          }
          break;
        case BILLBOARD_STATE.UNLOADED:
          this.stats.unloaded++;
          break;
        case BILLBOARD_STATE.CULLED:
          this.stats.culled++;
          break;
      }

      // Unload billboards that are too far or behind player
      if (billboard.state === BILLBOARD_STATE.LOADED) {
        if (distance > this.unloadDistance || !isInFront) {
          billboard.unload(this.scene);
          continue;
        }

        // Cull (hide) billboards behind player but keep loaded for a bit
        if (
          !isInFront ||
          playerPosition.z - billboard.position.z > Math.abs(this.cullDistance)
        ) {
          billboard.hide();
          continue;
        }

        // Show visible billboards and update lights based on time of day
        billboard.show();
        billboard.updateLights(timeOfDay);
      }

      // Queue billboards for loading if within range and in front
      if (
        billboard.state === BILLBOARD_STATE.UNLOADED &&
        isInFront &&
        distance <= this.loadDistance
      ) {
        billboardsToLoad.push({ billboard, distance });
      }
    }

    // Load closest billboards up to max limit
    if (billboardsToLoad.length > 0) {
      // Sort by distance (closest first)
      billboardsToLoad.sort((a, b) => a.distance - b.distance);

      // Load up to max limit
      const slotsAvailable = this.maxLoadedBillboards - this.stats.loaded;
      const toLoad = billboardsToLoad.slice(0, slotsAvailable);

      for (const { billboard } of toLoad) {
        billboard
          .load(
            this.scene,
            this.sharedGeometries,
            this.sharedPostGeometry,
            this.sharedPostMaterial,
            timeOfDay
          )
          .catch((error) => {
            console.error(`Failed to load billboard ${billboard.name}:`, error);
          });
      }
    }
  }

  /**
   * Get billboard at specific position (for testing/debugging)
   * @param {number} zPosition - Z position to find billboard near
   * @param {number} tolerance - How close to position (default 50m)
   * @returns {Billboard|null}
   */
  getBillboardNear(zPosition, tolerance = 50) {
    return (
      this.billboards.find(
        (b) => Math.abs(b.position.z - zPosition) < tolerance
      ) || null
    );
  }

  /**
   * Update a specific billboard's texture
   * @param {string} billboardId - Billboard ID
   * @param {string} newTextureUrl - New texture URL
   */
  async updateBillboardTexture(billboardId, newTextureUrl) {
    const billboard = this.billboards.find((b) => b.id === billboardId);
    if (billboard) {
      await billboard.updateTexture(newTextureUrl, this.scene);
    } else {
      console.warn(`Billboard ${billboardId} not found`);
    }
  }

  /**
   * Get system statistics
   * @returns {Object}
   */
  getStats() {
    const textureStats = this.textureCache.getStats();

    return {
      billboards: {
        total: this.stats.total,
        loaded: this.stats.loaded,
        unloaded: this.stats.unloaded,
        culled: this.stats.culled,
        visible: this.stats.visible,
      },
      textures: {
        cached: textureStats.cachedTextures,
        memoryUsed: textureStats.memoryUsed,
        memoryMax: textureStats.memoryMax,
        memoryPercent: textureStats.memoryPercent,
        hitRate: textureStats.hitRate,
      },
      limits: {
        loadDistance: this.loadDistance,
        unloadDistance: this.unloadDistance,
        maxLoaded: this.maxLoadedBillboards,
      },
    };
  }

  /**
   * Log statistics to console
   */
  logStats() {
    const stats = this.getStats();
    console.log("🪧 Billboard System Stats:", {
      billboards: `${stats.billboards.visible} visible / ${stats.billboards.loaded} loaded / ${stats.billboards.total} total`,
      textures: `${stats.textures.cached} cached, ${stats.textures.memoryPercent}% memory used`,
      hitRate: `${stats.textures.hitRate}% cache hit rate`,
    });
  }

  /**
   * Get all loaded billboards info (for debugging)
   * @returns {Array}
   */
  getLoadedBillboardsInfo() {
    return this.billboards
      .filter((b) => b.state === BILLBOARD_STATE.LOADED)
      .map((b) => b.getInfo());
  }

  /**
   * Dispose all billboards and cleanup
   */
  dispose() {
    // Dispose all billboards
    for (const billboard of this.billboards) {
      billboard.dispose(this.scene);
    }

    this.billboards = [];

    // Dispose shared geometries
    if (this.sharedGeometries) {
      if (this.sharedGeometries.large) {
        this.sharedGeometries.large.dispose();
      }
      if (this.sharedGeometries.small) {
        this.sharedGeometries.small.dispose();
      }
      this.sharedGeometries = null;
    }

    // Dispose shared post resources
    if (this.sharedPostGeometry) {
      this.sharedPostGeometry.dispose();
      this.sharedPostGeometry = null;
    }
    if (this.sharedPostMaterial) {
      this.sharedPostMaterial.dispose();
      this.sharedPostMaterial = null;
    }

    // Unregister from Stoppa
    if (this.stoppaId && window.stoppa) {
      window.stoppa.unregister(this.stoppaId);
      this.stoppaId = null;
    }
  }

  /**
   * Create default test billboards (for development)
   * @param {number} count - Number of billboards to create
   * @param {number} spacing - Spacing between billboards (meters)
   */
  createTestBillboards(count = 8, spacing = 600) {
    const sides = ["left", "right"];
    const types = ["large-dual", "large-single", "small"]; // Billboard types

    for (let i = 0; i < count; i++) {
      const side = sides[i % 2];
      const type = types[i % 3]; // Cycle through types

      // Different sizes based on type
      let scaleX, scaleY, posY, xPos;

      if (type === "large-dual" || type === "large-single") {
        scaleX = 20;
        scaleY = 10;
        posY = 10;
        xPos = side === "left" ? -40 : 40;
      } else {
        // small
        scaleX = 12;
        scaleY = 6;
        posY = 7;
        xPos = side === "left" ? -35 : 35; // Closer to road
      }

      this.addBillboard({
        id: `test_billboard_${i}`,
        name: `Test Billboard ${i} (${type})`,
        type: type,
        position_x: xPos,
        position_y: posY,
        position_z: i * spacing + 100,
        rotation_x: 0,
        rotation_y: Math.PI,
        scale_x: scaleX,
        scale_y: scaleY,
        texture_url: "/textures/billboards/default.png",
        side: side,
      });
    }

    // Sort by Z position
    this.billboards.sort((a, b) => a.position.z - b.position.z);
  }
}
