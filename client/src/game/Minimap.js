/**
 * Minimap - Shows all players as dots on a straight line
 * The line represents the highway and dots show relative positions
 */

export class Minimap {
  constructor(container, config = {}) {
    this.container = container;
    this.config = {
      width: config.width || 300,
      height: config.height || 60,
      backgroundColor: config.backgroundColor || 'rgba(0, 0, 0, 0.7)',
      roadColor: config.roadColor || '#444444',
      playerColor: config.playerColor || '#00ff00',
      otherPlayerColor: config.otherPlayerColor || '#ffff00',
      vehicleColor: config.vehicleColor || '#666666',
      dotSize: config.dotSize || 4,
      position: config.position || { top: '10px', right: '10px' },
      showVehicles: config.showVehicles !== false,
      viewDistance: config.viewDistance || 500 // How far ahead/behind to show
    };

    // Player tracking
    this.players = new Map();
    this.localPlayerId = null;
    this.vehicles = [];

    // Pre-allocate array for sorting to prevent memory allocation every frame
    this.sortedPlayersArray = [];

    // Frame limiting - only update minimap every few frames
    this.lastUpdateTime = 0;
    this.updateInterval = 100; // Update every 100ms (10 FPS) instead of 60 FPS

    this.createElements();
  }

  createElements() {
    // Create minimap container
    this.mapElement = document.createElement('div');
    this.mapElement.className = 'minimap';
    this.mapElement.style.cssText = `
      position: absolute;
      ${this.config.position.top ? `top: ${this.config.position.top}` : ''};
      ${this.config.position.bottom ? `bottom: ${this.config.position.bottom}` : ''};
      ${this.config.position.left ? `left: ${this.config.position.left}` : ''};
      ${this.config.position.right ? `right: ${this.config.position.right}` : ''};
      width: ${this.config.width}px;
      height: ${this.config.height}px;
      background: ${this.config.backgroundColor};
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 5px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      z-index: 100;
    `;

    // Create canvas for drawing
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.config.width;
    this.canvas.height = this.config.height;
    this.canvas.style.width = this.config.width + 'px';
    this.canvas.style.height = this.config.height + 'px';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.mapElement.appendChild(this.canvas);

    // Get canvas context
    this.ctx = this.canvas.getContext('2d');

    // Add title
    this.title = document.createElement('div');
    this.title.style.cssText = `
      position: absolute;
      top: 2px;
      left: 5px;
      color: white;
      font-size: 10px;
      font-family: monospace;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
      pointer-events: none;
    `;
    this.title.textContent = 'PLAYER POSITIONS';
    this.mapElement.appendChild(this.title);

    // Add distance display
    this.distanceDisplay = document.createElement('div');
    this.distanceDisplay.style.cssText = `
      position: absolute;
      top: 15px;
      left: 5px;
      color: white;
      font-size: 16px;
      font-weight: bold;
      font-family: 'Arial', sans-serif;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.9);
      pointer-events: none;
    `;
    this.distanceDisplay.textContent = '0.0 mi';
    this.mapElement.appendChild(this.distanceDisplay);

    // Add to container
    this.container.appendChild(this.mapElement);
  }

  /**
   * Set the local player ID
   */
  setLocalPlayer(playerId) {
    this.localPlayerId = playerId;
  }

  /**
   * Update player position
   */
  updatePlayer(playerId, position, data = {}) {
    // Reuse existing player object if it exists to prevent memory leak
    const existingPlayer = this.players.get(playerId);
    if (existingPlayer) {
      // Update existing object instead of creating new one
      existingPlayer.position = position;
      existingPlayer.speed = data.speed || 0;
      existingPlayer.name = data.name || existingPlayer.name || 'Player';
      existingPlayer.isDead = data.isDead || false;
      existingPlayer.respawnTime = data.respawnTime || 0;
    } else {
      // Only create new object if player doesn't exist
      this.players.set(playerId, {
        position: position,
        speed: data.speed || 0,
        name: data.name || 'Player',
        color: playerId === this.localPlayerId ? this.config.playerColor : this.config.otherPlayerColor,
        isLocal: playerId === this.localPlayerId,
        isDead: data.isDead || false,
        respawnTime: data.respawnTime || 0
      });
    }

    // Update distance display for local player
    if (playerId === this.localPlayerId && this.distanceDisplay) {
      const distanceMiles = (position.z / 1609.34).toFixed(1);
      this.distanceDisplay.textContent = `${distanceMiles} mi`;
    }
  }

  /**
   * Remove a player
   */
  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  /**
   * Update vehicle positions (optional)
   */
  updateVehicles(vehicles) {
    if (!this.config.showVehicles) return;
    this.vehicles = vehicles.map(v => ({
      position: v.position,
      type: v.type || 'car'
    }));
  }

  /**
   * Draw the minimap
   */
  draw() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Get local player position for reference
    const localPlayer = this.players.get(this.localPlayerId);
    if (!localPlayer) return;

    const centerZ = localPlayer.position.z;

    // Draw simple horizontal line (no lanes, just a progress line)
    const centerY = this.canvas.height / 2;

    // Draw track background
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(0, centerY);
    this.ctx.lineTo(this.canvas.width, centerY);
    this.ctx.stroke();

    // Reuse array and sort players by position (who's ahead)
    this.sortedPlayersArray.length = 0; // Clear array without allocating new one
    for (const entry of this.players.entries()) {
      this.sortedPlayersArray.push(entry);
    }
    this.sortedPlayersArray.sort((a, b) => b[1].position.z - a[1].position.z);

    // Draw players
    this.sortedPlayersArray.forEach(([playerId, player], index) => {
      // Show dead players at their death position (not reset to 0)
      const relativeZ = player.position.z - centerZ;

      // Players ahead are to the right, behind are to the left
      let x;
      if (player.isLocal) {
        x = this.canvas.width / 2; // Always center local player
      } else {
        // Map position relative to local player
        // Ahead (positive relativeZ) = right side
        // Behind (negative relativeZ) = left side
        x = this.mapPositionToCanvas(relativeZ);

        // Skip if too far away
        if (Math.abs(relativeZ) > this.config.viewDistance) return;
      }

      const y = centerY; // All on same line

      // Draw player dot
      if (player.isLocal) {
        // Local player - larger dot with glow
        if (player.isDead) {
          // Dead - show as red pulsing dot
          this.ctx.shadowBlur = 5;
          this.ctx.shadowColor = '#ff0000';
          this.ctx.fillStyle = '#ff0000';
        } else {
          // Alive - green
          this.ctx.shadowBlur = 10;
          this.ctx.shadowColor = '#00ff00';
          this.ctx.fillStyle = '#00ff00';
        }

        this.ctx.beginPath();
        this.ctx.arc(x, y, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;

        // Show label
        this.ctx.fillStyle = player.isDead ? '#ff0000' : '#00ff00';
        this.ctx.font = 'bold 10px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.isDead ? '💀 DEAD' : 'YOU', x, y - 10);
      } else {
        // Other players
        const isAhead = relativeZ > 0;

        if (player.isDead) {
          // Dead - show as dark red
          this.ctx.fillStyle = '#aa0000';
        } else {
          // Alive - orange if ahead, yellow if behind
          this.ctx.fillStyle = isAhead ? '#ff6600' : '#ffff00';
        }

        this.ctx.beginPath();
        this.ctx.arc(x, y, 4, 0, Math.PI * 2);
        this.ctx.fill();

        // Show name and status
        this.ctx.fillStyle = player.isDead ? 'rgba(255, 100, 100, 0.8)' : 'rgba(255, 255, 255, 0.8)';
        this.ctx.font = '8px monospace';
        this.ctx.textAlign = 'center';

        if (player.isDead) {
          this.ctx.fillText(player.name, x, y - 8);
          this.ctx.fillText('💀', x + 15, y - 8);
        } else {
          const distance = Math.round(Math.abs(relativeZ));
          this.ctx.fillText(player.name, x, y - 8);
          this.ctx.fillText(distance + 'm', x, y + 15);

          // Arrow indicating if they're ahead or behind
          if (isAhead) {
            this.ctx.fillText('→', x + 10, y);
          } else {
            this.ctx.fillText('←', x - 10, y);
          }
        }
      }
    });

    // Draw distance scale at bottom showing absolute position
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.font = '8px monospace';
    this.ctx.textAlign = 'center';

    // Behind marker
    this.ctx.fillText('← BEHIND', 30, this.canvas.height - 5);

    // Center shows YOUR absolute distance
    const localDistance = Math.round(Math.abs(localPlayer.position.z));
    this.ctx.fillText(`${localDistance}m`, this.canvas.width / 2, this.canvas.height - 5);

    // Ahead marker
    this.ctx.fillText('AHEAD →', this.canvas.width - 30, this.canvas.height - 5);
  }

  /**
   * Map Z position to canvas X coordinate
   */
  mapPositionToCanvas(relativeZ) {
    // Map from [-viewDistance, viewDistance] to [0, canvas.width]
    const normalized = (relativeZ + this.config.viewDistance) / (2 * this.config.viewDistance);
    return normalized * this.canvas.width;
  }


  /**
   * Update and draw (with frame limiting)
   */
  update() {
    const now = performance.now();

    // Only update if enough time has passed
    if (now - this.lastUpdateTime < this.updateInterval) {
      return; // Skip this frame
    }

    this.lastUpdateTime = now;
    this.draw();
  }

  /**
   * Dispose of the minimap
   */
  dispose() {
    if (this.mapElement && this.mapElement.parentNode) {
      this.mapElement.parentNode.removeChild(this.mapElement);
    }
    this.players.clear();
    this.vehicles = [];
    this.ctx = null;
    this.canvas = null;
    this.mapElement = null;
  }
}