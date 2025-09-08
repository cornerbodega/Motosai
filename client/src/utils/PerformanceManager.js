import * as THREE from 'three';

export class PerformanceManager {
  constructor() {
    this.performanceLevel = 'high'; // high, medium, low
    this.frameCount = 0;
    this.frameTime = 0;
    this.lastFrameTime = performance.now();
    this.frameTimes = [];
    this.maxFrameHistory = 60; // Track last 60 frames
    
    // Performance thresholds (ms per frame)
    this.thresholds = {
      low: 33.3,    // <30 FPS
      medium: 20.0, // <50 FPS
      high: 16.67   // 60+ FPS
    };
    
    this.autoAdjustEnabled = true;
    this.adjustmentCooldown = 5000; // 5 seconds between adjustments
    this.lastAdjustment = 0;
    
    // Detect initial performance level based on hardware
    this.detectHardwareCapabilities();
  }
  
  detectHardwareCapabilities() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) {
      this.performanceLevel = 'low';
      return;
    }
    
    // Check WebGL capabilities
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : '';
    
    // Check for mobile devices
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Check memory (if available)
    const memory = navigator.deviceMemory || 4; // Default to 4GB if not available
    
    // Check CPU cores
    const cores = navigator.hardwareConcurrency || 2;
    
    console.log('Hardware detection:', { renderer, vendor, isMobile, memory, cores });
    
    // Performance classification
    if (isMobile || memory < 4 || cores < 4) {
      this.performanceLevel = 'low';
    } else if (memory < 8 || cores < 8) {
      this.performanceLevel = 'medium';
    } else {
      this.performanceLevel = 'high';
    }
    
    // Check for integrated graphics (common indicators of lower performance)
    const integratedGPU = renderer.toLowerCase().includes('intel') || 
                         renderer.toLowerCase().includes('integrated') ||
                         renderer.toLowerCase().includes('uhd') ||
                         renderer.toLowerCase().includes('iris');
    
    if (integratedGPU && this.performanceLevel === 'high') {
      this.performanceLevel = 'medium';
    }
    
    console.log(`Initial performance level: ${this.performanceLevel}`);
  }
  
  update(deltaTime) {
    this.frameCount++;
    this.frameTime = deltaTime * 1000; // Convert to milliseconds
    
    // Track frame times
    this.frameTimes.push(this.frameTime);
    if (this.frameTimes.length > this.maxFrameHistory) {
      this.frameTimes.shift();
    }
    
    // Auto-adjust performance every few seconds
    if (this.autoAdjustEnabled && 
        performance.now() - this.lastAdjustment > this.adjustmentCooldown &&
        this.frameTimes.length >= this.maxFrameHistory) {
      this.adjustPerformanceLevel();
    }
  }
  
  adjustPerformanceLevel() {
    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const targetFrameTime = 16.67; // 60 FPS
    
    console.log(`Average frame time: ${avgFrameTime.toFixed(2)}ms`);
    
    let newLevel = this.performanceLevel;
    
    // Adjust performance level based on frame times
    if (avgFrameTime > this.thresholds.low) {
      newLevel = 'low';
    } else if (avgFrameTime > this.thresholds.medium) {
      newLevel = 'medium';
    } else if (avgFrameTime < targetFrameTime && this.performanceLevel === 'low') {
      newLevel = 'medium';
    } else if (avgFrameTime < targetFrameTime && this.performanceLevel === 'medium') {
      newLevel = 'high';
    }
    
    if (newLevel !== this.performanceLevel) {
      console.log(`Performance level adjusted: ${this.performanceLevel} -> ${newLevel}`);
      this.performanceLevel = newLevel;
      this.lastAdjustment = performance.now();
      
      // Dispatch custom event for game to react to performance changes
      window.dispatchEvent(new CustomEvent('performanceChanged', { 
        detail: { level: newLevel, previousLevel: this.performanceLevel }
      }));
    }
  }
  
  getConfig() {
    const configs = {
      low: {
        shadowMapSize: 1024,
        shadowType: THREE.BasicShadowMap,
        pixelRatio: 1,
        antialias: false,
        maxVehicles: 15,
        spawnDistance: 150,
        segmentCount: 10,
        treeInstances: 50,
        particleCount: 20,
        updateFrequency: 2, // Update every 2 frames
        fogDistance: 500,
        lodDistance: 100,
        physicallyCorrectLights: false,
        toneMapping: THREE.LinearToneMapping,
        enableBloom: false,
        enableSSAO: false
      },
      medium: {
        shadowMapSize: 2048,
        shadowType: THREE.PCFShadowMap,
        pixelRatio: 1.25,
        antialias: true,
        maxVehicles: 25,
        spawnDistance: 200,
        segmentCount: 15,
        treeInstances: 100,
        particleCount: 50,
        updateFrequency: 1, // Update every frame
        fogDistance: 1000,
        lodDistance: 150,
        physicallyCorrectLights: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        enableBloom: false,
        enableSSAO: false
      },
      high: {
        shadowMapSize: 4096,
        shadowType: THREE.PCFSoftShadowMap,
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        antialias: true,
        maxVehicles: 40,
        spawnDistance: 300,
        segmentCount: 20,
        treeInstances: 200,
        particleCount: 100,
        updateFrequency: 1,
        fogDistance: 2000,
        lodDistance: 200,
        physicallyCorrectLights: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        enableBloom: true,
        enableSSAO: true
      }
    };
    
    return configs[this.performanceLevel];
  }
  
  setPerformanceLevel(level) {
    if (['low', 'medium', 'high'].includes(level)) {
      this.performanceLevel = level;
      console.log(`Performance level manually set to: ${level}`);
      
      window.dispatchEvent(new CustomEvent('performanceChanged', { 
        detail: { level, manual: true }
      }));
    }
  }
  
  enableAutoAdjust(enabled = true) {
    this.autoAdjustEnabled = enabled;
  }
  
  getAverageFPS() {
    if (this.frameTimes.length === 0) return 0;
    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    return 1000 / avgFrameTime;
  }
}