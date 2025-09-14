import * as THREE from 'three';

export class PerformanceManager {
  constructor() {
    this.performanceLevel = 'high'; // high, medium, low
    this.frameCount = 0;
    this.frameTime = 0;
    this.lastFrameTime = performance.now();
    this.frameTimes = [];
    this.maxFrameHistory = 60; // Track last 60 frames
    
    // Performance thresholds (ms per frame) - more conservative
    this.thresholds = {
      low: 50.0,    // <20 FPS - emergency mode
      medium: 33.3, // <30 FPS - needs help
      high: 20.0    // 50+ FPS - running well
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
    
    // Performance classification - more conservative
    if (isMobile || memory <= 4 || cores <= 2) {
      this.performanceLevel = 'low';
    } else if (memory <= 8 || cores <= 4) {
      this.performanceLevel = 'medium';
    } else {
      // Start at medium even for high-end hardware, let it scale up if performance is good
      this.performanceLevel = 'medium';
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
    
    // console.log(`Average frame time: ${avgFrameTime.toFixed(2)}ms`); // Commented - logs every frame!
    
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
        shadowMapSize: 512,  // Reduced from 1024
        shadowType: THREE.BasicShadowMap,
        pixelRatio: 1,
        antialias: false,
        maxVehicles: 10,  // Reduced from 15
        spawnDistance: 100,  // Reduced from 150
        segmentCount: 8,  // Reduced from 10
        treeInstances: 30,  // Reduced from 50
        particleCount: 10,  // Reduced from 20
        updateFrequency: 2, // Update every 2 frames
        fogDistance: 300,  // Reduced from 500
        lodDistance: 80,  // Reduced from 100
        physicallyCorrectLights: false,
        toneMapping: THREE.NoToneMapping,  // Simplest tone mapping
        enableBloom: false,
        enableSSAO: false
      },
      medium: {
        shadowMapSize: 1024,  // Reduced from 2048
        shadowType: THREE.PCFShadowMap,
        pixelRatio: Math.min(1.25, window.devicePixelRatio),  // Cap properly
        antialias: true,
        maxVehicles: 15,  // Reduced from 25
        spawnDistance: 150,  // Reduced from 200
        segmentCount: 12,  // Reduced from 15
        treeInstances: 60,  // Reduced from 100
        particleCount: 30,  // Reduced from 50
        updateFrequency: 1, // Update every frame
        fogDistance: 600,  // Reduced from 1000
        lodDistance: 120,  // Reduced from 150
        physicallyCorrectLights: false,
        toneMapping: THREE.LinearToneMapping,  // Simpler tone mapping
        enableBloom: false,
        enableSSAO: false
      },
      high: {
        shadowMapSize: 2048,  // Reduced from 4096 - still high quality but much less memory
        shadowType: THREE.PCFSoftShadowMap,
        pixelRatio: Math.min(window.devicePixelRatio, 1.5),  // Cap at 1.5 instead of 2
        antialias: true,
        maxVehicles: 20,  // Reduced from 40
        spawnDistance: 200,  // Reduced from 300
        segmentCount: 15,  // Reduced from 20
        treeInstances: 100,  // Reduced from 200
        particleCount: 50,  // Reduced from 100
        updateFrequency: 1,
        fogDistance: 1000,  // Reduced from 2000
        lodDistance: 150,  // Reduced from 200
        physicallyCorrectLights: false,  // Disabled for performance
        toneMapping: THREE.ACESFilmicToneMapping,
        enableBloom: false,  // Disabled - too expensive
        enableSSAO: false  // Disabled - too expensive
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