// Simple blue sky background

import * as THREE from 'three';

export class BackgroundSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.skyDome = null;

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
  }

  updateLocation(absolutePosition, location) {
    // No-op: static blue sky
  }

  update(deltaTime, playerPosition) {
    // Keep sky dome centered on player
    if (this.skyDome) {
      this.skyDome.position.copy(playerPosition);
    }
  }

  dispose() {
    if (this.skyDome) {
      this.skyDome.geometry.dispose();
      this.skyDome.material.dispose();
      this.scene.remove(this.skyDome);
    }

    this.scene = null;
    this.camera = null;
  }
}