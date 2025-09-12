import * as THREE from 'three';
import { SimpleBikePhysics } from '../physics/SimpleBikePhysics.js';
import { MotorcyclePhysics } from '../physics/MotorcyclePhysics.js';
import { MotorcyclePhysicsV2 } from '../physics/MotorcyclePhysicsV2.js';
import { InputController } from '../physics/InputController.js';
import { Highway101 } from './Highway101.js';
import { TrafficSystem } from './TrafficSystem.js';
import { BackgroundSystem } from './backgrounds/BackgroundSystem.js';
import { DeathAnimation } from './DeathAnimation.js';
import { BloodTrackSystem } from './BloodTrackSystem.js';
import { MultiplayerManager } from '../multiplayer/MultiplayerManager.js';
import { MotorcycleFactory } from './MotorcycleFactory.js';
import { PerformanceManager } from '../utils/PerformanceManager.js';
import { AudioManager } from './AudioManager.js';

export class MotosaiGame {
  constructor(container, config = {}) {
    this.container = container;
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    
    // Configuration options
    this.config = {
      riderColor: config.riderColor || 0x2a2a2a, // Default dark grey
      ...config
    };
    
    // Game state
    this.isRunning = false;
    this.isPaused = false;
    this.score = 0;
    this.distance = 0; // miles traveled
    
    // Collision effects
    this.screenShake = {
      intensity: 0,
      duration: 0,
      offset: { x: 0, y: 0 }
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
      console.error('Performance manager failed, using defaults:', error);
      this.performanceManager = null;
      this.currentConfig = {
        antialias: true,
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        shadowType: THREE.PCFShadowMap,
        shadowMapSize: 2048,
        maxVehicles: 25,
        physicallyCorrectLights: false,
        toneMapping: THREE.ACESFilmicToneMapping
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
      forward: new THREE.Vector3()
    };
    
    // Pre-allocate temp vectors for death animation
    this._tempVelocity = new THREE.Vector3();
    this._tempDeathPosition = new THREE.Vector3();
    
    // Initialize components
    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initLights();
    this.initPhysics();
    this.initHighway();
    this.initBackgrounds();
    this.initControls();
    this.initHUD();
    this.initDeathAnimation();
    this.initAudio();
    this.initBloodTrackSystem();
    
    // Initialize multiplayer first, then traffic (for synchronization)
    if (this.isMultiplayerEnabled) {
      this.initMultiplayer().then(() => {
        this.initTraffic();
      });
    } else {
      this.initTraffic();
    }
    
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
        stencil: false // Not needed, saves memory
      });
    } catch (error) {
      console.error('WebGL initialization failed:', error);
      // Show error message to user
      const errorDiv = document.createElement('div');
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
    this.renderer.physicallyCorrectLights = this.currentConfig.physicallyCorrectLights;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    
    // Soft sky color
    this.renderer.setClearColor(0x87CEEB, 1);
    this.container.appendChild(this.renderer.domElement);
    
    // Handle resize and performance changes
    window.addEventListener('resize', this.boundHandleResize);
    window.addEventListener('performanceChanged', this.boundHandlePerformanceChange);
    
    // CRITICAL: Handle WebGL context loss to prevent crashes
    this.boundHandleContextLost = (e) => {
      e.preventDefault();
      console.error('WebGL context lost! Stopping render loop.');
      this.isPaused = true;
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      // Show user message
      this.showGameMessage('Graphics error - Please refresh the page', 'death');
    };
    
    this.boundHandleContextRestored = () => {
      console.log('WebGL context restored');
      this.initRenderer();
      this.isPaused = false;
      this.animate();
    };
    
    this.renderer.domElement.addEventListener('webglcontextlost', this.boundHandleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.boundHandleContextRestored);
  }
  
  initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87CEEB, 200, 3000); // Extended fog distance from 1000 to 3000
    
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
    
    // Smooth camera movement
    this.cameraPosition = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
  }
  
  initLights() {
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
    this.sunLight.shadow.camera.near = 1;  // Increased from 0.1 to reduce shadow acne
    this.sunLight.shadow.camera.far = 300;
    this.sunLight.shadow.mapSize.width = this.currentConfig.shadowMapSize;
    this.sunLight.shadow.mapSize.height = this.currentConfig.shadowMapSize;
    this.sunLight.shadow.radius = 2; // Reduced soft shadow edges
    this.sunLight.shadow.blurSamples = 10; // Fewer blur samples for performance
    this.sunLight.shadow.bias = -0.0005; // Add negative bias to fix shadow acne
    this.sunLight.shadow.normalBias = 0.02; // Add normal bias to prevent artifacts
    this.scene.add(this.sunLight);
    
    // Hemisphere light for soft sky lighting
    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x8b7355, 0.6);
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
    // Use MotorcycleFactory to create the motorcycle with rider
    this.motorcycle = MotorcycleFactory.createMotorcycle({
      bikeColor: 0xff0000,
      riderColor: this.config.riderColor,
      includeRider: true
    });
    
    // Get references to wheels and rider for animation
    this.frontWheel = this.motorcycle.userData.frontWheel;
    this.rearWheel = this.motorcycle.userData.rearWheel;
    this.rider = this.motorcycle.userData.rider;
    
    this.scene.add(this.motorcycle);
  }
  
  initHighway() {
    this.highway = new Highway101(this.scene);
    this.highway.generate();
  }
  
  initBackgrounds() {
    try {
      console.log('[INIT] Creating BackgroundSystem...');
      this.backgrounds = new BackgroundSystem(this.scene, this.camera);
      console.log('[INIT] BackgroundSystem created successfully');
      
      // Test with initial location (Big Sur) - this should trigger segment 0
      console.log('[INIT] Setting initial location to segment 0...');
      this.backgrounds.updateLocation(0, {
        lat: 36.2704,
        lng: -121.8081,
        name: 'Big Sur California Coast'
      });
      console.log('[INIT] Initial location set');
    } catch (error) {
      console.error('Error creating BackgroundSystem:', error);
      this.backgrounds = null; // Prevent crashes in render loop
    }
  }
  
  initTraffic() {
    this.trafficSystem = new TrafficSystem(this.scene, this.highway, this.camera, this.bloodTrackSystem, this.multiplayer);
    this.trafficSystem.spawn(this.currentConfig.maxVehicles);
    
    // For backward compatibility
    this.traffic = this.trafficSystem;
  }
  
  initControls() {
    this.keys = {};
    
    // Keyboard controls
    this.boundHandleKeyDown = (e) => {
      // Toggle camera mode with spacebar (don't set keys[Space] to avoid brake interference)
      if (e.code === 'Space') {
        e.preventDefault(); // Prevent page scroll
        this.toggleCameraMode();
        return; // Don't process space as a regular key
      }
      
      this.keys[e.code] = true;
      
      // Gear shifting
      if (e.code === 'KeyQ') {
        this.physics.setControls({ gearDown: true });
      } else if (e.code === 'KeyE') {
        this.physics.setControls({ gearUp: true });
      } else if (e.code === 'KeyV') {
        // Toggle physics version
        this.togglePhysicsVersion();
      }
    };
    
    this.boundHandleKeyUp = (e) => {
      this.keys[e.code] = false;
      
      if (e.code === 'KeyQ') {
        this.physics.setControls({ gearDown: false });
      } else if (e.code === 'KeyE') {
        this.physics.setControls({ gearUp: false });
      }
    };
    
    window.addEventListener('keydown', this.boundHandleKeyDown);
    window.addEventListener('keyup', this.boundHandleKeyUp);
    
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
        frontBrake: 0
      });
    };
    
    this.renderer.domElement.addEventListener('touchstart', this.boundHandleTouchStart);
    this.renderer.domElement.addEventListener('touchmove', this.boundHandleTouchMove);
    this.renderer.domElement.addEventListener('touchend', this.boundHandleTouchEnd);
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
    this.bloodTrackSystem = new BloodTrackSystem(this.scene);
  }
  
  async initMultiplayer() {
    if (!this.isMultiplayerEnabled) return;
    
    this.multiplayer = new MultiplayerManager(this);
    
    try {
      // Connect with a default username for now
      const playerInfo = await this.multiplayer.connect();
      console.log(`Connected to multiplayer as ${playerInfo.username}`);
      
      // Add multiplayer status to HUD
      this.updateMultiplayerHUD();
    } catch (error) {
      console.error('Failed to connect to multiplayer:', error);
      this.isMultiplayerEnabled = false;
    }
  }
  
  updateMultiplayerHUD() {
    if (!this.multiplayer || !this.multiplayer.isConnected) return;
    
    // Create multiplayer HUD if it doesn't exist
    if (!this.multiplayerHUD) {
      this.multiplayerHUD = document.createElement('div');
      this.multiplayerHUD.style.position = 'absolute';
      this.multiplayerHUD.style.top = '10px';
      this.multiplayerHUD.style.right = '10px';
      this.multiplayerHUD.style.color = 'white';
      this.multiplayerHUD.style.fontFamily = 'monospace';
      this.multiplayerHUD.style.fontSize = '12px';
      this.multiplayerHUD.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
      this.multiplayerHUD.style.textAlign = 'right';
      this.container.appendChild(this.multiplayerHUD);
    }
    
    const players = this.multiplayer.getPlayerList();
    const playerListHTML = players.map(p => 
      `<div style="color: ${p.id === this.multiplayer.playerId ? '#00ff00' : 'white'}">${p.username}</div>`
    ).join('');
    
    this.multiplayerHUD.innerHTML = `
      <div style="font-size: 14px; margin-bottom: 5px;">🏍️ Online Players (${players.length})</div>
      ${playerListHTML}
    `;
  }

  showGameMessage(message, type = 'info') {
    // Create game message container if it doesn't exist
    if (!this.gameMessageContainer) {
      this.gameMessageContainer = document.createElement('div');
      this.gameMessageContainer.style.position = 'absolute';
      this.gameMessageContainer.style.top = '50%';
      this.gameMessageContainer.style.left = '50%';
      this.gameMessageContainer.style.transform = 'translate(-50%, -50%)';
      this.gameMessageContainer.style.pointerEvents = 'none';
      this.gameMessageContainer.style.zIndex = '1000';
      this.container.appendChild(this.gameMessageContainer);
    }

    // Create message element
    const messageElement = document.createElement('div');
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
      case 'crash':
        messageElement.style.borderLeft = '5px solid #ff6600';
        messageElement.style.color = '#ffaa66';
        break;
      case 'death':
        messageElement.style.borderLeft = '5px solid #ff0000';
        messageElement.style.color = '#ff6666';
        break;
      default:
        messageElement.style.borderLeft = '5px solid #00ff00';
        messageElement.style.color = '#66ff66';
    }

    messageElement.textContent = message;
    this.gameMessageContainer.appendChild(messageElement);

    // Animate in
    const fadeInTimer = setTimeout(() => {
      messageElement.style.opacity = '1';
      this.activeTimers.delete(fadeInTimer);
    }, 50);
    this.activeTimers.add(fadeInTimer);

    // Animate out and remove after 3 seconds
    const fadeOutTimer = setTimeout(() => {
      messageElement.style.opacity = '0';
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
    const chatMsg = document.createElement('div');
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
  
  initHUD() {
    // Create HUD overlay
    this.hud = document.createElement('div');
    this.hud.style.position = 'absolute';
    this.hud.style.top = '10px';
    this.hud.style.left = '10px';
    this.hud.style.color = 'white';
    this.hud.style.fontFamily = 'monospace';
    this.hud.style.fontSize = '14px';
    this.hud.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
    this.container.appendChild(this.hud);
    
    // Pre-create HUD elements to avoid innerHTML allocations
    this.hudElements = {};
    const hudLines = ['camera', 'physics', 'gear', 'rpm', 'lean', 'turnRate', 'wobble', 'death', 'distance', 'score'];
    hudLines.forEach(line => {
      const elem = document.createElement('div');
      this.hud.appendChild(elem);
      this.hudElements[line] = elem;
    });
    
    // Speedometer
    this.speedometer = document.createElement('div');
    this.speedometer.style.position = 'absolute';
    this.speedometer.style.bottom = '20px';
    this.speedometer.style.right = '20px';
    this.speedometer.style.fontSize = '48px';
    this.speedometer.style.fontWeight = 'bold';
    this.speedometer.style.color = 'white';
    this.speedometer.style.textShadow = '3px 3px 6px rgba(0,0,0,0.7)';
    this.container.appendChild(this.speedometer);
  }
  
  updateControls(deltaTime) {
    // Simple direct controls for our new physics
    const controls = {
      throttle: 0,
      brake: 0,
      steer: 0
    };
    
    // Throttle
    if (this.keys['KeyW'] || this.keys['ArrowUp']) {
      controls.throttle = 1;
    }
    
    // Brakes (removed Space since it's now camera toggle)
    if (this.keys['KeyS'] || this.keys['ArrowDown']) {
      controls.brake = 1;
    }
    
    // Steering (left/right)
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
      controls.steer = -1;  // Left
    } else if (this.keys['KeyD'] || this.keys['ArrowRight']) {
      controls.steer = 1;   // Right
    }
    
    // Apply controls to physics
    this.physics.setControls(controls);
  }
  
  updateControlsComplex(deltaTime) {
    // Complex controls for old physics with InputController
    const state = this.physics.getState();
    const speed = state.speed / 2.237; // Convert MPH to m/s
    
    const rawInputs = {
      throttle: 0,
      frontBrake: 0,
      rearBrake: 0,
      lean: 0,
      steer: 0
    };
    
    // Throttle
    if (this.keys['KeyW'] || this.keys['ArrowUp']) {
      rawInputs.throttle = 1;
    }
    
    // Brakes (removed Space since it's now camera toggle, use Shift for front brake)
    if (this.keys['KeyS'] || this.keys['ArrowDown']) {
      rawInputs.frontBrake = 0.8;
      rawInputs.rearBrake = 0.5;
    } else if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) {
      rawInputs.frontBrake = 1;
    }
    
    // Lean/Steer
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
      rawInputs.lean = -1;
      rawInputs.steer = -1;
    } else if (this.keys['KeyD'] || this.keys['ArrowRight']) {
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
      clutch: this.keys['ShiftLeft'] || false
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
        this.rider.visible = true; // Make sure rider is visible too in third person
      }
    }
    
    // Use pre-allocated objects instead of creating new ones
    const { bikeMatrix, leanMatrix, offset, targetCameraPos, targetLookAt, lookOffset } = this._cameraUpdateObjects;
    
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
    const leanX = leanOffset * Math.cos(state.rotation.yaw + Math.PI/2);
    const leanZ = leanOffset * Math.sin(state.rotation.yaw + Math.PI/2);
    
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
    
    // Smooth camera movement - more responsive at all speeds
    const speedMPH = state.speed;
    let smoothing;
    if (speedMPH > 200) {
      smoothing = 1.0; // Instant lock at extreme speeds
    } else if (speedMPH > 150) {
      smoothing = 0.95; // Nearly instant
    } else if (speedMPH > 100) {
      smoothing = 0.85;
    } else if (speedMPH > 50) {
      smoothing = 0.75;
    } else {
      smoothing = 0.65; // Much more responsive at low speeds (was 0.25)
    }
    
    this.cameraPosition.lerp(targetCameraPos, smoothing);
    this.cameraTarget.lerp(targetLookAt, smoothing);
    
    // Dynamic FOV based on speed for better speed perception
    const baseFOV = 60;
    const maxFOVIncrease = 30; // Maximum FOV increase at top speed
    const speedRatio = Math.min(speedMPH / 200, 1); // Normalize to displayed max of 200mph
    const targetFOV = baseFOV + (maxFOVIncrease * speedRatio * speedRatio); // Quadratic increase
    
    // Smooth FOV transition - make it more responsive
    const currentFOV = this.camera.fov;
    this.camera.fov = currentFOV + (targetFOV - currentFOV) * 0.2; // Faster FOV changes (was 0.1)
    this.camera.updateProjectionMatrix();
    
    // Apply camera position with screen shake
    this.camera.position.set(
      this.cameraPosition.x + this.screenShake.offset.x * 0.1,
      this.cameraPosition.y + this.screenShake.offset.y * 0.1,
      this.cameraPosition.z
    );
    this.camera.lookAt(this.cameraTarget);
    
    // IMMERSIVE CAMERA TILT: Rotate the camera to match the rider's lean angle
    // This simulates the rider's head tilting with the motorcycle
    // We use a percentage of the actual lean angle for a more comfortable viewing experience
    // More tilt in first person for full immersion
    const cameraLeanFactor = this.isFirstPerson ? 0.9 : 0.7; // 90% in first person, 70% in third
    const targetCameraRoll = state.rotation.roll * cameraLeanFactor;
    
    // Smooth the camera roll transition - make it more responsive
    if (!this.cameraRoll) this.cameraRoll = 0;
    this.cameraRoll += (targetCameraRoll - this.cameraRoll) * 0.3; // Faster transition (was 0.15)
    
    // Apply the roll rotation to the camera
    // Use pre-allocated vectors instead of creating new ones
    const { up, forward } = this._cameraUpdateObjects;
    up.set(0, 1, 0);
    forward.subVectors(this.cameraTarget, this.camera.position).normalize();
    
    // Apply roll rotation around the forward axis
    up.applyAxisAngle(forward, this.cameraRoll);
    this.camera.up.copy(up);
  }
  
  updateHUD() {
    const state = this.physics.getState();
    
    // Update speedometer
    this.speedometer.textContent = `${Math.round(state.speed)} MPH`;
    
    // Determine physics mode label
    let physicsMode = 'Simple (Working)';
    if (!this.useSimplePhysics) {
      physicsMode = this.useV2Physics ? 'V2 (Complex)' : 'V1 (Complex)';
    }
    
    // Update HUD elements directly without innerHTML
    this.hudElements.camera.textContent = `Camera: ${this.isFirstPerson ? 'First Person' : 'Third Person'} (Space)`;
    this.hudElements.physics.textContent = `Physics: ${physicsMode}`;
    
    // Add performance level color coding - with safety checks
    if (this.performanceManager && this.hudElements.performance && this.hudElements.fps) {
      const perfLevel = this.performanceManager.performanceLevel;
      this.hudElements.performance.textContent = `Performance: ${perfLevel.toUpperCase()}`;
      this.hudElements.performance.style.color = perfLevel === 'high' ? '#00ff00' : perfLevel === 'medium' ? '#ffff00' : '#ff6600';
      
      const fps = Math.round(this.performanceManager.getAverageFPS());
      this.hudElements.fps.textContent = `FPS: ${fps}`;
      this.hudElements.fps.style.color = fps >= 55 ? '#00ff00' : fps >= 30 ? '#ffff00' : '#ff6600';
    }
    
    this.hudElements.gear.textContent = `Gear: ${state.gear || 'N/A'}`;
    this.hudElements.rpm.textContent = `RPM: ${state.rpm || 'N/A'}`;
    this.hudElements.lean.textContent = `Lean: ${state.leanAngle !== undefined ? state.leanAngle.toFixed(1) : '0.0'}°`;
    
    // Conditionally show/hide turn rate
    if (state.turnRate !== undefined) {
      this.hudElements.turnRate.textContent = `Turn Rate: ${state.turnRate.toFixed(1)}°/s`;
      this.hudElements.turnRate.style.display = 'block';
    } else {
      this.hudElements.turnRate.style.display = 'none';
    }
    
    // Wobble warning
    if (state.collision && state.collision.isWobbling) {
      this.hudElements.wobble.textContent = '⚠️ WOBBLING!';
      this.hudElements.wobble.style.color = 'orange';
      this.hudElements.wobble.style.display = 'block';
    } else {
      this.hudElements.wobble.style.display = 'none';
    }
    
    // Death indicator
    if (this.isDead) {
      this.hudElements.death.textContent = '💀 DEAD - Respawning...';
      this.hudElements.death.style.color = 'red';
      this.hudElements.death.style.fontSize = '20px';
      this.hudElements.death.style.display = 'block';
    } else {
      this.hudElements.death.style.display = 'none';
    }
    
    this.hudElements.distance.textContent = `Distance: ${(this.distance / 5280).toFixed(1)} mi`;
    this.hudElements.score.textContent = `Score: ${this.score}`;
  }
  
  toggleCameraMode() {
    this.isFirstPerson = !this.isFirstPerson;
    
    // Switch camera offsets
    if (this.isFirstPerson) {
      this.cameraOffset = this.firstPersonOffset.clone();
      this.cameraLookOffset = this.firstPersonLookOffset.clone();
      console.log('Switched to First Person view');
    } else {
      this.cameraOffset = this.thirdPersonOffset.clone();
      this.cameraLookOffset = this.thirdPersonLookOffset.clone();
      console.log('Switched to Third Person view');
    }
  }
  
  triggerDeath(state) {
    if (this.isDead) return; // Already dead
    
    this.isDead = true;
    this.motorcycle.visible = false; // Hide motorcycle immediately
    this.rider.visible = false; // Hide rider immediately - they're now a puddle!
    
    // Play death/explosion sound
    if (this.audioManager) {
      this.audioManager.play('explosionBloody', { clone: true, volume: 0.7 });
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
    
    // MEMORY LEAK FIX: Clean up traffic system debris
    if (this.trafficSystem) {
      this.trafficSystem.cleanupDebris();
    }
    
    // Make everything visible again
    this.motorcycle.visible = true;
    this.rider.visible = true; // Rider is back from being a puddle!
    
    // Also make all children visible
    this.motorcycle.traverse((child) => {
      child.visible = true;
    });
    
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
      slideTime: 0
    };
    
    // Reset visual elements
    this.rider.rotation.set(0, 0, 0);
    this.frontWheel.rotation.x = 0;
    this.rearWheel.rotation.x = 0;
    
    // Play rev engine sound on respawn
    if (this.audioManager) {
      this.audioManager.play('revEngine', { clone: true, volume: 0.4 });
    }
    
    console.log('Player respawned!');
  }
  
  handleBarrierCollision(collision) {
    // Handle different severity levels
    switch(collision.severity) {
      case 'bump':
        // Low speed - just screen shake and tire screech
        if (this.audioManager) {
          this.audioManager.play('tireScreechShort', { clone: true, volume: 0.5 });
        }
        this.screenShake.intensity = 5;
        this.screenShake.duration = 0.2;
        console.log(`Barrier bump at ${collision.speedMph.toFixed(0)} mph`);
        break;
        
      case 'explode':
        // Medium speed - explosion effect
        // Explosion effect happens with death animation
        if (this.audioManager) {
          this.audioManager.play('explosion', { clone: true, volume: 0.6 });
        }
        this.screenShake.intensity = 15;
        this.screenShake.duration = 0.5;
        console.log(`Barrier explosion at ${collision.speedMph.toFixed(0)} mph`);
        break;
        
      case 'smear':
        // High speed - explosion + blood smear on barrier
        // Explosion effect happens with death animation
        if (this.audioManager) {
          this.audioManager.play('explosionBloody', { clone: true, volume: 0.8 });
          this.audioManager.play('tireScreechLong', { clone: true, volume: 0.4 });
        }
        
        if (this.bloodTrackSystem) {
          // Create blood smear along the barrier (more blood, spread out)
          for (let i = 0; i < 10; i++) {
            const smearOffset = {
              x: collision.position.x + (Math.random() - 0.5) * 0.5, // Keep close to barrier
              y: collision.position.y + Math.random() * 2, // Vertical smear
              z: collision.position.z + (Math.random() - 0.5) * 8 // Long smear along barrier
            };
            this.bloodTrackSystem.addBloodSplat(smearOffset, 3.0); // Extra large blood splats
          }
          
          // Add additional blood trail effect
          for (let i = 0; i < 5; i++) {
            const trailOffset = {
              x: collision.position.x,
              y: 0.1,
              z: collision.position.z - i * 2 // Trail behind impact point
            };
            this.bloodTrackSystem.addBloodSplat(trailOffset, 2.5);
          }
        }
        
        this.screenShake.intensity = 30;
        this.screenShake.duration = 1.0;
        console.log(`Barrier SMEAR at ${collision.speedMph.toFixed(0)} mph!`);
        break;
    }
  }
  
  handlePerformanceChange(event) {
    const { level, previousLevel } = event.detail;
    console.log(`Performance level changed from ${previousLevel} to ${level}`);
    
    // Update current config
    this.currentConfig = this.performanceManager.getConfig();
    
    // Apply immediate changes that don't require restart
    if (this.renderer) {
      this.renderer.setPixelRatio(this.currentConfig.pixelRatio);
      this.renderer.toneMapping = this.currentConfig.toneMapping;
      this.renderer.physicallyCorrectLights = this.currentConfig.physicallyCorrectLights;
      
      // Update shadow map settings
      this.renderer.shadowMap.type = this.currentConfig.shadowType;
      if (this.sunLight) {
        this.sunLight.shadow.mapSize.setScalar(this.currentConfig.shadowMapSize);
      }
    }
    
    // Update traffic system
    if (this.trafficSystem) {
      this.trafficSystem.setMaxVehicles(this.currentConfig.maxVehicles);
      this.trafficSystem.setSpawnDistance(this.currentConfig.spawnDistance);
    }
    
    // Update highway if possible
    if (this.highway && typeof this.highway.setSegmentCount === 'function') {
      this.highway.setSegmentCount(this.currentConfig.segmentCount);
    }
    
    // Show performance notification
    this.showGameMessage(`Performance adjusted to: ${level.toUpperCase()}`, 'info');
  }
  
  togglePhysicsVersion() {
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
      console.warn('Large deltaTime detected, skipping frame');
      return;
    }
    
    if (!this.isPaused) {
      // Wrap everything in try-catch to prevent crashes
      try {
      // Get physics state first
      let state;
      
      // Handle death animation
      if (this.isDead) {
        // Update death animation
        const readyForRespawn = this.deathAnimation.update(deltaTime);
        
        // Check if we should respawn
        if (readyForRespawn && !this.deathAnimation.isAnimating) {
          this.respawnPlayer();
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
            // Handle barrier-specific effects before death
            if (state.collision.type === 'barrier') {
              this.handleBarrierCollision(state.collision);
            }
            this.triggerDeath(state);
          } else if (state.collision.type === 'barrier') {
            // Non-fatal barrier collision (shouldn't happen anymore but just in case)
            this.handleBarrierCollision(state.collision);
          } else {
            // Minor collision - just wobble
            // Trigger screen shake on new collision
            if (state.collision.isWobbling && this.screenShake.duration <= 0) {
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
        if (!this.multiplayerHUDUpdateTimer) this.multiplayerHUDUpdateTimer = 0;
        this.multiplayerHUDUpdateTimer += deltaTime;
        if (this.multiplayerHUDUpdateTimer >= 2.0) { // Update only once per 2 seconds
          this.updateMultiplayerHUD();
          this.multiplayerHUDUpdateTimer = 0;
        }
      }
      
      // ALWAYS update traffic regardless of death state
      this.traffic.update(deltaTime, state.position, state.velocity);
      
      // Update blood track system
      if (this.bloodTrackSystem) {
        this.bloodTrackSystem.update(deltaTime);
        
        // Add blood while sliding on wall (high speed crashes)
        if (state.collision && state.collision.isSlidingOnWall) {
          // Add blood splat every few frames while sliding
          if (!this.lastWallBloodTime) this.lastWallBloodTime = 0;
          this.lastWallBloodTime += deltaTime;
          
          if (this.lastWallBloodTime > 0.05) { // Every 50ms
            const wallX = state.collision.wallSide === 'right' ? 
              Math.abs(state.position.x) - 0.5 : // Slightly off wall
              -Math.abs(state.position.x) + 0.5;
            
            this.bloodTrackSystem.addBloodSplat({
              x: wallX,
              y: Math.random() * 1.5, // Vary height on wall
              z: state.position.z + Math.random() * 2 - 1
            }, 2.0); // Large splats
            
            this.lastWallBloodTime = 0;
          }
        } else {
          this.lastWallBloodTime = 0;
        }
      }
      
      // Update highway 
      this.highway.update(state.position.z, state.actualSpeed || state.speed);
      
      // Update screen shake
      if (this.screenShake.duration > 0) {
        this.screenShake.duration -= deltaTime;
        this.screenShake.offset.x = (Math.random() - 0.5) * this.screenShake.intensity;
        this.screenShake.offset.y = (Math.random() - 0.5) * this.screenShake.intensity;
      } else {
        this.screenShake.offset.x = 0;
        this.screenShake.offset.y = 0;
      }
      
      // Handle motorcycle visibility and updates - DEATH CHECK FIRST!
      if (this.isDead) {
        // ALWAYS force hide when dead - this is the FIRST check
        this.motorcycle.visible = false;
        this.rider.visible = false;
        // Also hide all children to be absolutely sure
        this.motorcycle.traverse((child) => {
          child.visible = false;
        });
        // Don't do any other updates when dead
      } else if (this.motorcycle) {
        // Only update when alive
        // Handle invulnerability flashing - DISABLED to prevent flickering
        // Just show normally even during invulnerability
        this.motorcycle.visible = true;
        this.rider.visible = true;
        
        // Update motorcycle position and rotation
        // Apply lean offset to make it rotate around ground contact point
        const leanOffset = Math.sin(state.rotation.roll) * 0.4; // Height of bike center from ground
        
        this.motorcycle.position.set(
          state.position.x + leanOffset * Math.cos(state.rotation.yaw + Math.PI/2),
          0, // Force Y to 0 to prevent vertical vibration
          state.position.z + leanOffset * Math.sin(state.rotation.yaw + Math.PI/2)
        );
        
        // Apply rotations in correct order: yaw first, then lean, then pitch
        this.motorcycle.rotation.set(0, 0, 0);
        this.motorcycle.rotateY(state.rotation.yaw);
        this.motorcycle.rotateZ(state.rotation.roll);
        this.motorcycle.rotateX(state.rotation.pitch);
        
        // Update wheels rotation
        this.frontWheel.rotation.x += state.speed * deltaTime * 0.1;
        this.rearWheel.rotation.x += state.speed * deltaTime * 0.1;
        
        // Rider lean animation
        this.rider.rotation.z = -state.rotation.roll * 0.5;
        this.rider.rotation.x = state.rotation.pitch * 0.3;
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
        if (this.shadowUpdateTimer >= this.shadowUpdateInterval && this.renderer.shadowMap.enabled) {
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
      
      // Track distance
      this.distance += state.speed * deltaTime * 1.467; // mph to ft/s
      
      // Update performance manager
      if (this.performanceManager) {
        this.performanceManager.update(deltaTime);
      }
      
      } catch (error) {
        console.error('Animation loop error:', error);
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
          console.log('Gentle traffic cleanup:', this.traffic.vehicles.length);
          // Only remove vehicles that are far from player
          const playerZ = this.physics.getState().position.z;
          this.traffic.vehicles = this.traffic.vehicles.filter(vehicle => {
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
        console.error('Memory cleanup error:', error);
      }
    }
    
    // Render - wrapped to catch shader uniform errors
    try {
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      // Log the error once to avoid spamming console
      if (!this.shaderErrorLogged) {
        console.error('Render error:', error);
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
    if (this.traffic && typeof this.traffic.reset === 'function') {
      this.traffic.reset();
    }
  }
  
  dispose() {
    // Mark as disposed to prevent further animation frames
    this.isDisposed = true;
    
    // Stop animation loop
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    // Clear all active timers to prevent memory leaks
    this.activeTimers.forEach(timer => clearTimeout(timer));
    this.activeTimers.clear();
    this.activeChatTimers.forEach(timer => clearTimeout(timer));
    this.activeChatTimers.clear();
    
    // Dispose of physics and input controller
    if (this.physics && typeof this.physics.dispose === 'function') {
      this.physics.dispose();
    }
    if (this.inputController && typeof this.inputController.dispose === 'function') {
      this.inputController.dispose();
    }
    
    // Dispose of multiplayer
    if (this.multiplayer) {
      this.multiplayer.disconnect();
    }
    
    // Dispose of game systems
    if (this.traffic && typeof this.traffic.dispose === 'function') {
      this.traffic.dispose();
    }
    if (this.highway && typeof this.highway.dispose === 'function') {
      this.highway.dispose();
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
    
    // Dispose of renderer
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    
    // Clean up scene
    if (this.scene) {
      this.scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(mat => mat.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }
    
    // Remove HUD elements
    if (this.hud) {
      this.hud.remove();
    }
    if (this.speedometer) {
      this.speedometer.remove();
    }
    if (this.multiplayerHUD) {
      this.multiplayerHUD.remove();
    }
    if (this.gameMessageContainer) {
      this.gameMessageContainer.remove();
    }
    
    // Remove event listeners
    window.removeEventListener('resize', this.boundHandleResize);
    window.removeEventListener('keydown', this.boundHandleKeyDown);
    window.removeEventListener('keyup', this.boundHandleKeyUp);
    window.removeEventListener('performanceChanged', this.boundHandlePerformanceChange);
    
    // Remove WebGL context event listeners
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.boundHandleContextLost);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.boundHandleContextRestored);
    }
    
    // Remove touch event listeners if they exist
    if (this.renderer && this.renderer.domElement) {
      if (this.boundHandleTouchStart) {
        this.renderer.domElement.removeEventListener('touchstart', this.boundHandleTouchStart);
      }
      if (this.boundHandleTouchMove) {
        this.renderer.domElement.removeEventListener('touchmove', this.boundHandleTouchMove);
      }
      if (this.boundHandleTouchEnd) {
        this.renderer.domElement.removeEventListener('touchend', this.boundHandleTouchEnd);
      }
    }
  }
}