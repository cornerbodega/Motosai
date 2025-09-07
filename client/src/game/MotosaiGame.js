import * as THREE from 'three';
import { SimpleBikePhysics } from '../physics/SimpleBikePhysics.js';
import { MotorcyclePhysics } from '../physics/MotorcyclePhysics.js';
import { MotorcyclePhysicsV2 } from '../physics/MotorcyclePhysicsV2.js';
import { InputController } from '../physics/InputController.js';
import { Highway101 } from './Highway101.js';
import { TrafficSystem } from './TrafficSystem.js';
import { BackgroundSystem } from './backgrounds/BackgroundSystem.js';

export class MotosaiGame {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    
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
    
    // Store bound event handlers for cleanup
    this.boundHandleResize = () => this.onResize();
    this.boundHandleKeyDown = (e) => this.handleKeyDown(e);
    this.boundHandleKeyUp = (e) => this.handleKeyUp(e);
    
    // Initialize components
    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initLights();
    this.initPhysics();
    this.initHighway();
    this.initBackgrounds();
    this.initTraffic();
    this.initControls();
    this.initHUD();
    
    // Start game loop - delay slightly to ensure all materials are initialized
    this.lastTime = performance.now();
    requestAnimationFrame(() => this.animate());
  }
  
  initRenderer() {
    try {
      this.renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false // Allow fallback to software rendering
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.8;
    this.renderer.setClearColor(0x87CEEB, 1); // Set clear color to sky blue
    this.container.appendChild(this.renderer.domElement);
    
    // Handle resize
    window.addEventListener('resize', this.boundHandleResize);
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
    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    
    // Directional light (sun)
    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.sunLight.position.set(50, 100, 50);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.camera.left = -50;
    this.sunLight.shadow.camera.right = 50;
    this.sunLight.shadow.camera.top = 50;
    this.sunLight.shadow.camera.bottom = -50;
    this.sunLight.shadow.camera.near = 0.1;
    this.sunLight.shadow.camera.far = 200;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.scene.add(this.sunLight);
    
    // Hemisphere light for ambient
    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x545454, 0.4);
    this.scene.add(hemi);
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
    this.motorcycle = new THREE.Group();
    
    // Body (simplified sportbike shape)
    const bodyGeo = new THREE.BoxGeometry(0.3, 0.4, 1.8);
    const bodyMat = new THREE.MeshPhongMaterial({ 
      color: 0xff0000,
      shininess: 100
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    body.castShadow = true;
    this.motorcycle.add(body);
    
    // Tank
    const tankGeo = new THREE.BoxGeometry(0.35, 0.3, 0.6);
    const tank = new THREE.Mesh(tankGeo, bodyMat);
    tank.position.set(0, 0.55, 0.2);
    this.motorcycle.add(tank);
    
    // Seat
    const seatGeo = new THREE.BoxGeometry(0.25, 0.1, 0.5);
    const seatMat = new THREE.MeshPhongMaterial({ color: 0x000000 });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(0, 0.65, -0.3);
    this.motorcycle.add(seat);
    
    // Front wheel
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 8);
    const wheelMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    this.frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
    this.frontWheel.rotation.z = Math.PI / 2;
    this.frontWheel.position.set(0, 0.3, 0.7);
    this.frontWheel.castShadow = true;
    this.motorcycle.add(this.frontWheel);
    
    // Rear wheel
    this.rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
    this.rearWheel.rotation.z = Math.PI / 2;
    this.rearWheel.position.set(0, 0.32, -0.7);
    this.rearWheel.castShadow = true;
    this.motorcycle.add(this.rearWheel);
    
    // Fork
    const forkGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6);
    const forkMat = new THREE.MeshPhongMaterial({ color: 0x666666 });
    const fork1 = new THREE.Mesh(forkGeo, forkMat);
    fork1.position.set(0.08, 0.3, 0.7);
    fork1.rotation.z = 0.1;
    this.motorcycle.add(fork1);
    
    const fork2 = new THREE.Mesh(forkGeo, forkMat);
    fork2.position.set(-0.08, 0.3, 0.7);
    fork2.rotation.z = -0.1;
    this.motorcycle.add(fork2);
    
    // Handlebars
    const barGeo = new THREE.BoxGeometry(0.5, 0.02, 0.02);
    const bars = new THREE.Mesh(barGeo, forkMat);
    bars.position.set(0, 0.7, 0.6);
    this.motorcycle.add(bars);
    
    // Rider (very simple)
    const riderGroup = new THREE.Group();
    
    // Helmet
    const helmetGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const helmetMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.set(0, 1.0, -0.1);
    riderGroup.add(helmet);
    
    // Body
    const riderBodyGeo = new THREE.BoxGeometry(0.3, 0.4, 0.3);
    const riderBodyMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const riderBody = new THREE.Mesh(riderBodyGeo, riderBodyMat);
    riderBody.position.set(0, 0.8, -0.2);
    riderGroup.add(riderBody);
    
    this.rider = riderGroup;
    this.motorcycle.add(this.rider);
    
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
    this.traffic = new TrafficSystem(this.scene, this.highway, this.camera);
    this.traffic.spawn(20); // Start with 20 vehicles
  }
  
  initSoftShaders() {
    if (this.useSoftShaders) {
      try {
        this.softShaders = new SoftShaderSystem(this.renderer, this.scene, this.camera);
        console.log('Soft shader system initialized');
      } catch (error) {
        console.error('Failed to initialize soft shaders:', error);
        this.useSoftShaders = false;
      }
    }
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
      } else if (e.code === 'KeyG') {
        // Toggle soft shaders
        this.toggleSoftShaders();
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
    
    this.renderer.domElement.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    });
    
    this.renderer.domElement.addEventListener('touchmove', (e) => {
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
    });
    
    this.renderer.domElement.addEventListener('touchend', () => {
      this.physics.setControls({ 
        lean: 0,
        throttle: 0,
        frontBrake: 0
      });
    });
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
    
    // Hide/show motorcycle based on camera mode
    if (this.motorcycle) {
      this.motorcycle.visible = !this.isFirstPerson;
    }
    
    // Calculate camera position based on bike
    const bikeMatrix = new THREE.Matrix4();
    bikeMatrix.makeRotationY(state.rotation.yaw);
    
    // Apply lean to camera offset (but not as much as the bike itself in third person)
    const leanMatrix = new THREE.Matrix4();
    const leanFactor = this.isFirstPerson ? 0.8 : 0.3; // More lean in first person for immersion
    leanMatrix.makeRotationZ(state.rotation.roll * leanFactor);
    
    // Camera offset
    const offset = this.cameraOffset.clone();
    offset.applyMatrix4(leanMatrix);
    offset.applyMatrix4(bikeMatrix);
    
    // Account for lean offset in camera position
    const leanOffset = Math.sin(state.rotation.roll) * 0.4;
    const leanX = leanOffset * Math.cos(state.rotation.yaw + Math.PI/2);
    const leanZ = leanOffset * Math.sin(state.rotation.yaw + Math.PI/2);
    
    // Target positions
    const targetCameraPos = new THREE.Vector3(
      state.position.x + offset.x + leanX,
      state.position.y + offset.y + 1,
      state.position.z + offset.z + leanZ
    );
    
    const lookOffset = this.cameraLookOffset.clone();
    lookOffset.applyMatrix4(bikeMatrix);
    
    const targetLookAt = new THREE.Vector3(
      state.position.x + lookOffset.x,
      state.position.y + lookOffset.y,
      state.position.z + lookOffset.z
    );
    
    // Smooth camera movement - much faster lerp at high speeds
    const speedMPH = state.speed;
    let smoothing;
    if (speedMPH > 200) {
      smoothing = 1.0; // Instant lock at extreme speeds
    } else if (speedMPH > 150) {
      smoothing = 0.9; // Nearly instant
    } else if (speedMPH > 100) {
      smoothing = 0.6;
    } else if (speedMPH > 50) {
      smoothing = 0.4;
    } else {
      smoothing = 0.25; // Still smooth at low speeds
    }
    
    this.cameraPosition.lerp(targetCameraPos, smoothing);
    this.cameraTarget.lerp(targetLookAt, smoothing);
    
    // Dynamic FOV based on speed for better speed perception
    const baseFOV = 60;
    const maxFOVIncrease = 30; // Maximum FOV increase at top speed
    const speedRatio = Math.min(speedMPH / 200, 1); // Normalize to displayed max of 200mph
    const targetFOV = baseFOV + (maxFOVIncrease * speedRatio * speedRatio); // Quadratic increase
    
    // Smooth FOV transition
    const currentFOV = this.camera.fov;
    this.camera.fov = currentFOV + (targetFOV - currentFOV) * 0.1;
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
    
    // Smooth the camera roll transition
    if (!this.cameraRoll) this.cameraRoll = 0;
    this.cameraRoll += (targetCameraRoll - this.cameraRoll) * 0.15; // Smooth transition
    
    // Apply the roll rotation to the camera
    // Save the current up vector and rotation
    const up = new THREE.Vector3(0, 1, 0);
    const forward = new THREE.Vector3();
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
    
    // Update info display
    this.hud.innerHTML = `
      Camera: ${this.isFirstPerson ? 'First Person' : 'Third Person'} (Space)<br>
      Shaders: ${this.useSoftShaders ? 'Soft' : 'Standard'} (G)<br>
      Physics: ${physicsMode}<br>
      Gear: ${state.gear || 'N/A'}<br>
      RPM: ${state.rpm || 'N/A'}<br>
      Lean: ${state.leanAngle !== undefined ? state.leanAngle.toFixed(1) : '0.0'}°<br>
      ${state.turnRate !== undefined ? `Turn Rate: ${state.turnRate.toFixed(1)}°/s<br>` : ''}
      ${state.collision && state.collision.isWobbling ? `<span style="color: orange">⚠️ WOBBLING!</span><br>` : ''}
      ${state.collision && state.collision.isCrashed ? `<span style="color: red">💥 CRASHED!</span><br>` : ''}
      Distance: ${(this.distance / 5280).toFixed(1)} mi<br>
      Score: ${this.score}
    `;
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
  
  toggleSoftShaders() {
    this.useSoftShaders = !this.useSoftShaders;
    
    if (this.useSoftShaders && !this.softShaders) {
      this.initSoftShaders();
    } else if (!this.useSoftShaders && this.softShaders) {
      this.softShaders.dispose();
      this.softShaders = null;
      // Need to refresh materials
      this.scene.traverse((object) => {
        if (object.isMesh && object.material) {
          object.material.needsUpdate = true;
        }
      });
    }
    
    console.log('Soft shaders:', this.useSoftShaders ? 'ON' : 'OFF');
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
    this.animationId = requestAnimationFrame(() => this.animate());
    
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    
    if (!this.isPaused) {
      // Update controls
      if (this.useSimplePhysics) {
        // Direct controls for simple physics
        this.updateControls(deltaTime);
      } else {
        // Use input controller for complex physics
        this.updateControlsComplex(deltaTime);
      }
      
      // Update physics (pass traffic for collision detection)
      const state = this.useSimplePhysics 
        ? this.physics.update(deltaTime, this.traffic) 
        : this.physics.update(deltaTime);
      
      // Check for collision effects
      if (state.collision) {
        // Trigger screen shake on new collision
        if (state.collision.isWobbling && this.screenShake.duration <= 0) {
          this.screenShake.intensity = state.collision.isCrashed ? 20 : 10;
          this.screenShake.duration = 0.3;
        }
        
        // Flash effect for invulnerability
        if (state.collision.invulnerable) {
          this.motorcycle.visible = Math.sin(Date.now() * 0.01) > 0;
        } else {
          this.motorcycle.visible = true;
        }
      }
      
      // Update screen shake
      if (this.screenShake.duration > 0) {
        this.screenShake.duration -= deltaTime;
        this.screenShake.offset.x = (Math.random() - 0.5) * this.screenShake.intensity;
        this.screenShake.offset.y = (Math.random() - 0.5) * this.screenShake.intensity;
      } else {
        this.screenShake.offset.x = 0;
        this.screenShake.offset.y = 0;
      }
      
      // Update motorcycle position and rotation
      // Apply lean offset to make it rotate around ground contact point
      const leanOffset = Math.sin(state.rotation.roll) * 0.4; // Height of bike center from ground
      
      this.motorcycle.position.set(
        state.position.x + leanOffset * Math.cos(state.rotation.yaw + Math.PI/2),
        state.position.y,
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
      
      // Update highway (infinite scrolling)
      this.highway.update(state.position.z, state.actualSpeed || state.speed);
      
      // Update traffic
      this.traffic.update(deltaTime, state.position);
      
      // Update backgrounds
      if (this.backgrounds) {
        this.backgrounds.update(deltaTime, state.position);
        // Update location based on absolute position
        // this.distance is in feet, convert to meters
        const absoluteZ = this.distance * 0.3048; // Convert feet to meters
        const location = this.highway.getLocationAtPosition(absoluteZ);
        
        // Debug: Log every 100 frames
        if (!this.bgLogCounter) this.bgLogCounter = 0;
        if (this.bgLogCounter++ % 100 === 0) {
          console.log(`[DEBUG] Distance: ${(this.distance/5280).toFixed(2)}mi, absoluteZ: ${absoluteZ.toFixed(0)}m, location:`, location);
        }
        
        this.backgrounds.updateLocation(absoluteZ, location);
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
      }
      
      // Update camera
      this.updateCamera(deltaTime);
      
      // Speed effects on camera (using display speed)
      const speedMPH = state.speed; // This is now the scaled display speed
      if (speedMPH > 80) {
        // Increase FOV at high speeds for speed effect
        const targetFOV = 60 + Math.min((speedMPH - 80) / 10, 40); // Max 100 FOV at 480mph
        this.camera.fov += (targetFOV - this.camera.fov) * 0.1;
        this.camera.updateProjectionMatrix();
        
        // Motion blur would go here
      } else {
        // Return to normal FOV
        this.camera.fov += (60 - this.camera.fov) * 0.1;
        this.camera.updateProjectionMatrix();
      }
      
      // Update HUD
      this.updateHUD();
      
      // Track distance
      this.distance += state.speed * deltaTime * 1.467; // mph to ft/s
    }
    
    // Render - wrapped to catch shader uniform errors
    try {
      if (this.useSoftShaders && this.softShaders) {
        // Update materials for any new objects
        this.softShaders.updateMaterials();
        // Render with soft shader post-processing
        this.softShaders.render(this.renderer, this.scene, this.camera);
      } else {
        // Standard render
        this.renderer.render(this.scene, this.camera);
      }
    } catch (error) {
      // Log the error once to avoid spamming console
      if (!this.shaderErrorLogged) {
        console.error('Shader uniform error during render:', error);
        
        // Log all objects with materials to find the problematic one
        this.scene.traverse((object) => {
          if (object.material) {
            console.log('Object with material:', {
              name: object.name || 'unnamed',
              type: object.type,
              materialType: object.material.type,
              fog: object.material.fog,
              transparent: object.material.transparent,
              hasFogUniforms: object.material.uniforms?.fogColor ? true : false
            });
          }
        });
        
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
    
    // Resize soft shader system
    if (this.softShaders) {
      this.softShaders.resize(this.width, this.height);
    }
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
    // Stop animation loop
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    // Dispose of physics and input controller
    if (this.physics && typeof this.physics.dispose === 'function') {
      this.physics.dispose();
    }
    if (this.inputController && typeof this.inputController.dispose === 'function') {
      this.inputController.dispose();
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
    if (this.softShaders) {
      this.softShaders.dispose();
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
    
    // Remove event listeners
    window.removeEventListener('resize', this.boundHandleResize);
    window.removeEventListener('keydown', this.boundHandleKeyDown);
    window.removeEventListener('keyup', this.boundHandleKeyUp);
  }
}