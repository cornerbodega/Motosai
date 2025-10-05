import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

export class UFORaceIntro {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.isComplete = false;
    this.onComplete = null;
    this.onStartGame = null; // Callback for start button

    // Animation objects
    this.earthModel = null;
    this.atmosphereModel = null;
    this.ufoModel = null;
    this.text3D = null;
    this.subtitle3D = null;
    this.starField = null;
    this.lights = [];

    // Track textures for disposal
    this.textures = [];

    // UI elements
    this.uiContainer = null;
    this.selectedColor = 0x1a1a1a; // Default black
    this.boundStartHandler = null; // Store bound event handler

    // Timing
    this.startTime = 0;
    this.introDuration = 6000; // 6 seconds total
    this.animationComplete = false;
    this.waitingForUser = false;
    this.animationFrameId = null; // Track animation frame

    // UFO transition animation when START GAME is clicked
    this.ufoTransitioning = false;
    this.ufoTransitionStart = 0;
    this.ufoTransitionDuration = 2000; // 2 seconds
    this.ufoStartPosition = null;
    this.ufoStartScale = null;

    // Loaders
    this.gltfLoader = new GLTFLoader();
    this.fontLoader = new FontLoader();
    this.textureLoader = new THREE.TextureLoader();
  }

  async start() {
    this.startTime = Date.now();

    // Set black space background
    this.scene.background = new THREE.Color(0x000000);

    // Load all assets
    await Promise.all([
      this.loadEarth(),
      this.loadUFO(),
      this.createStarField(),
      this.create3DText(),
      this.setupLighting()
    ]);

    // Position camera for intro view
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    // Show UI immediately - start button available right away
    this.showUI();

    // Start animation loop
    this.animate();
  }

  async loadEarth() {
    // Create realistic Earth with textures
    const earthColorTexture = this.textureLoader.load("/textures/earth/earth_color_10K.png");
    const earthRoughnessMap = this.textureLoader.load("/textures/earth/earth_landocean_4K.png");
    const earthHeightMap = this.textureLoader.load("/textures/earth/topography_5K.png");

    // Track textures for disposal
    this.textures.push(earthColorTexture, earthRoughnessMap, earthHeightMap);

    const earthGeometry = new THREE.SphereGeometry(1, 64, 64);
    const earthMaterial = new THREE.MeshStandardMaterial({
      map: earthColorTexture,
      roughnessMap: earthRoughnessMap,
      displacementMap: earthHeightMap,
      displacementScale: 0.05,
    });

    this.earthModel = new THREE.Mesh(earthGeometry, earthMaterial);
    this.earthModel.position.set(0, -35, -15); // Centered left-right
    this.earthModel.rotation.y = Math.PI / 4;
    this.earthModel.rotation.x = Math.PI / 4;
    this.earthModel.rotation.z = Math.PI / 2;
    this.earthModel.scale.set(25, 25, 25); // Bigger (was 10)
    this.scene.add(this.earthModel);

    // Create atmosphere layer - match RhymeWithUs exactly
    const atmosphereTexture = this.textureLoader.load("/textures/smoke/fog3.png");
    this.textures.push(atmosphereTexture);

    const atmosphereGeometry = new THREE.SphereGeometry(1, 1024, 256);
    const atmosphereMaterial = new THREE.MeshStandardMaterial({
      transparent: true,
      map: atmosphereTexture,
    });

    this.atmosphereModel = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    this.atmosphereModel.position.set(0, -35, -15); // Match Earth position
    this.atmosphereModel.rotation.y = Math.PI / 4;
    this.atmosphereModel.rotation.x = Math.PI / 4;
    this.atmosphereModel.rotation.z = Math.PI / 2;
    this.atmosphereModel.scale.set(27, 27, 27); // Slightly bigger than Earth (was 11)
    this.scene.add(this.atmosphereModel);
  }

  async loadUFO() {
    return new Promise((resolve) => {
      this.gltfLoader.load(
        "/models/ufo.glb",
        (gltf) => {
          this.ufoModel = gltf.scene;

          // Center the model
          const box = new THREE.Box3().setFromObject(this.ufoModel);
          const center = box.getCenter(new THREE.Vector3());
          this.ufoModel.position.sub(center);

          // Calculate size and scale appropriately
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 1 / maxDim; // Target size of 1 unit (even smaller)
          this.ufoModel.scale.setScalar(scale);
          this.ufoModel.userData.baseScale = scale; // Store for animation

          // Apply colorful metallic materials to UFO
          const colors = [
            { color: 0x00ffff, emissive: 0x00ffff }, // Cyan
            { color: 0xff00ff, emissive: 0xff00ff }, // Magenta
            { color: 0xffaa00, emissive: 0xffaa00 }, // Orange
            { color: 0x00ff88, emissive: 0x00ff88 }, // Green-cyan
            { color: 0xaa88ff, emissive: 0xaa88ff }, // Purple
          ];

          let colorIndex = 0;
          this.ufoModel.traverse((child) => {
            if (child.isMesh) {
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

          // Position for intro - visible UFO position
          this.ufoModel.position.set(0, -1, 6);
          this.ufoModel.rotation.x = -0.2;
          this.ufoModel.rotation.y = Math.PI;

          console.log("UFO loaded successfully, size:", size, "scale:", scale);
          this.scene.add(this.ufoModel);
          resolve();
        },
        (progress) => {
          console.log("Loading UFO:", (progress.loaded / progress.total * 100).toFixed(0) + "%");
        },
        (error) => {
          console.error("UFO model failed to load:", error);
          this.createFallbackUFO();
          resolve();
        }
      );
    });
  }

  createFallbackUFO() {
    // Simple flying saucer
    const group = new THREE.Group();

    // Dome
    const domeGeometry = new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x00ffff,
      emissiveIntensity: 0.3
    });
    const dome = new THREE.Mesh(domeGeometry, domeMaterial);
    dome.position.y = 0.2;
    group.add(dome);

    // Disc
    const discGeometry = new THREE.CylinderGeometry(1, 1.2, 0.3, 32);
    const discMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0x0088ff,
      emissiveIntensity: 0.2
    });
    const disc = new THREE.Mesh(discGeometry, discMaterial);
    group.add(disc);

    // Lights around edge
    const lightGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const lightMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 1
    });

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const light = new THREE.Mesh(lightGeometry, lightMaterial);
      light.position.set(Math.cos(angle) * 1.1, -0.1, Math.sin(angle) * 1.1);
      group.add(light);
    }

    this.ufoModel = group;
    this.ufoModel.position.set(0, -1, 6);
    this.ufoModel.rotation.x = -0.2;
    this.scene.add(this.ufoModel);
  }

  async createStarField() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.1,
      sizeAttenuation: true
    });

    const starsVertices = [];
    for (let i = 0; i < 5000; i++) {
      const x = (Math.random() - 0.5) * 300;
      const y = (Math.random() - 0.5) * 300;
      const z = (Math.random() - 0.5) * 300;
      starsVertices.push(x, y, z);
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    this.starField = new THREE.Points(starsGeometry, starsMaterial);
    this.scene.add(this.starField);
  }

  async create3DText() {
    return new Promise((resolve) => {
      this.fontLoader.load('/fonts/4.json', (font) => {
        // Main title text
        const titleGeometry = new TextGeometry('MOTOSAI', {
          font: font,
          size: 0.7,
          height: 0.2,
          curveSegments: 12,
          bevelEnabled: true,
          bevelThickness: 0.03,
          bevelSize: 0.02,
          bevelOffset: 0,
          bevelSegments: 5
        });
        titleGeometry.center();

        const textMaterial = new THREE.MeshStandardMaterial({
          color: 0x00ffff,
          metalness: 0.8,
          roughness: 0.2,
          emissive: 0x00ffff,
          emissiveIntensity: 0.4
        });

        this.text3D = new THREE.Mesh(titleGeometry, textMaterial);
        this.text3D.position.set(0, 3.5, 0);
        this.scene.add(this.text3D);

        // Subtitle text
        const subtitleGeometry = new TextGeometry('Level: Death Valley, USA', {
          font: font,
          size: 0.3,
          height: 0.1,
          curveSegments: 12,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.01,
          bevelOffset: 0,
          bevelSegments: 5
        });
        subtitleGeometry.center();

        const subtitleMaterial = new THREE.MeshStandardMaterial({
          color: 0xffaa00,
          metalness: 0.6,
          roughness: 0.3,
          emissive: 0xffaa00,
          emissiveIntensity: 0.3
        });

        this.subtitle3D = new THREE.Mesh(subtitleGeometry, subtitleMaterial);
        this.subtitle3D.position.set(0, 2.5, 0);
        this.scene.add(this.subtitle3D);

        resolve();
      }, undefined, (error) => {
        console.warn("Font failed to load:", error);
        resolve();
      });
    });
  }

  async setupLighting() {
    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0x202020, 0.8);
    this.scene.add(ambientLight);
    this.lights.push(ambientLight);

    // Main spotlight on UFO
    const ufoSpotlight = new THREE.SpotLight(0xffffff, 3);
    ufoSpotlight.position.set(5, 10, 10);
    ufoSpotlight.angle = Math.PI / 6;
    ufoSpotlight.penumbra = 0.5;
    this.scene.add(ufoSpotlight);
    this.lights.push(ufoSpotlight);

    // Blue point light
    const blueLight = new THREE.PointLight(0x00ffff, 2, 50);
    blueLight.position.set(-8, 5, 5);
    this.scene.add(blueLight);
    this.lights.push(blueLight);

    // Purple point light
    const purpleLight = new THREE.PointLight(0xff00ff, 2, 50);
    purpleLight.position.set(8, 5, 5);
    this.scene.add(purpleLight);
    this.lights.push(purpleLight);

    // Orange point light for warmth
    const orangeLight = new THREE.PointLight(0xff8800, 1.5, 40);
    orangeLight.position.set(0, -5, 10);
    this.scene.add(orangeLight);
    this.lights.push(orangeLight);

    // Directional light simulating distant sun
    const sunLight = new THREE.DirectionalLight(0xffffee, 1.5);
    sunLight.position.set(10, 10, 10);
    this.scene.add(sunLight);
    this.lights.push(sunLight);
  }

  animate() {
    if (this.isComplete) {
      // Cancel animation frame to prevent memory leaks
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      return;
    }

    const elapsed = Date.now() - this.startTime;
    const progress = Math.min(elapsed / this.introDuration, 1);

    // Rotate Earth and atmosphere slowly
    if (this.earthModel) {
      this.earthModel.rotation.y += 0.003;
      this.earthModel.rotation.x += 0.001;
    }
    if (this.atmosphereModel) {
      this.atmosphereModel.rotation.y += 0.003;
      this.atmosphereModel.rotation.x += 0.001;
    }

    // UFO animation - gentle floating or transitioning to Earth
    if (this.ufoModel) {
      if (this.ufoTransitioning) {
        // Animate UFO: scale down fast first, then move toward Earth
        const transitionElapsed = Date.now() - this.ufoTransitionStart;
        const transitionProgress = Math.min(transitionElapsed / this.ufoTransitionDuration, 1);

        // Scale shrinks very fast in the first 30% of animation
        let scaleProgress = Math.min(transitionProgress / 0.3, 1);
        scaleProgress = scaleProgress * scaleProgress; // Ease-in for faster shrinking

        // Movement starts after scale is mostly done (after 30% of animation)
        let moveProgress = 0;
        if (transitionProgress > 0.3) {
          moveProgress = (transitionProgress - 0.3) / 0.7;
          // Ease-in-out for smooth movement
          moveProgress = moveProgress < 0.5
            ? 2 * moveProgress * moveProgress
            : 1 - Math.pow(-2 * moveProgress + 2, 2) / 2;
        }

        // Scale down to 5% of original size (much smaller)
        const targetScale = this.ufoStartScale * 0.05;
        const currentScale = this.ufoStartScale + (targetScale - this.ufoStartScale) * scaleProgress;
        this.ufoModel.scale.setScalar(currentScale);

        // Move toward Earth position (-1, -10, 0) with spiral motion
        const targetX = -1;
        const targetY = -10;
        const targetZ = 0;

        // Base linear interpolation
        const baseX = this.ufoStartPosition.x + (targetX - this.ufoStartPosition.x) * moveProgress;
        const baseY = this.ufoStartPosition.y + (targetY - this.ufoStartPosition.y) * moveProgress;
        const baseZ = this.ufoStartPosition.z + (targetZ - this.ufoStartPosition.z) * moveProgress;

        // Add subtle spiral motion - decreasing radius as it descends
        const spiralRadius = 1.2 * (1 - moveProgress); // Radius shrinks from 1.2 to 0
        const spiralAngle = moveProgress * Math.PI * 3; // 1.5 rotations
        const spiralX = Math.cos(spiralAngle) * spiralRadius;
        const spiralZ = Math.sin(spiralAngle) * spiralRadius;

        this.ufoModel.position.x = baseX + spiralX;
        this.ufoModel.position.y = baseY;
        this.ufoModel.position.z = baseZ + spiralZ;

        // Spin faster while transitioning
        this.ufoModel.rotation.y += 0.05;

        // Check if animation is complete
        if (transitionProgress >= 1) {
          this.isComplete = true;
          if (this.onStartGame) {
            this.onStartGame(this.selectedColor);
          }
        }
      } else {
        // Realistic floating motion - figure-8 pattern
        const floatTime = elapsed * 0.0008; // Slower, more graceful

        // Vertical bobbing with multiple frequencies for organic feel
        const bob1 = Math.sin(floatTime * 1.3) * 0.15;
        const bob2 = Math.sin(floatTime * 2.7) * 0.08;
        this.ufoModel.position.y = -1 + bob1 + bob2;

        // Horizontal figure-8 drift
        this.ufoModel.position.x = Math.sin(floatTime) * 0.3;
        this.ufoModel.position.z = 6 + Math.sin(floatTime * 2) * 0.2;

        // Gentle tilting/wobbling
        this.ufoModel.rotation.x = -0.2 + Math.sin(floatTime * 1.5) * 0.08;
        this.ufoModel.rotation.z = Math.sin(floatTime * 0.8) * 0.05;

        // Slow rotation with slight variation
        this.ufoModel.rotation.y += 0.003 + Math.sin(floatTime * 0.5) * 0.002;
      }
    }

    // Static text - no pulsing animation

    // Animate lights for cool effect
    if (this.lights[2]) { // Blue light
      this.lights[2].intensity = 2 + Math.sin(elapsed * 0.003) * 0.8;
    }
    if (this.lights[3]) { // Purple light
      this.lights[3].intensity = 2 + Math.cos(elapsed * 0.003) * 0.8;
    }

    // Slowly rotate star field
    if (this.starField) {
      this.starField.rotation.y += 0.0001;
    }

    // Render scene
    this.renderer.render(this.scene, this.camera);

    // Keep animating until user clicks start
    if (!this.isComplete) {
      this.animationFrameId = requestAnimationFrame(() => this.animate());
    }
  }

  showUI() {
    // Create UI overlay
    this.uiContainer = document.createElement('div');
    this.uiContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 1000;
      pointer-events: none;
    `;

    // Color chooser container
    const colorContainer = document.createElement('div');
    colorContainer.style.cssText = `
      margin: 20px 0;
      pointer-events: auto;
    `;

    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Rider Gear Color:';
    colorLabel.style.cssText = `
      color: white;
      font-size: 18px;
      margin-right: 10px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
    `;
    colorContainer.appendChild(colorLabel);

    const colorSelect = document.createElement('select');
    colorSelect.id = 'introRiderColor';
    colorSelect.style.cssText = `
      padding: 8px 15px;
      font-size: 16px;
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.9);
      border: none;
      cursor: pointer;
    `;
    colorSelect.innerHTML = `
      <option value="0x1a1a1a">Black</option>
      <option value="0xff0000">Red</option>
      <option value="0x0066cc">Blue</option>
      <option value="0xffff00">Hi-Viz Yellow</option>
      <option value="0xff6600">Orange</option>
      <option value="0x00ff00">Green</option>
      <option value="0xffffff">White</option>
      <option value="0x800080">Purple</option>
      <option value="0x00ffff">Cyan</option>
    `;
    colorSelect.addEventListener('change', (e) => {
      this.selectedColor = parseInt(e.target.value);
    });
    colorContainer.appendChild(colorSelect);
    this.uiContainer.appendChild(colorContainer);

    // Start button
    const startButton = document.createElement('button');
    startButton.textContent = 'START GAME';
    startButton.style.cssText = `
      padding: 15px 40px;
      font-size: 20px;
      color: white;
      background: rgba(255, 255, 255, 0.2);
      border: 2px solid white;
      border-radius: 50px;
      cursor: pointer;
      transition: all 0.3s;
      margin: 10px;
      pointer-events: auto;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
    `;
    startButton.addEventListener('mouseenter', () => {
      startButton.style.background = 'rgba(255, 255, 255, 0.3)';
      startButton.style.transform = 'scale(1.05)';
    });
    startButton.addEventListener('mouseleave', () => {
      startButton.style.background = 'rgba(255, 255, 255, 0.2)';
      startButton.style.transform = 'scale(1)';
    });

    // Store bound handler for cleanup
    this.boundStartHandler = () => this.handleStartGame();
    startButton.addEventListener('click', this.boundStartHandler);
    this.uiContainer.appendChild(startButton);

    document.body.appendChild(this.uiContainer);
  }

  handleStartGame() {
    // Remove UI immediately
    if (this.uiContainer) {
      this.uiContainer.remove();
      this.uiContainer = null;
    }

    // Start UFO transition animation
    if (this.ufoModel) {
      this.ufoTransitioning = true;
      this.ufoTransitionStart = Date.now();

      // Store current UFO position and scale
      this.ufoStartPosition = {
        x: this.ufoModel.position.x,
        y: this.ufoModel.position.y,
        z: this.ufoModel.position.z
      };
      this.ufoStartScale = this.ufoModel.scale.x; // Assuming uniform scale
    } else {
      // If no UFO model, complete immediately
      this.isComplete = true;
      if (this.onStartGame) {
        this.onStartGame(this.selectedColor);
      }
    }
    // Note: isComplete will be set to true in the animate loop when transition finishes
  }

  cleanup(keepUFO = false) {
    // Stop animation loop
    this.isComplete = true;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Clean up Earth
    if (this.earthModel) {
      this.earthModel.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          if (child.material.roughnessMap) child.material.roughnessMap.dispose();
          if (child.material.displacementMap) child.material.displacementMap.dispose();
          child.material.dispose();
        }
      });
      this.scene.remove(this.earthModel);
      this.earthModel = null;
    }

    // Clean up atmosphere
    if (this.atmosphereModel) {
      this.atmosphereModel.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      this.scene.remove(this.atmosphereModel);
      this.atmosphereModel = null;
    }

    // Clean up UFO (unless we want to keep it for gameplay)
    if (this.ufoModel && !keepUFO) {
      this.ufoModel.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          // Dispose textures
          if (child.material.map) child.material.map.dispose();
          if (child.material.emissiveMap) child.material.emissiveMap.dispose();
          if (child.material.normalMap) child.material.normalMap.dispose();
          if (child.material.roughnessMap) child.material.roughnessMap.dispose();
          if (child.material.metalnessMap) child.material.metalnessMap.dispose();
          child.material.dispose();
        }
      });
      this.scene.remove(this.ufoModel);
      this.ufoModel = null;
    }

    // Clean up text
    if (this.text3D) {
      if (this.text3D.geometry) this.text3D.geometry.dispose();
      if (this.text3D.material) {
        if (this.text3D.material.matcap) this.text3D.material.matcap.dispose();
        this.text3D.material.dispose();
      }
      this.scene.remove(this.text3D);
      this.text3D = null;
    }

    // Clean up subtitle
    if (this.subtitle3D) {
      if (this.subtitle3D.geometry) this.subtitle3D.geometry.dispose();
      if (this.subtitle3D.material) {
        if (this.subtitle3D.material.matcap) this.subtitle3D.material.matcap.dispose();
        this.subtitle3D.material.dispose();
      }
      this.scene.remove(this.subtitle3D);
      this.subtitle3D = null;
    }

    // Clean up star field
    if (this.starField) {
      if (this.starField.geometry) this.starField.geometry.dispose();
      if (this.starField.material) this.starField.material.dispose();
      this.scene.remove(this.starField);
      this.starField = null;
    }

    // Clean up lights
    this.lights.forEach(light => {
      this.scene.remove(light);
      if (light.dispose) light.dispose();
    });
    this.lights = [];

    // Dispose all tracked textures
    this.textures.forEach(texture => {
      if (texture && texture.dispose) texture.dispose();
    });
    this.textures = [];

    // Clean up UI and remove event listeners
    if (this.uiContainer) {
      // Remove all event listeners by removing the DOM element
      this.uiContainer.remove();
      this.uiContainer = null;
    }
    this.boundStartHandler = null;

    // Clear callbacks to prevent memory leaks
    this.onComplete = null;
    this.onStartGame = null;

    console.log('UFORaceIntro cleaned up successfully');
  }

  // Get the UFO model to use in gameplay
  getUFO() {
    return this.ufoModel;
  }
}
