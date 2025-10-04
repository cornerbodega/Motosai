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
import { PlayerSelection } from "./PlayerSelection.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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

    // Material tracking for debugging
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
    }, 5000); // Every 5 seconds

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
    this.initLights();

    // Show intro and player selection first
    this.showIntroAndSelection(() => {
      // After selection, initialize game components
      this.initPhysics();
      this.initHighway();
      this.initBackgrounds();
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

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87ceeb, 200, 3000); // Extended fog distance from 1000 to 3000

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

    // Softer ambient light with warm tint
    const ambient = new THREE.AmbientLight(0xfff5e6, 0.4);
    this.scene.add(ambient);

    // Main sun light - softer and warmer
    this.sunLight = new THREE.DirectionalLight(0xfff5dd, 2.5);
    this.sunLight.position.set(100, 150, 80);
    this.sunLight.castShadow = true;

    // Softer shadow settings
    this.sunLight.shadow.camera.left = -60;
    this.sunLight.shadow.camera.right = 60;
    this.sunLight.shadow.camera.top = 60;
    this.sunLight.shadow.camera.bottom = -60;
    this.sunLight.shadow.camera.near = 1; // Increased from 0.1 to reduce shadow acne
    this.sunLight.shadow.camera.far = 300;
    this.sunLight.shadow.mapSize.width = this.currentConfig.shadowMapSize;
    this.sunLight.shadow.mapSize.height = this.currentConfig.shadowMapSize;
    this.sunLight.shadow.radius = 2; // Reduced soft shadow edges
    this.sunLight.shadow.blurSamples = 10; // Fewer blur samples for performance
    this.sunLight.shadow.bias = 0.001; // Positive bias to prevent shadow acne
    this.sunLight.shadow.normalBias = 0.05; // Increased normal bias to prevent self-shadowing artifacts
    this.scene.add(this.sunLight);

    // Hemisphere light for soft sky lighting
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.6);
    this.scene.add(hemi);

    // Add a subtle fill light to soften harsh shadows
    const fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.4);
    fillLight.position.set(-50, 80, -50);
    this.scene.add(fillLight);
  }

  initPhysics() {
    // Use new simple physics by default
    this.useSimplePhysics = true;
    this.physics = new SimpleBikePhysics();

    // Keep old physics for comparison if needed
    this.useV2Physics = false;

    // Initialize input controller for smooth control (not needed for simple physics)
    // this.inputController = new InputController();

    // Create motorcycle mesh (low poly)
    this.createMotorcycle();
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

          this.frontWheel = this.motorcycle.userData.frontWheel;
          this.rearWheel = this.motorcycle.userData.rearWheel;
          this.rider = this.motorcycle.userData.rider;

          this.scene.add(this.motorcycle);
        }
      );
    }
  }

  _setupMotorcycleModel(model, bikeColor) {
    // Scale to appropriate size (motor1.glb needs to be smaller)
    this.motorcycle.scale.setScalar(0.25);

    // Set initial position
    this.motorcycle.position.set(0, 0, 0);

    // Apply the selected bike color to all meshes using shared materials
    const materialManager = getMaterialManager();
    this.motorcycle.traverse((child) => {
      if (child.isMesh && child.material) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Use MaterialManager to get a shared material instead of modifying the original
        if (child.material.color) {
          const sharedMaterial = materialManager.getMaterial('standard', {
            color: bikeColor,
            metalness: child.material.metalness || 0.5,
            roughness: child.material.roughness || 0.5,
          });
          child.material = sharedMaterial;
        }
      }
    });

    // Store references for animation (find wheels in the model)
    // Only use named objects - don't fallback to children to avoid rotating wrong parts
    this.frontWheel = this.motorcycle.getObjectByName("frontWheel");
    this.rearWheel = this.motorcycle.getObjectByName("rearWheel");

    // Store user data
    this.motorcycle.userData.frontWheel = this.frontWheel;
    this.motorcycle.userData.rearWheel = this.rearWheel;
    this.motorcycle.userData.originalColor = new THREE.Color(bikeColor);

    this.scene.add(this.motorcycle);

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

  initBackgrounds() {
    try {
      console.log("[INIT] Creating BackgroundSystem...");
      this.backgrounds = new BackgroundSystem(this.scene, this.camera);
      console.log("[INIT] BackgroundSystem created successfully");

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
    let touchStartX = 0;
    let touchStartY = 0;

    // Store bound handlers for cleanup
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
    // Create intro animation
    this.introAnimation = new IntroAnimation(
      this.scene,
      this.camera,
      this.audioManager
    );

    // Create player selection
    this.playerSelection = new PlayerSelection(
      this.scene,
      this.camera,
      this.audioManager
    );

    // Start intro animation
    this.introAnimation.onComplete = () => {
      // Clean up intro
      this.introAnimation.cleanup();

      // Show player selection
      this.playerSelection.showSelectionUI();

      // Set up selection callback
      this.playerSelection.onSelectionComplete = (selectedBike) => {
        console.log("Selected bike:", selectedBike);

        // Store selected bike for motorcycle creation
        this.selectedBike = selectedBike;

        // Hide selection UI
        this.playerSelection.hideSelectionUI();

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
    const countInterval = setInterval(() => {
      if (count > 0) {
        countdown.textContent = count;
        count--;
      } else {
        countdown.textContent = "GO!";
        clearInterval(countInterval);
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

    const countdownInterval = setInterval(() => {
      if (this.countdownValue > 0) {
        this.showGameMessage(this.countdownValue.toString(), "info");
        if (this.audioManager) {
          this.audioManager.play("revEngine", { clone: true, volume: 0.3 });
        }
        this.countdownValue--;
      } else {
        clearInterval(countdownInterval);
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
    if (!this.physics) return; // Safety check

    const controls = {
      throttle: 0,
      brake: 0,
      steer: 0,
    };

    // Throttle
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) {
      controls.throttle = 1;
    }

    // Brakes (removed Space since it's now camera toggle)
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) {
      controls.brake = 1;
    } else if (this.keys["ShiftLeft"] || this.keys["ShiftRight"]) {
      // Shift keys for front brake
      controls.brake = 1;
    }

    // Steering (left/right)
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) {
      controls.steer = -1; // Left
    } else if (this.keys["KeyD"] || this.keys["ArrowRight"]) {
      controls.steer = 1; // Right
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
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) {
      rawInputs.frontBrake = 0.8;
      rawInputs.rearBrake = 0.5;
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

  respawnPlayer() {
    this.isDead = false;

    // MEMORY LEAK FIX: Clean up death animation objects before respawn
    if (this.deathAnimation) {
      this.deathAnimation.cleanup();
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

    // Reset physics completely - back to start
    this.physics.reset();

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

    // Make everything visible again
    if (this.motorcycle) {
      this.motorcycle.visible = true;
      this.motorcycle.traverse((child) => {
        child.visible = true;
      });
    }
    if (this.rider) this.rider.visible = true; // Rider is back from being a puddle!

    // Reset physics but keep Z position (player has fallen behind)
    const currentState = this.physics.getState();
    this.physics.position.x = 0; // Reset to center of road
    this.physics.position.y = 0.3; // Reset to proper height
    // Keep Z position so player respawns where they died
    this.physics.speed = 20 / 2.237; // Start at low speed (20 mph)
    this.physics.velocity = { x: 0, y: 0, z: this.physics.speed };
    this.physics.rotation = { pitch: 0, yaw: 0, roll: 0 };

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
        this.traffic.update(deltaTime, state.position, state.velocity);

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

        // Make sun light follow player for consistent shadows
        if (this.sunLight) {
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
    }

    // Render - wrapped to catch shader uniform errors
    try {
      this.renderer.render(this.scene, this.camera);
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
  }

  start() {
    this.isRunning = true;
    this.isPaused = false;
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
