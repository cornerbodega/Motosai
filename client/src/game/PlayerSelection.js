// PlayerSelection module - preview and bike chooser
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MotorcycleFactory } from "./MotorcycleFactory.js";

export class PlayerSelection {
  constructor(scene, camera, audioManager = null) {
    this.scene = scene;
    this.camera = camera;
    this.audioManager = audioManager;
    this.selectedBike = null;
    this.availableBikes = [];
    this.unlockedBikes = ["default"];
    this.bikeModels = new Map();
    this.selectionUI = null;
    this.onSelectionComplete = null;
    // Store original camera position to restore after selection
    this.originalCameraPosition = null;
    this.originalCameraRotation = null;
    // Preview bike model in the main scene
    this.previewModel = null;
    this.previewAnimationId = null;
    // token to track latest async preview load to avoid race conditions
    this._previewLoadId = 0;

    this.initializeBikes();
  }

  initializeBikes() {
    // Define all available bikes with their unlock requirements
    this.availableBikes = [
      {
        id: "default",
        name: "Street Rider",
        emoji: "🏍️",
        color: 0xff0000,
        speed: 100,
        acceleration: 1.0,
        handling: 1.0,
        unlocked: true,
        unlockRequirement: null,
        modelPath: "/models/motor1.glb",
      },
      {
        id: "dragon",
        name: "Dragon Fury",
        emoji: "🐉",
        color: 0x00ff00,
        speed: 120,
        acceleration: 1.2,
        handling: 0.9,
        unlocked: true, // All bikes unlocked - powerup system removed
        unlockRequirement: { powerup: "dragon", count: 2 }, // Reduced from 5
        modelPath: "/models/motor1.glb",
      },
      {
        id: "rocket",
        name: "Rocket Blast",
        emoji: "🚀",
        color: 0x0099ff,
        speed: 150,
        acceleration: 1.5,
        handling: 0.8,
        unlocked: true, // All bikes unlocked - powerup system removed
        unlockRequirement: { powerup: "rocket", count: 3 }, // Reduced from 10
        modelPath: "/models/motor1.glb",
      },
      {
        id: "star",
        name: "Star Cruiser",
        emoji: "⭐",
        color: 0xffff00,
        speed: 110,
        acceleration: 1.1,
        handling: 1.2,
        unlocked: true, // All bikes unlocked - powerup system removed
        unlockRequirement: { powerup: "star", count: 2 }, // Reduced from 7
        modelPath: "/models/motor1.glb",
      },
      {
        id: "fire",
        name: "Inferno",
        emoji: "🔥",
        color: 0xff6600,
        speed: 130,
        acceleration: 1.3,
        handling: 1.0,
        unlocked: true, // All bikes unlocked - powerup system removed
        unlockRequirement: { powerup: "fire", count: 3 }, // Reduced from 8
        modelPath: "/models/motor1.glb",
      },
      {
        id: "lightning",
        name: "Thunder Strike",
        emoji: "⚡",
        color: 0x9900ff,
        speed: 140,
        acceleration: 1.4,
        handling: 1.1,
        unlocked: true, // All bikes unlocked - powerup system removed
        unlockRequirement: { powerup: "lightning", count: 4 }, // Reduced from 12
        modelPath: "/models/motor1.glb",
      },
      {
        id: "skull",
        name: "Death Rider",
        emoji: "💀",
        color: 0x333333,
        speed: 125,
        acceleration: 1.2,
        handling: 1.3,
        unlocked: true, // All bikes unlocked - powerup system removed
        unlockRequirement: { powerup: "skull", count: 5 }, // Reduced from 15
        modelPath: "/models/motor1.glb",
      },
      {
        id: "rainbow",
        name: "Rainbow Dash",
        emoji: "🌈",
        color: 0xff00ff,
        speed: 135,
        acceleration: 1.3,
        handling: 1.4,
        unlocked: true, // All bikes unlocked - powerup system removed
        unlockRequirement: { powerup: "rainbow", count: 7 }, // Reduced from 20
        modelPath: "/models/motor1.glb",
      },
    ];

    // Load unlocked bikes from localStorage
    this.loadUnlockedBikes();
  }

  loadUnlockedBikes() {
    const saved = localStorage.getItem("motosai_unlocked_bikes");
    if (saved) {
      this.unlockedBikes = JSON.parse(saved);
    }

    // Update bike unlock status
    this.availableBikes.forEach((bike) => {
      if (this.unlockedBikes.includes(bike.id)) {
        bike.unlocked = true;
      }
    });
  }

  saveUnlockedBikes() {
    localStorage.setItem(
      "motosai_unlocked_bikes",
      JSON.stringify(this.unlockedBikes)
    );
  }

  unlockBike(bikeId) {
    if (!this.unlockedBikes.includes(bikeId)) {
      this.unlockedBikes.push(bikeId);
      const bike = this.availableBikes.find((b) => b.id === bikeId);
      if (bike) {
        bike.unlocked = true;
      }
      this.saveUnlockedBikes();
      return true;
    }
    return false;
  }

  createBikeModel(bikeConfig) {
    const group = new THREE.Group();

    // Main body
    const bodyGeometry = new THREE.BoxGeometry(2, 0.8, 0.6);
    const bodyMaterial = new THREE.MeshPhongMaterial({
      color: bikeConfig.color,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.5;
    group.add(body);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 32);
    const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });

    const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    frontWheel.rotation.z = Math.PI / 2;
    frontWheel.position.set(0.8, 0, 0);
    group.add(frontWheel);

    const rearWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    rearWheel.rotation.z = Math.PI / 2;
    rearWheel.position.set(-0.8, 0, 0);
    group.add(rearWheel);

    // Handlebars
    const handlebarGeometry = new THREE.CylinderGeometry(0.02, 0.02, 1, 8);
    const handlebarMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const handlebar = new THREE.Mesh(handlebarGeometry, handlebarMaterial);
    handlebar.rotation.z = Math.PI / 2;
    handlebar.position.set(0.6, 0.9, 0);
    group.add(handlebar);

    // emoji and placeholder red-bike removed; prefer GLB model for previews

    return group;
  }

  createSelectionUI() {
    const uiContainer = document.createElement("div");
    uiContainer.id = "bike-selection-ui";
    uiContainer.style.cssText = `
            position: fixed;
            bottom: 40px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(180deg, rgba(12,18,28,0.95), rgba(24,36,56,0.92));
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 16px;
            padding: 24px 32px;
            z-index: 1000;
            color: white;
            font-family: Arial, sans-serif;
            display: flex;
            gap: 24px;
            align-items: center;
        `;

    // Left: Arrow buttons
    const leftArrow = document.createElement("button");
    leftArrow.textContent = "‹";
    leftArrow.title = "Previous Bike";
    leftArrow.style.cssText = `
      width: 48px; height: 48px; border-radius: 12px;
      background: rgba(255,255,255,0.1);
      color: #fff; border: 1px solid rgba(255,255,255,0.2);
      font-size: 24px; cursor: pointer;
      transition: background 0.2s;
    `;
    leftArrow.addEventListener("mouseenter", () => {
      leftArrow.style.background = "rgba(255,255,255,0.2)";
    });
    leftArrow.addEventListener("mouseleave", () => {
      leftArrow.style.background = "rgba(255,255,255,0.1)";
    });
    leftArrow.addEventListener("click", () => this._prevBike());
    uiContainer.appendChild(leftArrow);

    // Center: Bike info
    const infoPanel = document.createElement("div");
    infoPanel.style.cssText = "text-align: center; min-width: 300px;";

    const infoName = document.createElement("div");
    infoName.style.cssText =
      "font-weight: bold; font-size: 24px; margin-bottom: 8px;";
    const infoStats = document.createElement("div");
    infoStats.style.cssText = "font-size: 14px; color: #bbb; margin-bottom: 16px;";

    const startButton = document.createElement("button");
    startButton.textContent = "START GAME";
    startButton.style.cssText = `
      padding: 12px 32px; font-size: 16px;
      background: #4CAF50; color: #fff;
      border: none; border-radius: 10px;
      cursor: pointer; font-weight: bold;
      transition: background 0.2s;
    `;
    startButton.addEventListener("mouseenter", () => {
      startButton.style.background = "#45a049";
    });
    startButton.addEventListener("mouseleave", () => {
      startButton.style.background = "#4CAF50";
    });
    startButton.addEventListener("click", () => {
      if (this.selectedBike && this.onSelectionComplete) {
        if (this.audioManager) this.audioManager.playUISelect();
        this.onSelectionComplete(this.selectedBike);
        this.hideSelectionUI();
      }
    });

    infoPanel.appendChild(infoName);
    infoPanel.appendChild(infoStats);
    infoPanel.appendChild(startButton);
    uiContainer.appendChild(infoPanel);

    // Right: Arrow button
    const rightArrow = document.createElement("button");
    rightArrow.textContent = "›";
    rightArrow.title = "Next Bike";
    rightArrow.style.cssText = `
      width: 48px; height: 48px; border-radius: 12px;
      background: rgba(255,255,255,0.1);
      color: #fff; border: 1px solid rgba(255,255,255,0.2);
      font-size: 24px; cursor: pointer;
      transition: background 0.2s;
    `;
    rightArrow.addEventListener("mouseenter", () => {
      rightArrow.style.background = "rgba(255,255,255,0.2)";
    });
    rightArrow.addEventListener("mouseleave", () => {
      rightArrow.style.background = "rgba(255,255,255,0.1)";
    });
    rightArrow.addEventListener("click", () => this._nextBike());
    uiContainer.appendChild(rightArrow);

    // store references for updates
    this._uiInfoName = infoName;
    this._uiInfoStats = infoStats;
    this.startButton = startButton;

    return uiContainer;
  }

  _prevBike() {
    const i = this.availableBikes.indexOf(this.selectedBike);
    const next =
      (i - 1 + this.availableBikes.length) % this.availableBikes.length;
    this.selectBike(this.availableBikes[next]);
    this._updateInfoUI();
  }

  _nextBike() {
    const i = this.availableBikes.indexOf(this.selectedBike);
    const next = (i + 1) % this.availableBikes.length;
    this.selectBike(this.availableBikes[next]);
    this._updateInfoUI();
  }

  _updateInfoUI() {
    if (this._uiInfoName && this.selectedBike) {
      this._uiInfoName.textContent = this.selectedBike.name;
      this._uiInfoStats.innerHTML = `Speed: ${this.selectedBike.speed}<br>Accel: ${this.selectedBike.acceleration}x<br>Handle: ${this.selectedBike.handling}x`;
    }
  }

  selectBike(bike) {
    this.selectedBike = bike;

    // Update start button
    if (this.startButton) {
      this.startButton.disabled = false;
      this.startButton.style.opacity = "1";
      this.startButton.style.cursor = "pointer";
    }

    // Update 3D preview if needed
    this.updateBikePreview(bike);
    this._updateInfoUI();
  }


  updateBikePreview(bike) {
    // bump load token so in-flight loads become stale
    this._previewLoadId += 1;
    const loadId = this._previewLoadId;

    // Helper to dispose freshly loaded models that become stale
    // Only use for non-shared resources (fresh GLB loads, factory-created models)
    const disposeObject = (obj) => {
      if (!obj) return;
      obj.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
          } else {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        }
      });
    };

    // Preserve current rotation so swapping models doesn't reset the spin
    const preservedRotationY = this.previewModel
      ? this.previewModel.rotation.y
      : 0;

    // Remove existing preview model from main scene
    // DON'T dispose geometries/materials as they're shared with preloaded model
    if (this.previewModel) {
      this.scene.remove(this.previewModel);
      this.previewModel = null;
    }

    // Try to reuse preloaded model to save memory
    const preloadedModel =
      window.__PRELOADED_BIKE_MODELS__ &&
      window.__PRELOADED_BIKE_MODELS__["motor1"];

    if (preloadedModel) {
      // Clone the preloaded model for preview
      const model = preloadedModel.clone(true);
      if (!model) return;

      // Scale the model bigger for preview (0.6 instead of game's 0.25)
      model.scale.setScalar(0.6);

      // Compute bounding box to find wheel bottom
      const bbox = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      bbox.getCenter(center);

      // Create a pivot wrapper so we can rotate around the model's true center
      const pivot = new THREE.Group();

      // Move the model so its center is at the pivot origin
      model.position.sub(center);
      pivot.add(model);

      // Calculate Y offset so wheels touch ground (Y=0)
      // bbox.min.y is the bottom of the model relative to its original position
      // After centering, the bottom is at -center.y + bbox.min.y from pivot origin
      const wheelBottom = bbox.min.y - center.y;
      const groundOffset = -wheelBottom; // Lift bike so wheelBottom is at Y=0

      // Position the bike in the right lane with wheels on ground
      pivot.position.set(-8.5, groundOffset, -3);

      // Apply preserved rotation to the pivot so swapping keeps the spin
      pivot.rotation.y = preservedRotationY;

      // Ensure meshes cast/receive shadows and apply bike color
      model.traverse((c) => {
        if (c.isMesh && c.material) {
          c.castShadow = true;
          c.receiveShadow = true;
          if (
            this.selectedBike &&
            this.selectedBike.color &&
            c.material.color
          ) {
            try {
              c.material.color.setHex(this.selectedBike.color);
            } catch (e) {}
          }
        }
      });

      // Add pivot to the main scene
      this.scene.add(pivot);
      this.previewModel = pivot;
    } else {
      // Load fresh if no preloaded model available
      const glbPath = "/models/motor1.glb";
      const loader = new GLTFLoader();
      loader.load(
        glbPath,
        (gltf) => {
          // ignore this result if a newer load started
          if (loadId !== this._previewLoadId) {
            // dispose loaded resources to avoid leaks
            if (gltf && gltf.scene) disposeObject(gltf.scene);
            return;
          }
          const model = gltf.scene || gltf.scenes[0];
          if (!model) return;

          // Scale the model bigger for preview (0.6 instead of game's 0.25)
          model.scale.setScalar(0.6);

          // Compute bounding box to find wheel bottom
          const bbox = new THREE.Box3().setFromObject(model);
          const center = new THREE.Vector3();
          bbox.getCenter(center);

          // Create a pivot wrapper so we can rotate around the model's true center
          const pivot = new THREE.Group();

          // Move the model so its center is at the pivot origin
          model.position.sub(center);
          pivot.add(model);

          // Calculate Y offset so wheels touch ground (Y=0)
          // bbox.min.y is the bottom of the model relative to its original position
          // After centering, the bottom is at -center.y + bbox.min.y from pivot origin
          const wheelBottom = bbox.min.y - center.y;
          const groundOffset = -wheelBottom; // Lift bike so wheelBottom is at Y=0

          // Position the bike in the right lane with wheels on ground
          pivot.position.set(-8.5, groundOffset, -3);

          // Apply preserved rotation to the pivot so swapping keeps the spin
          pivot.rotation.y = preservedRotationY;

          // Ensure meshes cast/receive shadows and apply bike color
          model.traverse((c) => {
            if (c.isMesh && c.material) {
              c.castShadow = true;
              c.receiveShadow = true;
              if (
                this.selectedBike &&
                this.selectedBike.color &&
                c.material.color
              ) {
                try {
                  c.material.color.setHex(this.selectedBike.color);
                } catch (e) {}
              }
            }
          });

          // Add pivot to the main scene
          this.scene.add(pivot);
          this.previewModel = pivot;
        },
        undefined,
        (err) => {
          // If this load fails but is stale, ignore to avoid triggering fallback for newer loads
          if (loadId !== this._previewLoadId) return;
          console.error("Failed to load preview GLB:", err);
          // Fallback: use MotorcycleFactory as a fallback if GLB fails
          try {
            const fallback = MotorcycleFactory.createMotorcycle({
              bikeColor: bike.color,
              includeRider: true,
            });
            // if a newer load started while building fallback, discard it
            if (loadId !== this._previewLoadId) {
              disposeObject(fallback);
              return;
            }
            // Position fallback at ground level (approximate)
            fallback.position.set(-8.5, 0.5, -3);
            this.previewModel = fallback;
            this.scene.add(fallback);
          } catch (e) {
            console.error("Fallback model error:", e);
          }
        }
      );
    }
  }


  showSelectionUI() {
    // Store original camera position and rotation
    this.originalCameraPosition = this.camera.position.clone();
    this.originalCameraRotation = this.camera.rotation.clone();

    // Position camera to the side of the bike for side view
    // Bike center will be calculated based on bounding box
    // Camera farther back since bike is bigger (0.6 scale)
    this.camera.position.set(-4, 1.0, -3);
    this.camera.lookAt(-8.5, 0.5, -3);
    this.camera.updateProjectionMatrix();

    // attach keyboard listeners for arrow navigation when showing
    const onKey = (ev) => {
      if (ev.key === "ArrowLeft") this._prevBike();
      if (ev.key === "ArrowRight") this._nextBike();
    };
    window.addEventListener("keydown", onKey);
    // store to remove later
    this._selectionKeyHandler = onKey;

    // Create UI
    if (!this.selectionUI) {
      const ui = this.createSelectionUI();
      document.body.appendChild(ui);
      this.selectionUI = ui;
    }

    const initial = this.selectedBike || this.availableBikes[0];
    if (initial) this.selectBike(initial);
  }

  hideSelectionUI() {
    // Restore original camera position and rotation
    if (this.originalCameraPosition) {
      this.camera.position.copy(this.originalCameraPosition);
      this.originalCameraPosition = null;
    }
    if (this.originalCameraRotation) {
      this.camera.rotation.copy(this.originalCameraRotation);
      this.originalCameraRotation = null;
    }

    // Remove key handler
    if (this._selectionKeyHandler) {
      window.removeEventListener("keydown", this._selectionKeyHandler);
      this._selectionKeyHandler = null;
    }

    // Remove UI
    if (this.selectionUI && this.selectionUI.parentElement) {
      this.selectionUI.parentElement.removeChild(this.selectionUI);
    }
    this.selectionUI = null;

    // Remove preview bike model from main scene
    // DON'T dispose geometries/materials as they're shared with preloaded model
    if (this.previewModel && this.scene) {
      this.scene.remove(this.previewModel);
      this.previewModel = null;
    }
  }
}
