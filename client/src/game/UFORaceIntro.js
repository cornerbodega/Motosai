import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TitleAnimation } from "./TitleAnimation.js";

export class UFORaceIntro {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.phase = "loading"; // loading, earth, descent, title, ground, complete
    this.progress = 0;
    this.onComplete = null;

    // Animation objects
    this.earthModel = null;
    this.ufoModel = null;
    this.titleAnimation = null;

    // Timing
    this.startTime = 0;
    this.phaseStartTime = 0;

    // Assets
    this.loader = new GLTFLoader();
    this.assetsLoaded = {
      earth: false,
      ufo: false
    };
  }

  async start() {
    this.startTime = Date.now();
    this.phase = "loading";

    // Load assets in parallel
    await Promise.all([
      this.loadEarth(),
      this.loadUFO()
    ]);

    // Start Earth phase
    this.phase = "earth";
    this.phaseStartTime = Date.now();
    this.setupEarthScene();
    this.animate();
  }

  async loadEarth() {
    return new Promise((resolve, reject) => {
      this.loader.load(
        "/models/earth-v6.glb",
        (gltf) => {
          this.earthModel = gltf.scene;
          this.assetsLoaded.earth = true;
          resolve();
        },
        undefined,
        (error) => {
          console.warn("Earth model failed to load:", error);
          this.createFallbackEarth();
          resolve();
        }
      );
    });
  }

  async loadUFO() {
    return new Promise((resolve, reject) => {
      this.loader.load(
        "/models/ufo.glb",
        (gltf) => {
          this.ufoModel = gltf.scene;
          this.assetsLoaded.ufo = true;
          resolve();
        },
        undefined,
        (error) => {
          console.warn("UFO model failed to load:", error);
          this.createFallbackUFO();
          resolve();
        }
      );
    });
  }

  createFallbackEarth() {
    // Simple textured sphere
    const geometry = new THREE.SphereGeometry(5, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0x1e90ff,
      roughness: 0.8,
      metalness: 0.2
    });
    this.earthModel = new THREE.Mesh(geometry, material);
    this.assetsLoaded.earth = true;
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
    this.assetsLoaded.ufo = true;
  }

  setupEarthScene() {
    // Clear scene
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }

    // Add Earth
    if (this.earthModel) {
      this.earthModel.position.set(0, 0, 0);
      this.earthModel.scale.setScalar(1);
      this.scene.add(this.earthModel);
    }

    // Add UFO far away
    if (this.ufoModel) {
      this.ufoModel.position.set(50, 20, -100);
      this.ufoModel.scale.setScalar(1);
      this.scene.add(this.ufoModel);
    }

    // Add space lights
    const ambientLight = new THREE.AmbientLight(0x404040, 1);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2);
    sunLight.position.set(10, 10, 10);
    this.scene.add(sunLight);

    // Position camera for space view
    this.camera.position.set(0, 0, 15);
    this.camera.lookAt(0, 0, 0);

    // Black space background
    this.scene.background = new THREE.Color(0x000000);
  }

  animate() {
    if (this.phase === "complete") return;

    const elapsed = Date.now() - this.phaseStartTime;

    switch (this.phase) {
      case "earth":
        this.animateEarthPhase(elapsed);
        break;
      case "descent":
        this.animateDescentPhase(elapsed);
        break;
      case "title":
        this.animateTitlePhase(elapsed);
        break;
      case "selection":
        this.animateSelectionPhase(elapsed);
        break;
      case "ground":
        this.animateGroundPhase(elapsed);
        break;
    }

    requestAnimationFrame(() => this.animate());
  }

  animateEarthPhase(elapsed) {
    // Duration: 0-5 seconds
    const duration = 5000;
    const t = Math.min(elapsed / duration, 1);

    // Rotate Earth slowly
    if (this.earthModel) {
      this.earthModel.rotation.y = t * Math.PI * 0.5;
    }

    // UFO approaches Earth
    if (this.ufoModel) {
      // Move from far to near Earth
      const startPos = new THREE.Vector3(50, 20, -100);
      const endPos = new THREE.Vector3(10, 5, -20);
      this.ufoModel.position.lerpVectors(startPos, endPos, t);

      // Rotate UFO
      this.ufoModel.rotation.y += 0.02;
    }

    // Camera slowly zooms
    const startZ = 15;
    const endZ = 12;
    this.camera.position.z = startZ + (endZ - startZ) * t;

    // Transition to descent phase
    if (t >= 1) {
      this.phase = "descent";
      this.phaseStartTime = Date.now();
    }
  }

  animateDescentPhase(elapsed) {
    // Duration: 5-6 seconds (1 second transition)
    const duration = 1000;
    const t = Math.min(elapsed / duration, 1);

    // Zoom to UFO closeup
    if (this.ufoModel) {
      const startCamPos = new THREE.Vector3(0, 0, 12);
      const endCamPos = new THREE.Vector3(
        this.ufoModel.position.x,
        this.ufoModel.position.y,
        this.ufoModel.position.z + 3
      );
      this.camera.position.lerpVectors(startCamPos, endCamPos, t);
      this.camera.lookAt(this.ufoModel.position);

      // UFO continues rotating
      this.ufoModel.rotation.y += 0.04;
    }

    // Fade Earth
    if (this.earthModel && this.earthModel.traverse) {
      this.earthModel.traverse((child) => {
        if (child.material) {
          child.material.opacity = 1 - t * 0.5;
          child.material.transparent = true;
        }
      });
    }

    // Transition to title phase
    if (t >= 1) {
      this.phase = "title";
      this.phaseStartTime = Date.now();
      this.setupTitleScene();
    }
  }

  setupTitleScene() {
    // Remove Earth (keep UFO in background)
    if (this.earthModel) {
      this.scene.remove(this.earthModel);
    }

    // Position camera for title view (sky/atmosphere)
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, -10);

    // Change background to sky blue
    this.scene.background = new THREE.Color(0x87ceeb);

    // Move UFO to background (smaller, in distance)
    if (this.ufoModel) {
      this.ufoModel.position.set(0, 10, -50);
      this.ufoModel.scale.setScalar(2);
    }

    // Create title animation
    this.titleAnimation = new TitleAnimation(this.scene, this.camera);
    this.titleAnimation.start();
  }

  animateTitlePhase(elapsed) {
    // Duration: 6-10 seconds (4 seconds for title animation)
    const duration = 4000;
    const t = Math.min(elapsed / duration, 1);

    // UFO slowly descends in background
    if (this.ufoModel) {
      this.ufoModel.position.y = 10 - t * 3;
      this.ufoModel.rotation.y += 0.01;
    }

    // Update title animation
    if (this.titleAnimation) {
      this.titleAnimation.update(elapsed);
    }

    // When title animation is complete, pause and wait for bike selection
    if (t >= 1 && this.titleAnimation.isComplete) {
      this.phase = "selection";
      this.phaseStartTime = Date.now();

      // Callback to show bike selection overlay
      if (this.onSelectionReady) {
        this.onSelectionReady();
      }
    }
  }

  animateSelectionPhase(elapsed) {
    // Just maintain the scene while player selects bike
    // UFO continues gentle movement in background
    if (this.ufoModel) {
      this.ufoModel.rotation.y += 0.01;
      this.ufoModel.position.y = 7 + Math.sin(elapsed * 0.0005) * 1;
    }

    // Keep animating until bike is selected (external trigger)
    // Will be advanced by continueToGround() method
  }

  continueToGround() {
    // Called externally when bike is selected
    this.phase = "ground";
    this.phaseStartTime = Date.now();
  }

  animateGroundPhase(elapsed) {
    // Duration: 10-11 seconds (1 second transition)
    const duration = 1000;
    const t = Math.min(elapsed / duration, 1);

    // Descend camera to ground level
    const startCamPos = new THREE.Vector3(0, 5, 10);
    const endCamPos = new THREE.Vector3(0, 1.5, 5); // Behind bike view
    this.camera.position.lerpVectors(startCamPos, endCamPos, t);

    // Look forward down the road
    const lookTarget = new THREE.Vector3(0, 2, -20);
    this.camera.lookAt(lookTarget);

    // Fade title to persistent position
    if (this.titleAnimation) {
      this.titleAnimation.fadeToSky(t);
    }

    // Complete
    if (t >= 1) {
      this.phase = "complete";
      if (this.onComplete) {
        this.onComplete();
      }
    }
  }

  cleanup() {
    // Clean up Earth
    if (this.earthModel) {
      this.earthModel.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      this.scene.remove(this.earthModel);
      this.earthModel = null;
    }

    // Keep UFO and title for game

    // Clean up title animation
    if (this.titleAnimation) {
      this.titleAnimation.cleanup();
      this.titleAnimation = null;
    }
  }
}
