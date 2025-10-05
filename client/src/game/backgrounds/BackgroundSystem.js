// Simple blue sky background with beautiful night starfield

import * as THREE from 'three';

export class BackgroundSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.skyDome = null;
    this.starfield = null;
    this.milkyWay = null;
    this.time = 0;

    this.init();
  }

  init() {
    // Create simple blue sky sphere
    const skyGeo = new THREE.SphereGeometry(2000, 64, 32);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x87CEEB,  // Sky blue
      fog: false,
      side: THREE.BackSide,  // Render inside of sphere
      depthWrite: false,
      transparent: false
    });

    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.name = 'sky';
    this.skyDome.renderOrder = -1000;  // Render behind everything
    this.skyDome.frustumCulled = false;  // Always render
    this.scene.add(this.skyDome);

    // Create beautiful starfield
    this.createStarfield();

    // Create Milky Way galaxy band
    this.createMilkyWay();
  }

  createStarfield() {
    // Create 8000 stars for a dense, beautiful field
    const starCount = 8000;
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const colors = new Float32Array(starCount * 3);
    const twinkleOffsets = new Float32Array(starCount);
    const twinkleSpeeds = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      // Distribute stars spherically around the sky
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 1800; // Inside sky dome

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      // Vary star sizes for depth - some large bright stars, mostly small ones
      const sizeRoll = Math.random();
      if (sizeRoll > 0.98) {
        sizes[i] = 4.0 + Math.random() * 3.0; // Bright stars
      } else if (sizeRoll > 0.90) {
        sizes[i] = 2.5 + Math.random() * 1.5; // Medium stars
      } else {
        sizes[i] = 1.0 + Math.random() * 1.5; // Small stars
      }

      // Star colors - mostly white/blue, some warm stars
      const colorRoll = Math.random();
      if (colorRoll > 0.95) {
        // Warm orange/red stars (rare)
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.7 + Math.random() * 0.3;
        colors[i * 3 + 2] = 0.6 + Math.random() * 0.2;
      } else if (colorRoll > 0.85) {
        // Yellow-white stars
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.95 + Math.random() * 0.05;
        colors[i * 3 + 2] = 0.85 + Math.random() * 0.15;
      } else {
        // Blue-white stars (most common)
        colors[i * 3] = 0.8 + Math.random() * 0.2;
        colors[i * 3 + 1] = 0.85 + Math.random() * 0.15;
        colors[i * 3 + 2] = 1.0;
      }

      // Twinkle parameters for organic animation
      twinkleOffsets[i] = Math.random() * Math.PI * 2;
      twinkleSpeeds[i] = 0.5 + Math.random() * 1.5;
    }

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    starGeometry.setAttribute('twinkleOffset', new THREE.BufferAttribute(twinkleOffsets, 1));
    starGeometry.setAttribute('twinkleSpeed', new THREE.BufferAttribute(twinkleSpeeds, 1));

    // Custom shader for beautiful twinkling stars
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        opacity: { value: 1.0 }
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        attribute float twinkleOffset;
        attribute float twinkleSpeed;

        varying vec3 vColor;
        varying float vAlpha;

        uniform float time;

        void main() {
          vColor = color;

          // Organic twinkling effect
          float twinkle = sin(time * twinkleSpeed + twinkleOffset) * 0.5 + 0.5;
          twinkle = pow(twinkle, 2.0); // Make twinkle more dramatic
          vAlpha = 0.4 + twinkle * 0.6; // Stars fade between 40% and 100%

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

          // Size based on distance and twinkle
          gl_PointSize = size * (1.0 + twinkle * 0.5) * (1000.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float opacity;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          // Create soft circular stars
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);

          if (dist > 0.5) discard;

          // Soft glow falloff
          float alpha = (1.0 - dist * 2.0) * vAlpha;
          alpha = pow(alpha, 1.5); // Soft glow

          // Add bright core to larger stars
          float core = smoothstep(0.5, 0.0, dist);
          vec3 finalColor = vColor * (1.0 + core * 0.5);

          gl_FragColor = vec4(finalColor, alpha * opacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });

    this.starfield = new THREE.Points(starGeometry, starMaterial);
    this.starfield.name = 'starfield';
    this.starfield.renderOrder = -999;
    this.starfield.frustumCulled = false;
    this.starfield.visible = false; // Hidden by default, shown at night
    this.scene.add(this.starfield);
  }

  createMilkyWay() {
    // Create a subtle Milky Way band for extra beauty
    const milkyWayGeo = new THREE.PlaneGeometry(3000, 1000);

    // Create a gradient texture for the Milky Way
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Create radial gradient from center
    const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    gradient.addColorStop(0, 'rgba(200, 220, 255, 0.4)');
    gradient.addColorStop(0.3, 'rgba(150, 180, 255, 0.2)');
    gradient.addColorStop(0.6, 'rgba(100, 140, 200, 0.1)');
    gradient.addColorStop(1, 'rgba(50, 80, 150, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);

    const milkyWayTexture = new THREE.CanvasTexture(canvas);

    const milkyWayMat = new THREE.MeshBasicMaterial({
      map: milkyWayTexture,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false
    });

    this.milkyWay = new THREE.Mesh(milkyWayGeo, milkyWayMat);
    this.milkyWay.name = 'milkyWay';
    this.milkyWay.renderOrder = -998;
    this.milkyWay.rotation.x = Math.PI / 2;
    this.milkyWay.rotation.z = Math.PI / 4; // Angle the Milky Way
    this.milkyWay.position.y = 500;
    this.milkyWay.frustumCulled = false;
    this.milkyWay.visible = false; // Hidden by default, shown at night
    this.scene.add(this.milkyWay);
  }

  setSkyColor(color) {
    if (this.skyDome) {
      this.skyDome.material.color.setHex(color);
    }
  }

  // Show/hide starfield (for night time)
  setStarfieldVisible(visible) {
    if (this.starfield) {
      this.starfield.visible = visible;
    }
    if (this.milkyWay) {
      this.milkyWay.visible = visible;
    }
  }

  updateLocation(absolutePosition, location) {
    // No-op: static blue sky
  }

  update(deltaTime, playerPosition) {
    // Keep sky dome centered on player
    if (this.skyDome) {
      this.skyDome.position.copy(playerPosition);
    }

    // Keep starfield centered on player
    if (this.starfield) {
      this.starfield.position.copy(playerPosition);

      // Update time for twinkling animation
      this.time += deltaTime * 0.5; // Slow, gentle twinkling
      this.starfield.material.uniforms.time.value = this.time;
    }

    // Keep Milky Way centered and slowly rotating for subtle motion
    if (this.milkyWay) {
      this.milkyWay.position.x = playerPosition.x;
      this.milkyWay.position.z = playerPosition.z;
      // Very slow rotation for subtle beauty
      this.milkyWay.rotation.z += deltaTime * 0.02;
    }
  }

  dispose() {
    if (this.skyDome) {
      this.skyDome.geometry.dispose();
      this.skyDome.material.dispose();
      this.scene.remove(this.skyDome);
    }

    if (this.starfield) {
      this.starfield.geometry.dispose();
      this.starfield.material.dispose();
      this.scene.remove(this.starfield);
    }

    if (this.milkyWay) {
      this.milkyWay.geometry.dispose();
      this.milkyWay.material.map.dispose();
      this.milkyWay.material.dispose();
      this.scene.remove(this.milkyWay);
    }

    this.scene = null;
    this.camera = null;
  }
}