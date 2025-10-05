import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

export class UFOController {
  constructor(scene) {
    this.scene = scene;
    this.ufo = null;
    this.targetDistance = 200; // meters ahead of player (matches starting position)
    this.minDistance = 180;
    this.maxDistance = 220;

    // Movement
    this.baseSpeed = 0;
    this.weaveTime = 0;
    this.bobTime = 0;
    this.spiralAngle = 0; // Track current angle in spiral
    this.wobbleTime = 0; // For additional wobble
    this.dartTime = 0; // For sudden dart movements
    this.nextDartTime = Math.random() * 3 + 2; // Random time until next dart
    this.dartDirection = 0; // Initialize dart direction to avoid NaN

    // Visual effects
    this.lights = [];
    this.glowMesh = null;
    this.particleSystem = null;

    // Animation state
    this.isEscaping = false;
  }

  async load() {
    // Try loading GLB first
    const gltfLoader = new GLTFLoader();

    return new Promise((resolve) => {
      gltfLoader.load(
        "/models/ufo.glb",
        (gltf) => {
          this.ufo = gltf.scene;
          this.setupUFO();
          resolve();
        },
        undefined,
        (error) => {
          console.warn("UFO GLB failed, trying OBJ:", error);
          this.loadOBJ().then(resolve);
        }
      );
    });
  }

  async loadOBJ() {
    const objLoader = new OBJLoader();

    return new Promise((resolve) => {
      objLoader.load(
        "/models/ufo/Low_poly_UFO.obj",
        (obj) => {
          this.ufo = obj;
          this.setupUFO();
          resolve();
        },
        undefined,
        (error) => {
          console.warn("UFO OBJ failed, using fallback:", error);
          this.createFallbackUFO();
          resolve();
        }
      );
    });
  }

  createFallbackUFO() {
    const group = new THREE.Group();

    // Dome
    const domeGeometry = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x00ffff,
      emissiveIntensity: 0.3
    });
    const dome = new THREE.Mesh(domeGeometry, domeMaterial);
    dome.position.y = 0.4;
    group.add(dome);

    // Disc
    const discGeometry = new THREE.CylinderGeometry(2, 2.5, 0.6, 32);
    const discMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0x0088ff,
      emissiveIntensity: 0.2
    });
    const disc = new THREE.Mesh(discGeometry, discMaterial);
    group.add(disc);

    // Spinning lights
    const lightGeometry = new THREE.SphereGeometry(0.15, 8, 8);
    const lightMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 1
    });

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const light = new THREE.Mesh(lightGeometry, lightMaterial.clone());
      light.position.set(Math.cos(angle) * 2.2, -0.2, Math.sin(angle) * 2.2);
      group.add(light);
      this.lights.push(light);
    }

    this.ufo = group;
    this.setupUFO();
  }

  setupUFO() {
    if (!this.ufo) return;

    // Scale appropriately
    this.ufo.scale.setScalar(2);

    // Starting position (ahead of player)
    this.ufo.position.set(0, 20, -this.targetDistance);

    // Add to scene
    this.scene.add(this.ufo);

    // Add glow effect
    this.addGlow();

    // Add particle trail
    this.addParticleTrail();

    // Add bright point light around UFO
    const ufoLight = new THREE.PointLight(0xffffff, 100, 100);
    ufoLight.position.set(0, 0, 0);
    this.ufo.add(ufoLight);
  }

  addGlow() {
    // Don't add glow if it already exists
    if (this.glowMesh) {
      console.log('Glow already exists, skipping');
      return;
    }

    // Glow halo around UFO
    const glowGeometry = new THREE.SphereGeometry(3, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide
    });
    this.glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    this.ufo.add(this.glowMesh);
  }

  addParticleTrail() {
    // Don't add particle trail if it already exists
    if (this.particleSystem) {
      console.log('Particle trail already exists, skipping');
      return;
    }

    // Simple particle system for trail
    const particleCount = 50;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i++) {
      positions[i] = 0;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    this.particleSystem = new THREE.Points(geometry, material);
    this.scene.add(this.particleSystem);
  }

  update(deltaTime, playerPosition, playerSpeed) {
    if (!this.ufo) {
      console.warn('UFOController.update called but ufo is null');
      return;
    }
    if (this.isEscaping) {
      // Don't update position while escaping
      return;
    }

    // Log first update call
    if (!this.hasLoggedFirstUpdate) {
      console.log('UFO first update - Before:', {
        ufoPos: this.ufo.position,
        playerPos: playerPosition,
        playerSpeed: playerSpeed
      });
      this.hasLoggedFirstUpdate = true;
    }

    // Calculate distance to player (Z axis is forward in Motosai)
    const playerZ = playerPosition.z;
    const currentDistance = this.ufo.position.z - playerZ; // How far ahead UFO is (positive = ahead)

    // Adjust UFO speed to maintain distance ahead (more aggressive correction)
    let speedAdjustment = 0;
    const distanceError = currentDistance - this.targetDistance;

    if (distanceError < -5) {
      // UFO is falling behind - speed up more
      speedAdjustment = 15;
    } else if (distanceError > 5) {
      // Too far ahead - slow down more
      speedAdjustment = -10;
    } else {
      // Fine-tune with proportional control
      speedAdjustment = -distanceError * 0.5;
    }

    // Move UFO forward (matching player + adjustment) along Z axis
    this.ufo.position.z += (playerSpeed + speedAdjustment) * deltaTime;

    // Speed-based behavior (normalized to 0-1, where 1 is ~200mph / 90 m/s)
    const speedFactor = Math.min(playerSpeed / 90, 1);
    const slowFactor = 1 - speedFactor; // Inverse for slow-speed behaviors

    // At high speeds: tighter, more stable, angled forward
    // At low speeds: smaller spirals to stay visible
    this.spiralAngle += deltaTime * (0.5 + slowFactor * 0.8); // More spiraling

    // Start with tiny radius at very low speeds, increase with speed
    const minSpeed = 10; // m/s (~22 mph)
    const speedRatio = Math.min(playerSpeed / minSpeed, 1); // 0 at stop, 1 at minSpeed+
    const baseRadius = 5 + speedRatio * 10; // 5-15m radius (much tighter at low speed)
    const baseHeight = 8 + slowFactor * 12; // 8-20m height (more vertical motion)

    // Wobble only at slower speeds - more gentle and floaty
    this.wobbleTime += deltaTime * 1.0;
    const radiusWobble = Math.sin(this.wobbleTime) * (5 * slowFactor);
    const spiralRadius = baseRadius + radiusWobble;

    // Figure-8 pattern less pronounced at speed - more gentle bobbing
    const heightWobble = Math.cos(this.spiralAngle * 2) * (6 * slowFactor);
    const spiralHeight = baseHeight + heightWobble;

    // Calculate base spiral position
    let spiralX = Math.cos(this.spiralAngle) * spiralRadius;
    let spiralY = Math.sin(this.spiralAngle) * spiralHeight;

    // Occasional dart movements (less frequent at high speed)
    this.dartTime += deltaTime;
    if (this.dartTime >= this.nextDartTime) {
      this.dartTime = 0;
      this.nextDartTime = Math.random() * 5 + (3 * speedFactor); // Longer wait when fast
      this.dartDirection = (Math.random() - 0.5) * 2;
    }

    // Smaller darts at high speed
    const dartDecay = Math.max(0, 1 - (this.dartTime / 1.0));
    const dartOffset = this.dartDirection * (4 + slowFactor * 4) * dartDecay * Math.sin(dartDecay * Math.PI);
    spiralX += dartOffset;

    // Apply all motion (higher base altitude for floaty feel)
    this.ufo.position.x = playerPosition.x + spiralX;
    this.ufo.position.y = 35 + spiralY;

    // Log first position update
    if (this.hasLoggedFirstUpdate && !this.hasLoggedFirstPosition) {
      console.log('UFO first update - After:', {
        spiralX: spiralX,
        spiralRadius: spiralRadius,
        finalX: this.ufo.position.x,
        finalY: this.ufo.position.y,
        finalZ: this.ufo.position.z
      });
      this.hasLoggedFirstPosition = true;
    }

    // Faster rotation at high speed (aggressive forward motion)
    this.ufo.rotation.y += deltaTime * (0.4 + speedFactor * 0.8);

    // Forward tilt increases with speed (looks like it's racing ahead)
    this.ufo.rotation.x = -0.3 * speedFactor + Math.cos(this.spiralAngle * 0.5) * 0.1 * slowFactor;

    // Banking tilt based on spiral position (less at high speed)
    this.ufo.rotation.z = Math.sin(this.spiralAngle) * (0.2 * slowFactor);

    // Pulse glow
    if (this.glowMesh) {
      this.glowMesh.material.opacity = 0.15 + Math.sin(this.bobTime * 2) * 0.1;
    }

    // Animate lights
    if (this.lights.length > 0) {
      this.lights.forEach((light, i) => {
        const intensity = Math.sin(this.bobTime * 3 + i * 0.5) * 0.5 + 0.5;
        if (light.material) {
          light.material.emissiveIntensity = intensity;
        }
      });
    }

    // Update particle trail
    this.updateParticleTrail();
  }

  updateParticleTrail() {
    if (!this.particleSystem || !this.ufo) return;

    const positions = this.particleSystem.geometry.attributes.position.array;

    // Shift particles back
    for (let i = positions.length - 3; i >= 3; i -= 3) {
      positions[i] = positions[i - 3];
      positions[i + 1] = positions[i - 2];
      positions[i + 2] = positions[i - 1];
    }

    // Add new particle at UFO position
    positions[0] = this.ufo.position.x;
    positions[1] = this.ufo.position.y;
    positions[2] = this.ufo.position.z;

    this.particleSystem.geometry.attributes.position.needsUpdate = true;
  }

  playEscapeAnimation(onComplete) {
    if (!this.ufo) {
      if (onComplete) onComplete();
      return;
    }

    // Set escaping flag to prevent update() from interfering
    this.isEscaping = true;
    this.escapeAnimationRunning = true; // Track if animation is actively running

    const startPos = this.ufo.position.clone();
    const startRotation = this.ufo.rotation.clone();
    const startTime = Date.now();
    const waitDuration = 1000; // Wait 1 second before escaping
    const escapeDuration = 3000; // 3 seconds for escape
    const totalDuration = waitDuration + escapeDuration;

    // Pick a random direction on the horizon (left or right)
    const randomAngle = (Math.random() - 0.5) * Math.PI; // -90° to +90°
    const escapeDistance = 500; // How far it travels
    const escapeX = Math.sin(randomAngle) * escapeDistance;
    const escapeZ = Math.cos(randomAngle) * escapeDistance;

    // Calculate how high it needs to go based on distance to avoid mountains
    // Mountains are ~200 units tall, so go higher the further out we go
    const escapeHeight = 250; // Always go up to 250 units to clear mountains

    const animate = () => {
      // Check if animation was cancelled (e.g., by respawn)
      if (!this.escapeAnimationRunning) {
        console.log('UFO escape animation cancelled');
        if (onComplete) onComplete();
        return;
      }

      const elapsed = Date.now() - startTime;
      const totalT = Math.min(elapsed / totalDuration, 1);

      // Wait phase - UFO just hovers in place
      if (elapsed < waitDuration) {
        // Just do gentle bobbing while waiting
        const bobTime = elapsed / 1000;
        this.ufo.position.y = startPos.y + Math.sin(bobTime * 3) * 1;
        this.ufo.rotation.y += 0.02;
        requestAnimationFrame(animate);
        return;
      }

      // Escape phase
      const escapeElapsed = elapsed - waitDuration;
      const t = Math.min(escapeElapsed / escapeDuration, 1);

      // Ease-out cubic for smooth deceleration at the end
      const eased = 1 - Math.pow(1 - t, 3);

      // Move toward horizon in random direction
      this.ufo.position.x = startPos.x + escapeX * eased;
      this.ufo.position.z = startPos.z + escapeZ * eased;

      // Rise up and away to clear mountains
      if (t < 0.2) {
        // Quick initial rise
        const riseT = t / 0.2;
        this.ufo.position.y = startPos.y + (riseT * escapeHeight * 0.3);
      } else {
        // Continue rising to full escape height
        const riseT = (t - 0.2) / 0.8;
        const easedRise = 1 - Math.pow(1 - riseT, 2); // Ease out
        this.ufo.position.y = startPos.y + (0.3 * escapeHeight) + (easedRise * 0.7 * escapeHeight);
      }

      // Spin while escaping
      this.ufo.rotation.y += 0.1;
      this.ufo.rotation.x = Math.sin(t * Math.PI * 2) * 0.2;

      // Don't fade - just let it fly away (keeps materials opaque for respawn)

      if (totalT < 1) {
        requestAnimationFrame(animate);
      } else {
        // Escape complete - just mark as not escaping, UFO stays in scene
        this.isEscaping = false;
        this.escapeAnimationRunning = false;
        console.log('UFO escape complete - ready for respawn');
        if (onComplete) onComplete();
      }
    };

    animate();
  }

  cleanup() {
    if (this.ufo) {
      this.ufo.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      this.scene.remove(this.ufo);
      this.ufo = null;
    }

    if (this.particleSystem) {
      this.particleSystem.geometry.dispose();
      this.particleSystem.material.dispose();
      this.scene.remove(this.particleSystem);
      this.particleSystem = null;
    }

    this.lights = [];
    this.glowMesh = null;
  }
}
