import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

export class UFOController {
  constructor(scene) {
    this.scene = scene;
    this.ufo = null;
    this.targetDistance = 75; // meters ahead of player
    this.minDistance = 50;
    this.maxDistance = 100;

    // Movement
    this.baseSpeed = 0;
    this.weaveTime = 0;
    this.bobTime = 0;

    // Visual effects
    this.lights = [];
    this.glowMesh = null;
    this.particleSystem = null;
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

    // Add point light
    const ufoLight = new THREE.PointLight(0x00ffff, 2, 50);
    ufoLight.position.set(0, 0, 0);
    this.ufo.add(ufoLight);
  }

  addGlow() {
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
    // Simple particle system for trail
    const particleCount = 50;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i++) {
      positions[i] = 0;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x00ffff,
      size: 0.5,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });

    this.particleSystem = new THREE.Points(geometry, material);
    this.scene.add(this.particleSystem);
  }

  update(deltaTime, playerPosition, playerSpeed) {
    if (!this.ufo) return;

    // Calculate distance to player
    const playerX = playerPosition.x;
    const currentDistance = this.ufo.position.x - playerX;

    // Adjust UFO speed to maintain distance
    let speedAdjustment = 0;

    if (currentDistance < this.minDistance) {
      // Speed up
      speedAdjustment = 10;
    } else if (currentDistance > this.maxDistance) {
      // Slow down
      speedAdjustment = -5;
    }

    // Move UFO forward (matching player + adjustment)
    this.ufo.position.x += (playerSpeed + speedAdjustment) * deltaTime;

    // Horizontal weaving
    this.weaveTime += deltaTime;
    const weaveAmount = Math.sin(this.weaveTime * 0.5) * 5;
    this.ufo.position.z = weaveAmount;

    // Vertical bobbing
    this.bobTime += deltaTime;
    const bobAmount = Math.sin(this.bobTime * 0.8) * 3;
    this.ufo.position.y = 20 + bobAmount;

    // Rotate UFO
    this.ufo.rotation.y += deltaTime * 0.5;

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

    const startPos = this.ufo.position.clone();
    const startRotation = this.ufo.rotation.clone();
    const startTime = Date.now();
    const duration = 3000; // 3 seconds

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);

      if (t < 0.4) {
        // Phase 1: 90° vertical turn (0-1.2s)
        const verticalT = t / 0.4;
        this.ufo.position.y = startPos.y + verticalT * 100;
        this.ufo.rotation.x = startRotation.x - verticalT * Math.PI / 2;
      } else if (t < 0.7) {
        // Phase 2: 90° horizontal turn (1.2-2.1s)
        const horizontalT = (t - 0.4) / 0.3;
        const randomDir = Math.random() > 0.5 ? 1 : -1;
        this.ufo.position.z = startPos.z + horizontalT * 50 * randomDir;
        this.ufo.rotation.y = startRotation.y + horizontalT * Math.PI / 2 * randomDir;
      } else {
        // Phase 3: Zip away (2.1-3s)
        const zipT = (t - 0.7) / 0.3;
        const accel = Math.pow(zipT, 2);
        this.ufo.position.x += accel * 5;
        this.ufo.position.y += accel * 3;

        // Fade out
        this.ufo.traverse((child) => {
          if (child.material) {
            child.material.opacity = 1 - zipT;
            child.material.transparent = true;
          }
        });
      }

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        // Remove UFO
        this.cleanup();
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
