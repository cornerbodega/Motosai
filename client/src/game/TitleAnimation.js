import * as THREE from "three";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";

export class TitleAnimation {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.words = [];
    this.wordConfigs = [
      { text: "RACE", size: 80, delay: 0 },
      { text: "THE", size: 50, delay: 1000 },
      { text: "UFO", size: 80, delay: 2000 }
    ];
    this.font = null;
    this.isComplete = false;
  }

  async start() {
    // Load font
    const loader = new FontLoader();
    loader.load(
      "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json",
      (font) => {
        this.font = font;
        this.createWords();
      },
      undefined,
      (error) => {
        console.warn("Font loading failed, using fallback:", error);
        this.createFallbackWords();
      }
    );
  }

  createWords() {
    let xOffset = -150; // Starting X position

    this.wordConfigs.forEach((config, index) => {
      const geometry = new TextGeometry(config.text, {
        font: this.font,
        size: config.size,
        height: 20, // Extrusion depth
        curveSegments: 12,
        bevelEnabled: true,
        bevelThickness: 2,
        bevelSize: 1,
        bevelOffset: 0,
        bevelSegments: 5
      });

      geometry.computeBoundingBox();
      const centerOffset = -0.5 * (geometry.boundingBox.max.x - geometry.boundingBox.min.x);

      const material = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 0.5,
        metalness: 0.8,
        roughness: 0.2
      });

      const mesh = new THREE.Mesh(geometry, material);

      // Start position (high above, ready to drop)
      mesh.position.set(xOffset, 500, -200);

      // Random rotation for tumbling effect
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      // Final position
      const finalY = 0;
      const finalZ = -100;
      const finalRotation = new THREE.Euler(0, 0, 0);

      this.words.push({
        mesh,
        config,
        startTime: null,
        isDropping: false,
        isComplete: false,
        finalPosition: new THREE.Vector3(xOffset, finalY, finalZ),
        finalRotation,
        centerOffset
      });

      this.scene.add(mesh);

      // Update offset for next word
      if (geometry.boundingBox) {
        xOffset += (geometry.boundingBox.max.x - geometry.boundingBox.min.x) + 20;
      }

      // Start drop after delay
      setTimeout(() => {
        this.words[index].isDropping = true;
        this.words[index].startTime = Date.now();
      }, config.delay);
    });
  }

  createFallbackWords() {
    // Simple text planes as fallback
    const words = ["RACE", "THE", "UFO"];
    let xOffset = -150;

    words.forEach((text, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, 512, 256);

      const fontSize = text === "THE" ? 80 : 120;
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.fillStyle = "#00ffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 256, 128);

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true
      });

      const geometry = new THREE.PlaneGeometry(100, 50);
      const mesh = new THREE.Mesh(geometry, material);

      mesh.position.set(xOffset, 500, -200);
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      const finalPosition = new THREE.Vector3(xOffset, 0, -100);
      const finalRotation = new THREE.Euler(0, 0, 0);

      this.words.push({
        mesh,
        config: this.wordConfigs[index],
        startTime: null,
        isDropping: false,
        isComplete: false,
        finalPosition,
        finalRotation
      });

      this.scene.add(mesh);
      xOffset += 120;

      setTimeout(() => {
        this.words[index].isDropping = true;
        this.words[index].startTime = Date.now();
      }, this.wordConfigs[index].delay);
    });
  }

  update(elapsed) {
    let allComplete = true;

    this.words.forEach((word) => {
      if (!word.isDropping || word.isComplete) {
        if (!word.isComplete) allComplete = false;
        return;
      }

      const dropDuration = 1000; // 1 second drop
      const timeSinceStart = Date.now() - word.startTime;
      const t = Math.min(timeSinceStart / dropDuration, 1);

      // Ease-out cubic for smooth landing
      const eased = 1 - Math.pow(1 - t, 3);

      // Position
      word.mesh.position.lerp(word.finalPosition, eased);

      // Rotation (tumbling)
      if (t < 1) {
        // Continue tumbling
        word.mesh.rotation.x += 0.1;
        word.mesh.rotation.y += 0.15;
        word.mesh.rotation.z += 0.08;
      } else {
        // Lock into final rotation
        word.mesh.rotation.x = THREE.MathUtils.lerp(word.mesh.rotation.x, word.finalRotation.x, 0.2);
        word.mesh.rotation.y = THREE.MathUtils.lerp(word.mesh.rotation.y, word.finalRotation.y, 0.2);
        word.mesh.rotation.z = THREE.MathUtils.lerp(word.mesh.rotation.z, word.finalRotation.z, 0.2);

        if (Math.abs(word.mesh.rotation.x) < 0.01) {
          word.mesh.rotation.set(0, 0, 0);
          word.isComplete = true;
        }
      }

      if (!word.isComplete) allComplete = false;
    });

    this.isComplete = allComplete;
  }

  fadeToSky(t) {
    // Move title to persistent sky position
    this.words.forEach((word) => {
      // Move up and back
      const targetY = 100;
      const targetZ = -200;

      word.mesh.position.y = THREE.MathUtils.lerp(word.mesh.position.y, targetY, t);
      word.mesh.position.z = THREE.MathUtils.lerp(word.mesh.position.z, targetZ, t);

      // Slightly reduce scale
      const targetScale = 0.8;
      const currentScale = word.mesh.scale.x;
      word.mesh.scale.setScalar(THREE.MathUtils.lerp(currentScale, targetScale, t));
    });
  }

  cleanup() {
    this.words.forEach((word) => {
      if (word.mesh) {
        if (word.mesh.geometry) word.mesh.geometry.dispose();
        if (word.mesh.material) {
          if (word.mesh.material.map) word.mesh.material.map.dispose();
          word.mesh.material.dispose();
        }
        this.scene.remove(word.mesh);
      }
    });
    this.words = [];
  }
}
