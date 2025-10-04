import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class IntroAnimation {
  constructor(scene, camera, audioManager = null) {
    this.scene = scene;
    this.camera = camera;
    this.audioManager = audioManager;
    this.animationPhase = "loading";
    this.previewModel = null; // loaded GLB or fallback meshes
    this.morphProgress = 0;
    this.onComplete = null;
    this._gltf = null;
  }

  async start() {
    // Try to load GLB model for a richer intro
    const loader = new GLTFLoader();
    const glbPath = "/models/motor1.glb";

    loader.load(
      glbPath,
      (gltf) => {
        this._gltf = gltf;
        const model = gltf.scene || gltf.scenes[0];
        if (!model) {
          this._startFallback();
          return;
        }

        // Don't run a spinning intro. Instead register the loaded model
        // in a global registry so selection UI can reuse it.
        try {
          if (!window.__PRELOADED_BIKE_MODELS__) window.__PRELOADED_BIKE_MODELS__ = {};
          // store a clone to avoid accidental shared transforms
          window.__PRELOADED_BIKE_MODELS__["motor1"] = model.clone(true);
          // also preserve original gltf for later disposal if needed
          window.__PRELOADED_BIKE_GLTF__ = gltf;
        } catch (e) {
          console.warn("Failed to register preloaded bike model:", e);
        }

        // Mark intro as complete (no spinning animation)
        this.animationPhase = "complete";
        if (this.onComplete) this.onComplete();
      },
      undefined,
      (err) => {
        console.warn("Intro GLB load failed, using fallback intro:", err);
        this._startFallback();
      }
    );
  }

  _startFallback() {
    // Original emoji -> morph fallback
    this.animationPhase = "emoji";

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 512, 512);
    ctx.font = "bold 400px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🏍️", 256, 256);

    const emojiTexture = new THREE.CanvasTexture(canvas);
    this._fallbackEmojiTex = emojiTexture;

    const geometry = new THREE.PlaneGeometry(5, 5);
    const material = new THREE.MeshBasicMaterial({
      map: emojiTexture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.previewModel = new THREE.Mesh(geometry, material);
    this.previewModel.position.set(0, 2, -10);
    this.scene.add(this.previewModel);

    this._animateFallback();
  }

  _animateGLBIntro() {
    const start = Date.now();
    const duration = 2400; // ms

    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);

      // Scale up and rotate gently
      if (this.previewModel) {
        const s = 0.2 + t * 0.8; // from 0.2 to 1.0
        this.previewModel.scale.setScalar(s);
        this.previewModel.rotation.y += 0.02 + t * 0.02;
        // bob up a bit
        this.previewModel.position.y = 0.5 + Math.sin(t * Math.PI) * 0.5;
      }

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        // complete
        if (this.onComplete) this.onComplete();
      }
    };

    tick();
  }

  _animateFallback() {
    const duration = 3000;
    const start = Date.now();

    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);

      if (this.animationPhase === "emoji") {
        // Rotate and pulse the emoji
        if (this.previewModel) {
          this.previewModel.rotation.y = progress * Math.PI * 2;
          const scale = 1 + Math.sin(progress * Math.PI * 4) * 0.2;
          this.previewModel.scale.set(scale, scale, scale);
        }

        if (progress >= 1) {
          // morph into simple 3D bike created procedurally
          this.animationPhase = "morph";
          const bike = this._createFallbackMotorcycle();
          this._fallbackBike = bike;
          this.scene.add(bike);
          this.morphProgress = 0;
          if (this.audioManager && this.audioManager.playIntroMorph)
            this.audioManager.playIntroMorph();
        }
      } else if (this.animationPhase === "morph") {
        this.morphProgress += 0.02;

        if (this.morphProgress <= 1) {
          if (this.previewModel && this.previewModel.material)
            this.previewModel.material.opacity = 1 - this.morphProgress;

          if (this._fallbackBike) {
            this._fallbackBike.visible = true;
            this._fallbackBike.rotation.y = this.morphProgress * Math.PI;
            const scale = this.morphProgress;
            this._fallbackBike.scale.set(scale, scale, scale);
          }
        } else {
          // Finish
          if (this.previewModel) {
            this.scene.remove(this.previewModel);
            if (this.previewModel.geometry)
              this.previewModel.geometry.dispose();
            if (this.previewModel.material) {
              if (this.previewModel.material.map)
                this.previewModel.material.map.dispose();
              this.previewModel.material.dispose();
            }
            this.previewModel = null;
          }

          this.animationPhase = "complete";
          if (this.onComplete) this.onComplete();
          return;
        }
      }

      if (this.animationPhase !== "complete") requestAnimationFrame(animate);
    };

    animate();
  }

  _createFallbackMotorcycle() {
    const group = new THREE.Group();

    // Body
    const bodyGeometry = new THREE.BoxGeometry(2, 0.8, 0.6);
    const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
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

    group.position.set(0, 1, -10);
    group.visible = false;
    return group;
  }

  cleanup() {
    // Remove and dispose GLTF if present
    if (this._gltf) {
      try {
        if (this._gltf.scene) {
          this._gltf.scene.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (child.material.map) child.material.map.dispose();
              child.material.dispose();
            }
          });
          if (this._gltf.scene.parent)
            this._gltf.scene.parent.remove(this._gltf.scene);
        }
      } catch (e) {
        /* ignore */
      }
      this._gltf = null;
    }

    // Remove previewModel if still present
    if (this.previewModel) {
      this.previewModel.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      if (this.previewModel.parent)
        this.previewModel.parent.remove(this.previewModel);
      this.previewModel = null;
    }

    // Remove fallback bike
    if (this._fallbackBike) {
      this._fallbackBike.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      if (this._fallbackBike.parent)
        this._fallbackBike.parent.remove(this._fallbackBike);
      this._fallbackBike = null;
    }

    // Dispose fallback emoji texture
    if (this._fallbackEmojiTex) {
      if (typeof this._fallbackEmojiTex.dispose === "function")
        this._fallbackEmojiTex.dispose();
      this._fallbackEmojiTex = null;
    }

    this.scene = null;
    this.camera = null;
    this.audioManager = null;
  }
}
