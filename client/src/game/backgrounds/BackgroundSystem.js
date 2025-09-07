// Background System for forward-driving view
// Places photo/gradient on the horizon where the road meets the sky

import * as THREE from 'three';
import { UnsplashService } from './UnsplashService.js';
import { ImageCacheManager } from './ImageCacheManager.js';

export class BackgroundSystem {
  constructor(scene, camera) {
    console.log('BackgroundSystem: Constructor called with scene:', scene, 'camera:', camera);
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
    
    // Cache
    this.backgroundCache = new Map();
    
    // Clean up old cached images on startup (older than 30 days)
    this.cacheManager.clearOldCache();
    
    this.init();
  }
  
  init() {
    // Create the sky dome which will also be our background
    this.updateSkyDome();
    
    // Don't need a separate horizon plane
    // this.createHorizonPlane();
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
    console.log('BackgroundSystem: Creating sky dome...');
    
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
      console.log('Removing old sky');
      this.scene.remove(oldSky);
    }
    
    // This is now our main background holder
    this.horizonPlane = new THREE.Mesh(skyGeo, skyMat);
    this.horizonPlane.name = 'sky';
    this.horizonPlane.renderOrder = -1000;  // Render first (behind everything)
    this.horizonPlane.frustumCulled = false;  // Always render
    console.log('BackgroundSystem: Adding sky sphere to scene');
    this.scene.add(this.horizonPlane);
    console.log('BackgroundSystem: Sky sphere added. Total scene children:', this.scene.children.length);
    console.log('Sky sphere material color:', this.horizonPlane.material.color);
    
    // Keep reference as skyDome for compatibility
    this.skyDome = this.horizonPlane;
  }
  
  async updateLocation(absolutePosition, location) {
    // Calculate segment (every 1 mile for more frequent changes)
    const segmentId = Math.floor(absolutePosition / 1609.34); // 1 mile in meters
    
    // Debug logging
    const milesTravel = (absolutePosition / 1609.34).toFixed(2);
    
    if (segmentId !== this.currentSegment) {
      console.log(`[BG] Segment change! Miles: ${milesTravel}, New segment: ${segmentId}, Location:`, location);
      this.currentSegment = segmentId;
      
      // SIMPLIFIED: Just load a new background, no complex caching
      await this.loadNewBackground(segmentId, location);
    }
    
    // Update sphere position to follow player
    if (this.horizonPlane) {
      // Keep sphere centered on player
      this.horizonPlane.position.z = absolutePosition;
      if (this.nextHorizonPlane) {
        this.nextHorizonPlane.position.z = absolutePosition;
      }
    }
  }
  
  async loadNewBackground(segmentId, location) {
    try {
      // SIMPLIFIED: Always fetch fresh from API, no caching issues
      console.log(`[BG] Loading background for segment ${segmentId}`);
      console.log(`[BG] Location: lat=${location.lat.toFixed(3)}, lng=${location.lng.toFixed(3)}, name=${location.name}`);
      
      // Fetch from API
      const photos = await this.photoService.fetchPhotosForLocation(
        location.lat,
        location.lng,
        location.name
      );
      
      console.log(`[BG] API returned ${photos ? photos.length : 0} photos`);
      
      if (photos && photos.length > 0) {
        // Pick a photo based on segment ID to get variety
        const photoIndex = segmentId % photos.length;
        const photo = photos[photoIndex];
        console.log(`[BG] Using photo ${photoIndex + 1} of ${photos.length}`);
        
        if (photo.type === 'gradient') {
          console.log('[BG] Applying gradient background');
          this.applyGradientBackground(photo.gradient);
        } else if (photo.url) {
          console.log('[BG] Loading photo from URL');
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
    
    this.horizonPlane.material.map = texture;
    this.horizonPlane.material.color.set(0xffffff);
    this.horizonPlane.material.needsUpdate = true;
    
    // Now dispose the old texture if it existed
    if (oldTexture && oldTexture !== texture) {
      oldTexture.dispose();
    }
  }
  
  async loadPhotoBackground(url) {
    return new Promise((resolve, reject) => {
      // Store old texture to dispose after new one loads
      const oldTexture = this.horizonPlane.material.map;
      
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (texture) => {
          // Optimize texture for performance
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          
          // Apply texture to horizon plane
          this.horizonPlane.material.map = texture;
          this.horizonPlane.material.color.set(0xffffff);
          this.horizonPlane.material.needsUpdate = true;
          
          // Now dispose the old texture if it existed
          if (oldTexture && oldTexture !== texture) {
            oldTexture.dispose();
          }
          
          // Don't scale - keep the massive size to prevent seeing edges
          // const aspect = texture.image.width / texture.image.height;
          // this.horizonPlane.scale.x = aspect;
          
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error('Error loading photo:', error);
          // Fall back to gradient
          this.applyGradientBackground({
            stops: [
              { color: '#87CEEB', position: 0 },
              { color: '#98D8F8', position: 0.5 },
              { color: '#4682B4', position: 1 }
            ]
          });
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
    // Keep sky dome (which is our background) centered on player
    if (this.horizonPlane) {
      // Sphere follows player position
      this.horizonPlane.position.x = playerPosition.x;
      this.horizonPlane.position.z = playerPosition.z;
      // Keep it at ground level
      this.horizonPlane.position.y = 0;
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