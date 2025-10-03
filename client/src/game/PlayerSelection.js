import * as THREE from "three";
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

    // Add emoji indicator on top
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.font = "bold 100px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(bikeConfig.emoji, 64, 64);

    const emojiTexture = new THREE.CanvasTexture(canvas);
    const emojiGeometry = new THREE.PlaneGeometry(1, 1);
    const emojiMaterial = new THREE.MeshBasicMaterial({
      map: emojiTexture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const emojiMesh = new THREE.Mesh(emojiGeometry, emojiMaterial);
    emojiMesh.position.y = 2;
    group.add(emojiMesh);

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
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #fff;
            border-radius: 20px;
            padding: 20px;
            z-index: 1000;
            color: white;
            font-family: Arial, sans-serif;
            width: 760px;
            height: 620px; /* fixed height so inner scrolling works */
            max-height: 640px;
            overflow: hidden;
        `;

    const title = document.createElement("h2");
    title.textContent = "Choose Your Ride";
    title.style.cssText =
      "text-align: center; margin: 8px 0 16px; font-size: 28px;";
    uiContainer.appendChild(title);

    // Content row: left = preview, right = bike list + start
    const contentRow = document.createElement("div");
    contentRow.style.cssText = `display: flex; gap: 18px; align-items: flex-start; height: calc(100% - 88px);`;

    // Left: preview container
    const previewContainer = document.createElement("div");
    previewContainer.id = "bike-preview-container";
    previewContainer.style.cssText = `
            width: 360px;
            min-width: 260px;
            height: 420px;
            background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.2));
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.06);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        `;

    // Add an overlay label for the preview
    const previewLabel = document.createElement("div");
    previewLabel.textContent = "Bike Preview";
    previewLabel.style.cssText =
      "position: absolute; top: 8px; left: 12px; color: #ddd; font-size: 12px;";
    previewContainer.appendChild(previewLabel);

    contentRow.appendChild(previewContainer);

    // Right: controls and bike grid
    const rightPanel = document.createElement("div");
    rightPanel.style.cssText =
      "flex: 1; display: flex; flex-direction: column; gap: 12px; height: 100%;";

    const bikeGrid = document.createElement("div");
    bikeGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 12px;
            overflow-y: auto;
            padding-right: 6px;
            flex: 1 1 auto; /* allow grid to grow and scroll */
            max-height: 100%;
        `;

    this.availableBikes.forEach((bike) => {
      const bikeCard = document.createElement("div");
      bikeCard.style.cssText = `
                background: ${
                  bike.unlocked
                    ? "rgba(50,50,50,0.85)"
                    : "rgba(20,20,20,0.85)"
                };
                border: 2px solid ${bike.unlocked ? "#4CAF50" : "#666"};
                border-radius: 10px;
                padding: 12px;
                cursor: ${bike.unlocked ? "pointer" : "not-allowed"};
                transition: all 0.18s;
                text-align: center;
                opacity: ${bike.unlocked ? "1" : "0.5"};
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
            `;

      if (bike.unlocked) {
        bikeCard.addEventListener("click", () => {
          if (this.audioManager) this.audioManager.playUISelect();
          this.selectBike(bike);
        });
        bikeCard.addEventListener("mouseenter", () => {
          bikeCard.style.transform = "scale(1.03)";
          if (this.audioManager) this.audioManager.playUIHover();
          // update preview on hover for faster feedback
          this.updateBikePreview(bike);
        });
        bikeCard.addEventListener("mouseleave", () => {
          bikeCard.style.transform = "scale(1)";
        });
      }

      const emoji = document.createElement("div");
      emoji.textContent = bike.emoji;
      emoji.style.cssText = "font-size: 34px; margin-bottom: 8px;";
      bikeCard.appendChild(emoji);

      const name = document.createElement("div");
      name.textContent = bike.name;
      name.style.cssText = "font-weight: bold; margin-bottom: 6px; font-size:14px;";
      bikeCard.appendChild(name);

      const stats = document.createElement("div");
      stats.style.cssText = "font-size: 12px; color: #bbb;";
      stats.innerHTML = `Speed: ${bike.speed}<br>Accel: ${bike.acceleration}x<br>Handle: ${bike.handling}x`;
      bikeCard.appendChild(stats);

      bikeGrid.appendChild(bikeCard);
    });

    rightPanel.appendChild(bikeGrid);

    // Start button area pinned to bottom of rightPanel
    const bottomBar = document.createElement("div");
    bottomBar.style.cssText = 'display:flex; justify-content:center; align-items:center; padding: 8px 0; flex: 0 0 auto;';

    const startButton = document.createElement("button");
    startButton.textContent = "START GAME";
    startButton.disabled = true;
    startButton.style.cssText = `
            padding: 12px 26px;
            font-size: 16px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            opacity: 0.6;
        `;

    startButton.addEventListener("click", () => {
      if (this.selectedBike && this.onSelectionComplete) {
        if (this.audioManager) this.audioManager.playUISelect();
        this.onSelectionComplete(this.selectedBike);
        this.hideSelectionUI();
      }
    });

    bottomBar.appendChild(startButton);
    rightPanel.appendChild(bottomBar);

    contentRow.appendChild(rightPanel);
    uiContainer.appendChild(contentRow);

    this.selectionUI = uiContainer;
    this.startButton = startButton;

    return uiContainer;
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
  }

  updateBikePreview(bike) {
    // Use a dedicated preview scene + renderer so UI does not overlap the bike
    this._ensurePreviewRenderer();

    // Remove existing preview model from previewScene
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

    // Create a fuller motorcycle model using the MotorcycleFactory
    const model = MotorcycleFactory.createMotorcycle({
      bikeColor: bike.color,
      includeRider: true,
    });
    model.position.set(0, 0, 0);
    model.scale.setScalar(1.2);
    this.previewScene.add(model);
    this.previewModel = model;

    // Cancel previous animation and start a new one that renders into the preview canvas
    if (this.previewAnimationId) cancelAnimationFrame(this.previewAnimationId);

    const renderLoop = () => {
      if (!this.previewRenderer) return;
      if (this.previewModel) this.previewModel.rotation.y += 0.01;
      this.previewRenderer.render(this.previewScene, this.previewCamera);
      this.previewAnimationId = requestAnimationFrame(renderLoop);
    };
    renderLoop();
  }

  _ensurePreviewRenderer() {
    // If previewScene already created, nothing to do
    if (this.previewScene) return;

    // Create simple preview scene / camera
    this.previewScene = new THREE.Scene();
    this.previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.previewCamera.position.set(0, 1.2, 3.0);
    this.previewCamera.lookAt(0, 0.5, 0);

    // Add simple lighting so standard/physical materials are visible in the preview
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.previewScene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.45);
    hemi.position.set(0, 5, 0);
    this.previewScene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(5, 8, 5);
    key.target.position.set(0, 0.5, 0);
    this.previewScene.add(key);
    this.previewScene.add(key.target);

    const rim = new THREE.DirectionalLight(0xaaaaee, 0.25);
    rim.position.set(-5, 4, -3);
    this.previewScene.add(rim);

    // Note: renderer is created in showSelectionUI when the preview container is available
  }

  showSelectionUI() {
    const ui = this.createSelectionUI();
    document.body.appendChild(ui);

    // If the preview container exists in the created UI, create a renderer attached to it
    const previewContainer = ui.querySelector('#bike-preview-container');
    if (previewContainer && !this.previewRenderer) {
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(previewContainer.clientWidth, previewContainer.clientHeight);
      // nicer output encoding
      if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
      // set a contrasting clear color so dark/black bike parts are visible
      const clearColor = 0x243445; // desaturated blue-gray
      renderer.setClearColor(clearColor, 1);
      // also update the preview container CSS background to match the renderer
      previewContainer.style.background = '#243445';
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      previewContainer.appendChild(renderer.domElement);
      this.previewRenderer = renderer;

      // Ensure preview scene and camera exist
      this._ensurePreviewRenderer();

      // Resize handling
      const resizeObserver = new ResizeObserver(() => {
        if (!this.previewRenderer) return;
        const w = previewContainer.clientWidth;
        const h = previewContainer.clientHeight;
        this.previewRenderer.setSize(w, h);
        this.previewCamera.aspect = w / h;
        this.previewCamera.updateProjectionMatrix();
      });
      resizeObserver.observe(previewContainer);
      this._previewResizeObserver = resizeObserver;
    }

    // Select the first bike by default if nothing selected yet
    const initial = this.selectedBike || this.availableBikes[0];
    if (initial) this.selectBike(initial);
  }

  hideSelectionUI() {
    if (this.selectionUI && this.selectionUI.parentElement) {
      this.selectionUI.parentElement.removeChild(this.selectionUI);
    }

    // Clean up 3D models and dispose resources properly
    // Dispose preview renderer and its scene/models
    if (this.previewAnimationId) cancelAnimationFrame(this.previewAnimationId);

    if (this.previewModel) {
      this.previewModel.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      if (this.previewScene) this.previewScene.remove(this.previewModel);
      this.previewModel = null;
    }

    if (this.previewRenderer) {
      // Dispose renderer and remove canvas
      const canvas = this.previewRenderer.domElement;
      this.previewRenderer.forceContextLoss();
      if (canvas && canvas.parentElement)
        canvas.parentElement.removeChild(canvas);
      this.previewRenderer.domElement = null;
      this.previewRenderer = null;
    }
    if (this._previewResizeObserver) {
      this._previewResizeObserver.disconnect();
      this._previewResizeObserver = null;
    }

    this.bikeModels.clear();
  }

  getSelectedBikeConfig() {
    return this.selectedBike;
  }
}
