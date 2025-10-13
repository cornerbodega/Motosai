// PlayerSelection module - preview and bike chooser
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { MotorcycleFactory } from "./MotorcycleFactory.js";

export class PlayerSelection {
  // === BIKE MODEL DIMENSIONS ===
  static BIKE_BODY_WIDTH = 2;
  static BIKE_BODY_HEIGHT = 0.8;
  static BIKE_BODY_DEPTH = 0.6;
  static BIKE_BODY_Y_POSITION = 0.5;

  static WHEEL_RADIUS = 0.4;
  static WHEEL_WIDTH = 0.3;
  static WHEEL_SEGMENTS = 32;
  static WHEEL_COLOR = 0x222222;
  static FRONT_WHEEL_X_POSITION = 0.8;
  static REAR_WHEEL_X_POSITION = -0.8;
  static WHEEL_ROTATION = Math.PI / 2;

  static HANDLEBAR_RADIUS = 0.02;
  static HANDLEBAR_LENGTH = 1;
  static HANDLEBAR_SEGMENTS = 8;
  static HANDLEBAR_COLOR = 0x333333;
  static HANDLEBAR_X_POSITION = 0.6;
  static HANDLEBAR_Y_POSITION = 0.9;
  static HANDLEBAR_Z_POSITION = 0;

  // === PREVIEW POSITIONING ===
  static PREVIEW_SCALE = 0.6;
  static PREVIEW_X_POSITION = -28.5;
  static PREVIEW_Z_POSITION = -3;
  static PREVIEW_FALLBACK_Y_POSITION = 0.5;
  static PREVIEW_ROTATION_Y = (3 * Math.PI) / 4; // 135 degrees

  // === GAS STATION ===
  static GAS_STATION_MODEL_PATH = '/models/gas-station/gas-station.glb';
  static GAS_STATION_SCALE = 1;
  static GAS_STATION_X_POSITION = -28.5;
  static GAS_STATION_Y_POSITION = 0;
  static GAS_STATION_Z_POSITION = -3;

  // Gas Station Colors - Realistic scheme
  static GAS_STATION_CANOPY_COLOR = 0xFFFFFF; // White canopy/roof
  static GAS_STATION_CANOPY_TRIM_COLOR = 0xFF0000; // Red trim on canopy
  static GAS_STATION_WALLS_COLOR = 0xE8E8E8; // Off-white walls
  static GAS_STATION_PUMPS_COLOR = 0xFF4444; // Bright red pumps
  static GAS_STATION_COLUMNS_COLOR = 0xC0C0C0; // Silver/metallic columns
  static GAS_STATION_WINDOWS_COLOR = 0x4A90A4; // Tinted blue windows
  static GAS_STATION_BASE_COLOR = 0x606060; // Dark gray base/ground
  static GAS_STATION_ACCENTS_COLOR = 0xFFD700; // Gold/yellow accents

  // === PAVEMENT ===
  static PAVEMENT_WIDTH = 80;
  static PAVEMENT_HEIGHT = 80;
  static PAVEMENT_COLOR = 0x404040;
  static PAVEMENT_X_POSITION = -28.5;
  static PAVEMENT_Y_POSITION = 0.01;
  static PAVEMENT_Z_POSITION = -3;

  // === FRIES ===
  static FRIES_MODEL_PATH = '/models/fries/fries.glb';
  static FRIES_SCALE = 1;
  static FRIES_X_POSITION = -19.7;
  static FRIES_Y_POSITION = -0.25;
  static FRIES_Z_POSITION = -3;

  // Fries colors based on UV coordinates
  static FRIES_TOP_COLOR = 0xFFD700; // Golden yellow for top (crispy)
  static FRIES_MIDDLE_COLOR = 0xFFA500; // Orange for middle
  static FRIES_BOTTOM_COLOR = 0xD2691E; // Brown for bottom

  // === CAMERA POSITIONING ===
  static CAMERA_X_POSITION = -19;
  static CAMERA_Y_POSITION = 1.0;
  static CAMERA_Z_POSITION = -3;
  static CAMERA_LOOK_AT_X = -23.5;
  static CAMERA_LOOK_AT_Y = 0.5;
  static CAMERA_LOOK_AT_Z = -3;

  // === UI STYLING ===
  static UI_BOTTOM_OFFSET = '40px';
  static UI_BORDER_RADIUS = '16px';
  static UI_PADDING = '24px 32px';
  static UI_Z_INDEX = 1000;
  static UI_GAP = '24px';
  static UI_BACKGROUND_GRADIENT = 'linear-gradient(180deg, rgba(12,18,28,0.95), rgba(24,36,56,0.92))';
  static UI_BORDER_COLOR = 'rgba(255,255,255,0.12)';

  static ARROW_BUTTON_SIZE = '48px';
  static ARROW_BUTTON_BORDER_RADIUS = '12px';
  static ARROW_BUTTON_BG = 'rgba(255,255,255,0.1)';
  static ARROW_BUTTON_BG_HOVER = 'rgba(255,255,255,0.2)';
  static ARROW_BUTTON_BORDER = '1px solid rgba(255,255,255,0.2)';
  static ARROW_BUTTON_FONT_SIZE = '24px';

  static INFO_PANEL_MIN_WIDTH = '300px';
  static INFO_NAME_FONT_SIZE = '24px';
  static INFO_NAME_MARGIN_BOTTOM = '8px';
  static INFO_STATS_FONT_SIZE = '14px';
  static INFO_STATS_COLOR = '#bbb';
  static INFO_STATS_MARGIN_BOTTOM = '16px';

  static START_BUTTON_PADDING = '12px 32px';
  static START_BUTTON_FONT_SIZE = '16px';
  static START_BUTTON_BG = '#4CAF50';
  static START_BUTTON_BG_HOVER = '#45a049';
  static START_BUTTON_BORDER_RADIUS = '10px';

  static BUTTON_OPACITY_DISABLED = '1';

  constructor(scene, camera, renderer = null, audioManager = null, ufoController = null) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.audioManager = audioManager;
    this.ufoController = ufoController;
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
    // Gas station model for selection screen
    this.gasStationModel = null;
    // Pavement mesh for selection screen
    this.pavementMesh = null;
    // Fries model for selection screen
    this.friesModel = null;

    // UFO floating animation
    this.ufoFloatAnimationId = null;
    this.lastFloatTime = 0;
    this.ufoBeamLine = null;
    this.ufoBeamStartTime = 0;

    // Fries animation
    this.friesFloatingUp = false;
    this.friesStartPosition = new THREE.Vector3();
    this.friesAnimationStartTime = 0;
    this.ufoFlewAway = false;

    // Animation frame tracking to prevent memory leaks
    this.cameraRotationAnimationId = null;
    this.ufoFlyAwayAnimationId = null;

    this.initializeBikes();
  }

  initializeBikes() {
    // Define all available bikes with their unlock requirements
    this.availableBikes = [
      {
        id: "default",
        name: "Street Rider",
        emoji: "🏍️",
        color: 0xff0000, // Bold red tank
        seatColor: 0x000000, // Black seat accent
        tireColor: 0xcc0000, // Deep red tires
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
        color: 0x00cc00, // Rich green tank
        seatColor: 0x000000, // Black seat accent
        tireColor: 0x009900, // Deep green tires
        speed: 120,
        acceleration: 1.2,
        handling: 0.9,
        unlocked: true,
        unlockRequirement: { powerup: "dragon", count: 2 },
        modelPath: "/models/motor1.glb",
      },
      {
        id: "rocket",
        name: "Rocket Blast",
        emoji: "🚀",
        color: 0x0088ff, // Vibrant blue tank
        seatColor: 0x000000, // Black seat accent
        tireColor: 0x0066cc, // Deep blue tires
        speed: 150,
        acceleration: 1.5,
        handling: 0.8,
        unlocked: true,
        unlockRequirement: { powerup: "rocket", count: 3 },
        modelPath: "/models/motor1.glb",
      },
      {
        id: "star",
        name: "Star Cruiser",
        emoji: "⭐",
        color: 0xffd700, // Gold tank
        seatColor: 0x000000, // Black seat accent
        tireColor: 0xccaa00, // Dark gold tires
        speed: 110,
        acceleration: 1.1,
        handling: 1.2,
        unlocked: true,
        unlockRequirement: { powerup: "star", count: 2 },
        modelPath: "/models/motor1.glb",
      },
      {
        id: "fire",
        name: "Inferno",
        emoji: "🔥",
        color: 0xff6600, // Blazing orange tank
        seatColor: 0x000000, // Black seat accent
        tireColor: 0xcc5200, // Deep orange tires
        speed: 130,
        acceleration: 1.3,
        handling: 1.0,
        unlocked: true,
        unlockRequirement: { powerup: "fire", count: 3 },
        modelPath: "/models/motor1.glb",
      },
      {
        id: "lightning",
        name: "Thunder Strike",
        emoji: "⚡",
        color: 0x8800ff, // Rich purple tank
        seatColor: 0x000000, // Black seat accent
        tireColor: 0x6600cc, // Deep purple tires
        speed: 140,
        acceleration: 1.4,
        handling: 1.1,
        unlocked: true,
        unlockRequirement: { powerup: "lightning", count: 4 },
        modelPath: "/models/motor1.glb",
      },
      {
        id: "skull",
        name: "Death Rider",
        emoji: "💀",
        color: 0x111111, // Nearly black tank
        seatColor: 0x000000, // Pure black seat
        tireColor: 0x000000, // Pure black tires
        speed: 125,
        acceleration: 1.2,
        handling: 1.3,
        unlocked: true,
        unlockRequirement: { powerup: "skull", count: 5 },
        modelPath: "/models/motor1.glb",
      },
      {
        id: "rainbow",
        name: "Rainbow Dash",
        emoji: "🌈",
        color: 0xff1493, // Hot pink tank
        seatColor: 0x000000, // Black seat accent
        tireColor: 0xcc0077, // Deep pink tires
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
    const bodyGeometry = new THREE.BoxGeometry(
      PlayerSelection.BIKE_BODY_WIDTH,
      PlayerSelection.BIKE_BODY_HEIGHT,
      PlayerSelection.BIKE_BODY_DEPTH
    );
    const bodyMaterial = new THREE.MeshPhongMaterial({
      color: bikeConfig.color,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = PlayerSelection.BIKE_BODY_Y_POSITION;
    group.add(body);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(
      PlayerSelection.WHEEL_RADIUS,
      PlayerSelection.WHEEL_RADIUS,
      PlayerSelection.WHEEL_WIDTH,
      PlayerSelection.WHEEL_SEGMENTS
    );
    const wheelMaterial = new THREE.MeshPhongMaterial({ color: PlayerSelection.WHEEL_COLOR });

    const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    frontWheel.rotation.z = PlayerSelection.WHEEL_ROTATION;
    frontWheel.position.set(PlayerSelection.FRONT_WHEEL_X_POSITION, 0, 0);
    group.add(frontWheel);

    const rearWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    rearWheel.rotation.z = PlayerSelection.WHEEL_ROTATION;
    rearWheel.position.set(PlayerSelection.REAR_WHEEL_X_POSITION, 0, 0);
    group.add(rearWheel);

    // Handlebars
    const handlebarGeometry = new THREE.CylinderGeometry(
      PlayerSelection.HANDLEBAR_RADIUS,
      PlayerSelection.HANDLEBAR_RADIUS,
      PlayerSelection.HANDLEBAR_LENGTH,
      PlayerSelection.HANDLEBAR_SEGMENTS
    );
    const handlebarMaterial = new THREE.MeshPhongMaterial({ color: PlayerSelection.HANDLEBAR_COLOR });
    const handlebar = new THREE.Mesh(handlebarGeometry, handlebarMaterial);
    handlebar.rotation.z = PlayerSelection.WHEEL_ROTATION;
    handlebar.position.set(
      PlayerSelection.HANDLEBAR_X_POSITION,
      PlayerSelection.HANDLEBAR_Y_POSITION,
      PlayerSelection.HANDLEBAR_Z_POSITION
    );
    group.add(handlebar);

    // emoji and placeholder red-bike removed; prefer GLB model for previews

    return group;
  }

  createSelectionUI() {
    const uiContainer = document.createElement("div");
    uiContainer.id = "bike-selection-ui";
    uiContainer.style.cssText = `
            position: fixed;
            bottom: ${PlayerSelection.UI_BOTTOM_OFFSET};
            left: 50%;
            transform: translateX(-50%);
            background: ${PlayerSelection.UI_BACKGROUND_GRADIENT};
            border: 1px solid ${PlayerSelection.UI_BORDER_COLOR};
            border-radius: ${PlayerSelection.UI_BORDER_RADIUS};
            padding: ${PlayerSelection.UI_PADDING};
            z-index: ${PlayerSelection.UI_Z_INDEX};
            color: white;
            font-family: Arial, sans-serif;
            display: flex;
            gap: ${PlayerSelection.UI_GAP};
            align-items: center;
        `;

    // Left: Arrow buttons
    const leftArrow = document.createElement("button");
    leftArrow.textContent = "‹";
    leftArrow.title = "Previous Bike";
    leftArrow.style.cssText = `
      width: ${PlayerSelection.ARROW_BUTTON_SIZE}; height: ${PlayerSelection.ARROW_BUTTON_SIZE}; border-radius: ${PlayerSelection.ARROW_BUTTON_BORDER_RADIUS};
      background: ${PlayerSelection.ARROW_BUTTON_BG};
      color: #fff; border: ${PlayerSelection.ARROW_BUTTON_BORDER};
      font-size: ${PlayerSelection.ARROW_BUTTON_FONT_SIZE}; cursor: pointer;
      transition: background 0.2s;
    `;
    leftArrow.addEventListener("mouseenter", () => {
      leftArrow.style.background = PlayerSelection.ARROW_BUTTON_BG_HOVER;
    });
    leftArrow.addEventListener("mouseleave", () => {
      leftArrow.style.background = PlayerSelection.ARROW_BUTTON_BG;
    });
    leftArrow.addEventListener("click", () => this._prevBike());
    uiContainer.appendChild(leftArrow);

    // Center: Bike info
    const infoPanel = document.createElement("div");
    infoPanel.style.cssText = `text-align: center; min-width: ${PlayerSelection.INFO_PANEL_MIN_WIDTH};`;

    const infoName = document.createElement("div");
    infoName.style.cssText =
      `font-weight: bold; font-size: ${PlayerSelection.INFO_NAME_FONT_SIZE}; margin-bottom: ${PlayerSelection.INFO_NAME_MARGIN_BOTTOM};`;
    const infoStats = document.createElement("div");
    infoStats.style.cssText = `font-size: ${PlayerSelection.INFO_STATS_FONT_SIZE}; color: ${PlayerSelection.INFO_STATS_COLOR}; margin-bottom: ${PlayerSelection.INFO_STATS_MARGIN_BOTTOM};`;

    const startButton = document.createElement("button");
    startButton.textContent = "START GAME";
    startButton.style.cssText = `
      padding: ${PlayerSelection.START_BUTTON_PADDING}; font-size: ${PlayerSelection.START_BUTTON_FONT_SIZE};
      background: ${PlayerSelection.START_BUTTON_BG}; color: #fff;
      border: none; border-radius: ${PlayerSelection.START_BUTTON_BORDER_RADIUS};
      cursor: pointer; font-weight: bold;
      transition: background 0.2s;
    `;
    startButton.addEventListener("mouseenter", () => {
      startButton.style.background = PlayerSelection.START_BUTTON_BG_HOVER;
    });
    startButton.addEventListener("mouseleave", () => {
      startButton.style.background = PlayerSelection.START_BUTTON_BG;
    });
    startButton.addEventListener("click", () => {
      if (this.selectedBike && this.onSelectionComplete) {
        if (this.audioManager) this.audioManager.playUISelect();

        // Disable and grey out the start button
        startButton.disabled = true;
        startButton.style.opacity = '0.5';
        startButton.style.cursor = 'not-allowed';
        startButton.style.background = '#666';

        // Hide the selection menu UI
        this.hideUIOnly();

        // If UFO controller is available, animate UFO to bike
        if (this.ufoController && this.previewModel) {
          // Stop the UFO from spinning
          this.ufoController.stopSpinning = true;

          // Get the bike preview position before hiding UI
          const bikePosition = this.previewModel.position.clone();

          // Start UFO animation to fly above the bike
          this.ufoController.playFlyToBikeAnimation(bikePosition, () => {
            // Once UFO reaches the bike, start camera rotation to look up
            const startRotationY = this.camera.rotation.y;
            const targetRotationY = startRotationY + Math.PI / 4; // 45 degrees upward
            const rotationDuration = 500; // 0.5 seconds
            const rotationStartTime = performance.now();

            const animateCameraRotation = (currentTime) => {
              const elapsed = currentTime - rotationStartTime;
              const progress = Math.min(elapsed / rotationDuration, 1);

              // Ease-out curve for smooth deceleration
              const eased = 1 - Math.pow(1 - progress, 3);

              this.camera.rotation.y = startRotationY + (targetRotationY - startRotationY) * eased;

              if (progress < 1) {
                this.cameraRotationAnimationId = requestAnimationFrame(animateCameraRotation);
              } else {
                this.cameraRotationAnimationId = null;
              }
            };

            this.cameraRotationAnimationId = requestAnimationFrame(animateCameraRotation);

            // Start floating animation
            this.startUFOFloating();

            // Continue with game after animation completes
            setTimeout(() => {
              this.stopUFOFloating();
              this.hideSelectionUI();
              this.onSelectionComplete(this.selectedBike);
            }, 2000); // 2 second delay for all animations
          });
        } else {
          // No UFO or no preview model - just proceed normally
          this.hideSelectionUI();
          this.onSelectionComplete(this.selectedBike);
        }
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
      width: ${PlayerSelection.ARROW_BUTTON_SIZE}; height: ${PlayerSelection.ARROW_BUTTON_SIZE}; border-radius: ${PlayerSelection.ARROW_BUTTON_BORDER_RADIUS};
      background: ${PlayerSelection.ARROW_BUTTON_BG};
      color: #fff; border: ${PlayerSelection.ARROW_BUTTON_BORDER};
      font-size: ${PlayerSelection.ARROW_BUTTON_FONT_SIZE}; cursor: pointer;
      transition: background 0.2s;
    `;
    rightArrow.addEventListener("mouseenter", () => {
      rightArrow.style.background = PlayerSelection.ARROW_BUTTON_BG_HOVER;
    });
    rightArrow.addEventListener("mouseleave", () => {
      rightArrow.style.background = PlayerSelection.ARROW_BUTTON_BG;
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
      this.startButton.style.opacity = PlayerSelection.BUTTON_OPACITY_DISABLED;
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
      : PlayerSelection.PREVIEW_ROTATION_Y;

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
      model.scale.setScalar(PlayerSelection.PREVIEW_SCALE);

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
      pivot.position.set(PlayerSelection.PREVIEW_X_POSITION, groundOffset, PlayerSelection.PREVIEW_Z_POSITION);

      // Apply preserved rotation to the pivot so swapping keeps the spin
      pivot.rotation.y = preservedRotationY;

      // Apply bike color using shared function from MotosaiGame
      if (this.selectedBike) {
        // Import MotosaiGame dynamically to avoid circular dependency
        import('./MotosaiGame.js').then(({ MotosaiGame }) => {
          MotosaiGame.applyBikeColor(model, this.selectedBike, false);
        }).catch(e => {
          console.warn('Could not apply advanced bike coloring:', e);
          // Fallback to simple coloring
          model.traverse((c) => {
            if (c.isMesh && c.material && c.material.color) {
              try {
                c.material.color.setHex(this.selectedBike.color);
              } catch (e) {}
            }
          });
        });
      } else {
        // Just set shadows if no bike selected
        model.traverse((c) => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
      }

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
          model.scale.setScalar(PlayerSelection.PREVIEW_SCALE);

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
          pivot.position.set(PlayerSelection.PREVIEW_X_POSITION, groundOffset, PlayerSelection.PREVIEW_Z_POSITION);

          // Apply preserved rotation to the pivot so swapping keeps the spin
          pivot.rotation.y = preservedRotationY;

          // Apply bike color using shared function from MotosaiGame
          if (this.selectedBike) {
            // Import MotosaiGame dynamically to avoid circular dependency
            import('./MotosaiGame.js').then(({ MotosaiGame }) => {
              MotosaiGame.applyBikeColor(model, this.selectedBike, false);
            }).catch(e => {
              console.warn('Could not apply advanced bike coloring:', e);
              // Fallback to simple coloring
              model.traverse((c) => {
                if (c.isMesh && c.material && c.material.color) {
                  try {
                    c.material.color.setHex(this.selectedBike.color);
                  } catch (e) {}
                }
              });
            });
          } else {
            // Just set shadows if no bike selected
            model.traverse((c) => {
              if (c.isMesh) {
                c.castShadow = true;
                c.receiveShadow = true;
              }
            });
          }

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
            fallback.position.set(
              PlayerSelection.PREVIEW_X_POSITION,
              PlayerSelection.PREVIEW_FALLBACK_Y_POSITION,
              PlayerSelection.PREVIEW_Z_POSITION
            );
            fallback.rotation.y = PlayerSelection.PREVIEW_ROTATION_Y;
            this.previewModel = fallback;
            this.scene.add(fallback);
          } catch (e) {
            console.error("Fallback model error:", e);
          }
        }
      );
    }
  }


  createPavement() {
    // Create pavement plane
    const geometry = new THREE.PlaneGeometry(
      PlayerSelection.PAVEMENT_WIDTH,
      PlayerSelection.PAVEMENT_HEIGHT
    );
    const material = new THREE.MeshStandardMaterial({
      color: PlayerSelection.PAVEMENT_COLOR,
      roughness: 0.8,
      metalness: 0.2
    });

    const pavement = new THREE.Mesh(geometry, material);
    pavement.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    pavement.position.set(
      PlayerSelection.PAVEMENT_X_POSITION,
      PlayerSelection.PAVEMENT_Y_POSITION,
      PlayerSelection.PAVEMENT_Z_POSITION
    );
    pavement.receiveShadow = true;

    this.pavementMesh = pavement;
    this.scene.add(pavement);
  }

  loadGasStation() {
    // Load gas station model
    const loader = new GLTFLoader();
    loader.load(
      PlayerSelection.GAS_STATION_MODEL_PATH,
      (gltf) => {
        const model = gltf.scene || gltf.scenes[0];
        if (!model) return;

        // Scale and position the gas station
        model.scale.setScalar(PlayerSelection.GAS_STATION_SCALE);
        model.position.set(
          PlayerSelection.GAS_STATION_X_POSITION,
          PlayerSelection.GAS_STATION_Y_POSITION,
          PlayerSelection.GAS_STATION_Z_POSITION
        );

        // Log all mesh names for coloring reference
        console.log('=== Gas Station Mesh Names ===');
        model.traverse((child) => {
          if (child.isMesh) {
            console.log(`- ${child.name}`);
            child.castShadow = true;
            child.receiveShadow = true;

            // Apply colors based on mesh names
            if (child.material) {
              const name = child.name.toLowerCase();
              let targetColor = null;

              if (name === 'canopy') {
                targetColor = PlayerSelection.GAS_STATION_CANOPY_COLOR;
              } else if (name === 'canopy_outer' || name === 'canopy outer') {
                targetColor = PlayerSelection.GAS_STATION_CANOPY_COLOR;
              } else if (name === 'pump_stands' || name === 'canopy_roof_holder') {
                targetColor = PlayerSelection.GAS_STATION_COLUMNS_COLOR;
              } else if (name === 'pump1' || name === 'pump2') {
                targetColor = PlayerSelection.GAS_STATION_PUMPS_COLOR;
              } else if (name === 'pump_stands_ads') {
                targetColor = PlayerSelection.GAS_STATION_ACCENTS_COLOR;
              } else if (name === 'canopyparrt') {
                targetColor = PlayerSelection.GAS_STATION_CANOPY_COLOR;
              } else if (name === 'store_roof') {
                targetColor = PlayerSelection.GAS_STATION_CANOPY_TRIM_COLOR;
              } else if (name === 'trash_can') {
                targetColor = PlayerSelection.GAS_STATION_BASE_COLOR;
              } else if (name === 'ice_machine') {
                targetColor = PlayerSelection.GAS_STATION_COLUMNS_COLOR;
              } else if (name === 'window' || name === 'windows') {
                targetColor = PlayerSelection.GAS_STATION_WINDOWS_COLOR;
              } else if (name === 'store') {
                targetColor = PlayerSelection.GAS_STATION_ACCENTS_COLOR;
              }

              // Apply color if determined
              if (targetColor !== null) {
                // Create a new simple material with the target color
                child.material = new THREE.MeshStandardMaterial({
                  color: targetColor,
                  roughness: 0.7,
                  metalness: 0.2
                });
              }
            }
          }
        });

        this.gasStationModel = model;
        this.scene.add(model);
      },
      undefined,
      (err) => {
        console.error("Failed to load gas station model:", err);
      }
    );
  }


  loadFries() {
    // Load fries model using GLTFLoader
    const loader = new GLTFLoader();
    loader.load(
      PlayerSelection.FRIES_MODEL_PATH,
      (gltf) => {
        const model = gltf.scene || gltf.scenes[0];
        if (!model) return;

        // Scale and position the fries
        model.scale.setScalar(PlayerSelection.FRIES_SCALE);
        model.position.set(
          PlayerSelection.FRIES_X_POSITION,
          PlayerSelection.FRIES_Y_POSITION,
          PlayerSelection.FRIES_Z_POSITION
        );

        // Apply colors based on UV coordinates (gradient from top to bottom)
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            const geometry = child.geometry;

            // Create vertex colors based on UV coordinates
            if (geometry.attributes.uv) {
              const uvAttribute = geometry.attributes.uv;

              // Define colors once (memory efficient - reused for all vertices)
              const topColor = new THREE.Color(PlayerSelection.FRIES_TOP_COLOR);
              const middleColor = new THREE.Color(PlayerSelection.FRIES_MIDDLE_COLOR);
              const bottomColor = new THREE.Color(PlayerSelection.FRIES_BOTTOM_COLOR);

              // Pre-allocate color array for better performance
              const colors = new Array(uvAttribute.count * 3);
              let colorIndex = 0;

              for (let i = 0; i < uvAttribute.count; i++) {
                const v = uvAttribute.getY(i); // V coordinate (0 = bottom, 1 = top)

                let color;
                if (v > 0.66) {
                  // Top third - golden yellow
                  color = topColor;
                } else if (v > 0.33) {
                  // Middle third - orange
                  color = middleColor;
                } else {
                  // Bottom third - brown
                  color = bottomColor;
                }

                // Direct array indexing is faster than push()
                colors[colorIndex++] = color.r;
                colors[colorIndex++] = color.g;
                colors[colorIndex++] = color.b;
              }

              geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            }

            // Create material that uses vertex colors
            child.material = new THREE.MeshStandardMaterial({
              vertexColors: true,
              roughness: 0.7,
              metalness: 0.1
            });
          }
        });

        this.friesModel = model;
        this.scene.add(model);
        console.log('Fries model loaded with UV-based colors');
      },
      undefined,
      (err) => {
        console.error("Failed to load fries GLB model:", err);
      }
    );
  }

  showSelectionUI() {
    // Store original camera position and rotation
    this.originalCameraPosition = this.camera.position.clone();
    this.originalCameraRotation = this.camera.rotation.clone();

    // Sky color and fog are handled by BackgroundSystem with day/night cycle
    // No need to manually set them here - they update automatically

    // Position camera to the side of the bike for side view
    // Bike center will be calculated based on bounding box
    // Camera farther back since bike is bigger (0.6 scale)
    this.camera.position.set(
      PlayerSelection.CAMERA_X_POSITION,
      PlayerSelection.CAMERA_Y_POSITION,
      PlayerSelection.CAMERA_Z_POSITION
    );
    this.camera.lookAt(
      PlayerSelection.CAMERA_LOOK_AT_X,
      PlayerSelection.CAMERA_LOOK_AT_Y,
      PlayerSelection.CAMERA_LOOK_AT_Z
    );
    this.camera.updateProjectionMatrix();

    // Create pavement and load gas station and fries
    this.createPavement();
    this.loadGasStation();
    this.loadFries();

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

  startUFOFloating() {
    if (!this.ufoController || !this.previewModel) return;

    this.lastFloatTime = performance.now();
    this.ufoBeamStartTime = performance.now();

    const animate = (currentTime) => {
      const deltaTime = (currentTime - this.lastFloatTime) / 1000; // Convert to seconds
      this.lastFloatTime = currentTime;

      // Update UFO floating animation
      const bikePosition = this.previewModel.position.clone();
      this.ufoController.updateFloatingAboveBike(deltaTime, bikePosition);

      // Spin the UFO
      if (this.ufoController.ufo) {
        this.ufoController.ufo.rotation.y += 0.02; // Continuous spinning
      }

      // Show beam after 0.5 seconds
      const elapsedSinceStart = (currentTime - this.ufoBeamStartTime) / 1000;
      if (elapsedSinceStart >= 0.5 && this.friesModel && this.ufoController.ufo) {
        if (!this.ufoBeamLine) {
          // Create the beam line
          this.createUFOBeam();
          // Store initial fries world position
          this.friesModel.getWorldPosition(this.friesStartPosition);
        }
        // Update beam position
        this.updateUFOBeam();

        // Start fries animation after 0.7 seconds total (0.2 seconds after beam appears)
        if (elapsedSinceStart >= 0.7 && !this.friesFloatingUp) {
          this.friesFloatingUp = true;
          this.friesAnimationStartTime = currentTime;
        }

        // Animate fries floating up
        if (this.friesFloatingUp) {
          this.updateFriesAnimation(currentTime);
        }
      }

      this.ufoFloatAnimationId = requestAnimationFrame(animate);
    };

    this.ufoFloatAnimationId = requestAnimationFrame(animate);
  }

  updateFriesAnimation(currentTime) {
    if (!this.friesModel || !this.ufoController.ufo) return;

    const elapsed = (currentTime - this.friesAnimationStartTime) / 1000;
    const duration = 1.0; // 1 second to float up to UFO

    if (elapsed >= duration) {
      // Animation complete - hide fries and make UFO fly away
      if (!this.ufoFlewAway) {
        this.friesModel.visible = false;
        this.ufoFlewAway = true;

        // Stop floating and fly to starting position
        this.ufoController.stopFloating();
        console.log('UFO flying to game start position');

        // Fly UFO to where it will be at game start (ahead of the bike)
        const startTime = Date.now();
        const flyDuration = 2000; // 2 seconds to fly to start
        const startPos = this.ufoController.ufo.position.clone();

        // Target is where UFO will be at game start
        const targetPos = { x: 0, y: 30, z: 200 }; // Same as game start position

        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / flyDuration, 1);

          // Smooth easing
          const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

          // Move UFO to starting position
          this.ufoController.ufo.position.x = startPos.x + (targetPos.x - startPos.x) * eased;
          this.ufoController.ufo.position.y = startPos.y + (targetPos.y - startPos.y) * eased;
          this.ufoController.ufo.position.z = startPos.z + (targetPos.z - startPos.z) * eased;

          // Keep rotating
          this.ufoController.ufo.rotation.y += 0.05;

          // Make camera follow UFO
          const ufoPos = this.ufoController.ufo.position;
          this.camera.lookAt(ufoPos.x, ufoPos.y, ufoPos.z);

          if (progress < 1) {
            this.ufoFlyAwayAnimationId = requestAnimationFrame(animate);
          } else {
            this.ufoFlyAwayAnimationId = null;
            console.log('UFO reached game start position');
          }
        };

        this.ufoFlyAwayAnimationId = requestAnimationFrame(animate);
      }
      return;
    }

    // Calculate progress (0 to 1)
    const progress = elapsed / duration;

    // Ease-in cubic for smooth acceleration
    const eased = progress * progress * progress;

    // Get UFO world position (destination)
    const ufoWorldPos = new THREE.Vector3();
    this.ufoController.ufo.getWorldPosition(ufoWorldPos);
    const ufoBottomY = ufoWorldPos.y - 1.5;

    // Create end point (same calculation as the beam endpoint)
    const endPoint = new THREE.Vector3(ufoWorldPos.x, ufoBottomY, ufoWorldPos.z);

    // Interpolate position along the path from start to UFO
    const newPosition = new THREE.Vector3().lerpVectors(this.friesStartPosition, endPoint, eased);

    // Update fries position
    this.friesModel.position.copy(newPosition);

    // Also fade out as it approaches the UFO
    if (progress > 0.7) {
      const fadeProgress = (progress - 0.7) / 0.3; // Last 30% of animation
      this.friesModel.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.opacity = 1 - fadeProgress;
          child.material.transparent = true;
        }
      });
    }
  }

  createUFOBeam() {
    if (!this.friesModel || !this.ufoController.ufo) return;

    // Get UFO world position
    const ufoWorldPos = new THREE.Vector3();
    this.ufoController.ufo.getWorldPosition(ufoWorldPos);
    const ufoBottomY = ufoWorldPos.y - 1.5;

    // Get fries world position
    const friesWorldPos = new THREE.Vector3();
    this.friesModel.getWorldPosition(friesWorldPos);

    // Get the bounding box in world space
    const friesBBox = new THREE.Box3().setFromObject(this.friesModel);

    // Find the actual top of the visible fries geometry
    const friesHeight = friesBBox.max.y - friesBBox.min.y;
    const friesTopY = friesBBox.min.y + (friesHeight * 0.85); // 85% up from bottom

    // Create start and end points
    const startPoint = new THREE.Vector3(ufoWorldPos.x, ufoBottomY, ufoWorldPos.z);
    const endPoint = new THREE.Vector3(friesWorldPos.x, friesTopY, friesWorldPos.z);

    // Calculate distance between points
    const distance = startPoint.distanceTo(endPoint);

    // Calculate midpoint
    const midPoint = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);

    // Create cone geometry for tractor beam
    const topRadius = 0.3;  // Narrow at UFO
    const bottomRadius = 1.2; // Wide at fries
    const radialSegments = 16;

    const coneGeometry = new THREE.CylinderGeometry(
      topRadius,
      bottomRadius,
      distance,
      radialSegments,
      1,
      true // open ended
    );

    // Create semi-transparent glowing material
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });

    this.ufoBeamLine = new THREE.Mesh(coneGeometry, beamMaterial);

    // Position the beam at midpoint
    this.ufoBeamLine.position.copy(midPoint);

    // Rotate the cone to point from UFO to fries
    // Create a direction vector from start to end
    const direction = new THREE.Vector3().subVectors(endPoint, startPoint).normalize();

    // The cylinder's default orientation is along Y axis (0, 1, 0)
    const upVector = new THREE.Vector3(0, 1, 0);

    // Create a quaternion to rotate from up to direction
    const quaternion = new THREE.Quaternion().setFromUnitVectors(upVector, direction);
    this.ufoBeamLine.setRotationFromQuaternion(quaternion);

    // Disable frustum culling
    this.ufoBeamLine.frustumCulled = false;

    this.scene.add(this.ufoBeamLine);

    console.log('Tractor beam created:', {
      ufoBottom: startPoint,
      friesTop: endPoint,
      distance: distance
    });
  }

  updateUFOBeam() {
    if (!this.ufoBeamLine || !this.friesModel || !this.ufoController.ufo) {
      return;
    }

    // Get UFO world position
    const ufoWorldPos = new THREE.Vector3();
    this.ufoController.ufo.getWorldPosition(ufoWorldPos);
    const ufoBottomY = ufoWorldPos.y - 1.5;

    // Get fries world position
    const friesWorldPos = new THREE.Vector3();
    this.friesModel.getWorldPosition(friesWorldPos);

    // Get fries bounding box to find the top
    const friesBBox = new THREE.Box3().setFromObject(this.friesModel);
    const friesHeight = friesBBox.max.y - friesBBox.min.y;
    const friesTopY = friesBBox.min.y + (friesHeight * 0.85);

    // Create start and end points
    const startPoint = new THREE.Vector3(ufoWorldPos.x, ufoBottomY, ufoWorldPos.z);
    const endPoint = new THREE.Vector3(friesWorldPos.x, friesTopY, friesWorldPos.z);

    // Calculate distance between points
    const distance = startPoint.distanceTo(endPoint);

    // Calculate midpoint
    const midPoint = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);

    // Update beam position
    this.ufoBeamLine.position.copy(midPoint);

    // Rotate the cone to point from UFO to fries
    const direction = new THREE.Vector3().subVectors(endPoint, startPoint).normalize();
    const upVector = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(upVector, direction);
    this.ufoBeamLine.setRotationFromQuaternion(quaternion);

    // Recreate geometry if distance changed significantly
    const currentHeight = this.ufoBeamLine.geometry.parameters.height;
    if (Math.abs(currentHeight - distance) > 0.1) {
      this.ufoBeamLine.geometry.dispose();
      const topRadius = 0.3;
      const bottomRadius = 1.2;
      this.ufoBeamLine.geometry = new THREE.CylinderGeometry(
        topRadius,
        bottomRadius,
        distance,
        16,
        1,
        true
      );
    }
  }

  stopUFOFloating() {
    if (this.ufoFloatAnimationId) {
      cancelAnimationFrame(this.ufoFloatAnimationId);
      this.ufoFloatAnimationId = null;
    }
    if (this.ufoController) {
      this.ufoController.stopFloating();
    }
    // Clean up tractor beam
    if (this.ufoBeamLine) {
      this.scene.remove(this.ufoBeamLine);
      this.ufoBeamLine.geometry.dispose();
      this.ufoBeamLine.material.dispose();
      this.ufoBeamLine = null;
    }
    // Reset fries animation state
    this.friesFloatingUp = false;
    this.friesAnimationStartTime = 0;
    this.ufoFlewAway = false;
  }

  hideUIOnly() {
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
  }

  restoreCamera() {
    // Restore original camera position and rotation
    if (this.originalCameraPosition) {
      this.camera.position.copy(this.originalCameraPosition);
      this.originalCameraPosition = null;
    }
    if (this.originalCameraRotation) {
      this.camera.rotation.copy(this.originalCameraRotation);
      this.originalCameraRotation = null;
    }
  }

  cleanupSceneObjects() {
    // Remove preview bike model from main scene
    // DON'T dispose geometries/materials as they're shared with preloaded model
    if (this.previewModel && this.scene) {
      this.scene.remove(this.previewModel);
      this.previewModel = null;
    }

    // Remove gas station model
    if (this.gasStationModel && this.scene) {
      this.scene.remove(this.gasStationModel);
      this.gasStationModel = null;
    }

    // Remove pavement
    if (this.pavementMesh && this.scene) {
      this.scene.remove(this.pavementMesh);
      this.pavementMesh.geometry.dispose();
      this.pavementMesh.material.dispose();
      this.pavementMesh = null;
    }

    // Remove fries model
    if (this.friesModel && this.scene) {
      this.scene.remove(this.friesModel);
      this.friesModel = null;
    }
  }

  hideSelectionUI() {
    // Stop UFO floating animation
    this.stopUFOFloating();

    // Hide UI elements
    this.hideUIOnly();

    // Restore camera
    this.restoreCamera();

    // Cleanup scene objects
    this.cleanupSceneObjects();
  }

  cleanup() {
    console.log('PlayerSelection: Starting cleanup');

    // Stop all animations
    this.stopUFOFloating();
    if (this.previewAnimationId) {
      cancelAnimationFrame(this.previewAnimationId);
      this.previewAnimationId = null;
    }
    if (this.cameraRotationAnimationId) {
      cancelAnimationFrame(this.cameraRotationAnimationId);
      this.cameraRotationAnimationId = null;
    }
    if (this.ufoFlyAwayAnimationId) {
      cancelAnimationFrame(this.ufoFlyAwayAnimationId);
      this.ufoFlyAwayAnimationId = null;
    }

    // Remove event listeners
    if (this._selectionKeyHandler) {
      window.removeEventListener("keydown", this._selectionKeyHandler);
      this._selectionKeyHandler = null;
    }

    // Remove UI elements from DOM
    if (this.selectionUI && this.selectionUI.parentElement) {
      this.selectionUI.parentElement.removeChild(this.selectionUI);
      this.selectionUI = null;
    }

    // Helper function to dispose Three.js objects properly
    const disposeObject = (obj) => {
      if (!obj) return;

      obj.traverse((child) => {
        // Dispose geometry
        if (child.geometry) {
          child.geometry.dispose();
        }

        // Dispose materials
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => {
              this.disposeMaterial(material);
            });
          } else {
            this.disposeMaterial(child.material);
          }
        }
      });

      // Remove from scene
      if (this.scene && obj.parent) {
        obj.parent.remove(obj);
      }
    };

    // Clean up preview model (don't dispose if it's a clone of preloaded model)
    if (this.previewModel) {
      this.scene.remove(this.previewModel);
      // Only dispose if it was a fallback model (not cloned from preload)
      const isPreloadedClone = window.__PRELOADED_BIKE_MODELS__ &&
                               window.__PRELOADED_BIKE_MODELS__["motor1"];
      if (!isPreloadedClone) {
        disposeObject(this.previewModel);
      }
      this.previewModel = null;
    }

    // Clean up gas station
    if (this.gasStationModel) {
      disposeObject(this.gasStationModel);
      this.gasStationModel = null;
    }

    // Clean up pavement
    if (this.pavementMesh) {
      if (this.pavementMesh.geometry) this.pavementMesh.geometry.dispose();
      if (this.pavementMesh.material) this.disposeMaterial(this.pavementMesh.material);
      this.scene.remove(this.pavementMesh);
      this.pavementMesh = null;
    }

    // Clean up fries model
    if (this.friesModel) {
      disposeObject(this.friesModel);
      this.friesModel = null;
    }

    // Clean up tractor beam
    if (this.ufoBeamLine) {
      if (this.ufoBeamLine.geometry) this.ufoBeamLine.geometry.dispose();
      if (this.ufoBeamLine.material) this.disposeMaterial(this.ufoBeamLine.material);
      this.scene.remove(this.ufoBeamLine);
      this.ufoBeamLine = null;
    }

    // Clear bike models map (these are references, actual disposal happens elsewhere)
    this.bikeModels.clear();

    // Reset state
    this.selectedBike = null;
    this._previewLoadId = 0;
    this.friesFloatingUp = false;
    this.friesAnimationStartTime = 0;
    this.ufoFlewAway = false;
    this.friesStartPosition = new THREE.Vector3();
    this.ufoBeamStartTime = 0;
    this.lastFloatTime = 0;

    // Restore camera if needed
    this.restoreCamera();

    console.log('PlayerSelection: Cleanup complete');
  }

  disposeMaterial(material) {
    // Dispose all textures used by the material
    if (material.map) material.map.dispose();
    if (material.lightMap) material.lightMap.dispose();
    if (material.bumpMap) material.bumpMap.dispose();
    if (material.normalMap) material.normalMap.dispose();
    if (material.specularMap) material.specularMap.dispose();
    if (material.envMap) material.envMap.dispose();
    if (material.alphaMap) material.alphaMap.dispose();
    if (material.aoMap) material.aoMap.dispose();
    if (material.displacementMap) material.displacementMap.dispose();
    if (material.emissiveMap) material.emissiveMap.dispose();
    if (material.gradientMap) material.gradientMap.dispose();
    if (material.metalnessMap) material.metalnessMap.dispose();
    if (material.roughnessMap) material.roughnessMap.dispose();

    // Dispose the material itself
    material.dispose();
  }
}
