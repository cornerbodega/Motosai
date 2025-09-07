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
    this.currentSegment = null;
    this.nextSegment = null;
    
    // Transition state
    this.transitioning = false;
    this.transitionProgress = 0;
    
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
      emissive: 0x87CEEB,  // Make it glow
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
    this.horizonPlane.renderOrder = -1;  // Render first (behind everything)
    console.log('BackgroundSystem: Adding sky sphere to scene');
    this.scene.add(this.horizonPlane);
    console.log('BackgroundSystem: Sky sphere added. Total scene children:', this.scene.children.length);
    console.log('Sky sphere material color:', this.horizonPlane.material.color);
    
    // Keep reference as skyDome for compatibility
    this.skyDome = this.horizonPlane;
  }
  
  async updateLocation(absolutePosition, location) {
    // Calculate segment (every 50 miles to reduce API calls)
    const segmentId = Math.floor(absolutePosition / 80467); // 50 miles in meters
    
    if (segmentId !== this.currentSegment) {
      this.currentSegment = segmentId;
      await this.loadBackgroundForSegment(segmentId, location);
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
  
  async loadBackgroundForSegment(segmentId, location) {
    const cacheKey = `segment_${segmentId}`;
    
    // Limit cache size to prevent memory issues
    if (this.backgroundCache.size > 5) {
      const firstKey = this.backgroundCache.keys().next().value;
      this.backgroundCache.delete(firstKey);
    }
    
    // Check cache
    if (this.backgroundCache.has(cacheKey)) {
      this.applyBackground(this.backgroundCache.get(cacheKey));
      return;
    }
    
    console.log('Loading background for segment:', segmentId, location);
    
    // First check if we have a cached image in browser storage
    const cachedImage = await this.cacheManager.getCachedImage(segmentId);
    if (cachedImage) {
      console.log('Using cached image from browser storage for segment:', segmentId);
      await this.loadPhotoBackground(cachedImage);
      this.backgroundCache.set(cacheKey, { url: cachedImage, type: 'photo' });
      return;
    }
    
    // Fetch new background from API
    const photos = await this.photoService.fetchPhotosForLocation(
      location.lat,
      location.lng,
      location.name
    );
    
    if (photos && photos.length > 0) {
      const photo = photos[0];
      console.log('Using photo:', photo);
      
      if (photo.type === 'gradient') {
        // Apply gradient
        this.applyGradientBackground(photo.gradient);
        this.backgroundCache.set(cacheKey, photo);
      } else if (photo.url) {
        // Load and apply photo
        await this.loadPhotoBackground(photo.url);
        
        // Save to permanent cache for next time
        const cachedDataUrl = await this.cacheManager.downloadAndSaveImage(segmentId, photo.url);
        if (cachedDataUrl) {
          console.log('Saved image to permanent cache for segment:', segmentId);
        }
        
        this.backgroundCache.set(cacheKey, photo);
      }
    } else {
      console.log('No photos found for segment');
    }
  }
  
  applyGradientBackground(gradient) {
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
  }
  
  async loadPhotoBackground(url) {
    return new Promise((resolve, reject) => {
      // Dispose of old texture if exists
      if (this.horizonPlane.material.map) {
        this.horizonPlane.material.map.dispose();
        this.horizonPlane.material.map = null;
      }
      
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
    if (this.transitioning) return;
    
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
        requestAnimationFrame(animate);
      } else {
        // Swap planes
        const temp = this.horizonPlane;
        this.horizonPlane = this.nextHorizonPlane;
        this.nextHorizonPlane = temp;
        
        this.nextHorizonPlane.visible = false;
        this.horizonPlane.material.opacity = 1;
        this.horizonPlane.material.transparent = false;
        
        this.transitioning = false;
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
    if (this.horizonPlane) {
      this.horizonPlane.geometry.dispose();
      this.horizonPlane.material.dispose();
      this.scene.remove(this.horizonPlane);
    }
    
    if (this.nextHorizonPlane) {
      this.nextHorizonPlane.geometry.dispose();
      this.nextHorizonPlane.material.dispose();
      this.scene.remove(this.nextHorizonPlane);
    }
    
    if (this.skyDome) {
      this.skyDome.geometry.dispose();
      this.skyDome.material.dispose();
      this.scene.remove(this.skyDome);
    }
    
    this.backgroundCache.clear();
  }
}