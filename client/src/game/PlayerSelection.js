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
    // Preview renderer/state (separate from main game renderer to avoid UI overlap)
    this.previewRenderer = null;
    this.previewScene = null;
    this.previewCamera = null;
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
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            /* softer, non-black background */
            background: linear-gradient(180deg, rgba(12,18,28,0.98), rgba(24,36,56,0.95));
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 20px;
            padding: 20px;
            z-index: 1000;
            color: white;
            font-family: Arial, sans-serif;
            width: 760px;
            /* make the dialog a bit shorter to reduce dead space */
            height: 560px; /* reduced height */
            max-height: 600px;
            overflow: hidden;
        `;

    const title = document.createElement("h2");
    title.textContent = "Choose Your Ride";
    title.style.cssText =
      "text-align: center; margin: 8px 0 16px; font-size: 28px;";
    uiContainer.appendChild(title);

    // Content row: left = preview, right = info + start
    const contentRow = document.createElement("div");
    contentRow.style.cssText = `display: flex; gap: 12px; align-items: flex-start; height: calc(100% - 88px);`;

    // Left: preview container (we'll load the level mountains into the preview scene)
    const previewContainer = document.createElement("div");
    previewContainer.id = "bike-preview-container";
    previewContainer.style.cssText = `
            width: 640px; /* wider to show mountains */
            min-width: 420px;
            height: 420px;
            /* lighter, bluish preview background so the bike doesn't sit on black */
            background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(10,20,40,0.16));
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.06);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        `;

    // Overlay label
    const previewLabel = document.createElement("div");
    previewLabel.textContent = "Bike Preview";
    previewLabel.style.cssText =
      "position: absolute; top: 8px; left: 12px; color: #ddd; font-size: 12px;";
    previewContainer.appendChild(previewLabel);

    // Add left/right arrow controls overlayed on the preview to switch bikes
    const leftArrow = document.createElement("button");
    leftArrow.textContent = "‹";
    leftArrow.title = "Previous Bike";
    leftArrow.style.cssText = `
      position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
      width: 40px; height: 40px; border-radius: 8px; background: rgba(0,0,0,0.5);
      color: #fff; border: none; font-size: 20px; cursor: pointer;
    `;
    leftArrow.addEventListener("click", () => this._prevBike());
    previewContainer.appendChild(leftArrow);

    const rightArrow = document.createElement("button");
    rightArrow.textContent = "›";
    rightArrow.title = "Next Bike";
    rightArrow.style.cssText = `
      position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
      width: 40px; height: 40px; border-radius: 8px; background: rgba(0,0,0,0.5);
      color: #fff; border: none; font-size: 20px; cursor: pointer;
    `;
    rightArrow.addEventListener("click", () => this._nextBike());
    previewContainer.appendChild(rightArrow);

    contentRow.appendChild(previewContainer);

    // Right: info panel and start button
    const rightPanel = document.createElement("div");
    rightPanel.style.cssText =
      "width: 280px; display:flex; flex-direction:column; gap:12px; align-items:center; justify-content:flex-start;";

    // Bike info
    const infoBox = document.createElement("div");
    infoBox.style.cssText = `width:100%; padding:12px; background: rgba(255,255,255,0.03); border-radius:10px; text-align:center;`;
    const infoName = document.createElement("div");
    infoName.style.cssText =
      "font-weight:bold; font-size:18px; margin-bottom:8px;";
    const infoStats = document.createElement("div");
    infoStats.style.cssText = "font-size:13px; color:#bbb;";
    infoBox.appendChild(infoName);
    infoBox.appendChild(infoStats);
    rightPanel.appendChild(infoBox);

    // Start button
    const startWrap = document.createElement("div");
    startWrap.style.cssText =
      "width:100%; display:flex; justify-content:center; padding-top:18px;";
    const startButton = document.createElement("button");
    startButton.textContent = "START GAME";
    startButton.style.cssText = `padding:12px 26px; font-size:16px; background:#4CAF50; color:#fff; border:none; border-radius:10px; cursor:pointer;`;
    startButton.addEventListener("click", () => {
      if (this.selectedBike && this.onSelectionComplete) {
        // pass selected bike (colors already on config)
        if (this.audioManager) this.audioManager.playUISelect();
        this.onSelectionComplete(this.selectedBike);
        this.hideSelectionUI();
      }
    });
    startWrap.appendChild(startButton);
    rightPanel.appendChild(startWrap);

    contentRow.appendChild(rightPanel);
    uiContainer.appendChild(contentRow);

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

  // Ensure textures used in the preview are configured for high-quality sampling
  _configureTextureForPreview(texture) {
    if (!texture || !this.previewRenderer) return;
    try {
      const caps = this.previewRenderer.capabilities || {};
      const maxAniso =
        (this.previewRenderer.capabilities &&
        this.previewRenderer.capabilities.getMaxAnisotropy
          ? this.previewRenderer.capabilities.getMaxAnisotropy()
          : caps.maxAnisotropy || 1) || 1;
      texture.anisotropy = Math.max(1, maxAniso);
      // Use sRGB for color maps so colors appear correct on most displays
      if (THREE && THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
      // Use trilinear mipmap filtering for crisper downscaled results
      if (THREE && THREE.LinearMipmapLinearFilter) {
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
      }
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
    } catch (e) {
      // ignore failures
    }
  }

  _configureMaterialsForPreview(obj) {
    if (!obj) return;
    obj.traverse((c) => {
      if (c.isMesh && c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach((m) => {
          if (!m) return;
          if (m.map) this._configureTextureForPreview(m.map);
          if (m.emissiveMap) this._configureTextureForPreview(m.emissiveMap);
          if (m.normalMap) this._configureTextureForPreview(m.normalMap);
          if (m.roughnessMap) this._configureTextureForPreview(m.roughnessMap);
          if (m.metalnessMap) this._configureTextureForPreview(m.metalnessMap);
          m.needsUpdate = true;
        });
      }
    });
  }

  // Clone texture so we don't mutate the main scene's texture settings
  _cloneTextureIfNeeded(texture) {
    if (!texture) return texture;
    try {
      // Some texture types expose a clone(); prefer that when available
      if (typeof texture.clone === "function") {
        const t = texture.clone();
        t.needsUpdate = true;
        return t;
      }
      // fallback shallow-copy for older textures
      const copy = texture; // as a safe fallback, return original (we'll still configure it)
      return copy;
    } catch (e) {
      return texture;
    }
  }

  // Specifically configure sky sphere / env maps for the preview
  _configureSkyForPreview(obj) {
    if (!obj) return;
    obj.traverse((c) => {
      if (!c.isMesh || !c.material) return;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach((m) => {
        if (!m) return;
        // Clone color map/envMap so we don't alter the main scene textures
        if (m.map) {
          try {
            m.map = this._cloneTextureIfNeeded(m.map);
            this._configureTextureForPreview(m.map);
          } catch (e) {}
        }
        if (m.envMap) {
          try {
            m.envMap = this._cloneTextureIfNeeded(m.envMap);
            this._configureTextureForPreview(m.envMap);
          } catch (e) {}
        }

        // If this mesh is likely a sky (name contains "sky" or very large sphere), ensure mapping is equirectangular
        const nameLower = (c.name || "").toLowerCase();
        let isSky = false;
        if (
          nameLower.includes("sky") ||
          nameLower.includes("skysphere") ||
          nameLower.includes("skydome")
        )
          isSky = true;
        try {
          if (c.geometry && c.geometry.boundingSphere === null)
            c.geometry.computeBoundingSphere();
          if (
            !isSky &&
            c.geometry &&
            c.geometry.boundingSphere &&
            c.geometry.boundingSphere.radius > 50
          )
            isSky = true;
        } catch (e) {}

        if (isSky) {
          if (m.map && m.map.mapping === undefined)
            m.map.mapping = THREE.EquirectangularReflectionMapping;
          if (m.envMap && m.envMap.mapping === undefined)
            m.envMap.mapping = THREE.EquirectangularReflectionMapping;
        }

        m.needsUpdate = true;
      });
    });
  }

  updateBikePreview(bike) {
    // Use a dedicated preview scene + renderer so UI does not overlap the bike
    this._ensurePreviewRenderer();

    // bump load token so in-flight loads become stale
    this._previewLoadId += 1;
    const loadId = this._previewLoadId;

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

    // Remove existing preview model from previewScene and dispose
    if (this.previewModel) {
      this.previewModel.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      this.previewScene.remove(this.previewModel);
      this.previewModel = null;
    }

    // Cancel previous animation frame
    if (this.previewAnimationId) cancelAnimationFrame(this.previewAnimationId);

    // Try to reuse preloaded model to save memory
    const preloadedModel =
      window.__PRELOADED_BIKE_MODELS__ &&
      window.__PRELOADED_BIKE_MODELS__["motor1"];

    if (preloadedModel) {
      // Clone the preloaded model for preview
      const model = preloadedModel.clone(true);
      if (!model) return;

      // Basic framing
      // Nudge down and scale smaller so the bike fits the preview properly
      // Scale the model down so it fits the preview
      model.scale.setScalar(0.6);

      // Compute bounding box center so we can pivot around the visual center
      const bbox = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      bbox.getCenter(center);

      // Create a pivot wrapper so we can rotate around the model's true center
      const pivot = new THREE.Group();

      // Move the model so its center is at the pivot origin
      model.position.sub(center);
      pivot.add(model);

      // Position the pivot slightly up relative to camera so bikes are visually centered
      const verticalOffset = 0.06; // tuned offset to visually center bike
      pivot.position.set(0, verticalOffset, 0);

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

      // Configure textures/materials for crisper appearance in preview
      this._configureMaterialsForPreview(model);

      // Add pivot (not the raw model) to the scene and set as previewModel
      this.previewScene.add(pivot);
      this.previewModel = pivot;

      // Aim camera at the pivot so rotation appears centered and show mountains behind
      if (this.previewCamera) {
        // place camera slightly back & above the pivot for level-style framing
        this.previewCamera.position.set(0.0, 1.4, 4.5);
        this.previewCamera.lookAt(pivot.position);
      }

      // Start render loop once model is present
      const renderLoop = () => {
        if (!this.previewRenderer) return;
        if (this.previewModel) this.previewModel.rotation.y += 0.01;
        this.previewRenderer.render(this.previewScene, this.previewCamera);
        this.previewAnimationId = requestAnimationFrame(renderLoop);
      };
      renderLoop();
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

          // Basic framing
          // Nudge down and scale smaller so the bike fits the preview properly
          // Scale the model down so it fits the preview
          model.scale.setScalar(0.6);

          // Compute bounding box center so we can pivot around the visual center
          const bbox = new THREE.Box3().setFromObject(model);
          const center = new THREE.Vector3();
          bbox.getCenter(center);

          // Create a pivot wrapper so we can rotate around the model's true center
          const pivot = new THREE.Group();

          // Move the model so its center is at the pivot origin
          model.position.sub(center);
          pivot.add(model);

          // Position the pivot slightly up relative to camera so bikes are visually centered
          const verticalOffset = 0.06; // tuned offset to visually center bike
          pivot.position.set(0, verticalOffset, 0);

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

          // Configure textures/materials for crisper appearance in preview
          this._configureMaterialsForPreview(model);

          // Add pivot (not the raw model) to the scene and set as previewModel
          this.previewScene.add(pivot);
          this.previewModel = pivot;

          // Aim camera at the pivot so rotation appears centered and show mountains behind
          if (this.previewCamera) {
            // place camera slightly back & above the pivot for level-style framing
            this.previewCamera.position.set(0.0, 1.4, 4.5);
            this.previewCamera.lookAt(pivot.position);
          }

          // Start render loop once model is present
          const renderLoop = () => {
            if (!this.previewRenderer) return;
            if (this.previewModel) this.previewModel.rotation.y += 0.01;
            this.previewRenderer.render(this.previewScene, this.previewCamera);
            this.previewAnimationId = requestAnimationFrame(renderLoop);
          };
          renderLoop();
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
            this.previewModel = fallback;
            this.previewScene.add(fallback);

            // Configure fallback materials as well
            this._configureMaterialsForPreview(fallback);

            // Aim camera at the fallback model
            const bbox = new THREE.Box3().setFromObject(fallback);
            const center = new THREE.Vector3();
            bbox.getCenter(center);
            if (this.previewCamera) {
              this.previewCamera.position.set(
                center.x,
                center.y,
                bbox.max.z + 2
              );
              this.previewCamera.lookAt(center);
            }

            // Start render loop for fallback
            const renderLoop = () => {
              if (!this.previewRenderer) return;
              if (this.previewModel) this.previewModel.rotation.y += 0.01;
              this.previewRenderer.render(
                this.previewScene,
                this.previewCamera
              );
              this.previewAnimationId = requestAnimationFrame(renderLoop);
            };
            renderLoop();
          } catch (e) {
            console.error("Fallback model error:", e);
          }
        }
      );
    }
  }

  _ensurePreviewRenderer() {
    if (this.previewRenderer) return;

    // Create a separate scene and camera for the bike preview
    this.previewScene = new THREE.Scene();
    // give the 3D preview a tan background so the model is easier to see
    const previewBgColor = 0xd2b48c; // tan
    this.previewScene.background = new THREE.Color(previewBgColor);
    this.previewCamera = new THREE.PerspectiveCamera(75, 1.0, 0.1, 1000);
    this.previewCamera.position.set(0, 1, 3);

    const renderer = new THREE.WebGLRenderer({
      // alpha:false so the renderer draws its own background color
      alpha: false,
      antialias: true,
    });
    // default size; will be resized to container shortly
    renderer.setSize(460, 360);
    // cap pixel ratio to avoid extremely large textures on high-DPI displays
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // set a matching clear color so the canvas shows this tan background
    renderer.setClearColor(previewBgColor, 1);
    // ensure the canvas fills the preview container and visually matches the scene
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.borderRadius = "12px";
    renderer.domElement.style.backgroundColor = "#d2b48c";
    renderer.gammaOutput = true;
    renderer.physicallyCorrectLights = true;

    // Enable shadow maps for the preview renderer
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.previewRenderer = renderer;

    // Add lighting to the preview scene so the bike is visible and casts soft shadows
    (function addPreviewLights(scene) {
      // Ambient fill (brighter so dark materials show)
      const ambient = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambient);

      // Hemisphere light for nice sky/ground fill
      const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 0.6);
      hemi.position.set(0, 5, 0);
      scene.add(hemi);

      // Key directional light
      const key = new THREE.DirectionalLight(0xffffff, 1.2);
      key.position.set(4, 6, 4);
      key.castShadow = true;
      key.shadow.mapSize.width = 2048;
      key.shadow.mapSize.height = 2048;
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 30;
      key.shadow.camera.left = -6;
      key.shadow.camera.right = 6;
      key.shadow.camera.top = 6;
      key.shadow.camera.bottom = -6;
      key.shadow.bias = -0.0005;
      scene.add(key);

      // Soft rim/back light to separate silhouette
      const rim = new THREE.DirectionalLight(0xaaaaff, 0.6);
      rim.position.set(-3, 2, -4);
      // Let rim light cast shadows and tune its shadow camera for the preview
      rim.castShadow = true;
      rim.shadow.mapSize.width = 1024;
      rim.shadow.mapSize.height = 1024;
      rim.shadow.camera.near = 0.5;
      rim.shadow.camera.far = 30;
      rim.shadow.camera.left = -6;
      rim.shadow.camera.right = 6;
      rim.shadow.camera.top = 6;
      rim.shadow.camera.bottom = -6;
      rim.shadow.bias = 0.0003;
      scene.add(rim);

      // Small camera-facing fill light so front details are visible
      const fill = new THREE.DirectionalLight(0xffffff, 0.35);
      fill.position.set(0, 1.5, 3);
      // Make fill light cast soft shadows too
      fill.castShadow = true;
      fill.shadow.mapSize.width = 1024;
      fill.shadow.mapSize.height = 1024;
      fill.shadow.camera.near = 0.5;
      fill.shadow.camera.far = 30;
      fill.shadow.camera.left = -4;
      fill.shadow.camera.right = 4;
      fill.shadow.camera.top = 4;
      fill.shadow.camera.bottom = -4;
      fill.shadow.bias = 0.0004;
      scene.add(fill);

      // Subtle ground so shadows have a surface to land on
      const groundGeo = new THREE.PlaneGeometry(8, 8);
      const groundMat = new THREE.ShadowMaterial({ opacity: 0.18 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.5;
      ground.receiveShadow = true;
      scene.add(ground);
    })(this.previewScene);

    // improve renderer color/tone so lighting looks correct
    if (THREE.ACESFilmicToneMapping)
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMappingExposure = 1.0;

    // Append to the preview container
    const container = document.getElementById("bike-preview-container");
    if (container) {
      container.appendChild(renderer.domElement);
      // Resize renderer to match container and update camera aspect
      try {
        const dpi = Math.min(window.devicePixelRatio || 1, 2);
        renderer.setPixelRatio(dpi);
        renderer.setSize(container.clientWidth, container.clientHeight, false);
        if (this.previewCamera) {
          this.previewCamera.aspect =
            container.clientWidth / container.clientHeight;
          this.previewCamera.updateProjectionMatrix();
        }
      } catch (e) {}
    }

    // Try to reuse mountains from the main scene if present
    try {
      const mountains = this.scene
        ? this.scene.getObjectByName("mountains")
        : null;
      if (mountains) {
        // clone so we don't detach mountains from main scene
        const mClone = mountains.clone();
        // configure textures on the cloned mountains to use high-quality sampling
        this._configureMaterialsForPreview(mClone);
        // also specifically configure any sky meshes/envmaps inside the cloned group
        this._configureSkyForPreview(mClone);
        this.previewScene.add(mClone);
      } else {
        // fallback: attempt to load a mountains glb if available
        const gl = new GLTFLoader();
        gl.load(
          "/models/mountains.glb",
          (g) => {
            if (g && g.scene) {
              // ensure any textures in the loaded mountains are configured for preview
              this._configureMaterialsForPreview(g.scene);
              // configure sky / envmap if present
              this._configureSkyForPreview(g.scene);
              this.previewScene.add(g.scene);
            }
          },
          undefined,
          () => {}
        );
      }

      // If the main scene has a dedicated sky / skydome object, clone and add it explicitly
      try {
        const skyNames = [
          "sky",
          "skydome",
          "skysphere",
          "sky_sphere",
          "skybox",
        ];
        for (let i = 0; i < skyNames.length; i++) {
          if (!this.scene) break;
          const s = this.scene.getObjectByName(skyNames[i]);
          if (s) {
            // clone deeply and configure textures for preview (do not mutate main scene)
            const skyClone = s.clone(true);
            this._configureSkyForPreview(skyClone);
            this.previewScene.add(skyClone);
            break;
          }
        }
      } catch (e) {
        // ignore sky cloning errors
      }
    } catch (e) {
      // ignore if mountains not available
    }
  }

  showSelectionUI() {
    // attach keyboard listeners for arrow navigation when showing
    const onKey = (ev) => {
      if (ev.key === "ArrowLeft") this._prevBike();
      if (ev.key === "ArrowRight") this._nextBike();
    };
    window.addEventListener("keydown", onKey);
    // store to remove later
    this._selectionKeyHandler = onKey;
    // call existing implementation (which creates UI)
    if (!this.selectionUI) {
      const ui = this.createSelectionUI();
      document.body.appendChild(ui);
      // remember the DOM node so hideSelectionUI can remove it
      this.selectionUI = ui;
      const previewContainer = ui.querySelector("#bike-preview-container");
      if (previewContainer && !this.previewRenderer) {
        this._ensurePreviewRenderer();
        if (this.previewRenderer) {
          this.previewRenderer.setSize(
            previewContainer.clientWidth,
            previewContainer.clientHeight
          );
          // only append the canvas if it's not already present
          if (!previewContainer.contains(this.previewRenderer.domElement)) {
            previewContainer.appendChild(this.previewRenderer.domElement);
          }
        }
      }
    }
    const initial = this.selectedBike || this.availableBikes[0];
    if (initial) this.selectBike(initial);
  }

  hideSelectionUI() {
    // remove key handler
    if (this._selectionKeyHandler) {
      window.removeEventListener("keydown", this._selectionKeyHandler);
      this._selectionKeyHandler = null;
    }
    // existing cleanup
    if (this.selectionUI && this.selectionUI.parentElement)
      this.selectionUI.parentElement.removeChild(this.selectionUI);
    this.selectionUI = null;
    if (this.previewAnimationId) cancelAnimationFrame(this.previewAnimationId);
    if (this.previewRenderer) {
      try {
        this.previewRenderer.forceContextLoss();
      } catch (e) {}
      const canvas = this.previewRenderer.domElement;
      if (canvas && canvas.parentElement)
        canvas.parentElement.removeChild(canvas);
      this.previewRenderer = null;
    }
    if (this.previewModel && this.previewScene) {
      this.previewScene.remove(this.previewModel);
      this.previewModel = null;
    }
  }
}
