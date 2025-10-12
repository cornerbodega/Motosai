import * as THREE from 'three';

export class VehiclePassCounter {
  constructor(game) {
    this.game = game;
    this.passedVehicles = new Set(); // Track vehicle IDs we've passed
    this.totalPassed = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastPassTime = 0;
    this.comboTimeout = 3000; // 3 seconds to maintain combo

    // Stats for leaderboard
    this.sessionStats = {
      vehiclesPassed: 0,
      maxSpeed: 0,
      distanceTraveled: 0,
      sessionStart: Date.now(),
      comboMultiplier: 1
    };

    // UI elements
    this.createUI();
  }

  createUI() {
    // Create pass counter display
    const counterDiv = document.createElement('div');
    counterDiv.id = 'vehicle-counter';
    counterDiv.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      color: white;
      font-family: 'Orbitron', monospace;
      font-size: 24px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      z-index: 1000;
      text-align: right;
    `;
    counterDiv.innerHTML = `
      <div style="font-size: 18px; color: #ffa500;">VEHICLES PASSED</div>
      <div id="pass-count" style="font-size: 36px; font-weight: bold;">0</div>
      <div id="combo-display" style="font-size: 20px; color: #ffff00; opacity: 0;">
        COMBO x<span id="combo-count">0</span>
      </div>
    `;
    document.body.appendChild(counterDiv);

    // Store references
    this.counterElement = document.getElementById('pass-count');
    this.comboElement = document.getElementById('combo-display');
    this.comboCountElement = document.getElementById('combo-count');
  }

  update(playerPosition, trafficSystem, playerSpeed) {
    if (!trafficSystem || !trafficSystem.vehicles) return;

    const now = Date.now();

    // Update max speed
    if (playerSpeed > this.sessionStats.maxSpeed) {
      this.sessionStats.maxSpeed = playerSpeed;
    }

    // Check each vehicle
    trafficSystem.vehicles.forEach(vehicle => {
      // Check if we've overtaken this vehicle
      const relativeZ = playerPosition.z - vehicle.position.z;
      const lateralDistance = Math.abs(playerPosition.x - vehicle.position.x);

      // Vehicle is behind us, close laterally, and we haven't counted it yet
      if (relativeZ > vehicle.length * 0.5 &&
          relativeZ < 50 && // Don't count vehicles too far behind
          lateralDistance < 10 && // Must be reasonably close laterally
          !this.passedVehicles.has(vehicle.id)) {

        this.passedVehicles.add(vehicle.id);
        this.onVehiclePassed(vehicle, now);
      }

      // Clean up vehicles that are too far behind
      if (relativeZ > 200) {
        this.passedVehicles.delete(vehicle.id);
      }
    });

    // Update combo timeout
    if (now - this.lastPassTime > this.comboTimeout && this.combo > 0) {
      this.resetCombo();
    }

    // Update distance traveled (approximate)
    this.sessionStats.distanceTraveled = Math.abs(playerPosition.z);
  }

  onVehiclePassed(vehicle, timestamp) {
    this.totalPassed++;
    this.sessionStats.vehiclesPassed = this.totalPassed;

    // Update combo
    if (timestamp - this.lastPassTime < this.comboTimeout) {
      this.combo++;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }
      this.sessionStats.comboMultiplier = 1 + (this.combo * 0.1); // 10% bonus per combo
    } else {
      this.combo = 1;
    }

    this.lastPassTime = timestamp;

    // Update UI
    this.updateUI();

    // Trigger visual feedback
    this.showPassEffect(vehicle);

    // Calculate points (can be used for scoring)
    const points = Math.floor(100 * this.sessionStats.comboMultiplier);

    // Play sound effect if available
    if (this.game.audioManager && this.game.audioManager.playPassSound) {
      this.game.audioManager.playPassSound();
    }

    console.log(`Vehicle passed! Total: ${this.totalPassed}, Combo: ${this.combo}x, Points: ${points}`);
  }

  showPassEffect(vehicle) {
    // Create a brief visual effect when passing a vehicle
    if (this.game.scene) {
      // Create a ring effect at vehicle position
      const geometry = new THREE.RingGeometry(2, 3, 32);
      const material = new THREE.MeshBasicMaterial({
        color: this.combo > 3 ? 0xffff00 : 0x00ff00,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.position.copy(vehicle.position);
      ring.position.y = 1;
      ring.rotation.x = -Math.PI / 2;

      this.game.scene.add(ring);

      // Animate the ring
      const startTime = Date.now();
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / 500; // 0.5 second animation

        if (progress < 1) {
          ring.scale.set(1 + progress * 2, 1 + progress * 2, 1);
          ring.material.opacity = 0.8 * (1 - progress);
          requestAnimationFrame(animate);
        } else {
          this.game.scene.remove(ring);
          geometry.dispose();
          material.dispose();
        }
      };
      animate();
    }
  }

  updateUI() {
    // Update counter
    if (this.counterElement) {
      this.counterElement.textContent = this.totalPassed;

      // Pulse animation
      this.counterElement.style.transform = 'scale(1.2)';
      setTimeout(() => {
        this.counterElement.style.transform = 'scale(1)';
      }, 200);
    }

    // Update combo display
    if (this.comboElement && this.combo > 1) {
      this.comboElement.style.opacity = '1';
      this.comboCountElement.textContent = this.combo;

      // Color based on combo level
      if (this.combo >= 10) {
        this.comboElement.style.color = '#ff00ff'; // Purple for mega combo
      } else if (this.combo >= 5) {
        this.comboElement.style.color = '#ffff00'; // Yellow for high combo
      } else {
        this.comboElement.style.color = '#00ff00'; // Green for low combo
      }
    }
  }

  resetCombo() {
    this.combo = 0;
    this.sessionStats.comboMultiplier = 1;
    if (this.comboElement) {
      this.comboElement.style.opacity = '0';
    }
  }

  getSessionStats() {
    return {
      ...this.sessionStats,
      sessionDuration: Math.floor((Date.now() - this.sessionStats.sessionStart) / 1000),
      maxCombo: this.maxCombo
    };
  }

  reset() {
    this.passedVehicles.clear();
    this.totalPassed = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastPassTime = 0;

    this.sessionStats = {
      vehiclesPassed: 0,
      maxSpeed: 0,
      distanceTraveled: 0,
      sessionStart: Date.now(),
      comboMultiplier: 1
    };

    this.updateUI();
    this.resetCombo();
  }

  dispose() {
    // Clean up UI elements
    const counterDiv = document.getElementById('vehicle-counter');
    if (counterDiv) {
      counterDiv.remove();
    }
  }
}