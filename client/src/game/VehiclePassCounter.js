import * as THREE from "three";

export class VehiclePassCounter {
  constructor(game) {
    this.game = game;
    this.passedVehicles = new Set(); // Track vehicle IDs we've passed
    this.totalPassed = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastPassTime = 0;
    this.comboTimeout = 3000; // 3 seconds to maintain combo
    this.activeAnimations = new Set(); // Track active animation frames

    // Stats for leaderboard
    this.sessionStats = {
      vehiclesPassed: 0,
      maxSpeed: 0,
      distanceTraveled: 0,
      sessionStart: Date.now(),
      comboMultiplier: 1,
    };

    // Player best score
    this.playerBest = null;
    this.playerRank = null;
    this.playerName = null;

    // Detect mobile
    this.isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    // UI elements
    this.createUI();
    // Don't fetch immediately - wait for player to connect to multiplayer
    // this.fetchPlayerBest();
  }

  // Called by game when player connects to multiplayer
  onPlayerConnected() {
    if (this.isMobile) {
      this.fetchPlayerBest();

      // Set up periodic refresh for mobile (every 30 seconds)
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
      }
      this.refreshTimer = setInterval(() => {
        this.fetchPlayerBest();
      }, 30000);
    }
  }

  createUI() {
    // Create pass counter display
    const counterDiv = document.createElement("div");
    counterDiv.id = "vehicle-counter";
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

    // Show high score and rank on mobile (since leaderboard is hidden)
    const mobileStatsHTML = this.isMobile
      ? `
      <div id="player-best" style="font-size: 14px; margin-top: 10px; display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
        <div id="player-name" style="color: white; margin-bottom: 5px;">--</div>
        <div style="color: #ffa500;">Best: <span id="best-value" style="color: white; font-weight: bold;">--</span></div>
        <div style="color: #ffa500;">Rank: <span id="rank-value" style="color: white; font-weight: bold;">--</span></div>
      </div>
    `
      : "";

    counterDiv.innerHTML = `
      <div style="font-size: 18px; color: #ffa500;">VEHICLES PASSED</div>
      <div id="pass-count" style="font-size: 36px; font-weight: bold; color: white;">0</div>
      ${mobileStatsHTML}
    `;
    document.body.appendChild(counterDiv);

    // Store references
    this.counterElement = document.getElementById("pass-count");
    this.bestScoreElement = this.isMobile
      ? document.getElementById("player-best")
      : null;
  }

  update(playerPosition, trafficSystem, playerSpeed) {
    if (!trafficSystem || !trafficSystem.vehicles) return;

    const now = Date.now();

    // Update max speed
    if (playerSpeed > this.sessionStats.maxSpeed) {
      this.sessionStats.maxSpeed = playerSpeed;
    }

    // Check each vehicle
    trafficSystem.vehicles.forEach((vehicle) => {
      // Check if we've overtaken this vehicle
      const relativeZ = playerPosition.z - vehicle.position.z;
      const lateralDistance = Math.abs(playerPosition.x - vehicle.position.x);

      // Vehicle is behind us, close laterally, and we haven't counted it yet
      if (
        relativeZ > vehicle.length * 0.5 &&
        relativeZ < 50 && // Don't count vehicles too far behind
        lateralDistance < 10 && // Must be reasonably close laterally
        !this.passedVehicles.has(vehicle.id)
      ) {
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
      this.sessionStats.comboMultiplier = 1 + this.combo * 0.1; // 10% bonus per combo
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
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.position.copy(vehicle.position);
      ring.position.y = 1;
      ring.rotation.x = -Math.PI / 2;

      this.game.scene.add(ring);

      // Animate the ring
      const startTime = Date.now();
      const animationState = { cancelled: false, frameId: null };
      this.activeAnimations.add(animationState);

      const animate = () => {
        if (animationState.cancelled) {
          // Animation was cancelled - clean up immediately
          if (this.game.scene) {
            this.game.scene.remove(ring);
          }
          geometry.dispose();
          material.dispose();
          this.activeAnimations.delete(animationState);
          return;
        }

        const elapsed = Date.now() - startTime;
        const progress = elapsed / 500; // 0.5 second animation

        if (progress < 1) {
          ring.scale.set(1 + progress * 2, 1 + progress * 2, 1);
          ring.material.opacity = 0.8 * (1 - progress);
          animationState.frameId = requestAnimationFrame(animate);
        } else {
          if (this.game.scene) {
            this.game.scene.remove(ring);
          }
          geometry.dispose();
          material.dispose();
          this.activeAnimations.delete(animationState);
        }
      };
      animationState.frameId = requestAnimationFrame(animate);
    }
  }

  updateUI() {
    // Update counter
    if (this.counterElement) {
      this.counterElement.textContent = this.totalPassed;

      // Pulse animation
      this.counterElement.style.transform = "scale(1.2)";
      setTimeout(() => {
        this.counterElement.style.transform = "scale(1)";
      }, 200);
    }
  }

  resetCombo() {
    this.combo = 0;
    this.sessionStats.comboMultiplier = 1;
  }

  getSessionStats() {
    return {
      ...this.sessionStats,
      sessionDuration: Math.floor(
        (Date.now() - this.sessionStats.sessionStart) / 1000
      ),
      maxCombo: this.maxCombo,
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
      comboMultiplier: 1,
    };

    this.updateUI();
    this.resetCombo();
  }

  async fetchPlayerBest() {
    if (!this.isMobile) return; // Only needed on mobile

    try {
      const playerId =
        this.game.multiplayerManager?.playerId ||
        this.game.multiplayer?.playerId;
      if (!playerId) {
        return;
      }

      // Get username from multiplayer manager (same as desktop)
      const username =
        this.game.multiplayerManager?.username ||
        this.game.multiplayer?.username;
      this.playerName = username || playerId.substring(0, 8); // Show first 8 chars of ID if no username

      const serverUrl =
        this.game.multiplayerManager?.serverUrl ||
        this.game.multiplayer?.serverUrl ||
        "http://localhost:8080";

      // Fetch player's best score
      const response = await fetch(
        `${serverUrl}/api/leaderboard/player/${playerId}`
      );
      const data = await response.json();

      if (data.success && data.bestScore) {
        this.playerBest = data.bestScore.vehicles_passed;

        // Fetch player's rank
        const contextResponse = await fetch(
          `${serverUrl}/api/leaderboard/context/${playerId}`
        );
        const contextData = await contextResponse.json();

        if (contextData.success && contextData.playerRank) {
          this.playerRank = contextData.playerRank;
        }

        this.updateBestScoreDisplay();
      }
    } catch (error) {
      console.error("Error fetching player best score:", error);
    }
  }

  updateBestScoreDisplay() {
    if (!this.bestScoreElement) return;

    const nameText = this.playerName || "--";
    const bestText = this.playerBest !== null ? this.playerBest : "--";
    const rankText = this.playerRank !== null ? `#${this.playerRank}` : "--";

    // Update the individual span elements
    const playerNameElement = document.getElementById("player-name");
    const bestValueElement = document.getElementById("best-value");
    const rankValueElement = document.getElementById("rank-value");

    if (playerNameElement) {
      playerNameElement.textContent = nameText;
    }
    if (bestValueElement) {
      bestValueElement.textContent = bestText;
    }
    if (rankValueElement) {
      rankValueElement.textContent = rankText;
    }
  }

  // Called after score submission to refresh the display
  onScoreSubmitted(newScore, newRank) {
    if (this.isMobile) {
      // Update local values if new score is better
      if (newScore > (this.playerBest || 0)) {
        this.playerBest = newScore;
      }
      if (newRank) {
        this.playerRank = newRank;
      }

      // Update display immediately
      this.updateBestScoreDisplay();

      // Also fetch fresh data from server
      this.fetchPlayerBest();
    }
  }

  dispose() {
    // Cancel all active animations
    this.activeAnimations.forEach((animationState) => {
      animationState.cancelled = true;
      if (animationState.frameId) {
        cancelAnimationFrame(animationState.frameId);
      }
    });
    this.activeAnimations.clear();

    // Clear refresh timer if exists
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Clean up UI elements
    const counterDiv = document.getElementById("vehicle-counter");
    if (counterDiv) {
      counterDiv.remove();
    }

    // Clear references
    this.counterElement = null;
    this.bestScoreElement = null;
    this.game = null;
  }
}
