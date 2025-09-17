import * as THREE from 'three';
import { UnsplashService } from '../../client/src/game/backgrounds/UnsplashService.js';
import { ImageCacheManager } from '../../client/src/game/backgrounds/ImageCacheManager.js';
import { getGlobalResourcePool } from '../core/ResourcePool.js';
import { disposeTexture, disposeObject3D } from '../utils/DisposalUtils.js';

/**
 * Refactored BackgroundSystem with proper memory management
 * Key improvements:
 * - Animation frame IDs properly tracked and cancelled
 * - Resource pooling for geometries and materials
 * - Proper texture disposal with tracking
 * - No memory leaks from uncancelled animations
 */
export class BackgroundSystemRefactored {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.photoService = new UnsplashService();
    this.cacheManager = new ImageCacheManager();
    this.resourcePool = getGlobalResourcePool();

    // Current background elements
    this.horizonPlane = null;
    this.transitionSphere = null;
    this.currentSegment = -1;
    this.lastBackgroundChange = 0;

    // Animation frame tracking - CRITICAL for cleanup
    this.animationFrameIds = new Set();
    this.isDisposed = false;

    // Texture tracking for disposal
    this.activeTextures = new Set();

    // Background cache with proper cleanup
    this.backgroundCache = new Map();
    this.maxCacheSize = 10;
    this.cacheCleanupCounter = 0;

    // Initialize
    this.init();
  }

  init() {
    // Clean up old cached images (older than 30 days)
    this.cacheManager.clearOldCache();

    // Create sky dome using pooled resources
    this.createSkyDome();

    // Create transition sphere for smooth transitions
    this.createTransitionSphere();
  }

  createSkyDome() {
    // Get pooled geometry
    const geometry = this.resourcePool.getSharedGeometry('sphere', {
      radius: 2000,
      widthSegments: 64,
      heightSegments: 32
    });

    // Get pooled material
    const material = this.resourcePool.getSharedMaterial('skyDome', {
      color: 0x87CEEB,
      fog: false,
      side: THREE.BackSide,
      depthWrite: false,
      transparent: false
    });

    // Remove old sky if exists
    const oldSky = this.scene.getObjectByName('sky');
    if (oldSky) {
      this.disposeObject(oldSky);
    }

    // Create new sky mesh
    this.horizonPlane = new THREE.Mesh(geometry, material);
    this.horizonPlane.name = 'sky';
    this.horizonPlane.renderOrder = -1000;
    this.horizonPlane.frustumCulled = false;
    this.scene.add(this.horizonPlane);

    // Keep reference as skyDome for compatibility
    this.skyDome = this.horizonPlane;
  }

  createTransitionSphere() {
    // Get pooled resources
    const geometry = this.resourcePool.getSharedGeometry('sphere', {
      radius: 2000,
      widthSegments: 64,
      heightSegments: 32
    });

    const material = this.resourcePool.getSharedMaterial('transitionSphere', {
      color: 0xffffff,
      fog: false,
      side: THREE.BackSide,
      depthWrite: false,
      transparent: true,
      opacity: 0
    });

    this.transitionSphere = new THREE.Mesh(geometry, material);
    this.transitionSphere.name = 'transitionSky';
    this.transitionSphere.renderOrder = -999;
    this.transitionSphere.frustumCulled = false;
    this.transitionSphere.visible = false;
    // Don't add to scene until needed
  }

  async updateLocation(absolutePosition, location) {
    if (this.isDisposed) return;

    // Calculate segment (every 10 miles)
    const segmentId = Math.max(0, Math.floor(absolutePosition / 16093.4));

    if (segmentId !== this.currentSegment) {
      const milesTravel = (absolutePosition / 1609.34).toFixed(2);
      console.log(`[BG] Segment change at ${milesTravel} miles (segment ${segmentId})`);

      // Rate limiting
      const now = Date.now();
      const timeSinceLastChange = (now - this.lastBackgroundChange) / 1000;

      if (timeSinceLastChange < 30) {
        console.log(`[BG] Skipping - only ${timeSinceLastChange.toFixed(1)}s since last change`);
        return;
      }

      this.currentSegment = segmentId;
      this.lastBackgroundChange = now;

      await this.loadNewBackground(segmentId, location);
    }
  }

  async loadNewBackground(segmentId, location) {
    if (this.isDisposed) return;

    try {
      console.log(`[BG] Loading segment ${segmentId}: ${location.name}`);

      // Clean up old textures before loading new ones
      this.cleanupOldTextures();

      // Fetch photos from API
      const photos = await this.photoService.fetchPhotosForLocation(
        location.lat,
        location.lng,
        location.name
      );

      if (photos && photos.length > 0) {
        const photoIndex = segmentId % photos.length;
        const photo = photos[photoIndex];

        if (photo.gradient) {
          this.applyGradientBackground(photo.gradient);
        } else if (photo.url) {
          await this.loadPhotoBackground(photo.url);
        }
      } else {
        // Default gradient fallback
        this.applyGradientBackground({
          stops: [
            { color: '#87CEEB', position: 0 },
            { color: '#98D8F8', position: 0.5 },
            { color: '#4682B4', position: 1 }
          ]
        });
      }
    } catch (error) {
      console.error('[BG] Error loading background:', error);
      // Error fallback gradient
      this.applyGradientBackground({
        stops: [
          { color: '#FFB6C1', position: 0 },
          { color: '#FFA07A', position: 0.5 },
          { color: '#FF6347', position: 1 }
        ]
      });
    }
  }

  applyGradientBackground(gradient) {
    if (this.isDisposed) return;

    // Store old texture for disposal
    const oldTexture = this.horizonPlane.material.map;

    // Create gradient texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.stops.forEach(stop => {
      grad.addColorStop(stop.position, stop.color);
    });

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create and apply texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Track new texture
    this.activeTextures.add(texture);

    this.horizonPlane.material.map = texture;
    this.horizonPlane.material.color.set(0xffffff);
    this.horizonPlane.material.needsUpdate = true;

    // Dispose old texture
    if (oldTexture && oldTexture !== texture) {
      this.activeTextures.delete(oldTexture);
      disposeTexture(oldTexture);
    }
  }

  async loadPhotoBackground(url) {
    if (this.isDisposed) return;

    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (texture) => {
          if (this.isDisposed) {
            disposeTexture(texture);
            resolve(null);
            return;
          }

          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;

          // Track new texture
          this.activeTextures.add(texture);

          // Dispose old texture
          if (this.horizonPlane.material.map) {
            this.activeTextures.delete(this.horizonPlane.material.map);
            disposeTexture(this.horizonPlane.material.map);
          }

          this.horizonPlane.material.map = texture;
          this.horizonPlane.material.color.set(0xffffff);
          this.horizonPlane.material.needsUpdate = true;

          resolve(texture);
        },
        undefined,
        (error) => {
          console.error('[BG] Error loading photo:', error);
          reject(error);
        }
      );
    });
  }

  async transitionToNewBackground(photo, duration = 1500) {
    if (this.isDisposed) return;

    return new Promise(async (resolve) => {
      // Cancel any existing transition
      this.cancelAllAnimations();

      // Add transition sphere to scene
      if (!this.transitionSphere.parent) {
        this.scene.add(this.transitionSphere);
      }

      // Load new background into transition sphere
      if (photo.gradient) {
        await this.applyGradientToSphere(this.transitionSphere, photo.gradient);
      } else if (photo.url) {
        await this.loadPhotoToSphere(this.transitionSphere, photo.url);
      } else {
        console.error('[BG] Invalid photo data');
        resolve();
        return;
      }

      // Fade transition
      this.transitionSphere.visible = true;
      this.transitionSphere.material.opacity = 0;

      const startTime = Date.now();
      const animateTransition = () => {
        if (this.isDisposed) {
          resolve();
          return;
        }

        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Smooth easing
        const eased = 1 - Math.pow(1 - progress, 3);
        this.transitionSphere.material.opacity = eased;

        if (progress < 1) {
          const frameId = requestAnimationFrame(animateTransition);
          this.animationFrameIds.add(frameId);
        } else {
          // Complete transition
          this.completeTransition();
          resolve();
        }
      };

      const frameId = requestAnimationFrame(animateTransition);
      this.animationFrameIds.add(frameId);
    });
  }

  completeTransition() {
    // Swap textures
    const oldTexture = this.horizonPlane.material.map;
    this.horizonPlane.material.map = this.transitionSphere.material.map;
    this.horizonPlane.material.color.copy(this.transitionSphere.material.color);
    this.horizonPlane.material.needsUpdate = true;

    // Track new texture
    if (this.transitionSphere.material.map) {
      this.activeTextures.add(this.transitionSphere.material.map);
    }

    // Clean up
    this.transitionSphere.visible = false;
    this.transitionSphere.material.opacity = 0;

    if (this.transitionSphere.parent) {
      this.scene.remove(this.transitionSphere);
    }

    // Dispose old texture
    if (oldTexture) {
      this.activeTextures.delete(oldTexture);
      disposeTexture(oldTexture);
    }
  }

  async applyGradientToSphere(sphere, gradient) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.stops.forEach(stop => {
      grad.addColorStop(stop.position, stop.color);
    });

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    sphere.material.map = texture;
    sphere.material.color.set(0xffffff);
    sphere.material.needsUpdate = true;
  }

  async loadPhotoToSphere(sphere, url) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (texture) => {
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;

          sphere.material.map = texture;
          sphere.material.color.set(0xffffff);
          sphere.material.needsUpdate = true;

          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  cleanupOldTextures() {
    // Dispose of textures not currently in use
    const texturesInUse = new Set();

    if (this.horizonPlane?.material.map) {
      texturesInUse.add(this.horizonPlane.material.map);
    }
    if (this.transitionSphere?.material.map) {
      texturesInUse.add(this.transitionSphere.material.map);
    }

    for (const texture of this.activeTextures) {
      if (!texturesInUse.has(texture)) {
        disposeTexture(texture);
        this.activeTextures.delete(texture);
      }
    }

    // Clean cache if too large
    if (this.backgroundCache.size > this.maxCacheSize) {
      const toRemove = this.backgroundCache.size - this.maxCacheSize;
      const keys = Array.from(this.backgroundCache.keys());

      for (let i = 0; i < toRemove; i++) {
        const value = this.backgroundCache.get(keys[i]);
        if (value?.texture) {
          disposeTexture(value.texture);
        }
        this.backgroundCache.delete(keys[i]);
      }
    }
  }

  update(deltaTime, playerPosition) {
    if (this.isDisposed) return;

    // Keep sky dome centered on player
    if (this.horizonPlane) {
      this.horizonPlane.position.copy(playerPosition);
    }

    // Keep transition sphere in sync
    if (this.transitionSphere) {
      this.transitionSphere.position.copy(playerPosition);
    }

    // Periodic cache cleanup
    this.cacheCleanupCounter++;
    if (this.cacheCleanupCounter > 100) {
      this.cacheCleanupCounter = 0;
      this.cleanupOldTextures();
    }
  }

  cancelAllAnimations() {
    // Cancel all tracked animation frames
    for (const frameId of this.animationFrameIds) {
      cancelAnimationFrame(frameId);
    }
    this.animationFrameIds.clear();
  }

  disposeObject(object) {
    if (!object) return;

    // Release pooled resources
    if (object.geometry) {
      this.resourcePool.release(object.geometry);
    }
    if (object.material) {
      this.resourcePool.release(object.material);
    }

    // Remove from scene
    if (object.parent) {
      object.parent.remove(object);
    }
  }

  dispose() {
    this.isDisposed = true;

    // CRITICAL: Cancel all animation frames
    this.cancelAllAnimations();

    // Dispose all active textures
    for (const texture of this.activeTextures) {
      disposeTexture(texture);
    }
    this.activeTextures.clear();

    // Dispose cache
    for (const value of this.backgroundCache.values()) {
      if (value?.texture) {
        disposeTexture(value.texture);
      }
    }
    this.backgroundCache.clear();

    // Dispose objects
    this.disposeObject(this.horizonPlane);
    this.disposeObject(this.transitionSphere);

    // Dispose services
    if (this.photoService?.dispose) {
      this.photoService.dispose();
    }
    if (this.cacheManager?.dispose) {
      this.cacheManager.dispose();
    }

    // Clear references
    this.scene = null;
    this.camera = null;
    this.photoService = null;
    this.cacheManager = null;
    this.resourcePool = null;
    this.horizonPlane = null;
    this.transitionSphere = null;
    this.skyDome = null;
  }
}