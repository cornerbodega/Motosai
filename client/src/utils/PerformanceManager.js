import * as THREE from 'three';
import { DeviceDetection } from './DeviceDetection.js';

export class PerformanceManager {
  constructor() {
    this.performanceLevel = 'high'; // high, medium, low
    this.frameCount = 0;
    this.frameTime = 0;
    this.lastFrameTime = performance.now();
    this.frameTimes = [];
    this.maxFrameHistory = 60; // Track last 60 frames

    // Mobile device info
    this.deviceInfo = DeviceDetection.getDeviceInfo();
    this.performanceTier = DeviceDetection.getPerformanceTier();

    // Performance thresholds (ms per frame) - more conservative for mobile
    this.thresholds = {
      low: this.deviceInfo.isMobile ? 66.7 : 50.0,    // 15 FPS mobile, 20 FPS desktop
      medium: this.deviceInfo.isMobile ? 50.0 : 33.3, // 20 FPS mobile, 30 FPS desktop
      high: this.deviceInfo.isMobile ? 33.3 : 20.0    // 30 FPS mobile, 50 FPS desktop
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

    // Use DeviceDetection for mobile/device checks
    const isMobile = this.deviceInfo.isMobile;
    const memory = navigator.deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 2;


    // Use performance tier from DeviceDetection
    if (this.performanceTier === 'low') {
      this.performanceLevel = 'low';
    } else if (this.performanceTier === 'medium') {
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
      this.performanceLevel = newLevel;
      this.lastAdjustment = performance.now();
      
      // Dispatch custom event for game to react to performance changes
      window.dispatchEvent(new CustomEvent('performanceChanged', { 
        detail: { level: newLevel, previousLevel: this.performanceLevel }
      }));
    }
  }
  
  getConfig() {
    const isMobile = this.deviceInfo.isMobile;

    const configs = {
      low: {
        shadowMapSize: isMobile ? 256 : 512,  // Even lower for mobile
        shadowType: THREE.BasicShadowMap,
        pixelRatio: 1,
        antialias: false,
        maxVehicles: isMobile ? 5 : 10,  // Fewer vehicles on mobile
        spawnDistance: isMobile ? 80 : 100,
        segmentCount: isMobile ? 6 : 8,
        treeInstances: isMobile ? 20 : 30,
        particleCount: isMobile ? 5 : 10,
        updateFrequency: isMobile ? 3 : 2, // Update every 3 frames on mobile
        fogDistance: isMobile ? 200 : 300,
        lodDistance: isMobile ? 60 : 80,
        physicallyCorrectLights: false,
        toneMapping: THREE.NoToneMapping,
        enableBloom: false,
        enableSSAO: false,
        targetFPS: isMobile ? 30 : 45
      },
      medium: {
        shadowMapSize: isMobile ? 512 : 1024,
        shadowType: isMobile ? THREE.BasicShadowMap : THREE.PCFShadowMap,
        pixelRatio: isMobile ? 1 : Math.min(1.25, window.devicePixelRatio),
        antialias: !isMobile, // Disable AA on mobile for performance
        maxVehicles: isMobile ? 8 : 15,
        spawnDistance: isMobile ? 100 : 150,
        segmentCount: isMobile ? 8 : 12,
        treeInstances: isMobile ? 40 : 60,
        particleCount: isMobile ? 15 : 30,
        updateFrequency: isMobile ? 2 : 1, // Update every 2 frames on mobile
        fogDistance: isMobile ? 400 : 600,
        lodDistance: isMobile ? 80 : 120,
        physicallyCorrectLights: false,
        toneMapping: isMobile ? THREE.NoToneMapping : THREE.LinearToneMapping,
        enableBloom: false,
        enableSSAO: false,
        targetFPS: isMobile ? 30 : 60
      },
      high: {
        shadowMapSize: isMobile ? 1024 : 2048,
        shadowType: isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap,
        pixelRatio: isMobile ? 1 : Math.min(window.devicePixelRatio, 1.5),
        antialias: !isMobile, // Disable AA on mobile
        maxVehicles: isMobile ? 12 : 20,
        spawnDistance: isMobile ? 150 : 200,
        segmentCount: isMobile ? 10 : 15,
        treeInstances: isMobile ? 60 : 100,
        particleCount: isMobile ? 25 : 50,
        updateFrequency: 1,
        fogDistance: isMobile ? 600 : 1000,
        lodDistance: isMobile ? 100 : 150,
        physicallyCorrectLights: false,
        toneMapping: isMobile ? THREE.LinearToneMapping : THREE.ACESFilmicToneMapping,
        enableBloom: false,
        enableSSAO: false,
        targetFPS: isMobile ? 30 : 60
      }
    };

    const config = configs[this.performanceLevel];

    return config;
  }
  
  setPerformanceLevel(level) {
    if (['low', 'medium', 'high'].includes(level)) {
      this.performanceLevel = level;

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