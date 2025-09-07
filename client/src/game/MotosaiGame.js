import * as THREE from 'three';
import { MotorcyclePhysics } from '../physics/MotorcyclePhysics.js';
import { Highway101 } from './Highway101.js';
import { TrafficSystem } from './TrafficSystem.js';

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
    
    // Initialize components
    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initLights();
    this.initPhysics();
    this.initHighway();
    this.initTraffic();
    this.initControls();
    this.initHUD();
    
    // Start game loop
    this.lastTime = performance.now();
    this.animate();
  }
  
  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.8;
    this.container.appendChild(this.renderer.domElement);
    
    // Handle resize
    window.addEventListener('resize', () => this.onResize());
  }
  
  initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87CEEB, 100, 1000);
    
    // Sky gradient
    const skyGeo = new THREE.SphereGeometry(2000, 32, 15);
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
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
  }
  
  initCamera() {
    // Third person camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.width / this.height,
      0.1,
      2000
    );
    
    // Camera positions
    this.cameraOffset = new THREE.Vector3(0, 2, -6);
    this.cameraLookOffset = new THREE.Vector3(0, 1, 10);
    
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
    this.physics = new MotorcyclePhysics();
    
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
  
  initTraffic() {
    this.traffic = new TrafficSystem(this.scene, this.highway);
    this.traffic.spawn(20); // Start with 20 vehicles
  }
  
  initControls() {
    this.keys = {};
    
    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      
      // Gear shifting
      if (e.code === 'KeyQ') {
        this.physics.setControls({ gearDown: true });
      } else if (e.code === 'KeyE') {
        this.physics.setControls({ gearUp: true });
      }
    });
    
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      
      if (e.code === 'KeyQ') {
        this.physics.setControls({ gearDown: false });
      } else if (e.code === 'KeyE') {
        this.physics.setControls({ gearUp: false });
      }
    });
    
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
  
  updateControls() {
    // Throttle
    if (this.keys['KeyW'] || this.keys['ArrowUp']) {
      this.physics.setControls({ throttle: 1 });
    } else {
      this.physics.setControls({ throttle: 0 });
    }
    
    // Brakes
    if (this.keys['KeyS'] || this.keys['ArrowDown']) {
      this.physics.setControls({ frontBrake: 0.8, rearBrake: 0.5 });
    } else if (this.keys['Space']) {
      this.physics.setControls({ frontBrake: 1, rearBrake: 0 });
    } else {
      this.physics.setControls({ frontBrake: 0, rearBrake: 0 });
    }
    
    // Lean
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
      this.physics.setControls({ lean: -1 });
    } else if (this.keys['KeyD'] || this.keys['ArrowRight']) {
      this.physics.setControls({ lean: 1 });
    } else {
      this.physics.setControls({ lean: 0 });
    }
    
    // Clutch
    if (this.keys['ShiftLeft']) {
      this.physics.setControls({ clutch: true });
    } else {
      this.physics.setControls({ clutch: false });
    }
  }
  
  updateCamera(deltaTime) {
    const state = this.physics.getState();
    
    // Calculate camera position based on bike
    const bikeMatrix = new THREE.Matrix4();
    bikeMatrix.makeRotationY(state.rotation.yaw);
    
    // Apply lean to camera
    const leanMatrix = new THREE.Matrix4();
    leanMatrix.makeRotationZ(state.rotation.roll * 0.3); // Less lean for camera
    
    // Camera offset
    const offset = this.cameraOffset.clone();
    offset.applyMatrix4(leanMatrix);
    offset.applyMatrix4(bikeMatrix);
    
    // Target positions
    const targetCameraPos = new THREE.Vector3(
      state.position.x + offset.x,
      state.position.y + offset.y + 1,
      state.position.z + offset.z
    );
    
    const lookOffset = this.cameraLookOffset.clone();
    lookOffset.applyMatrix4(bikeMatrix);
    
    const targetLookAt = new THREE.Vector3(
      state.position.x + lookOffset.x,
      state.position.y + lookOffset.y,
      state.position.z + lookOffset.z
    );
    
    // Smooth camera movement
    const smoothing = 0.1;
    this.cameraPosition.lerp(targetCameraPos, smoothing);
    this.cameraTarget.lerp(targetLookAt, smoothing);
    
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraTarget);
  }
  
  updateHUD() {
    const state = this.physics.getState();
    
    // Update speedometer
    this.speedometer.textContent = `${Math.round(state.speed)} MPH`;
    
    // Update info display
    this.hud.innerHTML = `
      Gear: ${state.gear}<br>
      RPM: ${state.rpm}<br>
      Lean: ${state.leanAngle.toFixed(1)}°<br>
      Distance: ${(this.distance / 5280).toFixed(1)} mi<br>
      Score: ${this.score}
    `;
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    
    if (!this.isPaused) {
      // Update controls
      this.updateControls();
      
      // Update physics
      const state = this.physics.update(deltaTime);
      
      // Update motorcycle position and rotation
      this.motorcycle.position.set(
        state.position.x,
        state.position.y,
        state.position.z
      );
      
      this.motorcycle.rotation.set(
        state.rotation.pitch,
        state.rotation.yaw,
        state.rotation.roll
      );
      
      // Update wheels rotation
      this.frontWheel.rotation.x += state.speed * deltaTime * 0.1;
      this.rearWheel.rotation.x += state.speed * deltaTime * 0.1;
      
      // Rider lean animation
      this.rider.rotation.z = -state.rotation.roll * 0.5;
      this.rider.rotation.x = state.rotation.pitch * 0.3;
      
      // Update highway (infinite scrolling)
      this.highway.update(state.position.z);
      
      // Update traffic
      this.traffic.update(deltaTime, state.position);
      
      // Update camera
      this.updateCamera(deltaTime);
      
      // Update HUD
      this.updateHUD();
      
      // Track distance
      this.distance += state.speed * deltaTime * 1.467; // mph to ft/s
    }
    
    // Render
    this.renderer.render(this.scene, this.camera);
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
    this.traffic.reset();
  }
}