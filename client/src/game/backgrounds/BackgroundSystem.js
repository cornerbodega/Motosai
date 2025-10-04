// Background System for forward-driving view
// Places photo/gradient on the horizon where the road meets the sky

import * as THREE from 'three';
import { UnsplashService } from './UnsplashService.js';
import { ImageCacheManager } from './ImageCacheManager.js';

export class BackgroundSystem {
  constructor(scene, camera) {
    // console.log('BackgroundSystem: Constructor called with scene:', scene, 'camera:', camera);
    this.scene = scene;
    this.camera = camera;
    this.photoService = new UnsplashService();
    this.cacheManager = new ImageCacheManager();
    
    // Current background elements
    this.horizonPlane = null;
    this.skyDome = null;
    this.currentSegment = -1;  // Start at -1 so segment 0 triggers
    this.nextSegment = null;
    
    // Transition state
    this.transitioning = false;
    this.transitionProgress = 0;
    this.transitionAnimationId = null;  // Store animation frame ID
    
    // Cache with size limit
    this.backgroundCache = new Map();
    this.maxCacheSize = 10; // Maximum number of cached backgrounds
    this.cacheCleanupCounter = 0;
    
    // Track textures for disposal
    this.activeTextures = new Set();
    
    // Clean up old cached images on startup (older than 30 days)
    this.cacheManager.clearOldCache();
    
    this.init();
  }
  
  init() {
    // Create the sky dome which will also be our background
    this.updateSkyDome();
    
    // Create second sphere for smooth transitions
    this.createTransitionSphere();
  }
  
  createTransitionSphere() {
    // Create a second sphere for blending
    const skyGeo = new THREE.SphereGeometry(2000, 64, 32);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,  // White instead of blue - will be replaced by texture
      fog: false,
      side: THREE.BackSide,
      depthWrite: false,
      transparent: true,
      opacity: 0,
      visible: false  // Ensure material is also not visible
    });
    
    this.transitionSphere = new THREE.Mesh(skyGeo, skyMat);
    this.transitionSphere.name = 'transitionSky';
    this.transitionSphere.renderOrder = -999; // Render just after main sky
    this.transitionSphere.frustumCulled = false;
    this.transitionSphere.visible = false;
    // Don't add to scene until needed for transition
    // this.scene.add(this.transitionSphere);
  }
  
  createHorizonPlane() {
    // Create a sphere that surrounds the player
    const geometry = new THREE.SphereGeometry(
      10000,  // radius - large enough to surround everything
      64,    // width segments
      32     // height segments
    );
    const material = new THREE.MeshBasicMaterial({
      color: 0x87CEEB,  // Sky blue default
      fog: false,
      side: THREE.DoubleSide  // Render both sides
    });
    
    this.horizonPlane = new THREE.Mesh(geometry, material);
    this.horizonPlane.position.set(0, 0, 0);  // Center at origin
    
    this.scene.add(this.horizonPlane);
    
    // Create second plane for smooth transitions
    this.nextHorizonPlane = new THREE.Mesh(
      geometry.clone(),
      material.clone()
    );
    this.nextHorizonPlane.position.set(0, 0, 0); // Same position as main sphere
    this.nextHorizonPlane.visible = false;
    this.scene.add(this.nextHorizonPlane);
  }
  
  updateSkyDome() {
    // console.log('BackgroundSystem: Creating sky dome...');
    
    // Create sky sphere that will hold our background photos
    const skyGeo = new THREE.SphereGeometry(2000, 64, 32);  // Increased size
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x87CEEB,  // Sky blue
      fog: false,
      side: THREE.BackSide,  // Render inside of sphere
      depthWrite: false,  // Ensure it renders behind everything
      transparent: false
    });
    
    // Remove old sky if exists
    const oldSky = this.scene.getObjectByName('sky');
    if (oldSky) {
      // console.log('Removing old sky');
      this.scene.remove(oldSky);
    }
    
    // This is now our main background holder
    this.horizonPlane = new THREE.Mesh(skyGeo, skyMat);
    this.horizonPlane.name = 'sky';
    this.horizonPlane.renderOrder = -1000;  // Render first (behind everything)
    this.horizonPlane.frustumCulled = false;  // Always render
    // console.log('BackgroundSystem: Adding sky sphere to scene');
    this.scene.add(this.horizonPlane);
    // console.log('BackgroundSystem: Sky sphere added. Total scene children:', this.scene.children.length);
    // console.log('Sky sphere material color:', this.horizonPlane.material.color);
    
    // Keep reference as skyDome for compatibility
    this.skyDome = this.horizonPlane;
  }
  
  async updateLocation(absolutePosition, location) {
    // Calculate segment (every 0.5 miles)
    // At 500mph, this is every 3.6 seconds
    // Use Math.max to ensure we never get negative segment IDs
    const segmentId = Math.max(0, Math.floor(absolutePosition / 804.67)); // 0.5 miles in meters
    
    // Debug logging
    const milesTravel = (absolutePosition / 1609.34).toFixed(2);
    
    if (segmentId !== this.currentSegment) {
      console.log(`[BG] Segment change at ${milesTravel} miles (segment ${segmentId}), Location:`, location);
      
      // Rate limit: Don't change backgrounds more than once every 12 seconds
      const now = Date.now();
      if (!this.lastBackgroundChange) this.lastBackgroundChange = 0;
      const timeSinceLastChange = (now - this.lastBackgroundChange) / 1000;

      if (timeSinceLastChange < 12) {
        console.log(`[BG] Skipping - only ${timeSinceLastChange.toFixed(1)}s since last change (min 12s)`);
        return;
      }
      
      this.currentSegment = segmentId;
      this.lastBackgroundChange = now;
      
      // SIMPLIFIED: Just load a new background, no complex caching
      await this.loadNewBackground(segmentId, location);
    }
    
    // Position update is now handled in update() method to keep sphere centered on player
  }
  
  cleanupOldTextures() {
    // Dispose of old textures to prevent memory leaks
    this.activeTextures.forEach(texture => {
      if (texture && typeof texture.dispose === 'function') {
        texture.dispose();
      }
    });
    this.activeTextures.clear();
    
    // Limit background cache size
    if (this.backgroundCache.size > this.maxCacheSize) {
      const oldestKey = this.backgroundCache.keys().next().value;
      this.backgroundCache.delete(oldestKey);
    }
  }
  
  async loadNewBackground(segmentId, location) {
    try {
      console.log(`[BG] Loading segment ${segmentId}: ${location.name} (${location.lat.toFixed(2)}, ${location.lng.toFixed(2)})`);
      
      // Clean up old textures before loading new ones
      this.cleanupOldTextures();
      
      // Fetch from API
      const photos = await this.photoService.fetchPhotosForLocation(
        location.lat,
        location.lng,
        location.name
      );
      
      if (photos && photos.length > 0) {
        // Pick a photo based on segment ID to get variety
        const photoIndex = segmentId % photos.length;
        const photo = photos[photoIndex];
        console.log(`[BG] Segment ${segmentId}: Using photo ${photoIndex + 1} of ${photos.length}`);
        
        // SIMPLE: Just load the new background directly, no transition
        if (photo.gradient) {
          this.applyGradientBackground(photo.gradient);
        } else if (photo.url) {
          await this.loadPhotoBackground(photo.url);
        }
      } else {
        console.log('[BG] No photos returned, using default gradient');
        // Fallback gradient
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
      // Apply fallback gradient on error
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
    // Store old texture to dispose after new one is applied
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
    
    // Create texture and apply to horizon
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // Track the new texture
    this.activeTextures.add(texture);
    
    this.horizonPlane.material.map = texture;
    this.horizonPlane.material.color.set(0xffffff);
    this.horizonPlane.material.needsUpdate = true;
    
    // Now dispose the old texture if it existed
    if (oldTexture && oldTexture !== texture) {
      this.activeTextures.delete(oldTexture);
      oldTexture.dispose();
    }
  }
  
  async transitionToNewBackground(photo, duration = 1500) {
    return new Promise(async (resolve) => {
      // Cancel any existing transition
      if (this.transitionAnimationId) {
        cancelAnimationFrame(this.transitionAnimationId);
        this.transitionAnimationId = null;
      }
      
      // Add transition sphere to scene only when needed
      if (!this.transitionSphere.parent) {
        this.scene.add(this.transitionSphere);
      }
      
      // Load the new background into the transition sphere first
      if (photo.gradient) {
        // It's a gradient (from mock data)
        await this.applyGradientToSphere(this.transitionSphere, photo.gradient);
      } else if (photo.url) {
        // It's a photo URL (from real API)
        await this.loadPhotoToSphere(this.transitionSphere, photo.url);
      } else {
        console.error('[BG] Photo has neither gradient nor url:', photo);
        resolve();
        return;
      }
      
      // Now fade between the two spheres
      this.transitionSphere.visible = true;
      this.transitionSphere.material.opacity = 0;
      
      const startTime = Date.now();
      const fadeIn = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Smooth easing
        const eased = 1 - Math.pow(1 - progress, 3);
        this.transitionSphere.material.opacity = eased;
        
        if (progress < 1) {
          this.transitionAnimationId = requestAnimationFrame(fadeIn);
        } else {
          // Swap the backgrounds
          const tempMap = this.horizonPlane.material.map;
          this.horizonPlane.material.map = this.transitionSphere.material.map;
          this.horizonPlane.material.color.copy(this.transitionSphere.material.color);
          this.horizonPlane.material.needsUpdate = true;
          
          // Track texture swap
          if (this.transitionSphere.material.map) {
            this.activeTextures.add(this.transitionSphere.material.map);
          }
          
          // Clean up
          this.transitionSphere.visible = false;
          this.transitionSphere.material.opacity = 0;
          // Remove from scene after transition
          if (this.transitionSphere.parent) {
            this.scene.remove(this.transitionSphere);
          }
          if (tempMap) {
            this.activeTextures.delete(tempMap);
            tempMap.dispose();
          }
          
          this.transitionAnimationId = null;
          resolve();
        }
      };
      
      fadeIn();
    });
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
        (error) => {
          console.error('Error loading photo:', error);
          reject(error);
        }
      );
    });
  }
  
  async loadPhotoBackground(url) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (texture) => {
          // Simple: just apply the texture
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          
          // Track the new texture
          this.activeTextures.add(texture);
          
          // Dispose old texture if exists
          if (this.horizonPlane.material.map) {
            this.activeTextures.delete(this.horizonPlane.material.map);
            this.horizonPlane.material.map.dispose();
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
  
  // Smooth transition between backgrounds
  async transitionToBackground(newBackground, duration = 2000) {
    if (this.transitioning) {
      // Cancel previous transition if still running
      if (this.transitionAnimationId) {
        cancelAnimationFrame(this.transitionAnimationId);
        this.transitionAnimationId = null;
      }
    }
    
    this.transitioning = true;
    this.transitionProgress = 0;
    
    // Set up next plane with new background
    if (newBackground.type === 'gradient') {
      this.applyGradientToPlane(this.nextHorizonPlane, newBackground.gradient);
    } else {
      await this.loadPhotoToPlane(this.nextHorizonPlane, newBackground.url);
    }
    
    // Fade transition
    this.nextHorizonPlane.visible = true;
    this.nextHorizonPlane.material.opacity = 0;
    this.nextHorizonPlane.material.transparent = true;
    
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      this.nextHorizonPlane.material.opacity = progress;
      this.horizonPlane.material.opacity = 1 - progress;
      
      if (progress < 1) {
        this.transitionAnimationId = requestAnimationFrame(animate);
      } else {
        // Swap planes
        const temp = this.horizonPlane;
        this.horizonPlane = this.nextHorizonPlane;
        this.nextHorizonPlane = temp;
        
        this.nextHorizonPlane.visible = false;
        this.horizonPlane.material.opacity = 1;
        this.horizonPlane.material.transparent = false;
        
        this.transitioning = false;
        this.transitionAnimationId = null;
      }
    };
    
    animate();
  }
  
  update(deltaTime, playerPosition) {
    // Keep sky dome (which is our background) ALWAYS centered on player
    // This ensures the player is always at the center of the sphere and can't reach the edges
    if (this.horizonPlane) {
      // Sphere must follow player position exactly to keep them centered
      this.horizonPlane.position.x = playerPosition.x;
      this.horizonPlane.position.z = playerPosition.z;
      this.horizonPlane.position.y = playerPosition.y; // Follow Y position too
    }
    
    // Keep transition sphere in sync
    if (this.transitionSphere) {
      this.transitionSphere.position.copy(this.horizonPlane.position);
    }
    
    // Periodic cache cleanup (every 100 updates)
    this.cacheCleanupCounter++;
    if (this.cacheCleanupCounter > 100) {
      this.cacheCleanupCounter = 0;
      this.cleanupCache();
    }
  }
  
  cleanupCache() {
    // Limit cache size
    if (this.backgroundCache.size > this.maxCacheSize) {
      // Remove oldest entries
      const entriesToRemove = this.backgroundCache.size - this.maxCacheSize;
      const keys = Array.from(this.backgroundCache.keys());
      for (let i = 0; i < entriesToRemove; i++) {
        const key = keys[i];
        const value = this.backgroundCache.get(key);
        if (value && value.texture) {
          value.texture.dispose();
        }
        this.backgroundCache.delete(key);
      }
    }
  }
  
  dispose() {
    // Cancel any ongoing transition animation
    if (this.transitionAnimationId) {
      cancelAnimationFrame(this.transitionAnimationId);
      this.transitionAnimationId = null;
    }
    
    // Dispose of horizon plane
    if (this.horizonPlane) {
      if (this.horizonPlane.material.map) {
        this.horizonPlane.material.map.dispose();
      }
      this.horizonPlane.geometry.dispose();
      this.horizonPlane.material.dispose();
      this.scene.remove(this.horizonPlane);
    }
    
    // Dispose of next horizon plane
    if (this.nextHorizonPlane) {
      if (this.nextHorizonPlane.material.map) {
        this.nextHorizonPlane.material.map.dispose();
      }
      this.nextHorizonPlane.geometry.dispose();
      this.nextHorizonPlane.material.dispose();
      this.scene.remove(this.nextHorizonPlane);
    }
    
    // Dispose of sky dome (if different from horizonPlane)
    if (this.skyDome && this.skyDome !== this.horizonPlane) {
      if (this.skyDome.material.map) {
        this.skyDome.material.map.dispose();
      }
      this.skyDome.geometry.dispose();
      this.skyDome.material.dispose();
      this.scene.remove(this.skyDome);
    }
    
    // Clear cache and dispose of any cached textures
    this.backgroundCache.forEach((value) => {
      if (value.texture && typeof value.texture.dispose === 'function') {
        value.texture.dispose();
      }
    });
    this.backgroundCache.clear();
    
    // Dispose all active textures
    this.activeTextures.forEach(texture => {
      if (texture && typeof texture.dispose === 'function') {
        texture.dispose();
      }
    });
    this.activeTextures.clear();
    
    // Dispose of services
    if (this.photoService && typeof this.photoService.dispose === 'function') {
      this.photoService.dispose();
    }
    if (this.cacheManager && typeof this.cacheManager.dispose === 'function') {
      this.cacheManager.dispose();
    }
    
    // Clear references
    this.scene = null;
    this.camera = null;
    this.photoService = null;
    this.cacheManager = null;
  }
}