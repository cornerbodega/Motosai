import * as THREE from "three";
import { MaterialTracker } from "../utils/MaterialTracker.js"; // MUST BE FIRST to intercept THREE.js
import { SimpleBikePhysics } from "../physics/SimpleBikePhysics.js";
import { MotorcyclePhysics } from "../physics/MotorcyclePhysics.js";
import { MotorcyclePhysicsV2 } from "../physics/MotorcyclePhysicsV2.js";
import { InputController } from "../physics/InputController.js";
import { Highway101 } from "./Highway101.js";
import { TrafficSystem } from "./TrafficSystem.js";
import { BackgroundSystem } from "./backgrounds/BackgroundSystem.js";
import { TerrainSystem } from "./TerrainSystem.js";
import { DeathAnimation } from "./DeathAnimation.js";
import { BloodTrackSystem } from "./BloodTrackSystem.js";
import { MultiplayerManager } from "../multiplayer/MultiplayerManager.js";
import { MotorcycleFactory } from "./MotorcycleFactory.js";
import { PerformanceManager } from "../utils/PerformanceManager.js";
import { AudioManager } from "./AudioManager.js";
import { getStoppa } from "../utils/Stoppa.js";
import { Minimap } from "./Minimap.js";
import { MemoryProfiler } from "../utils/MemoryProfiler.js";
import {
  getMaterialManager,
  resetMaterialManager,
} from "../utils/MaterialManager.js";
import { IntroAnimation } from "./IntroAnimation.js";
import { UFORaceIntro } from "./UFORaceIntro.js";
import { UFOController } from "./UFOController.js";
import { PlayerSelection } from "./PlayerSelection.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { HeatHazeShader } from "./shaders/HeatHazeShader.js";
import { HeatHazeShaderV2 } from "./shaders/HeatHazeShaderV2.js";
import { DevMenu } from "./DevMenu.js";
import { BillboardSystem } from "./BillboardSystem.js";
import { DeviceDetection } from "../utils/DeviceDetection.js";
import { MobileTouchController } from "../controls/MobileTouchController.js";
import { VehiclePassCounter } from "./VehiclePassCounter.js";
import { LeaderboardUI } from "./LeaderboardUI.js";
import { AccountModal } from "./AccountModal.js";
// PowerupSystem removed

export class MotosaiGame {
  constructor(container, config = {}) {
    this.container = container;
    this.width = container.clientWidth;
    this.height = container.clientHeight;

    // Initialize Stoppa memory manager
    this.stoppa = getStoppa({
      enabled: true,
      verbose: config.debug || false,
      autoCleanup: true,
      memoryThreshold: 400 * 1024 * 1024, // 400MB threshold
    });

    // Initialize Material Manager (singleton)
    this.materialManager = getMaterialManager();

    // Make Stoppa accessible from console for debugging
    window.stoppa = this.stoppa;
    console.log("🛡️ Stoppa Memory Manager initialized!");
    console.log("Usage from console:");
    console.log("  stoppa.getStats() - View memory statistics");
    console.log("  stoppa.detectLeaks() - Check for memory leaks");
    console.log("  stoppa.cleanup() - Force cleanup");
    console.log("  stoppa.takeSnapshot() - Take memory snapshot");

    // Material tracking and aggressive memory cleanup
    this.materialTrackingInterval = setInterval(() => {
      if (window.materialTracker) {
        window.materialTracker.logStats();
        const stats = window.materialTracker.getStats();
        if (stats.currentUndisposed > 200) {
          console.log(
            "%c🚨 FINDING LEAK SOURCE...",
            "color: #ff0000; font-weight: bold"
          );
          window.materialTracker.findLeakSource();
        }
      }

      // Log memory stats
      if (performance.memory) {
        const usedMB = (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
        const totalMB = (performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1);
        console.log(`💾 Memory: ${usedMB}MB / ${totalMB}MB`);

        // Warn if memory usage is high
        if (performance.memory.usedJSHeapSize > 150 * 1024 * 1024) {
          console.warn(`⚠️ HIGH MEMORY USAGE: ${usedMB}MB - Triggering cleanup`);
          this.performMemoryCleanup();
        }
      }
    }, 5000); // Every 5 seconds

    // Detect mobile device
    this.deviceInfo = DeviceDetection.getDeviceInfo();
    this.isMobile = this.deviceInfo.isMobile;
    this.performanceTier = DeviceDetection.getPerformanceTier();

    console.log('🎮 Device Detection:', {
      isMobile: this.isMobile,
      isTablet: this.deviceInfo.isTablet,
      performanceTier: this.performanceTier,
      hasTouch: this.deviceInfo.hasTouch
    });

    // Show device mode on screen for debugging
    if (this.isMobile) {
      console.log('%c📱 MOBILE MODE - Touch controls will be shown', 'background: #00ff00; color: black; font-size: 20px; padding: 10px;');
    } else {
      console.log('%c🖥️ DESKTOP MODE - Use keyboard controls (WASD)', 'background: #0088ff; color: white; font-size: 20px; padding: 10px;');
    }

    // Configuration options
    this.config = {
      riderColor: config.riderColor || 0x2a2a2a, // Default dark grey
      ...config,
    };

    // Game state
    this.isRunning = false;
    this.isPaused = false;
    this.score = 0;
    this.distance = 0; // miles traveled
    this.showDevHUD = false; // Toggle for dev HUD visibility (default hidden)

    // Mobile controls
    this.mobileController = null;

    // UFO that follows player
    this.ufo = null;
    this.ufoController = null;
    this.ufoState = 'following'; // 'following', 'flyingAway', 'returning'
    this.ufoFlyAwayProgress = 0;

    // Billboard system
    this.billboardSystem = null;

    // Race state
    this.raceMode = false;
    this.raceType = null; // 'ai' or 'friend'
    this.raceDistance = 0; // km
    this.raceStartDistance = 0;
    this.isCountingDown = false;
    this.countdownValue = 0;
    this.aiOpponent = null;
    this.deathInRaceMode = false; // Track if death happened during race

    // Collision effects
    this.screenShake = {
      intensity: 0,
      duration: 0,
      offset: { x: 0, y: 0 },
    };

    // Death animation system
    this.deathAnimation = null;
    this.isDead = false;
    this.respawnTimer = 0;

    // Multiplayer
    this.multiplayer = null;
    this.isMultiplayerEnabled = config.multiplayer || false;

    // Initialize performance manager - add error handling
    try {
      this.performanceManager = new PerformanceManager();
      this.currentConfig = this.performanceManager.getConfig();
    } catch (error) {
      console.error("Performance manager failed, using defaults:", error);
      this.performanceManager = null;
      this.currentConfig = {
        antialias: true,
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        shadowType: THREE.PCFShadowMap,
        shadowMapSize: 2048,
        maxVehicles: 25,
        physicallyCorrectLights: false,
        toneMapping: THREE.ACESFilmicToneMapping,
      };
    }

    // Store bound event handlers for cleanup
    this.boundHandleResize = () => this.onResize();
    this.boundHandleKeyDown = (e) => this.handleKeyDown(e);
    this.boundHandleKeyUp = (e) => this.handleKeyUp(e);
    this.boundHandlePerformanceChange = (e) => this.handlePerformanceChange(e);

    // Track active timers to prevent memory leaks
    this.activeTimers = new Set();
    this.activeChatTimers = new Set();
    this.countdownInterval = null; // Track countdown intervals
    this.raceCountdownInterval = null; // Track race countdown intervals

    // Day/night cycle system (120-second full cycle)
    this.dayCycleEnabled = true; // Start ENABLED - automatic day/night cycle
    this.manualSunControl = false; // Automatic control by default - sun moves through cycle
    this.dayCycleDuration = 120.0; // 120 seconds for full day
    this.dayCycleTime = 15; // Current time in the cycle (0-120) - start at mid-dawn (15s)
    this.dayCycleTimeOfDay = 'day'; // Current time of day
    this.currentTimeOfDay = 'day'; // Current calculated time of day (for billboard lights, etc.)
    this.timesOfDay = ['dawn', 'day', 'dusk', 'night']; // Cycle order

    // Pre-allocate reusable objects for updateCamera to prevent memory leaks
    this._cameraUpdateObjects = {
      bikeMatrix: new THREE.Matrix4(),
      leanMatrix: new THREE.Matrix4(),
      offset: new THREE.Vector3(),
      targetCameraPos: new THREE.Vector3(),
      targetLookAt: new THREE.Vector3(),
      lookOffset: new THREE.Vector3(),
      up: new THREE.Vector3(),
      forward: new THREE.Vector3(),
    };

    // Pre-allocate temp vectors for death animation
    this._tempVelocity = new THREE.Vector3();
    this._tempDeathPosition = new THREE.Vector3();

    // Initialize game systems
    this.introAnimation = null;
    this.playerSelection = null;
    // powerupSystem removed
    this.gameStarted = false;

    // Initialize components
    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.setupPostProcessing();
    this.initDevMenu();
    this.initLights();

    // Show intro FIRST, then show selection with desert background
    this.showIntroAndSelection(() => {
      // After selection, initialize player-specific components
      this.initPhysics();

      // Debug: Check if UFO exists
      console.log('AT GAME START:', {
        ufoController: !!this.ufoController,
        ufo: !!this.ufo,
        ufoControllerUfo: this.ufoController ? !!this.ufoController.ufo : 'no controller'
      });

      // Position UFO same as respawn does
      if (this.ufoController && this.ufo) {
        // Make sure ufoController and game both reference the same UFO
        if (this.ufoController.ufo !== this.ufo) {
          this.ufoController.ufo = this.ufo;
        }

        // Reset UFO state
        this.ufoController.escapeAnimationRunning = false;
        this.ufoController.isEscaping = false;

        // Position UFO like respawn does - ahead of player
        this.ufo.position.set(0, 30, 200);
        this.ufo.rotation.set(0, 0, 0);
        this.ufo.visible = true;

        // Make sure UFO is in the scene (might have been removed during fly-away)
        if (!this.scene.children.includes(this.ufo)) {
          this.scene.add(this.ufo);
          console.log('Re-added UFO to scene after fly-away');
        }

        // Make sure all UFO materials are visible - match respawn code exactly
        this.ufo.traverse((child) => {
          if (child.isMesh) {
            child.visible = true;
          }
          if (child.material) {
            const isGlow = child.material.side === THREE.BackSide;
            child.material.opacity = isGlow ? 0.2 : 1.0;
            child.material.transparent = true;  // respawn sets all to true
            child.material.needsUpdate = true;
          }
        });

        console.log('UFO positioned at start:', this.ufo.position, 'visible:', this.ufo.visible, 'in scene:', this.scene.children.includes(this.ufo));
      } else {
        console.error('NO UFO TO POSITION!');
      }

      this.initControls();
      this.initHUD();
      this.initDeathAnimation();
      this.initAudio();
      this.initBloodTrackSystem();
      this.initMinimap();
      // Powerup system removed

      // Initialize multiplayer first, then traffic (for synchronization)
      if (this.isMultiplayerEnabled) {
        this.initMultiplayer().then(() => {
          this.initTraffic();
        });
      } else {
        this.initTraffic();
      }

      this.gameStarted = true;
    });

    // Start game loop - delay slightly to ensure all materials are initialized
    this.lastTime = performance.now();
    requestAnimationFrame(() => this.animate());
  }

  initRenderer() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: this.currentConfig.antialias,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false, // Allow fallback to software rendering
        preserveDrawingBuffer: false, // Better performance
        stencil: false, // Not needed, saves memory
      });
    } catch (error) {
      console.error("WebGL initialization failed:", error);
      // Show error message to user
      const errorDiv = document.createElement("div");
      errorDiv.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        text-align: center;
        font-family: Arial, sans-serif;
      `;
      errorDiv.innerHTML = `
        <h2>WebGL Error</h2>
        <p>Unable to initialize WebGL. Please try:</p>
        <ul style="text-align: left;">
          <li>Refreshing the page</li>
          <li>Closing other browser tabs</li>
          <li>Enabling hardware acceleration in browser settings</li>
          <li>Using a different browser (Chrome/Firefox/Edge recommended)</li>
        </ul>
      `;
      this.container.appendChild(errorDiv);
      throw error;
    }

    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(this.currentConfig.pixelRatio);

    // Dynamic shadow settings based on performance
    this.renderer.shadowMap.enabled = this.currentConfig.shadowMapSize > 0;
    this.renderer.shadowMap.type = this.currentConfig.shadowType;
    this.renderer.shadowMap.autoUpdate = false; // Manual updates for performance
    this.shadowUpdateTimer = 0;
    this.shadowUpdateInterval = 0.1; // Update shadows every 100ms instead of every frame

    // Dynamic tone mapping based on performance
    this.renderer.toneMapping = this.currentConfig.toneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Dynamic lighting based on performance
    this.renderer.physicallyCorrectLights =
      this.currentConfig.physicallyCorrectLights;
    this.renderer.outputEncoding = THREE.sRGBEncoding;

    // Soft sky color
    this.renderer.setClearColor(0x87ceeb, 1);
    this.container.appendChild(this.renderer.domElement);

    // Handle resize and performance changes
    window.addEventListener("resize", this.boundHandleResize);
    window.addEventListener(
      "performanceChanged",
      this.boundHandlePerformanceChange
    );

    // CRITICAL: Handle WebGL context loss to prevent crashes
    this.boundHandleContextLost = (e) => {
      e.preventDefault();
      console.error("WebGL context lost! Stopping render loop.");
      this.isPaused = true;
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      // Show user message
      this.showGameMessage("Graphics error - Please refresh the page", "death");
    };

    this.boundHandleContextRestored = () => {
      console.log("WebGL context restored");
      this.initRenderer();
      this.isPaused = false;
      this.animate();
    };

    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.boundHandleContextLost
    );
    this.renderer.domElement.addEventListener(
      "webglcontextrestored",
      this.boundHandleContextRestored
    );
  }

  setupPostProcessing() {
    // Create the effect composer
    this.composer = new EffectComposer(this.renderer);

    // Add the render pass (renders the actual scene)
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Add the heat haze shader pass
    this.heatHazePass = new ShaderPass(HeatHazeShader);
    this.heatHazePass.uniforms.distortionAmount.value = 0.05;
    this.heatHazePass.uniforms.speed.value = 1.0;
    this.heatHazePass.uniforms.scale.value = 2.0;
    this.heatHazePass.uniforms.heightFactor.value = 0.5;
    this.heatHazePass.enabled = false; // Start disabled
    this.composer.addPass(this.heatHazePass);

    // Add the heat haze v2 shader pass
    this.heatHazeV2Pass = new ShaderPass(HeatHazeShaderV2);
    this.heatHazeV2Pass.uniforms.distortionAmount.value = 0.03;
    this.heatHazeV2Pass.uniforms.frequency.value = 4.0;
    this.heatHazeV2Pass.uniforms.speed.value = 1.5;
    this.heatHazeV2Pass.uniforms.heightFactor.value = 0.5;
    this.heatHazeV2Pass.uniforms.bikeExclusionRadius.value = 0.15;
    this.heatHazeV2Pass.enabled = true; // Start enabled
    this.composer.addPass(this.heatHazeV2Pass);

    // Add output pass (required for proper rendering in Three.js r150+)
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    // Initialize time for animation
    this.heatHazeTime = 0;
  }

  initDevMenu() {
    this.devMenu = new DevMenu(this);

    // Add heat haze effect controls
    this.devMenu.addEffect({
      name: 'Heat Haze',
      enabled: false,
      onChange: (enabled) => {
        this.heatHazePass.enabled = enabled;
      },
      parameters: [
        {
          name: 'Distortion',
          value: 0.05,
          min: 0,
          max: 0.3,
          step: 0.01,
          onChange: (value) => {
            this.heatHazePass.uniforms.distortionAmount.value = value;
          }
        },
        {
          name: 'Speed',
          value: 1.0,
          min: 0,
          max: 5.0,
          step: 0.1,
          onChange: (value) => {
            this.heatHazePass.uniforms.speed.value = value;
          }
        },
        {
          name: 'Scale',
          value: 2.0,
          min: 0.5,
          max: 10.0,
          step: 0.1,
          onChange: (value) => {
            this.heatHazePass.uniforms.scale.value = value;
          }
        },
        {
          name: 'Height',
          value: 0.5,
          min: 0,
          max: 1.0,
          step: 0.05,
          onChange: (value) => {
            this.heatHazePass.uniforms.heightFactor.value = value;
          }
        }
      ]
    });

    // Add heat haze v2 effect controls
    this.devMenu.addEffect({
      name: 'Heat Haze v2 (Horizontal)',
      enabled: true,
      onChange: (enabled) => {
        this.heatHazeV2Pass.enabled = enabled;
      },
      parameters: [
        {
          name: 'Distortion',
          value: 0.03,
          min: 0,
          max: 0.2,
          step: 0.01,
          onChange: (value) => {
            this.heatHazeV2Pass.uniforms.distortionAmount.value = value;
          }
        },
        {
          name: 'Frequency',
          value: 4.0,
          min: 1.0,
          max: 20.0,
          step: 0.5,
          onChange: (value) => {
            this.heatHazeV2Pass.uniforms.frequency.value = value;
          }
        },
        {
          name: 'Speed',
          value: 1.5,
          min: 0,
          max: 5.0,
          step: 0.1,
          onChange: (value) => {
            this.heatHazeV2Pass.uniforms.speed.value = value;
          }
        },
        {
          name: 'Height',
          value: 0.5,
          min: 0,
          max: 1.0,
          step: 0.05,
          onChange: (value) => {
            this.heatHazeV2Pass.uniforms.heightFactor.value = value;
          }
        },
        {
          name: 'Bike Exclusion',
          value: 0.15,
          min: 0,
          max: 0.5,
          step: 0.01,
          onChange: (value) => {
            this.heatHazeV2Pass.uniforms.bikeExclusionRadius.value = value;
          }
        }
      ]
    });

    // Add time of day controls
    this.devMenu.addSection({
      name: 'Time of Day',
      buttons: [
        {
          label: '🌅 Dawn',
          onClick: () => {
            this.dayCycleEnabled = false; // Disable cycle when manually setting
            this.manualSunControl = true; // Use exact preset sun position
            this.setTimeOfDay('dawn');
          }
        },
        {
          label: '☀️ Day',
          onClick: () => {
            this.dayCycleEnabled = false;
            this.manualSunControl = true; // Use exact preset sun position
            this.setTimeOfDay('day');
          }
        },
        {
          label: '🌇 Dusk',
          onClick: () => {
            this.dayCycleEnabled = false;
            this.manualSunControl = true; // Use exact preset sun position
            this.setTimeOfDay('dusk');
          }
        },
        {
          label: '🌙 Night',
          onClick: () => {
            this.dayCycleEnabled = false;
            this.manualSunControl = true; // Use exact preset sun position
            this.setTimeOfDay('night');
          }
        },
        {
          label: () => this.dayCycleEnabled ? '⏸️ Stop Cycle' : '▶️ Start Cycle (60s)',
          onClick: () => {
            this.dayCycleEnabled = !this.dayCycleEnabled;
            if (this.dayCycleEnabled) {
              this.manualSunControl = false; // Allow automatic sun positioning
              console.log('Day/night cycle started (60s per day)');
            } else {
              console.log('Day/night cycle stopped');
            }
          }
        }
      ]
    });

    // Add debug options
    this.devMenu.addSection({
      name: 'Debug Options',
      buttons: [
        {
          label: () => this.trafficSystem?.debugBoundingBoxes ? '✅ Hide Collision Boxes' : '📦 Show Collision Boxes',
          onClick: () => {
            if (this.trafficSystem) {
              const newState = !this.trafficSystem.debugBoundingBoxes;
              this.trafficSystem.setDebugBoundingBoxes(newState);
              console.log(`Vehicle collision boxes: ${newState ? 'ON' : 'OFF'}`);
            }
          }
        }
      ]
    });
  }

  initScene() {
    this.scene = new THREE.Scene();
    // Fog color will be set naturally in initLights() based on sun position
    this.scene.fog = new THREE.Fog(0x000000, 200, 3000); // Extended fog distance from 1000 to 3000

    // Ensure sky object is null to prevent shader errors
    this.sky = null;

    // Sky is now handled by BackgroundSystem - commenting out duplicate
    /*
    const skyGeo = new THREE.SphereGeometry(10000, 32, 15); // Increased from 2000 to 10000
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0077be) },
        bottomColor: { value: new THREE.Color(0xffffff) },
        offset: { value: 100 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.sky);
    */
  }

  initCamera() {
    // Third person camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.width / this.height,
      0.1,
      2000
    );

    // Camera mode
    this.isFirstPerson = false;

    // Third person camera positions - closer to bike for high speed
    this.thirdPersonOffset = new THREE.Vector3(0, 2, -4); // Moved closer from -6 to -4
    this.thirdPersonLookOffset = new THREE.Vector3(0, 1, 5); // Look closer too

    // First person camera positions (rider POV)
    this.firstPersonOffset = new THREE.Vector3(0, 0.9, 0.3); // Lower, more realistic rider height
    this.firstPersonLookOffset = new THREE.Vector3(0, 0.6, 8); // Look ahead at road level

    // Current camera offsets (will switch between modes)
    this.cameraOffset = this.thirdPersonOffset.clone();
    this.cameraLookOffset = this.thirdPersonLookOffset.clone();

    // Smooth camera movement - initialize to player starting position
    const initialPlayerPos = { x: -8.5, y: 0.3, z: 0 }; // Match SimpleBikePhysics starting position
    this.cameraPosition = new THREE.Vector3(
      initialPlayerPos.x + this.thirdPersonOffset.x,
      initialPlayerPos.y + this.thirdPersonOffset.y + 1,
      initialPlayerPos.z + this.thirdPersonOffset.z
    );
    this.cameraTarget = new THREE.Vector3(
      initialPlayerPos.x + this.thirdPersonLookOffset.x,
      initialPlayerPos.y + this.thirdPersonLookOffset.y,
      initialPlayerPos.z + this.thirdPersonLookOffset.z
    );

    // Set initial camera position immediately
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraTarget);
  }

  initLights() {
    // Initialize comprehensive memory profiler after scene and camera are ready
    const profilerConfig = {
      enableServerLogging: true,
      sessionId: this.config.sessionId || `game-${Date.now()}`,
      playerId:
        this.config.playerId ||
        `player-${Math.random().toString(36).substring(7)}`,
      serverUrl:
        window.location.hostname === "localhost"
          ? "http://localhost:8080"
          : "https://motosai-websocket-9z3mknbcfa-uw.a.run.app",
    };

    // 🚨 EMERGENCY: Memory Profiler disabled - may be causing its own leak
    console.error("🚨 MemoryProfiler DISABLED due to catastrophic leak");
    // this.memoryProfiler = new MemoryProfiler(this.renderer, this.scene, this.camera, profilerConfig);
    console.log("%c📡 Real-time monitoring enabled", "color: #00ff00");

    // Ambient light (color will be set by natural lighting calculation)
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.ambientLight);

    // Main sun light - HIGH NOON position for blue sky start
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sunLight.position.set(0, 200, 100);  // High overhead for beautiful blue sky
    this.sunLight.castShadow = true;

    // Enhanced shadow settings for better quality
    this.sunLight.shadow.camera.left = -60;
    this.sunLight.shadow.camera.right = 60;
    this.sunLight.shadow.camera.top = 60;
    this.sunLight.shadow.camera.bottom = -60;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 300;
    this.sunLight.shadow.mapSize.width = this.currentConfig.shadowMapSize;
    this.sunLight.shadow.mapSize.height = this.currentConfig.shadowMapSize;
    this.sunLight.shadow.radius = 3; // Softer shadow edges
    this.sunLight.shadow.blurSamples = 12; // More samples for smoother shadows
    this.sunLight.shadow.bias = 0.0008; // Fine-tuned bias
    this.sunLight.shadow.normalBias = 0.04;
    this.scene.add(this.sunLight);

    // Hemisphere light for soft sky lighting
    this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.55);
    this.scene.add(this.hemiLight);

    // Subtle fill light to soften harsh shadows
    this.fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.35);
    this.fillLight.position.set(-50, 80, -50);
    this.scene.add(this.fillLight);

    // Add subtle rim light for edge definition
    this.rimLight = new THREE.DirectionalLight(0xffd9cc, 0.25);
    this.rimLight.position.set(-80, 100, -80);
    this.scene.add(this.rimLight);

    // Calculate and apply natural lighting based on initial sun position
    // Reuse array to avoid allocations
    if (!this._tempSunPosition) this._tempSunPosition = [0, 0, 0];
    this._tempSunPosition[0] = this.sunLight.position.x;
    this._tempSunPosition[1] = this.sunLight.position.y;
    this._tempSunPosition[2] = this.sunLight.position.z;
    const naturalLighting = this.calculateNaturalLighting(this._tempSunPosition);

    // Apply natural colors immediately for consistent appearance before player select
    this.ambientLight.color.setHex(naturalLighting.ambientColor);
    this.ambientLight.intensity = naturalLighting.ambientIntensity;
    this.sunLight.color.setHex(naturalLighting.sunColor);
    this.sunLight.intensity = naturalLighting.sunIntensity;
    this.hemiLight.color.setHex(naturalLighting.hemiSky);
    this.hemiLight.groundColor.setHex(naturalLighting.hemiGround);
    this.hemiLight.intensity = naturalLighting.hemiIntensity;
    this.fillLight.color.setHex(naturalLighting.fillColor);
    this.fillLight.intensity = naturalLighting.fillIntensity;
    this.rimLight.color.setHex(naturalLighting.fillColor);
    this.rimLight.intensity = naturalLighting.fillIntensity * 0.5;

    // Update scene fog and background color to match sky
    this.scene.fog.color.setHex(naturalLighting.sky);
    this.renderer.setClearColor(naturalLighting.sky);

    console.log('Initial lighting set naturally from sun position');
  }

  initPhysics() {
    // Use new simple physics by default
    this.useSimplePhysics = true;
    this.physics = new SimpleBikePhysics();

    // Keep old physics for comparison if needed
    this.useV2Physics = false;

    // Initialize input controller with mobile support
    // Note: Simple physics doesn't use InputController, only complex physics does
    this.inputController = new InputController({ isMobile: this.isMobile });

    console.log('🎮 Physics initialized (Simple), Input controller ready for mobile:', this.isMobile);

    // Create motorcycle mesh (low poly)
    this.createMotorcycle();
  }

  // Calculate CINEMATIC atmospheric lighting based on sun position
  calculateNaturalLighting(sunPosition) {
    const sunX = sunPosition[0];
    const sunY = sunPosition[1];
    const sunZ = sunPosition[2];

    // Calculate sun elevation angle (0 = horizon, 90 = zenith)
    const sunDistance = Math.sqrt(sunX * sunX + sunY * sunY + sunZ * sunZ);
    const elevationAngle = Math.asin(sunY / sunDistance) * (180 / Math.PI); // Convert to degrees

    // Normalize elevation: -90 to 90 -> 0 to 1 (0 = below horizon, 0.5 = horizon, 1 = zenith)
    const elevationNorm = (elevationAngle + 90) / 180;

    // CINEMATIC Night - properly DARK with subtle moonlight
    const isNight = elevationAngle < -5;

    if (isNight) {
      return {
        sky: 0x050A1C,  // Much darker midnight blue
        ambientColor: 0x1A2040,  // Very dark blue ambient
        ambientIntensity: 0.04,  // VERY LOW - properly dark night
        sunColor: 0x6B7FA8,  // Dim cool moonlight
        sunIntensity: 0.15,  // Very subtle moonlight
        hemiSky: 0x0D1528,  // Dark night sky
        hemiGround: 0x020408,  // Nearly black ground
        hemiIntensity: 0.08,  // Minimal hemisphere light
        fillColor: 0x1A2545,  // Dark blue fill
        fillIntensity: 0.03,  // Barely visible fill
        starfieldVisible: true
      };
    }

    // CINEMATIC GOLDEN HOUR detection (low sun = epic orange/gold)
    const isGoldenHour = elevationAngle >= -5 && elevationAngle < 25;

    // Calculate atmospheric scattering - more dramatic curve for cinematic look
    const atmosphericThickness = 1.0 - Math.pow(elevationNorm, 0.4); // Steeper curve = more dramatic

    if (isGoldenHour) {
      // EPIC GOLDEN HOUR - saturated oranges and golds
      const goldenHourStrength = 1.0 - (elevationAngle + 5) / 30; // 1.0 at horizon, 0.0 at 25°

      // Intense golden sun color
      const sunR = 255;
      const sunG = Math.round(140 + goldenHourStrength * 30); // Deep orange at horizon
      const sunB = Math.round(30 + goldenHourStrength * 10); // Very little blue
      const sunColor = (sunR << 16) | (sunG << 8) | sunB;

      // Epic orange/pink sky
      const skyR = Math.round(255 - goldenHourStrength * 30);
      const skyG = Math.round(120 + goldenHourStrength * 40); // Peachy at low angle
      const skyB = Math.round(60 + goldenHourStrength * 50); // Purple tints
      const skyColor = (skyR << 16) | (skyG << 8) | skyB;

      // Warm ambient glow
      const ambR = 255;
      const ambG = Math.round(180 + goldenHourStrength * 20);
      const ambB = Math.round(100 + goldenHourStrength * 30);
      const ambientColor = (ambR << 16) | (ambG << 8) | ambB;

      // Dramatic sun intensity during golden hour
      const sunIntensity = 1.8 + goldenHourStrength * 0.8;
      const ambientIntensity = 0.15 + goldenHourStrength * 0.15;

      return {
        sky: skyColor,
        ambientColor: ambientColor,
        ambientIntensity: ambientIntensity,
        sunColor: sunColor,
        sunIntensity: sunIntensity,
        hemiSky: skyColor,
        hemiGround: 0x4A3520,  // Warm brown ground
        hemiIntensity: 0.35 + goldenHourStrength * 0.25,
        fillColor: ambientColor,
        fillIntensity: 0.25 + goldenHourStrength * 0.15,
        starfieldVisible: false
      };
    }

    // HIGH NOON - bright, high contrast, cooler colors
    // Interpolate sun color: becomes whiter/cooler at high angles
    const sunR = 255;
    const sunG = Math.round(250 - atmosphericThickness * 20); // Slight yellow
    const sunB = Math.round(245 - atmosphericThickness * 30); // Nearly white at zenith
    const sunColor = (sunR << 16) | (sunG << 8) | sunB;

    // Sky color: deep blue at high angles
    const skyR = Math.round(80 + atmosphericThickness * 60);
    const skyG = Math.round(160 + atmosphericThickness * 60);
    const skyB = Math.round(245 - atmosphericThickness * 30); // Rich blue
    const skyColor = (skyR << 16) | (skyG << 8) | skyB;

    // Ambient color - cooler at high sun
    const ambR = Math.round(240 + atmosphericThickness * 15);
    const ambG = Math.round(245 - atmosphericThickness * 10);
    const ambB = Math.round(255);
    const ambientColor = (ambR << 16) | (ambG << 8) | ambB;

    // DRAMATIC sun intensity - much stronger at zenith
    const sunIntensity = 1.5 + elevationNorm * 3.5; // Range: 1.5 to 5.0 (cinematic!)

    // Ambient intensity - significant variation for drama
    const ambientIntensity = 0.12 + elevationNorm * 0.45; // Range: 0.12 to 0.57

    return {
      sky: skyColor,
      ambientColor: ambientColor,
      ambientIntensity: ambientIntensity,
      sunColor: sunColor,
      sunIntensity: sunIntensity,
      hemiSky: skyColor,
      hemiGround: 0x7A6A55,  // Natural earth tone
      hemiIntensity: 0.3 + elevationNorm * 0.5,
      fillColor: ambientColor,
      fillIntensity: 0.15 + elevationNorm * 0.35,
      starfieldVisible: false
    };
  }

  setTimeOfDay(timeOfDay) {
    // Get current sun position (don't change it!)
    const currentSunPosition = this.sunLight ?
      [this.sunLight.position.x, this.sunLight.position.y, this.sunLight.position.z] :
      [0, 200, 100];

    // EPIC STYLIZED LIGHTING PRESETS - exact colors you wanted!
    const presets = {
      dawn: {
        // EPIC GOLDEN SUNRISE - intense warm glow
        sky: 0xFF6B4A,  // Vibrant orange-red
        ambientColor: 0xFFB380,  // Warm peachy glow
        ambientIntensity: 0.35,
        sunColor: 0xFFA040,  // Golden orange sun
        sunIntensity: 2.5,
        hemiSky: 0xFF8866,  // Warm orange sky
        hemiGround: 0x4A3020,  // Dark warm earth
        hemiIntensity: 0.6,
        fillColor: 0xFFCC99,  // Soft golden fill
        fillIntensity: 0.4,
        starfieldVisible: false
      },
      day: {
        // BRILLIANT BLUE DAY - vibrant and saturated
        sky: 0x4A9FFF,  // Rich saturated blue
        ambientColor: 0xE0F0FF,  // Cool bright ambient
        ambientIntensity: 0.65,
        sunColor: 0xFFFFF5,  // Brilliant white sun
        sunIntensity: 5.5,  // INTENSE!
        hemiSky: 0x5BB0FF,  // Bright sky blue
        hemiGround: 0xB8A890,  // Natural earth
        hemiIntensity: 0.9,
        fillColor: 0xCCE5FF,  // Cool blue fill
        fillIntensity: 0.55,
        starfieldVisible: false
      },
      dusk: {
        // EPIC SUNSET - dramatic purple and orange
        sky: 0xFF4466,  // Deep red-orange
        ambientColor: 0xFF8855,  // Fiery orange ambient
        ambientIntensity: 0.28,
        sunColor: 0xFF6633,  // Deep orange sun
        sunIntensity: 2.2,
        hemiSky: 0xCC4466,  // Purple-red sky
        hemiGround: 0x332211,  // Dark earth
        hemiIntensity: 0.5,
        fillColor: 0xFF9966,  // Warm orange fill
        fillIntensity: 0.35,
        starfieldVisible: false
      },
      night: {
        // DRAMATIC DARK NIGHT - proper darkness
        sky: 0x020510,  // Nearly black with blue tint
        ambientColor: 0x0A1530,  // Very dark blue
        ambientIntensity: 0.02,  // BARELY visible
        sunColor: 0x4060A0,  // Dim moonlight
        sunIntensity: 0.12,  // Very subtle
        hemiSky: 0x050A18,  // Dark night
        hemiGround: 0x000000,  // Pure black
        hemiIntensity: 0.05,
        fillColor: 0x0A1525,  // Dark blue fill
        fillIntensity: 0.02,
        starfieldVisible: true
      }
    };

    const preset = presets[timeOfDay];
    if (!preset) {
      console.error('Unknown time of day:', timeOfDay);
      return;
    }

    // Use exact preset colors, sun stays put
    const fullPreset = preset;
    fullPreset.sunPosition = currentSunPosition;

    // Initialize transition state if not exists
    if (!this.timeOfDayTransition) {
      this.timeOfDayTransition = {
        active: false,
        progress: 0,
        duration: 3.0, // 3 seconds for beautiful cinematic transition
        from: null,
        to: null
      };
    }

    // Start transition
    this.timeOfDayTransition.active = true;
    this.timeOfDayTransition.progress = 0;
    this.timeOfDayTransition.to = fullPreset;
    this.timeOfDayTransition.toTimeOfDay = timeOfDay; // Store time of day name

    // Capture current state as "from"
    this.timeOfDayTransition.from = {
      sky: this.skyDome ? this.skyDome.material.color.getHex() : fullPreset.sky,
      ambientColor: this.ambientLight ? this.ambientLight.color.getHex() : fullPreset.ambientColor,
      ambientIntensity: this.ambientLight ? this.ambientLight.intensity : fullPreset.ambientIntensity,
      sunColor: this.sunLight ? this.sunLight.color.getHex() : fullPreset.sunColor,
      sunIntensity: this.sunLight ? this.sunLight.intensity : fullPreset.sunIntensity,
      sunPosition: this.sunLight ? [this.sunLight.position.x, this.sunLight.position.y, this.sunLight.position.z] : fullPreset.sunPosition,
      hemiSky: this.hemiLight ? this.hemiLight.color.getHex() : fullPreset.hemiSky,
      hemiGround: this.hemiLight ? this.hemiLight.groundColor.getHex() : fullPreset.hemiGround,
      hemiIntensity: this.hemiLight ? this.hemiLight.intensity : fullPreset.hemiIntensity,
      fillColor: this.fillLight ? this.fillLight.color.getHex() : fullPreset.fillColor,
      fillIntensity: this.fillLight ? this.fillLight.intensity : fullPreset.fillIntensity,
      starfieldVisible: this.backgrounds && this.backgrounds.starfield ? this.backgrounds.starfield.visible : false
    };

    // Calculate elevation for logging (without storing intermediate objects)
    const sunDist = Math.sqrt(preset.sunPosition[0]**2 + preset.sunPosition[1]**2 + preset.sunPosition[2]**2);
    const elevation = Math.round(Math.asin(preset.sunPosition[1] / sunDist) * 180 / Math.PI);
    console.log(`Time of day transitioning to: ${timeOfDay} (sun elevation: ${elevation}°)`);
  }

  createMotorcycle() {
    // Use the bike selected from the player selection screen
    let bikeColor = 0xff0000; // default red
    let bikeStats = null;
    let modelPath = "/models/motor1.glb"; // default model

    if (this.selectedBike) {
      bikeColor = this.selectedBike.color;
      modelPath = this.selectedBike.modelPath || "/models/motor1.glb";
      bikeStats = {
        speed: this.selectedBike.speed,
        acceleration: this.selectedBike.acceleration,
        handling: this.selectedBike.handling,
      };
      console.log("Using selected bike:", this.selectedBike.name);
    } else {
      // Fallback to sessionStorage or default
      const selectedBikeData = sessionStorage.getItem("selectedBike");
      if (selectedBikeData) {
        try {
          const selectedBike = JSON.parse(selectedBikeData);
          bikeColor = selectedBike.color || 0xff0000;
          modelPath = selectedBike.modelPath || "/models/motor1.glb";
          console.log("Using bike from sessionStorage:", selectedBike.name);
        } catch (e) {
          console.warn("Failed to parse selected bike data:", e);
        }
      }
    }

    // Apply bike stats to physics if available
    if (bikeStats && this.physics) {
      this.physics.setBikeStats(bikeStats);
    }

    // Dispose of old motorcycle if it exists
    if (this.motorcycle) {
      // Dispose headlight and bulb first
      if (this.headlight) {
        this.headlight.dispose();
        this.headlight = null;
      }

      // Dispose bulb geometry and material
      if (this.motorcycle.userData.headlightBulb) {
        const bulb = this.motorcycle.userData.headlightBulb;
        if (bulb.geometry) bulb.geometry.dispose();
        if (bulb.material) bulb.material.dispose();
      }

      this.motorcycle.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => {
              if (m.map) m.map.dispose();
              if (m.normalMap) m.normalMap.dispose();
              if (m.roughnessMap) m.roughnessMap.dispose();
              if (m.metalnessMap) m.metalnessMap.dispose();
              m.dispose();
            });
          } else {
            if (child.material.map) child.material.map.dispose();
            if (child.material.normalMap) child.material.normalMap.dispose();
            if (child.material.roughnessMap) child.material.roughnessMap.dispose();
            if (child.material.metalnessMap) child.material.metalnessMap.dispose();
            child.material.dispose();
          }
        }
      });
      this.scene.remove(this.motorcycle);
      this.motorcycle = null;
    }

    // Try to reuse preloaded model to save memory
    const preloadedModel = window.__PRELOADED_BIKE_MODELS__ && window.__PRELOADED_BIKE_MODELS__["motor1"];

    if (preloadedModel) {
      // Clone the model but SHARE geometries and textures to save memory
      console.log("Reusing preloaded motor1 model (sharing geometries)");
      this.motorcycle = preloadedModel.clone(true); // deep clone
      this._setupMotorcycleModel(this.motorcycle, bikeColor);
    } else {
      // Load the GLB model fresh
      const loader = new GLTFLoader();
      loader.load(
        modelPath,
        (gltf) => {
          this.motorcycle = gltf.scene || gltf.scenes[0];

          console.log("GLB loaded fresh, checking for textures...");
          let textureCount = 0;
          gltf.scene.traverse((child) => {
            if (child.material) {
              if (child.material.map) textureCount++;
              if (child.material.normalMap) textureCount++;
            }
          });
          console.log(`Found ${textureCount} textures in GLB`);

          this._setupMotorcycleModel(this.motorcycle, bikeColor);
        },
        undefined,
        (error) => {
          console.error("Failed to load bike model, using fallback:", error);
          // Fallback to MotorcycleFactory
          this.motorcycle = MotorcycleFactory.createMotorcycle({
            bikeColor: bikeColor,
            riderColor: this.config.riderColor,
            includeRider: true,
          });

          this.steeringAssembly = this.motorcycle.userData.steeringAssembly;
          this.frontWheel = this.motorcycle.userData.frontWheel;
          this.rearWheel = this.motorcycle.userData.rearWheel;
          this.rider = this.motorcycle.userData.rider;

          this.scene.add(this.motorcycle);

          // Add headlight to fallback motorcycle
          this._addHeadlight();
        }
      );
    }
  }

  _addHeadlight() {
    if (!this.motorcycle) return;

    // Prevent duplicate headlights
    if (this.headlight) {
      console.warn('Headlight already exists, skipping');
      return;
    }

    // Add headlight (SpotLight) - conical beam angled down at road
    this.headlight = new THREE.SpotLight(0xffffff, 10.0, 100, Math.PI / 3.5, 0.4, 1.0);
    this.headlight.position.set(0, 1.0, 2.0); // Front of bike, elevated
    this.headlight.target.position.set(0, -0.5, 20); // Point down at road ahead
    this.headlight.castShadow = false; // Disable shadows for performance

    // Add headlight and its target to motorcycle so they move together
    this.motorcycle.add(this.headlight);
    this.motorcycle.add(this.headlight.target);

    // Add a visible bulb at the light position
    const bulbGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const bulbMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffee,
      emissive: 0xffffee,
      emissiveIntensity: 2.0
    });
    const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
    bulb.position.set(0, 1.0, 2.0);
    this.motorcycle.add(bulb);

    // Store reference
    this.motorcycle.userData.headlight = this.headlight;
    this.motorcycle.userData.headlightBulb = bulb;

    console.log('Headlight added - Intensity:', this.headlight.intensity);
  }

  // Shared function for applying color to motorcycles (used in game and preview)
  static applyBikeColor(model, bikeConfig, useMaterialManager = true) {
    const materialManager = useMaterialManager ? getMaterialManager() : null;

    // Support legacy single color or new 3-color theme
    const tankColor = bikeConfig.color || bikeConfig;
    const seatColor = bikeConfig.seatColor || tankColor;
    const tireColor = bikeConfig.tireColor || tankColor;

    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.castShadow = true;
        child.receiveShadow = true;

        // Get material and mesh names for intelligent coloring
        const materialName = child.material.name ? child.material.name.toLowerCase() : '';
        const meshName = child.name ? child.name.toLowerCase() : '';

        let targetColor = null;

        // Determine which color to use based on part
        if (materialName.includes('metal_red') || meshName.includes('tank')) {
          targetColor = tankColor; // Tank gets main bike color
        } else if (materialName.includes('leather') || meshName.includes('seat')) {
          targetColor = seatColor; // Seat gets seat color
        } else if (materialName.includes('tire')) {
          targetColor = tireColor; // Tires get tire color
        }

        // Apply color if we determined one
        if (child.material.color && targetColor !== null) {
          if (materialManager) {
            const sharedMaterial = materialManager.getMaterial('standard', {
              color: targetColor,
              metalness: child.material.metalness || 0.4,
              roughness: child.material.roughness || 0.3,
              emissive: targetColor,
              emissiveIntensity: 0.05, // Subtle glow
            });
            child.material = sharedMaterial;
          } else {
            // Direct color setting (for preview)
            child.material.color.setHex(targetColor);
            if (child.material.emissive) {
              child.material.emissive.setHex(targetColor);
              child.material.emissiveIntensity = 0.05;
            }
          }
        }
      }
    });
  }

  _setupMotorcycleModel(model, bikeColor) {
    // Scale to appropriate size (motor1.glb needs to be smaller)
    this.motorcycle.scale.setScalar(0.25);

    // Set initial position
    this.motorcycle.position.set(0, 0, 0);

    // Apply the selected bike color using shared function
    // Pass full selectedBike object if available for 3-color theme
    const bikeConfig = this.selectedBike || { color: bikeColor };
    MotosaiGame.applyBikeColor(this.motorcycle, bikeConfig, true);

    // Store references for animation (find wheels in the model)
    // Only use named objects - don't fallback to children to avoid rotating wrong parts
    this.frontWheel = this.motorcycle.getObjectByName("frontWheel");
    this.rearWheel = this.motorcycle.getObjectByName("rearWheel");

    // Store user data
    this.motorcycle.userData.frontWheel = this.frontWheel;
    this.motorcycle.userData.rearWheel = this.rearWheel;
    this.motorcycle.userData.originalColor = new THREE.Color(bikeColor);

    this.scene.add(this.motorcycle);

    // Add headlight
    this._addHeadlight();

    // Create rider using MotorcycleFactory
    this.rider = MotorcycleFactory.createRider(this.config.riderColor);
    this.rider.scale.setScalar(1.0 / 0.25); // Scale relative to bike's 0.25 scale
    this.rider.position.set(0, 1.2, -3.0); // Position on seat (negative Z = back)
    this.motorcycle.add(this.rider);
    this.motorcycle.userData.rider = this.rider;
  }

  initHighway() {
    this.highway = new Highway101(this.scene);
    this.highway.generate();

    // Initialize terrain system for Death Valley mountains
    this.terrain = new TerrainSystem(this.scene);
    this.terrain.generate();
  }

  initBillboards() {
    console.log('[INIT] Creating BillboardSystem...');
    this.billboardSystem = new BillboardSystem(this.scene);

    // Create test billboards for development
    // TODO: Replace with Supabase data loading
    this.billboardSystem.createTestBillboards(10, 500);

    console.log('[INIT] BillboardSystem created');
  }

  initBackgrounds() {
    try {
      console.log("[INIT] Creating BackgroundSystem...");
      this.backgrounds = new BackgroundSystem(this.scene, this.camera);
      console.log("[INIT] BackgroundSystem created successfully");

      // Update celestial positions based on current day cycle time (15s = mid-dawn)
      this.updateContinuousCelestialPositions();

      console.log("[INIT] Sky color and sun position set from day cycle time:", this.dayCycleTime);

      // Test with initial location (Death Valley) - this should trigger segment 0
      console.log("[INIT] Setting initial location to segment 0...");
      this.backgrounds.updateLocation(0, {
        lat: 36.4633,
        lng: -116.865,
        name: "Death Valley National Park",
      });
      console.log("[INIT] Initial location set");
    } catch (error) {
      console.error("Error creating BackgroundSystem:", error);
      this.backgrounds = null; // Prevent crashes in render loop
    }
  }

  initTraffic() {
    this.trafficSystem = new TrafficSystem(
      this.scene,
      this.highway,
      this.camera,
      this.bloodTrackSystem,
      this.multiplayer
    );
    this.trafficSystem.spawn(this.currentConfig.maxVehicles);

    // For backward compatibility
    this.traffic = this.trafficSystem;

    // Initialize vehicle pass counter, leaderboard, account modal, and placement toast
    this.vehiclePassCounter = new VehiclePassCounter(this);
    this.leaderboardUI = new LeaderboardUI(this);
    this.accountModal = new AccountModal(this);

    // Setup stats update interval (every 10 seconds)
    this.statsUpdateInterval = setInterval(() => {
      if (this.multiplayer?.socket && this.vehiclePassCounter) {
        this.multiplayer.socket.emit('stats-update', {
          stats: this.vehiclePassCounter.getSessionStats()
        });
      }
    }, 10000);

    // Listen for leaderboard events
    if (this.multiplayer?.socket) {
      this.multiplayer.socket.on('new-high-score', (data) => {
        if (this.leaderboardUI) {
          this.leaderboardUI.onNewHighScore(data);
        }
      });

      this.multiplayer.socket.on('player-stats-update', (data) => {
        if (this.leaderboardUI) {
          this.leaderboardUI.updateLiveEntry(
            data.playerId,
            data.username,
            data.vehiclesPassed
          );
        }
      });

      // Listen for score submission result
      this.multiplayer.socket.on('score-submitted', (result) => {
        console.log('Score submitted result:', result);

        // Update mobile stats display if on mobile
        if (this.vehiclePassCounter && this.vehiclePassCounter.isMobile) {
          this.vehiclePassCounter.fetchPlayerBest();
        }
      });
    }
  }

  initControls() {
    this.keys = {};

    // Keyboard controls
    this.boundHandleKeyDown = (e) => {
      // Toggle camera mode with spacebar (don't set keys[Space] to avoid brake interference)
      if (e.code === "Space") {
        e.preventDefault(); // Prevent page scroll
        this.toggleCameraMode();
        return; // Don't process space as a regular key
      }

      // Toggle dev HUD with H key
      if (e.code === "KeyH") {
        e.preventDefault();
        this.toggleDevHUD();
        return;
      }

      this.keys[e.code] = true;

      // Debug: Log throttle key presses
      if (e.code === "KeyW" || e.code === "ArrowUp") {
        console.log('🎮 Throttle key pressed:', e.code, 'keys:', this.keys);
      }

      // Gear shifting
      if (e.code === "KeyQ") {
        this.physics.setControls({ gearDown: true });
      } else if (e.code === "KeyE") {
        this.physics.setControls({ gearUp: true });
      } else if (e.code === "KeyV") {
        // Toggle physics version
        this.togglePhysicsVersion();
      } else if (e.code === "KeyM") {
        // Toggle mute
        this.toggleMute();
      }
    };

    this.boundHandleKeyUp = (e) => {
      this.keys[e.code] = false;

      if (e.code === "KeyQ") {
        this.physics.setControls({ gearDown: false });
      } else if (e.code === "KeyE") {
        this.physics.setControls({ gearUp: false });
      }
    };

    window.addEventListener("keydown", this.boundHandleKeyDown);
    window.addEventListener("keyup", this.boundHandleKeyUp);

    // Touch/mouse controls for mobile
    this.initTouchControls();
  }

  initTouchControls() {
    // Initialize mobile touch controls if on mobile device
    if (this.isMobile) {
      console.log('📱 Initializing mobile touch controls');

      // Initialize mobile controller with joystick layout
      this.mobileController = new MobileTouchController(this.container, {
        enabled: true,
        hapticFeedback: true,
        controlLayout: 'joystick', // or 'zones'
        sensitivity: {
          lean: 1.3, // Increased to 1.3 to compensate for InputController smoothing and reach max lean
          throttle: 1.0,
          brake: 1.0
        },
        onInputChange: (inputs) => {
          // Update InputController with mobile inputs
          if (this.inputController) {
            this.inputController.updateFromMobile(inputs);
          }
        }
      });

      // Prevent default touch behaviors
      DeviceDetection.preventZoom();
      DeviceDetection.preventScroll();

      console.log('✅ Mobile controls initialized');
    } else {
      // Desktop fallback - basic touch support for testing
      let touchStartX = 0;
      let touchStartY = 0;

      this.boundHandleTouchStart = (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      };

      this.boundHandleTouchMove = (e) => {
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;

        const deltaX = (touchX - touchStartX) / this.width;
        const deltaY = (touchY - touchStartY) / this.height;

        // Lean control
        this.physics.setControls({ lean: deltaX * 2 });

        // Throttle/brake
        if (deltaY < -0.1) {
          this.physics.setControls({ throttle: -deltaY });
        } else if (deltaY > 0.1) {
          this.physics.setControls({ frontBrake: deltaY });
        }
      };

      this.boundHandleTouchEnd = () => {
        this.physics.setControls({
          lean: 0,
          throttle: 0,
          frontBrake: 0,
        });
      };

      this.renderer.domElement.addEventListener(
        "touchstart",
        this.boundHandleTouchStart
      );
      this.renderer.domElement.addEventListener(
        "touchmove",
        this.boundHandleTouchMove
      );
      this.renderer.domElement.addEventListener(
        "touchend",
        this.boundHandleTouchEnd
      );
    }
  }

  initDeathAnimation() {
    this.deathAnimation = new DeathAnimation(this.scene);
  }

  initAudio() {
    this.audioManager = new AudioManager();
    // Start theme music
    this.audioManager.playTheme();
  }

  initBloodTrackSystem() {
    const performanceLevel = this.performanceManager
      ? this.performanceManager.performanceLevel
      : "high";
    this.bloodTrackSystem = new BloodTrackSystem(
      this.scene,
      false,
      performanceLevel
    );
  }

  initMinimap() {
    this.minimap = new Minimap(this.container, {
      width: 250,
      height: 50,
      position: { bottom: "80px", right: "20px" },
      showVehicles: true,
      viewDistance: 300,
    });

    // Set local player ID (use a default for now, will be updated in multiplayer)
    this.minimap.setLocalPlayer("local");
  }

  showIntroAndSelection(callback) {
    // Create UFO Race intro animation
    this.introAnimation = new UFORaceIntro(
      this.scene,
      this.camera,
      this.renderer
    );

    // Create player selection
    this.playerSelection = new PlayerSelection(
      this.scene,
      this.camera,
      this.renderer,
      this.audioManager,
      null // ufoController will be set after it's created
    );

    // Start intro animation - wait for user to click START GAME
    this.introAnimation.onStartGame = (selectedColor) => {
      console.log("User clicked START GAME with color:", selectedColor);

      // Store selected rider color
      this.config.riderColor = selectedColor;

      // Get UFO from intro before cleanup
      this.ufo = this.introAnimation.getUFO();

      // Clean up intro but keep the UFO
      this.introAnimation.cleanup(true);

      // Load desert/highway scene for bike selection
      this.initHighway();
      this.initBackgrounds();

      // Initialize Billboard System
      this.initBillboards();

      // Initialize UFOController with the UFO from intro BEFORE bike selection
      this.ufoController = new UFOController(this.scene);

      // Pass ufoController to playerSelection so it can animate the UFO
      this.playerSelection.ufoController = this.ufoController;

      if (this.ufo) {
        // Use UFO from intro
        this.ufoController.ufo = this.ufo;
        console.log('UFOController initialized with intro UFO');

        // Make sure UFO is in the scene
        if (!this.scene.children.includes(this.ufo)) {
          this.scene.add(this.ufo);
          console.log('UFO was not in scene, adding it now');
        }

        // Apply colorful materials to UFO (match intro)
        const colors = [
          { color: 0x00ffff, emissive: 0x00ffff }, // Cyan
          { color: 0xff00ff, emissive: 0xff00ff }, // Magenta
          { color: 0xffaa00, emissive: 0xffaa00 }, // Orange
          { color: 0x00ff88, emissive: 0x00ff88 }, // Green-cyan
          { color: 0xaa88ff, emissive: 0xaa88ff }, // Purple
        ];

        let colorIndex = 0;
        this.ufoController.ufo.traverse((child) => {
          if (child.isMesh) {
            // Skip the glow sphere (it has transparent material)
            if (child.material && child.material.transparent) {
              return;
            }

            const colorData = colors[colorIndex % colors.length];
            child.material = new THREE.MeshStandardMaterial({
              color: colorData.color,
              metalness: 0.9,
              roughness: 0.1,
              emissive: colorData.emissive,
              emissiveIntensity: 0.5
            });
            colorIndex++;
          }
        });

        // Add the effects
        this.ufoController.addGlow();
        this.ufoController.addParticleTrail();

        // Add bright point light around UFO
        const ufoLight = new THREE.PointLight(0xffffff, 100, 500);
        ufoLight.position.set(0, 0, 0);
        ufoLight.name = 'ufoMainLight';
        this.ufoController.ufo.add(ufoLight);
        console.log('UFO light added:', {
          intensity: ufoLight.intensity,
          color: ufoLight.color,
          distance: ufoLight.distance,
          ufoChildren: this.ufoController.ufo.children.length
        });

        // Scale it properly (smaller)
        this.ufoController.ufo.scale.setScalar(1);

        // Position immediately at starting position - close enough to see clearly at race start
        // Player spawns at x: -8.5, z: 0, so UFO should be ahead on same lane
        // Start UFO much closer (50 units ahead) so it's clearly visible at the start
        const playerSpawnZ = 0;
        const startDistance = 50; // Much closer than targetDistance (200) for visibility at start
        this.ufoController.ufo.position.set(0, 35, playerSpawnZ + startDistance);
        console.log('UFO positioned at start:', this.ufoController.ufo.position);
        console.log('UFO in scene?', this.scene.children.includes(this.ufoController.ufo));
        console.log('UFO scale:', this.ufoController.ufo.scale);
      } else {
        // Fallback: create UFO if intro didn't provide one
        this.ufoController.createFallbackUFO();
        this.ufo = this.ufoController.ufo;
        console.warn('Intro UFO not found, using fallback');
      }

      // Show player selection on top of desert
      this.playerSelection.showSelectionUI();

      // Set up selection callback
      this.playerSelection.onSelectionComplete = (selectedBike) => {
        console.log("Selected bike:", selectedBike);

        // Store selected bike for motorcycle creation
        this.selectedBike = selectedBike;

        // Hide selection UI
        this.playerSelection.hideSelectionUI();

        // UFO is already set up - just continue with game
        console.log('UFO in scene?', this.scene.children.includes(this.ufoController.ufo));

        // Continue with game initialization
        callback();
      };
    };

    // Start the intro
    this.introAnimation.start();
  }

  // Powerup system removed

  async initMultiplayer() {
    if (!this.isMultiplayerEnabled) return;

    this.multiplayer = new MultiplayerManager(this);

    try {
      // Connect with a default username for now
      const playerInfo = await this.multiplayer.connect();
      console.log(`Connected to multiplayer as ${playerInfo.username}`);

      // Update minimap with correct player ID
      if (this.minimap && this.multiplayer.playerId) {
        this.minimap.setLocalPlayer(this.multiplayer.playerId);
      }

      // Refresh leaderboard with player ID
      console.log('🔍 Checking leaderboard UI:', this.leaderboardUI, 'Player ID:', this.multiplayer.playerId);
      if (this.leaderboardUI) {
        this.leaderboardUI.onPlayerConnected();
      } else {
        console.warn('⚠️ Leaderboard UI not found when player connected');
      }

      // Add multiplayer status to HUD
      this.updateMultiplayerHUD();
    } catch (error) {
      console.error("Failed to connect to multiplayer:", error);
      this.isMultiplayerEnabled = false;
    }
  }

  updateMultiplayerHUD() {
    if (!this.multiplayer || !this.multiplayer.isConnected) return;

    // Create multiplayer HUD if it doesn't exist
    if (!this.multiplayerHUD) {
      this.multiplayerHUD = document.createElement("div");
      this.multiplayerHUD.style.position = "absolute";
      this.multiplayerHUD.style.top = "10px";
      this.multiplayerHUD.style.right = "10px";
      this.multiplayerHUD.style.color = "white";
      this.multiplayerHUD.style.fontFamily = "monospace";
      this.multiplayerHUD.style.fontSize = "12px";
      this.multiplayerHUD.style.textShadow = "2px 2px 4px rgba(0,0,0,0.5)";
      this.multiplayerHUD.style.textAlign = "right";
      this.container.appendChild(this.multiplayerHUD);
    }

    const players = this.multiplayer.getPlayerList();
    const playerListHTML = players
      .map(
        (p) =>
          `<div style="color: ${
            p.id === this.multiplayer.playerId ? "#00ff00" : "white"
          }">${p.username}</div>`
      )
      .join("");

    this.multiplayerHUD.innerHTML = `
      <div style="font-size: 14px; margin-bottom: 5px;">🏍️ Online Players (${players.length})</div>
      ${playerListHTML}
    `;
  }

  showGameMessage(message, type = "info") {
    // Use separate containers for death messages vs other messages
    let container;

    if (type === "death") {
      // Create death message container (top-left)
      if (!this.deathMessageContainer) {
        this.deathMessageContainer = document.createElement("div");
        this.deathMessageContainer.style.position = "absolute";
        this.deathMessageContainer.style.top = "80px";
        this.deathMessageContainer.style.left = "20px";
        this.deathMessageContainer.style.pointerEvents = "none";
        this.deathMessageContainer.style.zIndex = "1000";
        this.container.appendChild(this.deathMessageContainer);
      }
      container = this.deathMessageContainer;
    } else {
      // Create game message container (centered)
      if (!this.gameMessageContainer) {
        this.gameMessageContainer = document.createElement("div");
        this.gameMessageContainer.style.position = "absolute";
        this.gameMessageContainer.style.top = "50%";
        this.gameMessageContainer.style.left = "50%";
        this.gameMessageContainer.style.transform = "translate(-50%, -50%)";
        this.gameMessageContainer.style.pointerEvents = "none";
        this.gameMessageContainer.style.zIndex = "1000";
        this.container.appendChild(this.gameMessageContainer);
      }
      container = this.gameMessageContainer;
    }

    // Create message element
    const messageElement = document.createElement("div");
    messageElement.style.cssText = `
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 20px;
      margin: 5px 0;
      border-radius: 5px;
      font-family: 'Arial', sans-serif;
      font-size: 16px;
      font-weight: bold;
      text-align: center;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
    `;

    // Set color based on message type
    switch (type) {
      case "crash":
        messageElement.style.borderLeft = "5px solid #ff6600";
        messageElement.style.color = "#ffaa66";
        break;
      case "death":
        messageElement.style.borderLeft = "5px solid #ff0000";
        messageElement.style.color = "#ff6666";
        break;
      default:
        messageElement.style.borderLeft = "5px solid #00ff00";
        messageElement.style.color = "#66ff66";
    }

    messageElement.textContent = message;
    container.appendChild(messageElement);

    // Animate in
    const fadeInTimer = setTimeout(() => {
      messageElement.style.opacity = "1";
      this.activeTimers.delete(fadeInTimer);
    }, 50);
    this.activeTimers.add(fadeInTimer);

    // Animate out and remove after 3 seconds
    const fadeOutTimer = setTimeout(() => {
      messageElement.style.opacity = "0";
      const removeTimer = setTimeout(() => {
        if (messageElement.parentNode) {
          messageElement.parentNode.removeChild(messageElement);
        }
        this.activeTimers.delete(removeTimer);
      }, 300);
      this.activeTimers.add(removeTimer);
      this.activeTimers.delete(fadeOutTimer);
    }, 3000);
    this.activeTimers.add(fadeOutTimer);
  }

  displayChatMessage(data) {
    // Create chat message element
    const chatMsg = document.createElement("div");
    chatMsg.style.cssText = `
      position: absolute;
      bottom: 100px;
      left: 10px;
      color: white;
      font-family: monospace;
      font-size: 14px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.7);
      animation: fadeOut 5s forwards;
    `;
    chatMsg.textContent = `${data.username}: ${data.message}`;
    this.container.appendChild(chatMsg);

    // Remove after animation
    const removeTimer = setTimeout(() => {
      chatMsg.remove();
      this.activeChatTimers.delete(removeTimer);
    }, 5000);
    this.activeChatTimers.add(removeTimer);
  }

  showRaceSetup() {
    // Create non-intrusive compact panel in upper left
    const panel = document.createElement("div");
    panel.id = "race-setup-panel";
    panel.style.cssText = `
      position: absolute;
      top: 70px;
      left: 20px;
      background: rgba(30, 30, 30, 0.95);
      border: 2px solid white;
      border-radius: 10px;
      padding: 15px;
      z-index: 100;
      min-width: 200px;
    `;

    const title = document.createElement("div");
    title.textContent = "🏁 Race Setup";
    title.style.cssText =
      "color: white; font-size: 18px; font-weight: bold; margin-bottom: 10px;";
    panel.appendChild(title);

    // Race mode selection
    const modeLabel = document.createElement("label");
    modeLabel.textContent = "Mode:";
    modeLabel.style.cssText =
      "color: white; font-size: 14px; display: block; margin-bottom: 5px;";
    panel.appendChild(modeLabel);

    const modeSelect = document.createElement("select");
    modeSelect.style.cssText =
      "padding: 5px 10px; font-size: 14px; border-radius: 5px; width: 100%; margin-bottom: 10px;";
    modeSelect.innerHTML = `
      <option value="ai">vs AI</option>
      <option value="friend">vs Friend</option>
    `;
    panel.appendChild(modeSelect);

    // Player selection (only for friend mode)
    const playerLabel = document.createElement("label");
    playerLabel.textContent = "Select Player:";
    playerLabel.style.cssText =
      "color: white; font-size: 14px; display: none; margin-bottom: 5px;";
    panel.appendChild(playerLabel);

    const playerSelect = document.createElement("select");
    playerSelect.style.cssText =
      "padding: 5px 10px; font-size: 14px; border-radius: 5px; width: 100%; margin-bottom: 10px; display: none;";
    panel.appendChild(playerSelect);

    // Update player list when mode changes
    modeSelect.addEventListener("change", () => {
      const isFriendMode = modeSelect.value === "friend";
      playerLabel.style.display = isFriendMode ? "block" : "none";
      playerSelect.style.display = isFriendMode ? "block" : "none";

      if (isFriendMode && this.multiplayer) {
        // Populate online players
        playerSelect.innerHTML = '<option value="">Select a player...</option>';
        const players = this.multiplayer.getPlayerList();
        players.forEach((player) => {
          if (player.id !== this.multiplayer.playerId) {
            const option = document.createElement("option");
            option.value = player.id;
            option.textContent = player.username || `Player ${player.id}`;
            playerSelect.appendChild(option);
          }
        });
      }
    });

    // Race length selection
    const lengthLabel = document.createElement("label");
    lengthLabel.textContent = "Distance:";
    lengthLabel.style.cssText =
      "color: white; font-size: 14px; display: block; margin-bottom: 5px;";
    panel.appendChild(lengthLabel);

    const lengthSelect = document.createElement("select");
    lengthSelect.style.cssText =
      "padding: 5px 10px; font-size: 14px; border-radius: 5px; width: 100%; margin-bottom: 10px;";
    lengthSelect.innerHTML = `
      <option value="1">1 km</option>
      <option value="5">5 km</option>
      <option value="10">10 km</option>
    `;
    panel.appendChild(lengthSelect);

    // Buttons
    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText =
      "display: flex; gap: 10px; margin-top: 10px;";

    const startButton = document.createElement("button");
    startButton.textContent = "START";
    startButton.style.cssText = `
      padding: 8px 16px;
      font-size: 14px;
      font-weight: bold;
      color: white;
      background: #4CAF50;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      flex: 1;
    `;

    // Update button text based on mode
    const updateButtonText = () => {
      startButton.textContent = modeSelect.value === "friend" ? "INVITE" : "START";
    };
    modeSelect.addEventListener("change", updateButtonText);
    updateButtonText();

    startButton.addEventListener(
      "mouseenter",
      () => (startButton.style.background = "#45a049")
    );
    startButton.addEventListener(
      "mouseleave",
      () => (startButton.style.background = "#4CAF50")
    );
    startButton.addEventListener("click", () => {
      const mode = modeSelect.value;
      const distance = parseFloat(lengthSelect.value);

      if (mode === "friend") {
        const selectedPlayer = playerSelect.value;
        if (!selectedPlayer) {
          alert("Please select a player to race against");
          return;
        }
        this.sendRaceInvite(selectedPlayer, distance);
      } else {
        this.startRace(mode, distance);
      }
      panel.remove();
    });
    buttonContainer.appendChild(startButton);

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "CANCEL";
    cancelButton.style.cssText = `
      padding: 8px 16px;
      font-size: 14px;
      font-weight: bold;
      color: white;
      background: #f44336;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      flex: 1;
    `;
    cancelButton.addEventListener(
      "mouseenter",
      () => (cancelButton.style.background = "#da190b")
    );
    cancelButton.addEventListener(
      "mouseleave",
      () => (cancelButton.style.background = "#f44336")
    );
    cancelButton.addEventListener("click", () => panel.remove());
    buttonContainer.appendChild(cancelButton);

    panel.appendChild(buttonContainer);
    this.container.appendChild(panel);
  }

  sendRaceInvite(playerId, distance) {
    if (!this.multiplayer) return;

    console.log('Sending race invite to:', playerId, 'distance:', distance);

    // Send race invite via multiplayer
    this.multiplayer.sendMessage({
      type: "race-invite",
      from: this.multiplayer.playerId,
      to: playerId,
      distance: distance,
    });

    // Show waiting status
    this.showRaceInviteStatus("Invite sent... waiting for response");
  }

  showRaceInviteStatus(message) {
    const existingStatus = document.getElementById("race-invite-status");
    if (existingStatus) existingStatus.remove();

    const status = document.createElement("div");
    status.id = "race-invite-status";
    status.textContent = message;
    status.style.cssText = `
      position: absolute;
      top: 70px;
      left: 20px;
      padding: 10px 15px;
      background: rgba(102, 126, 234, 0.9);
      color: white;
      border-radius: 5px;
      font-size: 14px;
      z-index: 101;
    `;
    this.container.appendChild(status);

    setTimeout(() => status.remove(), 5000);
  }

  showRaceInvite(fromPlayerId, distance) {
    // Non-intrusive invite notification in upper left
    const invite = document.createElement("div");
    invite.id = "race-invite-notification";
    invite.style.cssText = `
      position: absolute;
      top: 70px;
      left: 20px;
      background: rgba(30, 30, 30, 0.95);
      border: 2px solid #667eea;
      border-radius: 10px;
      padding: 15px;
      z-index: 102;
      min-width: 200px;
    `;

    const title = document.createElement("div");
    title.textContent = "🏁 Race Invite!";
    title.style.cssText =
      "color: white; font-size: 16px; font-weight: bold; margin-bottom: 10px;";
    invite.appendChild(title);

    const message = document.createElement("div");
    message.textContent = `${fromPlayerId} wants to race ${distance}km`;
    message.style.cssText =
      "color: white; font-size: 14px; margin-bottom: 10px;";
    invite.appendChild(message);

    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText = "display: flex; gap: 10px;";

    const yesButton = document.createElement("button");
    yesButton.textContent = "YES";
    yesButton.style.cssText = `
      padding: 8px 16px;
      font-size: 14px;
      font-weight: bold;
      color: white;
      background: #4CAF50;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      flex: 1;
    `;
    yesButton.addEventListener("click", () => {
      this.acceptRaceInvite(fromPlayerId, distance);
      invite.remove();
    });
    buttonContainer.appendChild(yesButton);

    const noButton = document.createElement("button");
    noButton.textContent = "NO";
    noButton.style.cssText = `
      padding: 8px 16px;
      font-size: 14px;
      font-weight: bold;
      color: white;
      background: #f44336;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      flex: 1;
    `;
    noButton.addEventListener("click", () => {
      this.declineRaceInvite(fromPlayerId);
      invite.remove();
    });
    buttonContainer.appendChild(noButton);

    invite.appendChild(buttonContainer);
    this.container.appendChild(invite);

    // Auto-decline after 30 seconds
    setTimeout(() => {
      if (invite.parentElement) {
        this.declineRaceInvite(fromPlayerId);
        invite.remove();
      }
    }, 30000);
  }

  acceptRaceInvite(fromPlayerId, distance) {
    if (!this.multiplayer) return;

    // Send acceptance
    this.multiplayer.sendMessage({
      type: "race-accept",
      from: this.multiplayer.playerId,
      to: fromPlayerId,
      distance: distance,
    });

    // Start countdown
    this.startRaceCountdown(distance, fromPlayerId);
  }

  declineRaceInvite(fromPlayerId) {
    if (!this.multiplayer) return;

    this.multiplayer.sendMessage({
      type: "race-decline",
      from: this.multiplayer.playerId,
      to: fromPlayerId,
    });
  }

  startRaceCountdown(distance, opponentId = null) {
    // Show 3-2-1-GO countdown
    const countdown = document.createElement("div");
    countdown.id = "race-countdown";
    countdown.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 120px;
      font-weight: bold;
      color: white;
      text-shadow: 4px 4px 8px rgba(0, 0, 0, 0.8);
      z-index: 1000;
    `;
    this.container.appendChild(countdown);

    let count = 3;
    this.raceCountdownInterval = setInterval(() => {
      if (count > 0) {
        countdown.textContent = count;
        count--;
      } else {
        countdown.textContent = "GO!";
        clearInterval(this.raceCountdownInterval);
        this.raceCountdownInterval = null;
        setTimeout(() => {
          countdown.remove();
          this.startRace(opponentId ? "friend" : "ai", distance, opponentId);
        }, 500);
      }
    }, 1000);
  }

  startRace(raceType, raceDistanceKm) {
    this.raceMode = true;
    this.raceType = raceType;
    this.raceDistance = raceDistanceKm;

    // Reset distance to 0
    this.distance = 0;
    this.raceStartDistance = 0;

    // Hide race button during race
    if (this.raceButton) {
      this.raceButton.style.display = "none";
    }

    // Create AI opponent if vs AI
    if (raceType === "ai") {
      this.createAIOpponent();
    }

    // Start countdown
    this.startCountdown();
  }

  createAIOpponent() {
    // Create AI motorcycle
    const aiColor = 0x0000ff; // Blue bike for AI
    this.aiOpponent = MotorcycleFactory.createMotorcycle({
      bikeColor: aiColor,
      riderColor: 0x1a1a1a,
      includeRider: true,
    });

    // Position AI in adjacent lane
    const state = this.physics.getState();
    this.aiOpponent.position.set(state.position.x + 4, 0.3, state.position.z);
    this.scene.add(this.aiOpponent);

    // AI state
    this.aiOpponent.userData = {
      distance: 0,
      speed: 100 + Math.random() * 20, // 100-120 mph base speed
      frontWheel: this.aiOpponent.children.find(
        (c) => c.userData && c.userData.isFrontWheel
      ),
      rearWheel: this.aiOpponent.children.find(
        (c) => c.userData && c.userData.isRearWheel
      ),
    };
  }

  removeAIOpponent() {
    if (this.aiOpponent) {
      this.scene.remove(this.aiOpponent);
      this.aiOpponent.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      this.aiOpponent = null;
    }
  }

  startCountdown() {
    this.isCountingDown = true;
    this.countdownValue = 3;
    this.isPaused = true; // Pause game during countdown

    this.countdownInterval = setInterval(() => {
      if (this.countdownValue > 0) {
        this.showGameMessage(this.countdownValue.toString(), "info");
        if (this.audioManager) {
          this.audioManager.play("revEngine", { clone: true, volume: 0.3 });
        }
        this.countdownValue--;
      } else {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
        this.showGameMessage("GO!", "info");
        if (this.audioManager) {
          this.audioManager.play("revEngine", { clone: true, volume: 0.8 });
        }
        this.isCountingDown = false;
        this.isPaused = false; // Unpause game
      }
    }, 1000);
  }

  endRace(playerWon) {
    this.raceMode = false;
    this.isPaused = true; // Pause game

    // Create result overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    `;

    const resultPanel = document.createElement("div");
    resultPanel.style.cssText = `
      background: ${
        playerWon ? "rgba(76, 175, 80, 0.2)" : "rgba(244, 67, 54, 0.2)"
      };
      border: 5px solid ${playerWon ? "#4CAF50" : "#f44336"};
      border-radius: 20px;
      padding: 60px;
      text-align: center;
    `;

    const title = document.createElement("h1");
    title.textContent = playerWon ? "🏆 YOU WIN!" : "💀 YOU LOSE!";
    title.style.cssText = `
      color: ${playerWon ? "#4CAF50" : "#f44336"};
      font-size: 72px;
      margin-bottom: 20px;
      text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.5);
    `;
    resultPanel.appendChild(title);

    const message = document.createElement("p");
    const distanceKm = (this.distance * 0.0003048).toFixed(2);
    let messageText;
    if (this.raceType === "ai") {
      const aiDistanceKm = this.aiOpponent
        ? (this.aiOpponent.userData.distance * 0.0003048).toFixed(2)
        : "0.00";
      messageText = playerWon
        ? `You beat the AI! ${this.raceDistance}km completed!`
        : this.isDead
        ? `You crashed at ${distanceKm}km! AI won at ${aiDistanceKm}km.`
        : `AI finished first at ${this.raceDistance}km!`;
    } else {
      messageText = playerWon
        ? `You completed ${this.raceDistance}km!`
        : `You crashed at ${distanceKm}km!`;
    }
    message.textContent = messageText;
    message.style.cssText =
      "color: white; font-size: 24px; margin-bottom: 40px;";
    resultPanel.appendChild(message);

    const button = document.createElement("button");
    button.textContent = "BACK TO FREE RIDE";
    button.style.cssText = `
      padding: 20px 40px;
      font-size: 24px;
      font-weight: bold;
      color: white;
      background: #2196F3;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.3s;
    `;
    button.addEventListener(
      "mouseenter",
      () => (button.style.background = "#0b7dda")
    );
    button.addEventListener(
      "mouseleave",
      () => (button.style.background = "#2196F3")
    );
    button.addEventListener("click", () => {
      overlay.remove();
      this.exitRaceMode();
    });
    resultPanel.appendChild(button);

    overlay.appendChild(resultPanel);
    this.container.appendChild(overlay);

    // Play win/lose sound
    if (this.audioManager) {
      if (playerWon) {
        this.audioManager.play("revEngine", { clone: true, volume: 1.0 });
      } else {
        this.audioManager.play("explosionBloody", { clone: true, volume: 0.5 });
      }
    }
  }

  exitRaceMode() {
    this.raceMode = false;
    this.raceType = null;
    this.raceDistance = 0;
    this.isPaused = false;

    // Remove AI opponent
    this.removeAIOpponent();

    // Show race button again
    if (this.raceButton) {
      this.raceButton.style.display = "block";
    }

    // If player is dead, respawn them
    if (this.isDead) {
      this.respawnPlayer();
    }
  }

  initHUD() {
    // Create HUD overlay
    this.hud = document.createElement("div");
    this.hud.style.position = "absolute";
    this.hud.style.top = "10px";
    this.hud.style.left = "10px";
    this.hud.style.color = "white";
    this.hud.style.fontFamily = "monospace";
    this.hud.style.fontSize = "14px";
    this.hud.style.textShadow = "2px 2px 4px rgba(0,0,0,0.5)";
    this.hud.style.display = this.showDevHUD ? "block" : "none"; // Set initial visibility
    this.container.appendChild(this.hud);

    // Create race button
    this.raceButton = document.createElement("button");
    this.raceButton.textContent = "🏁 START RACE";
    this.raceButton.style.cssText = `
      position: absolute;
      top: 20px;
      left: 20px;
      padding: 12px 24px;
      font-size: 16px;
      font-weight: bold;
      color: white;
      background: rgba(255, 100, 0, 0.9);
      border: 2px solid white;
      border-radius: 8px;
      cursor: pointer;
      z-index: 100;
      transition: all 0.3s;
    `;
    this.raceButton.addEventListener("mouseenter", () => {
      this.raceButton.style.background = "rgba(255, 120, 20, 1)";
      this.raceButton.style.transform = "scale(1.05)";
    });
    this.raceButton.addEventListener("mouseleave", () => {
      this.raceButton.style.background = "rgba(255, 100, 0, 0.9)";
      this.raceButton.style.transform = "scale(1)";
    });
    this.raceButton.addEventListener("click", () => this.showRaceSetup());
    this.container.appendChild(this.raceButton);

    // Pre-create HUD elements to avoid innerHTML allocations
    this.hudElements = {};
    const hudLines = [
      "fps",
      "camera",
      "physics",
      "gear",
      "rpm",
      "lean",
      "turnRate",
      "wobble",
      "death",
      "distance",
      "score",
      "memoryUsage",
      "activeResources",
      "memoryLeaks",
    ];
    hudLines.forEach((line) => {
      const elem = document.createElement("div");
      this.hud.appendChild(elem);
      this.hudElements[line] = elem;
    });

    // FPS tracking variables
    this.fpsFrameCount = 0;
    this.fpsLastTime = performance.now();
    this.currentFPS = 0;

    // Speedometer
    this.speedometer = document.createElement("div");
    this.speedometer.style.position = "absolute";
    this.speedometer.style.bottom = "20px";
    this.speedometer.style.right = "20px";
    this.speedometer.style.fontSize = "48px";
    this.speedometer.style.fontWeight = "bold";
    this.speedometer.style.color = "white";
    this.speedometer.style.textShadow = "3px 3px 6px rgba(0,0,0,0.7)";
    this.container.appendChild(this.speedometer);
  }

  updateControls(deltaTime) {
    // Simple direct controls for our new physics
    if (!this.physics) {
      console.warn('⚠️ updateControls called but physics not initialized');
      return;
    }

    const controls = {
      throttle: 0,
      brake: 0,
      steer: 0,
    };

    // Check if we should use mobile input from InputController
    if (this.isMobile && this.inputController) {
      // Update the input controller to process raw inputs into smoothed outputs
      const state = this.physics.getState?.() || { speed: 0 };
      const speed = state.speed / 2.237; // Convert MPH to m/s
      this.inputController.update(deltaTime, speed);

      // Get smoothed inputs (it's a property, not a method)
      const smoothedInputs = this.inputController.smoothedInputs;

      controls.throttle = smoothedInputs.throttle || 0;
      // Use the maximum of front and rear brake for the combined brake value
      controls.brake = Math.max(smoothedInputs.frontBrake || 0, smoothedInputs.rearBrake || 0);
      controls.steer = smoothedInputs.steer || smoothedInputs.lean || 0;

      // Debug: Log when steering is applied
      if (Math.abs(controls.steer) > 0.1 && Math.random() < 0.05) {
        console.log('🎮 Applying steer:', controls.steer.toFixed(2), 'from smoothed:', (smoothedInputs.steer || 0).toFixed(2), 'lean:', (smoothedInputs.lean || 0).toFixed(2));
      }
    } else {
      // Desktop keyboard controls

      // Check throttle and brake - if both pressed, brake wins (safety first)
      const throttlePressed = this.keys["KeyW"] || this.keys["ArrowUp"];
      const brakePressed = this.keys["KeyS"] || this.keys["ArrowDown"] || this.keys["ShiftLeft"] || this.keys["ShiftRight"];

      // Brake has priority over throttle (safety first)
      if (brakePressed) {
        controls.brake = 1;
      } else if (throttlePressed) {
        controls.throttle = 1;
      }

      // Steering (left/right)
      if (this.keys["KeyA"] || this.keys["ArrowLeft"]) {
        controls.steer = -1; // Left
      } else if (this.keys["KeyD"] || this.keys["ArrowRight"]) {
        controls.steer = 1; // Right
      }
    }

    // Apply controls to physics
    this.physics.setControls(controls);
  }

  updateControlsComplex(deltaTime) {
    // Complex controls for old physics with InputController
    if (!this.physics) return; // Safety check
    const state = this.physics.getState();
    const speed = state.speed / 2.237; // Convert MPH to m/s

    const rawInputs = {
      throttle: 0,
      frontBrake: 0,
      rearBrake: 0,
      lean: 0,
      steer: 0,
    };

    // Throttle
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) {
      rawInputs.throttle = 1;
    }

    // Brakes (removed Space since it's now camera toggle, use Shift for front brake)
    // Match mobile brake values: frontBrake: 0.6, rearBrake: 0.8
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) {
      rawInputs.frontBrake = 0.6;
      rawInputs.rearBrake = 0.8;
    } else if (this.keys["ShiftLeft"] || this.keys["ShiftRight"]) {
      rawInputs.frontBrake = 1;
    }

    // Lean/Steer
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) {
      rawInputs.lean = -1;
      rawInputs.steer = -1;
    } else if (this.keys["KeyD"] || this.keys["ArrowRight"]) {
      rawInputs.lean = 1;
      rawInputs.steer = 1;
    }

    // Update input controller
    this.inputController.setRawInputs(rawInputs);
    const smoothedInputs = this.inputController.update(deltaTime, speed);

    // Apply smoothed inputs to physics
    this.physics.setControls({
      throttle: smoothedInputs.throttle,
      frontBrake: smoothedInputs.frontBrake,
      rearBrake: smoothedInputs.rearBrake,
      lean: smoothedInputs.lean,
      steer: smoothedInputs.steer,
      clutch: this.keys["ShiftLeft"] || false,
    });
  }

  updateUFO(deltaTime, state) {
    if (!this.ufoController || !this.ufo) {
      console.log('UFO update skipped:', { ufoController: !!this.ufoController, ufo: !!this.ufo });
      return;
    }

    // Use UFOController's update method
    // state.velocity is {x, y, z}, calculate magnitude manually
    const speed = Math.sqrt(
      state.velocity.x ** 2 +
      state.velocity.y ** 2 +
      state.velocity.z ** 2
    );
    this.ufoController.update(deltaTime, state.position, speed);
  }

  updateDayCycle(deltaTime) {
    if (!this.dayCycleEnabled) return;

    // Advance time in the cycle
    this.dayCycleTime += deltaTime;

    // Wrap around after 60 seconds
    if (this.dayCycleTime >= this.dayCycleDuration) {
      this.dayCycleTime -= this.dayCycleDuration;
    }

    // Continuously update sun/moon position and lighting based on cycle time
    this.updateContinuousCelestialPositions();
  }

  updateContinuousCelestialPositions() {
    // Sun completes a full circular orbit over 60 seconds
    // Moon is offset by 180 degrees (opposite side)

    const t = this.dayCycleTime;
    const cycleFraction = t / this.dayCycleDuration; // 0 to 1

    // Sun angle: 0 = east horizon (dawn), 0.25 = zenith (day), 0.5 = west horizon (dusk), 0.75 = nadir (night)
    const sunAngle = cycleFraction * Math.PI * 2; // 0 to 2π

    // Moon is always opposite the sun (180 degrees offset)
    const moonAngle = sunAngle + Math.PI;

    // Orbit parameters
    const orbitRadius = 1400;
    const horizonHeight = 30;  // Height at horizon
    const zenithHeight = 180;  // Height at zenith

    // Calculate sun position with more realistic elliptical arc
    // Camera faces west (negative Z), so:
    // Z: -100 at east (behind, sunrise), +100 at west (in front, sunset)
    // Y: low at horizon, high at zenith with slower rise/fall near horizon

    // Circular orbit - sun rises from horizon, peaks at zenith, sets below horizon
    const sunX = 0; // Keep sun aligned with camera view
    const sunY = Math.sin(sunAngle) * 150 + 30; // Circular arc: low at horizon, high at zenith
    const sunZ = -Math.cos(sunAngle) * 100; // -100 at dawn (east/behind), +100 at dusk (west/front)

    const moonX = 0;
    const moonY = Math.sin(moonAngle) * 150 + 30;
    const moonZ = -Math.cos(moonAngle) * 100;

    // Determine which celestial body should be visible and current period
    let currentPeriod, blendFactor;

    // Sun is visible even slightly below horizon for gradual sunset/sunrise
    const sunAboveHorizon = sunY > -50; // Keep visible as it descends below horizon
    const moonAboveHorizon = moonY > -50;

    if (t < 30) {
      currentPeriod = 'dawn';
      blendFactor = t / 30;
    } else if (t < 60) {
      currentPeriod = 'day';
      blendFactor = (t - 30) / 30;
    } else if (t < 90) {
      currentPeriod = 'dusk';
      blendFactor = (t - 60) / 30;
    } else {
      currentPeriod = 'night';
      blendFactor = (t - 90) / 30;
    }

    // Store current time of day for other systems (like billboard lights)
    this.currentTimeOfDay = currentPeriod;

    // Update directional light to follow the visible celestial body (only if not manually controlled)
    if (this.sunLight && !this.manualSunControl) {
      if (sunAboveHorizon) {
        this.sunLight.position.set(sunX, sunY, sunZ);
      } else {
        // During night, light comes from moon
        this.sunLight.position.set(moonX, moonY, moonZ);
      }
    }

    // Update background system with both sun and moon positions
    if (this.backgrounds) {
      this.backgrounds.setSunMoonPosition(
        [sunX, sunY, sunZ],
        currentPeriod,
        { moonX, moonY, moonZ, sunAboveHorizon, moonAboveHorizon }
      );
    }

    // Smoothly blend lighting colors based on current period (only if not manually controlled)
    if (!this.manualSunControl) {
      this.updateContinuousLighting(currentPeriod, blendFactor);
    }
  }

  updateContinuousLighting(period, blendFactor) {
    // EPIC PRESET COLORS - same as the buttons!
    const presets = {
      dawn: {
        sky: 0xFF6B4A,
        ambientColor: 0xFFB380,
        ambientIntensity: 0.35,
        sunColor: 0xFFA040,
        sunIntensity: 2.5,
        hemiSky: 0xFF8866,
        hemiGround: 0x4A3020,
        hemiIntensity: 0.6,
        fillColor: 0xFFCC99,
        fillIntensity: 0.4,
        starfieldVisible: false
      },
      day: {
        sky: 0x4A9FFF,
        ambientColor: 0xE0F0FF,
        ambientIntensity: 0.65,
        sunColor: 0xFFFFF5,
        sunIntensity: 5.5,
        hemiSky: 0x5BB0FF,
        hemiGround: 0xB8A890,
        hemiIntensity: 0.9,
        fillColor: 0xCCE5FF,
        fillIntensity: 0.55,
        starfieldVisible: false
      },
      dusk: {
        sky: 0xFF8833,          // Epic bright orange sky
        ambientColor: 0xFFAA55, // Golden orange ambient
        ambientIntensity: 0.32,
        sunColor: 0xFF6600,     // Deep epic orange sun
        sunIntensity: 2.8,      // Brighter for more drama
        hemiSky: 0xFF9944,      // Warm orange hemisphere
        hemiGround: 0x4A3020,   // Warm brown ground
        hemiIntensity: 0.6,
        fillColor: 0xFFBB66,    // Light golden orange fill
        fillIntensity: 0.4,
        starfieldVisible: false
      },
      night: {
        sky: 0x020510,
        ambientColor: 0x0A1530,
        ambientIntensity: 0.02,
        sunColor: 0x4060A0,
        sunIntensity: 0.12,
        hemiSky: 0x050A18,
        hemiGround: 0x000000,
        hemiIntensity: 0.05,
        fillColor: 0x0A1525,
        fillIntensity: 0.02,
        starfieldVisible: true
      }
    };

    const periodOrder = ['dawn', 'day', 'dusk', 'night'];
    const currentIndex = periodOrder.indexOf(period);
    const nextIndex = (currentIndex + 1) % periodOrder.length;

    const current = presets[period];
    const next = presets[periodOrder[nextIndex]];

    // Smooth easing for color transitions
    const easedBlend = this._easeInOutQuad(blendFactor);

    // Blend ALL the colors for EPIC transitions
    const skyColor = this._lerpColor(current.sky, next.sky, easedBlend);
    const ambientColor = this._lerpColor(current.ambientColor, next.ambientColor, easedBlend);
    const sunColor = this._lerpColor(current.sunColor, next.sunColor, easedBlend);
    const hemiSky = this._lerpColor(current.hemiSky, next.hemiSky, easedBlend);
    const hemiGround = this._lerpColor(current.hemiGround, next.hemiGround, easedBlend);
    const fillColor = this._lerpColor(current.fillColor, next.fillColor, easedBlend);

    const ambientIntensity = this._lerp(current.ambientIntensity, next.ambientIntensity, easedBlend);
    const sunIntensity = this._lerp(current.sunIntensity, next.sunIntensity, easedBlend);
    const hemiIntensity = this._lerp(current.hemiIntensity, next.hemiIntensity, easedBlend);
    const fillIntensity = this._lerp(current.fillIntensity, next.fillIntensity, easedBlend);

    // Apply to scene
    if (this.backgrounds) {
      this.backgrounds.setSkyColor(skyColor);

      // Starfield visibility
      const starfieldVisible = period === 'night' || (period === 'dusk' && blendFactor > 0.7);
      this.backgrounds.setStarfieldVisible(starfieldVisible);
    }

    if (this.scene && this.scene.fog) {
      this.scene.fog.color.setHex(skyColor);
    }
    if (this.renderer) {
      this.renderer.setClearColor(skyColor);
    }

    if (this.ambientLight) {
      this.ambientLight.color.setHex(ambientColor);
      this.ambientLight.intensity = ambientIntensity;
    }

    if (this.sunLight) {
      this.sunLight.color.setHex(sunColor);
      this.sunLight.intensity = sunIntensity;
    }

    // Update hemisphere light
    if (this.hemiLight) {
      this.hemiLight.color.setHex(hemiSky);
      this.hemiLight.groundColor.setHex(hemiGround);
      this.hemiLight.intensity = hemiIntensity;
    }

    // Update fill light
    if (this.fillLight) {
      this.fillLight.color.setHex(fillColor);
      this.fillLight.intensity = fillIntensity;
    }

    // Update rim light
    if (this.rimLight) {
      this.rimLight.color.setHex(fillColor);
      this.rimLight.intensity = fillIntensity * 0.5;
    }
  }

  // Helper method to lerp between two hex colors (avoid recreating function each frame)
  _lerpColor(color1, color2, t) {
    const r1 = (color1 >> 16) & 0xFF;
    const g1 = (color1 >> 8) & 0xFF;
    const b1 = color1 & 0xFF;

    const r2 = (color2 >> 16) & 0xFF;
    const g2 = (color2 >> 8) & 0xFF;
    const b2 = color2 & 0xFF;

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return (r << 16) | (g << 8) | b;
  }

  // Helper method to lerp numbers
  _lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Smooth easing function (ease-in-out)
  _easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  updateTimeOfDayTransition(deltaTime) {
    if (!this.timeOfDayTransition || !this.timeOfDayTransition.active) return;

    const transition = this.timeOfDayTransition;
    transition.progress += deltaTime / transition.duration;

    if (transition.progress >= 1.0) {
      // Transition complete
      transition.progress = 1.0;
      transition.active = false;
    }

    const eased = this._easeInOutQuad(transition.progress);
    const from = transition.from;
    const to = transition.to;

    // Update sky color
    if (this.backgrounds) {
      const skyColor = this._lerpColor(from.sky, to.sky, eased);
      this.backgrounds.setSkyColor(skyColor);

      // Update fog and renderer clear color
      if (this.scene && this.scene.fog) {
        this.scene.fog.color.setHex(skyColor);
      }
      if (this.renderer) {
        this.renderer.setClearColor(skyColor);
      }
    }

    // Update ambient light
    if (this.ambientLight) {
      const ambientColor = this._lerpColor(from.ambientColor, to.ambientColor, eased);
      this.ambientLight.color.setHex(ambientColor);
      this.ambientLight.intensity = this._lerp(from.ambientIntensity, to.ambientIntensity, eased);
    }

    // Update sun/moon light
    if (this.sunLight) {
      const sunColor = this._lerpColor(from.sunColor, to.sunColor, eased);
      this.sunLight.color.setHex(sunColor);
      this.sunLight.intensity = this._lerp(from.sunIntensity, to.sunIntensity, eased);

      // Lerp sun position
      this.sunLight.position.set(
        this._lerp(from.sunPosition[0], to.sunPosition[0], eased),
        this._lerp(from.sunPosition[1], to.sunPosition[1], eased),
        this._lerp(from.sunPosition[2], to.sunPosition[2], eased)
      );
    }

    // Update hemisphere light
    if (this.hemiLight) {
      const hemiSky = this._lerpColor(from.hemiSky, to.hemiSky, eased);
      const hemiGround = this._lerpColor(from.hemiGround, to.hemiGround, eased);
      this.hemiLight.color.setHex(hemiSky);
      this.hemiLight.groundColor.setHex(hemiGround);
      this.hemiLight.intensity = this._lerp(from.hemiIntensity, to.hemiIntensity, eased);
    }

    // Update fill light
    if (this.fillLight) {
      const fillColor = this._lerpColor(from.fillColor, to.fillColor, eased);
      this.fillLight.color.setHex(fillColor);
      this.fillLight.intensity = this._lerp(from.fillIntensity, to.fillIntensity, eased);
    }

    // Update rim light
    if (this.rimLight) {
      const rimColor = this._lerpColor(from.rimColor || from.fillColor, to.rimColor || to.fillColor, eased);
      this.rimLight.color.setHex(rimColor);
      this.rimLight.intensity = this._lerp(from.rimIntensity || 0.5, to.rimIntensity || 0.5, eased);
    }

    // Smooth starfield fade in/out
    if (this.backgrounds) {
      // Fade stars in during second half of transition to night
      // Fade stars out during first half of transition from night
      if (to.starfieldVisible && !from.starfieldVisible) {
        // Fading in - start at 50% progress
        const starAlpha = Math.max(0, (eased - 0.5) * 2);
        this.backgrounds.setStarfieldVisible(starAlpha > 0);
        if (this.backgrounds.starfield && this.backgrounds.starfield.material) {
          this.backgrounds.starfield.material.uniforms.opacity.value = starAlpha;
        }
        if (this.backgrounds.milkyWay && this.backgrounds.milkyWay.material) {
          this.backgrounds.milkyWay.material.opacity = 0.6 * starAlpha;
        }
      } else if (!to.starfieldVisible && from.starfieldVisible) {
        // Fading out - end at 50% progress
        const starAlpha = Math.max(0, 1 - (eased * 2));
        this.backgrounds.setStarfieldVisible(starAlpha > 0);
        if (this.backgrounds.starfield && this.backgrounds.starfield.material) {
          this.backgrounds.starfield.material.uniforms.opacity.value = starAlpha;
        }
        if (this.backgrounds.milkyWay && this.backgrounds.milkyWay.material) {
          this.backgrounds.milkyWay.material.opacity = 0.6 * starAlpha;
        }
      } else {
        // No transition needed
        this.backgrounds.setStarfieldVisible(to.starfieldVisible);
        if (to.starfieldVisible && this.backgrounds.starfield && this.backgrounds.starfield.material) {
          this.backgrounds.starfield.material.uniforms.opacity.value = 1.0;
        }
      }

      // Update sun and moon positions during transition
      const currentSunPos = [
        this._lerp(from.sunPosition[0], to.sunPosition[0], eased),
        this._lerp(from.sunPosition[1], to.sunPosition[1], eased),
        this._lerp(from.sunPosition[2], to.sunPosition[2], eased)
      ];
      this.backgrounds.setSunMoonPosition(currentSunPos, transition.toTimeOfDay);

      // Update road reflectivity based on time of day
      // Only 'day' is reflective, dawn/dusk/night are not reflective
      if (this.materialManager && transition.toTimeOfDay) {
        this.materialManager.updateRoadReflectivity(transition.toTimeOfDay);
      }
    }
  }

  updateCamera(deltaTime) {
    const state = this.physics.getState();

    // Hide/show motorcycle based on camera mode (ONLY if not dead!)
    if (this.motorcycle && !this.isDead) {
      // Only hide in first person, don't override death/respawn visibility
      if (this.isFirstPerson) {
        this.motorcycle.visible = false;
      } else {
        this.motorcycle.visible = true;
        if (this.rider) this.rider.visible = true; // Make sure rider is visible too in third person
      }
    }

    // Use pre-allocated objects instead of creating new ones
    const {
      bikeMatrix,
      leanMatrix,
      offset,
      targetCameraPos,
      targetLookAt,
      lookOffset,
    } = this._cameraUpdateObjects;

    // Calculate camera position based on bike
    bikeMatrix.makeRotationY(state.rotation.yaw);

    // Apply lean to camera offset (but not as much as the bike itself in third person)
    const leanFactor = this.isFirstPerson ? 0.8 : 0.3; // More lean in first person for immersion
    leanMatrix.makeRotationZ(state.rotation.roll * leanFactor);

    // Camera offset - copy instead of clone
    offset.copy(this.cameraOffset);
    offset.applyMatrix4(leanMatrix);
    offset.applyMatrix4(bikeMatrix);

    // Account for lean offset in camera position
    const leanOffset = Math.sin(state.rotation.roll) * 0.4;
    const leanX = leanOffset * Math.cos(state.rotation.yaw + Math.PI / 2);
    const leanZ = leanOffset * Math.sin(state.rotation.yaw + Math.PI / 2);

    // Target positions - set instead of creating new
    targetCameraPos.set(
      state.position.x + offset.x + leanX,
      state.position.y + offset.y + 1,
      state.position.z + offset.z + leanZ
    );

    // Look offset - copy instead of clone
    lookOffset.copy(this.cameraLookOffset);
    lookOffset.applyMatrix4(bikeMatrix);

    targetLookAt.set(
      state.position.x + lookOffset.x,
      state.position.y + lookOffset.y,
      state.position.z + lookOffset.z
    );

    // Dynamic FOV based on speed for better speed perception
    const baseFOV = 60;
    const maxFOVIncrease = 30; // Maximum FOV increase at top speed
    const speedRatio = Math.min(state.speed / 200, 1); // Normalize to displayed max of 200mph
    const targetFOV = baseFOV + maxFOVIncrease * speedRatio * speedRatio; // Quadratic increase

    // Smooth FOV transition - SLOWER to reduce shake perception
    const currentFOV = this.camera.fov;
    this.camera.fov = currentFOV + (targetFOV - currentFOV) * 0.05; // Much slower FOV changes to reduce shake
    this.camera.updateProjectionMatrix();

    // Direct camera positioning with screen shake
    this.camera.position.set(
      targetCameraPos.x + this.screenShake.offset.x * 0.1,
      targetCameraPos.y + this.screenShake.offset.y * 0.1,
      targetCameraPos.z
    );
    this.camera.lookAt(targetLookAt);

    // IMMERSIVE CAMERA TILT: Rotate the camera to match the rider's lean angle
    // This simulates the rider's head tilting with the motorcycle
    // We use a percentage of the actual lean angle for a more comfortable viewing experience
    // More tilt in first person for full immersion
    const cameraLeanFactor = this.isFirstPerson ? 0.9 : 0.7; // 90% in first person, 70% in third
    const targetCameraRoll = state.rotation.roll * cameraLeanFactor;

    // Smooth the camera roll transition - SLOWER to reduce shake
    if (!this.cameraRoll) this.cameraRoll = 0;
    this.cameraRoll += (targetCameraRoll - this.cameraRoll) * 0.1; // Much slower transition to reduce shake

    // Apply the roll rotation to the camera
    // Use pre-allocated vectors instead of creating new ones
    const { up, forward } = this._cameraUpdateObjects;
    up.set(0, 1, 0);
    forward.subVectors(targetLookAt, this.camera.position).normalize();

    // Apply roll rotation around the forward axis
    up.applyAxisAngle(forward, this.cameraRoll);
    this.camera.up.copy(up);
  }

  updateHUD() {
    const state = this.physics.getState();

    // Update speedometer
    this.speedometer.textContent = `${Math.round(state.speed)} MPH`;

    // Calculate FPS
    this.fpsFrameCount++;
    const currentTime = performance.now();
    const deltaFPSTime = currentTime - this.fpsLastTime;

    // Update FPS every 500ms for stable reading
    if (deltaFPSTime >= 500) {
      this.currentFPS = Math.round((this.fpsFrameCount * 1000) / deltaFPSTime);
      this.fpsFrameCount = 0;
      this.fpsLastTime = currentTime;
    }

    // Update FPS display with color coding
    this.hudElements.fps.textContent = `FPS: ${this.currentFPS}`;
    this.hudElements.fps.style.color =
      this.currentFPS >= 55
        ? "#00ff00"
        : this.currentFPS >= 30
        ? "#ffff00"
        : "#ff6600";
    this.hudElements.fps.style.fontWeight = "bold";

    // Determine physics mode label
    let physicsMode = "Simple (Working)";
    if (!this.useSimplePhysics) {
      physicsMode = this.useV2Physics ? "V2 (Complex)" : "V1 (Complex)";
    }

    // Update HUD elements directly without innerHTML
    this.hudElements.camera.textContent = `Camera: ${
      this.isFirstPerson ? "First Person" : "Third Person"
    } (Space)`;
    this.hudElements.physics.textContent = `Physics: ${physicsMode}`;

    // Add performance level color coding - with safety checks
    if (this.performanceManager && this.hudElements.performance) {
      const perfLevel = this.performanceManager.performanceLevel;
      this.hudElements.performance.textContent = `Performance: ${perfLevel.toUpperCase()}`;
      this.hudElements.performance.style.color =
        perfLevel === "high"
          ? "#00ff00"
          : perfLevel === "medium"
          ? "#ffff00"
          : "#ff6600";
    }

    this.hudElements.gear.textContent = `Gear: ${state.gear || "N/A"}`;
    this.hudElements.rpm.textContent = `RPM: ${state.rpm || "N/A"}`;
    this.hudElements.lean.textContent = `Lean: ${
      state.leanAngle !== undefined ? state.leanAngle.toFixed(1) : "0.0"
    }°`;

    // Conditionally show/hide turn rate
    if (state.turnRate !== undefined) {
      this.hudElements.turnRate.textContent = `Turn Rate: ${state.turnRate.toFixed(
        1
      )}°/s`;
      this.hudElements.turnRate.style.display = "block";
    } else {
      this.hudElements.turnRate.style.display = "none";
    }

    // Wobble warning
    if (state.collision && state.collision.isWobbling) {
      this.hudElements.wobble.textContent = "⚠️ WOBBLING!";
      this.hudElements.wobble.style.color = "orange";
      this.hudElements.wobble.style.display = "block";
    } else {
      this.hudElements.wobble.style.display = "none";
    }

    // Death indicator
    if (this.isDead) {
      this.hudElements.death.textContent = "💀 DEAD - Respawning...";
      this.hudElements.death.style.color = "red";
      this.hudElements.death.style.fontSize = "20px";
      this.hudElements.death.style.display = "block";
    } else {
      this.hudElements.death.style.display = "none";
    }

    // Distance display - show km in race mode
    if (this.raceMode) {
      const distanceKm = (this.distance * 0.0003048).toFixed(2); // feet to km
      const remainingKm = Math.max(0, this.raceDistance - distanceKm).toFixed(
        2
      );
      this.hudElements.distance.textContent = `Race: ${distanceKm}km / ${this.raceDistance}km (${remainingKm}km left)`;
      this.hudElements.distance.style.color = "#00ff00";
      this.hudElements.distance.style.fontSize = "18px";
      this.hudElements.distance.style.fontWeight = "bold";
    } else {
      this.hudElements.distance.textContent = `Distance: ${(
        this.distance / 5280
      ).toFixed(1)} mi`;
      this.hudElements.distance.style.color = "white";
      this.hudElements.distance.style.fontSize = "14px";
      this.hudElements.distance.style.fontWeight = "normal";
    }
    this.hudElements.score.textContent = `Score: ${this.score}`;

    // Memory stats from Stoppa
    if (this.stoppa) {
      const stats = this.stoppa.getStats();
      const leaks = stats.leaks || [];

      // Memory usage
      if (stats.memoryUsage) {
        const percentage = (
          (stats.memoryUsage.used / stats.memoryUsage.limit) *
          100
        ).toFixed(1);
        this.hudElements.memoryUsage.textContent = `Memory: ${stats.memoryUsage.used}MB/${stats.memoryUsage.limit}MB (${percentage}%)`;
        this.hudElements.memoryUsage.style.color =
          percentage > 80 ? "#ff6600" : percentage > 60 ? "#ffff00" : "#00ff00";
      } else {
        this.hudElements.memoryUsage.textContent = "Memory: N/A";
      }

      // Active resources
      this.hudElements.activeResources.textContent = `Resources: ${stats.activeResources}/${stats.totalResources}`;

      // Memory leaks
      if (leaks.length > 0) {
        this.hudElements.memoryLeaks.textContent = `⚠️ Leaks: ${leaks.length}`;
        this.hudElements.memoryLeaks.style.color = "#ff6600";
        this.hudElements.memoryLeaks.style.fontWeight = "bold";
      } else {
        this.hudElements.memoryLeaks.textContent = "✅ No leaks";
        this.hudElements.memoryLeaks.style.color = "#00ff00";
      }
    }
  }

  toggleDevHUD() {
    this.showDevHUD = !this.showDevHUD;
    if (this.hud) {
      this.hud.style.display = this.showDevHUD ? "block" : "none";
    }
    console.log(`Dev HUD ${this.showDevHUD ? "shown" : "hidden"}`);
  }

  toggleCameraMode() {
    this.isFirstPerson = !this.isFirstPerson;

    // Switch camera offsets
    if (this.isFirstPerson) {
      this.cameraOffset = this.firstPersonOffset.clone();
      this.cameraLookOffset = this.firstPersonLookOffset.clone();
      console.log("Switched to First Person view");
    } else {
      this.cameraOffset = this.thirdPersonOffset.clone();
      this.cameraLookOffset = this.thirdPersonLookOffset.clone();
      console.log("Switched to Third Person view");
    }
  }

  toggleMute() {
    if (!this.audioManager) return;

    // Toggle the audio state
    const isEnabled = !this.audioManager.isEnabled;
    this.audioManager.setEnabled(isEnabled);

    console.log(`Sound ${isEnabled ? "enabled" : "muted"}`);

    // HUD will update automatically in updateHUD()
  }

  showStoppaStats() {
    if (!this.stoppa) return;

    const stats = this.stoppa.getStats();
    const leaks = stats.leaks;

    // Log to console
    console.log("═══════════════════════════════════════");
    console.log("🛡️ STOPPA MEMORY STATISTICS");
    console.log("═══════════════════════════════════════");
    console.log(`Total Resources: ${stats.totalResources}`);
    console.log(`Active Resources: ${stats.activeResources}`);
    console.log(`Disposed Resources: ${stats.disposedResources}`);

    if (stats.memoryUsage) {
      console.log(
        `Memory Used: ${stats.memoryUsage.used}MB / ${stats.memoryUsage.limit}MB`
      );
      const percentage = (
        (stats.memoryUsage.used / stats.memoryUsage.limit) *
        100
      ).toFixed(1);
      console.log(`Memory Usage: ${percentage}%`);
    }

    console.log("\n📊 Resources by Type:");
    Object.entries(stats.resourcesByType).forEach(([type, counts]) => {
      console.log(
        `  ${type}: ${counts.active} active, ${counts.disposed} disposed`
      );
    });

    if (leaks.length > 0) {
      console.log("\n⚠️ POTENTIAL MEMORY LEAKS:");
      leaks.forEach((leak) => {
        console.log(`  - ${leak.type} (ID: ${leak.id}) - Age: ${leak.age}s`);
      });
    } else {
      console.log("\n✅ No memory leaks detected");
    }

    console.log("═══════════════════════════════════════");

    // Show in-game message
    const memUsage = stats.memoryUsage
      ? `${stats.memoryUsage.used}MB/${stats.memoryUsage.limit}MB`
      : "N/A";

    this.showGameMessage(
      `Memory: ${memUsage} | Active: ${stats.activeResources} | Leaks: ${leaks.length}`,
      leaks.length > 0 ? "crash" : "info"
    );
  }

  triggerDeath(state) {
    if (this.isDead) return; // Already dead

    this.isDead = true;

    // Submit final score to leaderboard
    console.log('🎯 Death triggered - checking submission conditions:');
    console.log('  multiplayer exists:', !!this.multiplayer);
    console.log('  socket exists:', !!this.multiplayer?.socket);
    console.log('  socket connected:', this.multiplayer?.socket?.connected);
    console.log('  vehiclePassCounter exists:', !!this.vehiclePassCounter);

    if (this.multiplayer?.socket && this.vehiclePassCounter) {
      const finalStats = this.vehiclePassCounter.getSessionStats();
      console.log('✅ Submitting final score:', finalStats);
      this.multiplayer.socket.emit('submit-score', {
        stats: finalStats
      });

      // Refresh leaderboard after a short delay to show updated rankings
      setTimeout(() => {
        if (this.leaderboardUI) {
          this.leaderboardUI.fetchLeaderboard();
        }
      }, 1000);
    } else {
      console.error('❌ Score NOT submitted - missing requirements:', {
        hasMultiplayer: !!this.multiplayer,
        hasSocket: !!this.multiplayer?.socket,
        socketConnected: this.multiplayer?.socket?.connected,
        hasVehicleCounter: !!this.vehiclePassCounter
      });
    }

    // Trigger UFO escape animation
    if (this.ufoController) {
      this.ufoController.playEscapeAnimation(() => {
        console.log('UFO escape animation completed');
      });
    }

    // Store race state for later (after death animation completes)
    this.deathInRaceMode = this.raceMode;

    if (this.motorcycle) this.motorcycle.visible = false; // Hide motorcycle immediately
    if (this.rider) this.rider.visible = false; // Hide rider immediately - they're now a puddle!

    // Play death/explosion sound
    if (this.audioManager) {
      this.audioManager.play("explosionBloody", { clone: true, volume: 0.7 });
      // Stop engine sound
      if (this.audioManager.currentEngineSound) {
        this.audioManager.stop(this.audioManager.currentEngineSound);
      }
    }

    // Calculate collision direction from velocity - use pre-allocated vectors
    this._tempVelocity.set(
      state.velocity.x || 0,
      state.velocity.y || 0,
      state.velocity.z || 0
    );

    // Trigger death animation at motorcycle position - use pre-allocated vector
    this._tempDeathPosition.set(
      state.position.x,
      state.position.y + 0.5, // Slightly above ground for rider height
      state.position.z
    );

    this.deathAnimation.trigger(this._tempDeathPosition, this._tempVelocity);

    // Register crash site with blood track system
    if (this.bloodTrackSystem) {
      this.bloodTrackSystem.registerCrashSite(this._tempDeathPosition);
    }

    // Big screen shake for death
    this.screenShake.intensity = 30;
    this.screenShake.duration = 0.5;

    // Stop the bike completely
    this.physics.velocity = { x: 0, y: 0, z: 0 };
    this.physics.speed = 0;
  }

  positionUFOForRaceStart() {
    // EXACT COPY from respawnPlayer() lines 3108-3181
    if (this.ufoController && this.ufo) {
      console.log('UFO exists, resetting...');

      // Make sure ufoController and game both reference the same UFO
      if (this.ufoController.ufo !== this.ufo) {
        console.warn('UFO reference mismatch! Syncing...');
        this.ufoController.ufo = this.ufo;
      }

      // Cancel any running escape animation and reset escape state
      this.ufoController.escapeAnimationRunning = false;
      this.ufoController.isEscaping = false;
      console.log('Cancelled escape animation and reset escape state');

      // Reset material opacity in case escape animation faded it
      let materialsReset = 0;
      this.ufo.traverse((child) => {
        if (child.material) {
          // Check if this is a glow material by checking its properties
          const isGlow = child.material.side === THREE.BackSide;
          const oldOpacity = child.material.opacity;
          child.material.opacity = isGlow ? 0.2 : 1.0;
          child.material.transparent = true;
          child.material.needsUpdate = true;
          materialsReset++;
          if (oldOpacity < 0.1) {
            console.log('Reset material from', oldOpacity, 'to', child.material.opacity, 'isGlow:', isGlow);
          }
        }
      });

      // Also reset particle system opacity
      if (this.ufoController.particleSystem) {
        this.ufoController.particleSystem.material.opacity = 0.6;
        this.ufoController.particleSystem.material.needsUpdate = true;
      }

      console.log('UFO materials reset:', materialsReset, 'will be positioned next');
    } else {
      console.error('UFO or UFOController is null during respawn!', {
        ufoController: !!this.ufoController,
        ufo: !!this.ufo,
        ufoInScene: this.ufo ? this.scene.children.includes(this.ufo) : false
      });
    }

    // NOW position UFO relative to player's reset position
    if (this.ufo) {
      this.ufo.position.set(
        this.physics.position.x,
        30,  // Higher up for more floaty feel
        this.physics.position.z + 200  // Further ahead
      );
      this.ufo.rotation.set(0, 0, 0);
      console.log('UFO positioned at:', this.ufo.position, 'Player at:', this.physics.position);
    }
  }

  respawnPlayer() {
    console.log('RESPAWNING PLAYER');

    // Set isDead to false FIRST to prevent re-triggering
    this.isDead = false;

    // MEMORY LEAK FIX: Clean up death animation objects before respawn
    // (Death animation already cleans itself up, but call it to be safe)
    if (this.deathAnimation && !this.deathAnimation.isAnimating) {
      this.deathAnimation.cleanup();
    }

    // Reset physics completely FIRST - back to start
    this.physics.reset();

    // Reset vehicle pass counter for new session
    if (this.vehiclePassCounter) {
      this.vehiclePassCounter.reset();
    }

    // Reset terrain system for respawn
    if (this.terrain && typeof this.terrain.reset === "function") {
      this.terrain.reset();
    }

    // MEMORY LEAK FIX: Clean up traffic system debris
    if (this.trafficSystem) {
      this.trafficSystem.cleanupDebris();
    }

    // Clear all blood data - remove trails completely to avoid artificial cutoff look
    if (this.bloodTrackSystem) {
      this.bloodTrackSystem.clearAllBloodData();
    }

    // Reset distance and score
    this.distance = 0;
    this.score = 0;

    // Reset highway to starting position
    if (this.highway) {
      this.highway.reset();
    }

    // Reset traffic
    if (this.traffic) {
      this.traffic.reset();
    }

    // Reset UFO position AFTER physics reset (so we know player's new position)
    // This needs to happen after all the resets above
    if (this.ufoController && this.ufo) {
      console.log('UFO exists, resetting...');

      // Make sure ufoController and game both reference the same UFO
      if (this.ufoController.ufo !== this.ufo) {
        console.warn('UFO reference mismatch! Syncing...');
        this.ufoController.ufo = this.ufo;
      }

      // Cancel any running escape animation and reset escape state
      this.ufoController.escapeAnimationRunning = false;
      this.ufoController.isEscaping = false;
      console.log('Cancelled escape animation and reset escape state');

      // Reset material opacity in case escape animation faded it
      let materialsReset = 0;
      this.ufo.traverse((child) => {
        if (child.material) {
          // Check if this is a glow material by checking its properties
          const isGlow = child.material.side === THREE.BackSide;
          const oldOpacity = child.material.opacity;
          child.material.opacity = isGlow ? 0.2 : 1.0;
          child.material.transparent = true;
          child.material.needsUpdate = true;
          materialsReset++;
          if (oldOpacity < 0.1) {
            console.log('Reset material from', oldOpacity, 'to', child.material.opacity, 'isGlow:', isGlow);
          }
        }
      });

      // Also reset particle system opacity
      if (this.ufoController.particleSystem) {
        this.ufoController.particleSystem.material.opacity = 0.6;
        this.ufoController.particleSystem.material.needsUpdate = true;
      }

      console.log('UFO materials reset:', materialsReset, 'will be positioned next');
    } else {
      console.error('UFO or UFOController is null during respawn!', {
        ufoController: !!this.ufoController,
        ufo: !!this.ufo,
        ufoInScene: this.ufo ? this.scene.children.includes(this.ufo) : false
      });
    }

    // Make everything visible again
    if (this.motorcycle) {
      this.motorcycle.visible = true;
      this.motorcycle.traverse((child) => {
        child.visible = true;
      });
    }
    if (this.rider) this.rider.visible = true; // Rider is back from being a puddle!

    // Reset physics position (already reset to 0,0,0 by physics.reset() above)
    const currentState = this.physics.getState();
    this.physics.position.x = 0; // Reset to center of road
    this.physics.position.y = 0.3; // Reset to proper height
    // Z is already 0 from reset()
    this.physics.speed = 20 / 2.237; // Start at low speed (20 mph)
    this.physics.velocity = { x: 0, y: 0, z: this.physics.speed };
    this.physics.rotation = { pitch: 0, yaw: 0, roll: 0 };

    // NOW position UFO relative to player's reset position
    if (this.ufo) {
      this.ufo.position.set(
        this.physics.position.x,
        30,  // Higher up for more floaty feel
        this.physics.position.z + 200  // Further ahead
      );
      this.ufo.rotation.set(0, 0, 0);
      console.log('UFO positioned at:', this.ufo.position, 'Player at:', this.physics.position);
    }

    // Clear collision state
    this.physics.collision = {
      isWobbling: false,
      wobbleTime: 0,
      wobbleAmplitude: 0,
      lateralVelocity: 0,
      isCrashed: false,
      recoveryTime: 0,
      invulnerableTime: 2.0, // 2 seconds of invulnerability after respawn
      isSlidingOnWall: false, // Clear wall sliding
      wallSide: null,
      slideTime: 0,
    };

    // Reset visual elements
    if (this.rider) this.rider.rotation.set(0, 0, 0);
    if (this.frontWheel) this.frontWheel.rotation.x = 0;
    if (this.rearWheel) this.rearWheel.rotation.x = 0;

    // Play rev engine sound on respawn
    if (this.audioManager) {
      this.audioManager.play("revEngine", { clone: true, volume: 0.4 });
    }

    console.log("Player respawned!");
  }

  handleBarrierCollision(collision) {
    // Handle different severity levels
    switch (collision.severity) {
      case "bump":
        // Low speed - just screen shake and tire screech
        if (this.audioManager) {
          this.audioManager.play("tireScreechShort", {
            clone: true,
            volume: 0.5,
          });
        }
        this.screenShake.intensity = 5;
        this.screenShake.duration = 0.2;
        // Removed console.log to prevent memory accumulation
        break;

      case "explode":
        // Medium speed - explosion effect
        // Explosion effect happens with death animation
        if (this.audioManager) {
          this.audioManager.play("explosion", { clone: true, volume: 0.6 });
        }
        this.screenShake.intensity = 15;
        this.screenShake.duration = 0.5;
        // Removed console.log to prevent memory accumulation
        break;

      case "smear":
        // High speed - explosion + blood smear on barrier
        // Explosion effect happens with death animation
        if (this.audioManager) {
          this.audioManager.play("explosionBloody", {
            clone: true,
            volume: 0.8,
          });
          this.audioManager.play("tireScreechLong", {
            clone: true,
            volume: 0.4,
          });
        }

        if (this.bloodTrackSystem) {
          // Reduce blood splats to prevent lag - create just a few immediate splats
          for (let i = 0; i < 3; i++) {
            const smearOffset = {
              x: collision.position.x + (Math.random() - 0.5) * 0.5, // Keep close to barrier
              y: collision.position.y + Math.random() * 2, // Vertical smear
              z: collision.position.z + (Math.random() - 0.5) * 8, // Long smear along barrier
            };
            this.bloodTrackSystem.addBloodSplat(smearOffset, 3.0); // Extra large blood splats
          }

          // Register crash site for continuous blood generation during slide
          // This will be handled by the blood track system over time, not all at once
          this.bloodTrackSystem.registerCrashSite(collision.position);
        }

        this.screenShake.intensity = 30;
        this.screenShake.duration = 1.0;
        // Removed console.log to prevent memory accumulation
        break;
    }
  }

  handlePerformanceChange(event) {
    const { level, previousLevel } = event.detail;
    console.log(`Performance level changed from ${previousLevel} to ${level}`);

    // Update current config
    this.currentConfig = this.performanceManager.getConfig();

    // Update blood track system performance
    if (this.bloodTrackSystem) {
      this.bloodTrackSystem.setPerformanceLevel(level);
    }

    // Apply immediate changes that don't require restart
    if (this.renderer) {
      this.renderer.setPixelRatio(this.currentConfig.pixelRatio);
      this.renderer.toneMapping = this.currentConfig.toneMapping;
      this.renderer.physicallyCorrectLights =
        this.currentConfig.physicallyCorrectLights;

      // Update shadow map settings
      this.renderer.shadowMap.type = this.currentConfig.shadowType;
      if (this.sunLight) {
        this.sunLight.shadow.mapSize.setScalar(
          this.currentConfig.shadowMapSize
        );
      }
    }

    // Update traffic system
    if (this.trafficSystem) {
      this.trafficSystem.setMaxVehicles(this.currentConfig.maxVehicles);
      this.trafficSystem.setSpawnDistance(this.currentConfig.spawnDistance);
    }

    // Update highway if possible
    if (this.highway && typeof this.highway.setSegmentCount === "function") {
      this.highway.setSegmentCount(this.currentConfig.segmentCount);
    }

    // Show performance notification
    this.showGameMessage(
      `Performance adjusted to: ${level.toUpperCase()}`,
      "info"
    );
  }

  togglePhysicsVersion() {
    // For now, only use Simple physics since V1/V2 have issues
    console.log(
      "Only Simple Physics is currently working. V1/V2 physics disabled."
    );
    return;

    /* Disabled until V1/V2 are fixed
    // Save current state
    const currentState = this.physics.getState();
    
    // Dispose old physics and input controller
    if (this.physics && typeof this.physics.dispose === 'function') {
      this.physics.dispose();
    }
    if (this.inputController && typeof this.inputController.dispose === 'function') {
      this.inputController.dispose();
    }
    
    // Cycle through physics versions: Simple -> V1 -> V2 -> Simple
    if (this.useSimplePhysics) {
      this.useSimplePhysics = false;
      this.useV2Physics = false;
      this.physics = new MotorcyclePhysics();
      this.inputController = new InputController();
      console.log('Switched to Physics V1 (Original Complex)');
    } else if (!this.useV2Physics) {
      this.useV2Physics = true;
      this.physics = new MotorcyclePhysicsV2();
      this.inputController = new InputController();
      console.log('Switched to Physics V2 (Improved Complex)');
    } else {
      this.useSimplePhysics = true;
      this.useV2Physics = false;
      this.physics = new SimpleBikePhysics();
      this.inputController = null;
      console.log('Switched to Simple Physics (Working)');
    }
    
    // Restore position and velocity
    this.physics.position = currentState.position;
    this.physics.velocity = currentState.velocity;
    */
  }

  animate() {
    // Prevent multiple animation loops
    if (this.isDisposed) return;
    this.animationId = requestAnimationFrame(() => this.animate());

    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1); // Cap deltaTime
    this.lastTime = currentTime;

    // Emergency brake: Stop if deltaTime is too large (indicates freeze)
    if (deltaTime > 0.5) {
      console.warn("Large deltaTime detected, skipping frame");
      return;
    }

    if (!this.isPaused && this.gameStarted) {
      // Only run game logic if the game has started (after intro/selection)
      // Wrap everything in try-catch to prevent crashes
      try {
        // Skip physics updates if not initialized yet
        if (!this.physics) {
          // Still render the scene but skip physics
          return;
        }

        // Get physics state first
        let state;

        // Handle death animation
        if (this.isDead) {
          // Update death animation
          const readyForRespawn = this.deathAnimation.update(deltaTime);

          // Check if death animation is complete
          if (readyForRespawn && !this.deathAnimation.isAnimating) {
            // If died during race, end the race now (after animation)
            if (this.deathInRaceMode) {
              this.deathInRaceMode = false;
              this.endRace(false); // Player loses
              // Don't respawn yet - endRace will handle it via exitRaceMode
            } else {
              // Normal respawn for free ride mode
              this.respawnPlayer();
            }
          }

          // Get state for camera
          state = this.physics.getState();
        } else {
          // Normal gameplay
          // Update controls
          if (this.useSimplePhysics) {
            // Direct controls for simple physics
            this.updateControls(deltaTime);
          } else {
            // Use input controller for complex physics
            this.updateControlsComplex(deltaTime);
          }

          // Update physics (pass traffic for collision detection)
          state = this.useSimplePhysics
            ? this.physics.update(deltaTime, this.traffic)
            : this.physics.update(deltaTime);

          // Check for collision effects
          if (state.collision) {
            // Check for crash FIRST (serious collision)
            if (state.collision.isCrashed && !this.isDead) {
              // Trigger death immediately to prevent lag
              this.triggerDeath(state);
              // Handle barrier-specific effects AFTER death animation starts
              if (state.collision.type === "barrier") {
                // Copy collision data to avoid closure memory leak
                const collisionCopy = {
                  type: state.collision.type,
                  severity: state.collision.severity,
                  position: { ...state.collision.position },
                  speedMph: state.collision.speedMph,
                };
                // Use setTimeout to defer blood effects slightly

                const barrierTimer = setTimeout(() => {
                  this.handleBarrierCollision(collisionCopy);
                  this.activeTimers.delete(barrierTimer);
                }, 50);
                this.activeTimers.add(barrierTimer);
              }
            } else if (state.collision.type === "barrier") {
              // Non-fatal barrier collision (shouldn't happen anymore but just in case)
              this.handleBarrierCollision(state.collision);
            } else {
              // Minor collision - just wobble
              // Trigger screen shake on new collision
              if (
                state.collision.isWobbling &&
                this.screenShake.duration <= 0
              ) {
                this.screenShake.intensity = 10;
                this.screenShake.duration = 0.3;
              }

              // Invulnerability effects are handled in the motorcycle update section
            }
          }
        }

        // Update multiplayer
        if (this.multiplayer && this.multiplayer.isConnected) {
          // Send our state to other players
          this.multiplayer.sendPlayerUpdate(state);

          // Update other players
          this.multiplayer.update();

          // Update multiplayer HUD even less frequently to prevent DOM thrashing
          if (!this.multiplayerHUDUpdateTimer)
            this.multiplayerHUDUpdateTimer = 0;
          this.multiplayerHUDUpdateTimer += deltaTime;
          if (this.multiplayerHUDUpdateTimer >= 2.0) {
            // Update only once per 2 seconds
            this.updateMultiplayerHUD();
            this.multiplayerHUDUpdateTimer = 0;
          }

          // Update minimap with multiplayer positions
          if (this.minimap) {
            // Update local player
            const localId = this.multiplayer.playerId || "local";
            this.minimap.updatePlayer(localId, state.position, {
              speed: state.speed,
              name: "You",
              isDead: this.isDead,
            });

            // Update other players
            const players = this.multiplayer.getPlayerList();
            players.forEach((player) => {
              if (player.id !== localId && player.state) {
                this.minimap.updatePlayer(player.id, player.state.position, {
                  speed: player.state.speed,
                  name: player.username,
                  isDead: player.state.isDead || false,
                });
              }
            });
          }
        } else if (this.minimap) {
          // Single player - just update local player
          this.minimap.updatePlayer("local", state.position, {
            speed: state.speed,
            name: "Player",
            isDead: this.isDead,
          });
        }

        // ALWAYS update traffic regardless of death state
        if (this.traffic) {
          this.traffic.update(deltaTime, state.position, state.velocity);
        }

        // Update vehicle pass counter
        if (this.vehiclePassCounter && this.traffic && !this.isDead) {
          this.vehiclePassCounter.update(
            state.position,
            this.traffic,
            state.speed
          );
        }

        // Update minimap with traffic vehicles
        if (this.minimap && this.traffic) {
          this.minimap.updateVehicles(this.traffic.vehicles);
          this.minimap.update(); // Draw the minimap
        }

        // Powerup system removed

        // Update blood track system
        if (this.bloodTrackSystem) {
          this.bloodTrackSystem.update(deltaTime);

          // Add blood while sliding on wall (high speed crashes)
          if (state.collision && state.collision.isSlidingOnWall) {
            // Add blood splat every few frames while sliding
            if (!this.lastWallBloodTime) this.lastWallBloodTime = 0;
            this.lastWallBloodTime += deltaTime;

            if (this.lastWallBloodTime > 0.05) {
              // Every 50ms
              const wallX =
                state.collision.wallSide === "right"
                  ? Math.abs(state.position.x) - 0.5 // Slightly off wall
                  : -Math.abs(state.position.x) + 0.5;

              this.bloodTrackSystem.addBloodSplat(
                {
                  x: wallX,
                  y: Math.random() * 1.5, // Vary height on wall
                  z: state.position.z + Math.random() * 2 - 1,
                },
                2.0
              ); // Large splats

              this.lastWallBloodTime = 0;
            }
          } else {
            this.lastWallBloodTime = 0;
          }
        }

        // Update highway
        this.highway.update(state.position.z, state.actualSpeed || state.speed);

        // Update terrain
        if (this.terrain) {
          this.terrain.update(state.position.z);
        }

        // Update screen shake
        if (this.screenShake.duration > 0) {
          this.screenShake.duration -= deltaTime;
          this.screenShake.offset.x =
            (Math.random() - 0.5) * this.screenShake.intensity;
          this.screenShake.offset.y =
            (Math.random() - 0.5) * this.screenShake.intensity;
        } else {
          this.screenShake.offset.x = 0;
          this.screenShake.offset.y = 0;
        }

        // Handle motorcycle visibility and updates - DEATH CHECK FIRST!
        if (this.isDead) {
          // ALWAYS force hide when dead - this is the FIRST check
          if (this.motorcycle) {
            this.motorcycle.visible = false;
            this.motorcycle.traverse((child) => {
              child.visible = false;
            });
          }
          if (this.rider) this.rider.visible = false;
          // Don't do any other updates when dead
        } else if (this.motorcycle) {
          // Only update when alive
          // Handle invulnerability flashing - DISABLED to prevent flickering
          // Just show normally even during invulnerability
          this.motorcycle.visible = true;
          if (this.rider) this.rider.visible = true;

          // Update motorcycle position and rotation
          // Simplified position - no lean offset to prevent jitter
          this.motorcycle.position.set(
            state.position.x,
            0, // Force Y to 0 to prevent vertical vibration
            state.position.z
          );

          // Apply rotations in correct order: yaw first, then lean, then pitch
          this.motorcycle.rotation.set(0, 0, 0);
          this.motorcycle.rotateY(state.rotation.yaw);
          this.motorcycle.rotateZ(state.rotation.roll);
          this.motorcycle.rotateX(state.rotation.pitch);

          // Update steering assembly rotation (handlebars and front wheel turn together)
          if (this.steeringAssembly && state.steerAngle !== undefined) {
            // Apply steering rotation around Y-axis
            this.steeringAssembly.rotation.y = state.steerAngle;
          }

          // Update wheels rotation - reduced multiplier at high speeds
          const wheelSpeedMultiplier = Math.min(
            0.1,
            0.1 / (1 + state.speed / 100)
          ); // Reduce at high speeds
          if (this.frontWheel) {
            this.frontWheel.rotation.x +=
              state.speed * deltaTime * wheelSpeedMultiplier;
          }
          if (this.rearWheel) {
            this.rearWheel.rotation.x +=
              state.speed * deltaTime * wheelSpeedMultiplier;
          }

          // Rider lean animation
          if (this.rider) {
            this.rider.rotation.z = -state.rotation.roll * 0.5;
            this.rider.rotation.x = state.rotation.pitch * 0.3;
          }
        }

        // Update backgrounds with memory management
        if (this.backgrounds) {
          this.backgrounds.update(deltaTime, state.position);

          // Only update location every 600 frames (~10 seconds at 60fps) to prevent API spam
          if (!this.bgUpdateCounter) this.bgUpdateCounter = 0;
          this.bgUpdateCounter++;

          if (this.bgUpdateCounter >= 600) {
            this.bgUpdateCounter = 0;

            // Update location based on absolute position
            const absoluteZ = this.distance * 0.3048;
            const location = this.highway.getLocationAtPosition(absoluteZ);
            this.backgrounds.updateLocation(absoluteZ, location);
          }
        }

        // Sky is now handled by BackgroundSystem
        /*
      if (this.sky) {
        this.sky.position.set(
          this.camera.position.x,
          this.camera.position.y - 100, // Keep sky centered vertically
          this.camera.position.z
        );
      }
      */

        // Make sun light follow player for consistent shadows (only if not manually controlled)
        if (this.sunLight && !this.manualSunControl) {
          this.sunLight.position.set(
            state.position.x + 50,
            100,
            state.position.z + 50
          );
          this.sunLight.target.position.copy(state.position);

          // Update shadows less frequently for performance
          this.shadowUpdateTimer += deltaTime;
          if (
            this.shadowUpdateTimer >= this.shadowUpdateInterval &&
            this.renderer.shadowMap.enabled
          ) {
            this.renderer.shadowMap.needsUpdate = true;
            this.shadowUpdateTimer = 0;
          }
        }

        // Update camera (includes FOV updates)
        this.updateCamera(deltaTime);

        // Update day/night cycle (60s per day)
        this.updateDayCycle(deltaTime);

        // Update time of day transitions
        this.updateTimeOfDayTransition(deltaTime);

        // Update UFO position
        this.updateUFO(deltaTime, state);

        // Update billboard system (distance-based loading/unloading)
        if (this.billboardSystem) {
          this.billboardSystem.update(deltaTime, state.position, this.currentTimeOfDay);
        }

        // Update HUD
        this.updateHUD();

        // Update audio (engine sounds)
        if (this.audioManager) {
          this.audioManager.updateEngineSound(state.speed);
        }

        // Track distance correctly
        // state.speed is in MPH, deltaTime is in seconds
        // Convert: MPH * seconds * (5280 feet/mile) / (3600 seconds/hour) = feet
        this.distance += state.speed * deltaTime * (5280 / 3600); // Correct: 1.4667 ft/s per mph

        // Update AI opponent
        if (this.aiOpponent && this.raceMode && !this.isCountingDown) {
          const aiData = this.aiOpponent.userData;
          // AI moves at constant speed with slight variation
          aiData.speed = 100 + Math.sin(performance.now() * 0.001) * 15; // Varies between 85-115 mph
          aiData.distance += aiData.speed * deltaTime * (5280 / 3600); // feet

          // Update AI position
          const playerState = this.physics.getState();
          this.aiOpponent.position.z =
            playerState.position.z +
            (((aiData.distance - this.distance) * 0.3048) / 1609.34) * 5280;
          this.aiOpponent.position.x = playerState.position.x + 4; // Keep in adjacent lane

          // Rotate AI wheels
          if (aiData.frontWheel) {
            aiData.frontWheel.rotation.x += aiData.speed * deltaTime * 0.1;
          }
          if (aiData.rearWheel) {
            aiData.rearWheel.rotation.x += aiData.speed * deltaTime * 0.1;
          }

          // Check if AI wins
          const aiDistanceKm = aiData.distance * 0.0003048;
          if (aiDistanceKm >= this.raceDistance) {
            this.endRace(false); // AI wins, player loses
          }
        }

        // Check race win condition for player
        if (this.raceMode && !this.isCountingDown) {
          const distanceKm = this.distance * 0.0003048; // feet to km
          if (distanceKm >= this.raceDistance) {
            this.endRace(true); // Player wins!
          }
        }

        // Update performance manager
        if (this.performanceManager) {
          this.performanceManager.update(deltaTime);
        }
      } catch (error) {
        console.error("Animation loop error:", error);
        // Don't crash the game, just log and continue
      }
    }

    // Memory management - gentler approach
    if (!this.memoryCounter) this.memoryCounter = 0;
    this.memoryCounter++;

    // Force cleanup every 5 seconds, less aggressive
    if (this.memoryCounter >= 300) {
      try {
        // Only cleanup if we have WAY too many vehicles
        if (this.traffic && this.traffic.vehicles.length > 25) {
          console.log("Gentle traffic cleanup:", this.traffic.vehicles.length);
          // Only remove vehicles that are far from player
          const playerZ = this.physics.getState().position.z;
          this.traffic.vehicles = this.traffic.vehicles.filter((vehicle) => {
            const distance = Math.abs(vehicle.position.z - playerZ);
            if (distance > 300) {
              this.scene.remove(vehicle.mesh);
              return false; // Remove far vehicles
            }
            return true; // Keep nearby vehicles
          });
        }

        // Force garbage collection less frequently
        if (window.gc) window.gc();

        this.memoryCounter = 0;
      } catch (error) {
        console.error("Memory cleanup error:", error);
      }
    } else if (!this.gameStarted) {
      // During intro/selection, just render the scene
      // The intro animation and player selection handle their own updates
      // Don't update UFO yet - it's positioned statically until game starts
    }

    // Update heat haze time uniforms
    if (this.heatHazePass) {
      this.heatHazeTime += deltaTime;
      this.heatHazePass.uniforms.time.value = this.heatHazeTime;
    }
    if (this.heatHazeV2Pass) {
      this.heatHazeV2Pass.uniforms.time.value = this.heatHazeTime;
    }

    // Render - wrapped to catch shader uniform errors
    try {
      this.composer.render();
    } catch (error) {
      // Log the error once to avoid spamming console
      if (!this.shaderErrorLogged) {
        console.error("Render error:", error);
        this.shaderErrorLogged = true;
      }
    }
  }

  onResize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(this.width, this.height);

    if (this.composer) {
      this.composer.setSize(this.width, this.height);
    }
  }

  start() {
    this.isRunning = true;
    this.isPaused = false;
  }

  performMemoryCleanup() {
    console.log('🧹 Performing aggressive memory cleanup...');

    // Cleanup old blood tracks
    if (this.bloodTrackSystem) {
      const trackCount = this.bloodTrackSystem.bloodTracks.length;
      if (trackCount > this.bloodTrackSystem.maxTracks * 0.5) {
        console.log(`Cleaning up ${trackCount} blood tracks`);
        while (this.bloodTrackSystem.bloodTracks.length > this.bloodTrackSystem.maxTracks * 0.3) {
          const oldTrack = this.bloodTrackSystem.bloodTracks.shift();
          if (oldTrack && oldTrack.mesh) {
            this.scene.remove(oldTrack.mesh);
            oldTrack.mesh.visible = false;
            this.bloodTrackSystem.trackPool.push(oldTrack.mesh);
          }
        }
      }
    }

    // Limit vehicles more aggressively
    if (this.traffic) {
      const vehicleCount = this.traffic.vehicles.length;
      if (vehicleCount > 15) {
        console.log(`Reducing vehicles from ${vehicleCount} to 15`);
        while (this.traffic.vehicles.length > 15) {
          const vehicle = this.traffic.vehicles.pop();
          if (vehicle && vehicle.mesh) {
            this.scene.remove(vehicle.mesh);
            this.traffic.disposeVehicleMesh(vehicle.mesh);
          }
        }
      }
    }

    // Run stoppa cleanup
    if (this.stoppa) {
      this.stoppa.cleanup();
    }

    console.log('✅ Memory cleanup complete');
  }

  pause() {
    this.isPaused = !this.isPaused;
  }

  reset() {
    this.physics.reset();
    this.score = 0;
    this.distance = 0;
    if (this.traffic && typeof this.traffic.reset === "function") {
      this.traffic.reset();
    }

    // Full reset - clear all blood data (stains and tracks)
    if (this.bloodTrackSystem) {
      this.bloodTrackSystem.clearAllBloodData();
    }

    // Reset camera position to match player starting position
    const initialPlayerPos = { x: -8.5, y: 0.3, z: 0 };
    this.cameraPosition.set(
      initialPlayerPos.x + this.cameraOffset.x,
      initialPlayerPos.y + this.cameraOffset.y + 1,
      initialPlayerPos.z + this.cameraOffset.z
    );
    this.cameraTarget.set(
      initialPlayerPos.x + this.cameraLookOffset.x,
      initialPlayerPos.y + this.cameraLookOffset.y,
      initialPlayerPos.z + this.cameraLookOffset.z
    );
  }

  dispose() {
    // Mark as disposed to prevent further animation frames
    this.isDisposed = true;

    // Stop animation loop FIRST
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Clear ALL timers to prevent memory leaks
    this.activeTimers.forEach((timer) => clearTimeout(timer));
    this.activeTimers.clear();
    this.activeChatTimers.forEach((timer) => clearTimeout(timer));
    this.activeChatTimers.clear();

    // Clear stats update interval
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = null;
    }

    // Clear countdown intervals
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.raceCountdownInterval) {
      clearInterval(this.raceCountdownInterval);
      this.raceCountdownInterval = null;
    }

    // Clear other timer references
    this.multiplayerHUDUpdateTimer = null;
    this.bgUpdateCounter = 0;
    this.memoryCounter = 0;
    this.shadowUpdateTimer = 0;
    this.lastWallBloodTime = 0;

    // Dispose of physics and input controller
    if (this.physics && typeof this.physics.dispose === "function") {
      this.physics.dispose();
    }
    if (
      this.inputController &&
      typeof this.inputController.dispose === "function"
    ) {
      this.inputController.dispose();
    }

    // Dispose of mobile controller
    if (this.mobileController) {
      this.mobileController.destroy();
      this.mobileController = null;
    }

    // Dispose of multiplayer
    if (this.multiplayer) {
      this.multiplayer.disconnect();
    }

    // Dispose of audio manager PROPERLY
    if (this.audioManager) {
      if (typeof this.audioManager.dispose === "function") {
        this.audioManager.dispose();
      } else {
        // Manual cleanup if no dispose method
        this.audioManager.stopAll && this.audioManager.stopAll();
      }
      this.audioManager = null;
    }

    // Dispose of game systems
    if (this.traffic && typeof this.traffic.dispose === "function") {
      this.traffic.dispose();
    }
    if (this.highway && typeof this.highway.dispose === "function") {
      this.highway.dispose();
    }
    if (this.terrain && typeof this.terrain.dispose === "function") {
      this.terrain.dispose();
    }

    // Dispose of UFO Controller
    if (this.ufoController) {
      this.ufoController.cleanup();
      this.ufoController = null;
      this.ufo = null;
    }

    // Dispose billboard system
    if (this.billboardSystem) {
      this.billboardSystem.dispose();
      this.billboardSystem = null;
    }

    // Dispose vehicle pass counter and leaderboard UI
    if (this.vehiclePassCounter) {
      this.vehiclePassCounter.dispose();
      this.vehiclePassCounter = null;
    }
    if (this.leaderboardUI) {
      this.leaderboardUI.dispose();
      this.leaderboardUI = null;
    }

    if (this.backgrounds) {
      this.backgrounds.dispose();
    }
    if (this.deathAnimation) {
      this.deathAnimation.dispose();
    }
    if (this.bloodTrackSystem) {
      this.bloodTrackSystem.dispose();
    }
    if (this.minimap) {
      this.minimap.dispose();
      this.minimap = null;
    }
    // Powerup system removed

    // Dispose performance manager
    if (
      this.performanceManager &&
      typeof this.performanceManager.dispose === "function"
    ) {
      this.performanceManager.dispose();
    }

    // Dispose memory profiler
    if (
      this.memoryProfiler &&
      typeof this.memoryProfiler.dispose === "function"
    ) {
      this.memoryProfiler.dispose();
      this.memoryProfiler = null;
    }

    // Dispose Material Manager - MUST be done after all systems dispose
    // This will clean up all pooled and shared materials
    if (this.materialManager) {
      this.materialManager.dispose();
      resetMaterialManager(); // Reset singleton for next game
    }

    // Dispose of renderer
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
      this.renderer = null;
    }

    // Clean up scene MORE THOROUGHLY
    if (this.scene) {
      this.scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => {
              // Dispose textures
              if (mat.map) mat.map.dispose();
              if (mat.normalMap) mat.normalMap.dispose();
              if (mat.roughnessMap) mat.roughnessMap.dispose();
              if (mat.metalnessMap) mat.metalnessMap.dispose();
              if (mat.aoMap) mat.aoMap.dispose();
              if (mat.emissiveMap) mat.emissiveMap.dispose();
              if (mat.envMap) mat.envMap.dispose();
              mat.dispose();
            });
          } else {
            if (object.material.map) object.material.map.dispose();
            if (object.material.normalMap) object.material.normalMap.dispose();
            if (object.material.roughnessMap)
              object.material.roughnessMap.dispose();
            if (object.material.metalnessMap)
              object.material.metalnessMap.dispose();
            if (object.material.aoMap) object.material.aoMap.dispose();
            if (object.material.emissiveMap)
              object.material.emissiveMap.dispose();
            if (object.material.envMap) object.material.envMap.dispose();
            object.material.dispose();
          }
        }
      });

      // Clear scene fog
      this.scene.fog = null;

      // Remove all children
      while (this.scene.children.length > 0) {
        this.scene.remove(this.scene.children[0]);
      }
    }

    // Null out pre-allocated objects
    this._cameraUpdateObjects = null;
    this._tempVelocity = null;
    this._tempDeathPosition = null;

    // Remove HUD elements and null references
    if (this.hud) {
      this.hud.remove();
      this.hud = null;
    }
    if (this.speedometer) {
      this.speedometer.remove();
      this.speedometer = null;
    }
    if (this.multiplayerHUD) {
      this.multiplayerHUD.remove();
      this.multiplayerHUD = null;
    }
    if (this.gameMessageContainer) {
      // Remove all children first
      while (this.gameMessageContainer.firstChild) {
        this.gameMessageContainer.removeChild(
          this.gameMessageContainer.firstChild
        );
      }
      this.gameMessageContainer.remove();
      this.gameMessageContainer = null;
    }

    // Null out HUD element references
    this.hudElements = null;

    // Remove event listeners
    window.removeEventListener("resize", this.boundHandleResize);
    window.removeEventListener("keydown", this.boundHandleKeyDown);
    window.removeEventListener("keyup", this.boundHandleKeyUp);
    window.removeEventListener(
      "performanceChanged",
      this.boundHandlePerformanceChange
    );

    // Remove WebGL context event listeners
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.removeEventListener(
        "webglcontextlost",
        this.boundHandleContextLost
      );
      this.renderer.domElement.removeEventListener(
        "webglcontextrestored",
        this.boundHandleContextRestored
      );
    }

    // Remove touch event listeners - check for domElement first
    if (
      this.boundHandleTouchStart &&
      this.renderer &&
      this.renderer.domElement
    ) {
      this.renderer.domElement.removeEventListener(
        "touchstart",
        this.boundHandleTouchStart
      );
    }
    if (
      this.boundHandleTouchMove &&
      this.renderer &&
      this.renderer.domElement
    ) {
      this.renderer.domElement.removeEventListener(
        "touchmove",
        this.boundHandleTouchMove
      );
    }
    if (this.boundHandleTouchEnd && this.renderer && this.renderer.domElement) {
      this.renderer.domElement.removeEventListener(
        "touchend",
        this.boundHandleTouchEnd
      );
    }

    // Null out all bound handlers
    this.boundHandleResize = null;
    this.boundHandleKeyDown = null;
    this.boundHandleKeyUp = null;
    this.boundHandlePerformanceChange = null;
    this.boundHandleContextLost = null;
    this.boundHandleContextRestored = null;
    this.boundHandleTouchStart = null;
    this.boundHandleTouchMove = null;
    this.boundHandleTouchEnd = null;

    // Clean up material tracking interval
    if (this.materialTrackingInterval) {
      clearInterval(this.materialTrackingInterval);
      this.materialTrackingInterval = null;
    }

    // Use Stoppa to clean up any remaining resources
    if (this.stoppa) {
      const stats = this.stoppa.getStats();
      console.log("[Stoppa] Final cleanup stats:", stats);
      this.stoppa.cleanup();
    }
  }
}
