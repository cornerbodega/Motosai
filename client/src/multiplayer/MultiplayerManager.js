import io from 'socket.io-client';
import * as THREE from 'three';
import { supabase } from '../utils/supabase.js';
import { MotorcycleFactory } from '../game/MotorcycleFactory.js';

export class MultiplayerManager {
  constructor(game) {
    this.game = game;
    this.socket = null;
    this.playerId = null;
    this.sessionId = null;
    this.username = null;
    this.otherPlayers = new Map();
    this.playerMeshes = new Map();
    this.isConnected = false;
    
    // Traffic synchronization
    this.isTrafficMaster = false;
    
    // Reusable objects to prevent garbage collection pressure
    this.tempVector3 = new THREE.Vector3();
    this.serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';
    
    // Supabase realtime channel
    this.realtimeChannel = null;
  }

  async connect(username = null) {
    try {
      // Join session via REST API first
      const response = await fetch(`${this.serverUrl}/api/session/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: username || `Rider_${Math.random().toString(36).substring(7)}`,
          sessionName: 'global'
        })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      this.playerId = data.player.id;
      this.sessionId = data.session.id;
      this.username = data.player.username;

      // Connect WebSocket
      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling']
      });

      this.setupSocketListeners();
      this.setupSupabaseRealtime();

      // Join the session
      this.socket.emit('player-join', {
        playerId: this.playerId,
        sessionId: this.sessionId,
        username: this.username
      });

      this.isConnected = true;
      console.log(`Connected as ${this.username} in session ${this.sessionId}`);

      return { playerId: this.playerId, username: this.username };

    } catch (error) {
      console.error('Failed to connect to multiplayer:', error);
      throw error;
    }
  }

  setupSocketListeners() {
    // Remove all existing listeners first to prevent memory leaks from stacking listeners
    this.socket.off('welcome');
    this.socket.off('player-joined');
    this.socket.off('player-left');
    this.socket.off('active-players');
    this.socket.off('player-state-update');
    this.socket.off('chat-message');
    this.socket.off('disconnect');
    this.socket.off('traffic-master-assigned');
    this.socket.off('traffic-vehicle-spawn');
    this.socket.off('traffic-update');
    this.socket.off('traffic-vehicle-remove');
    this.socket.off('player-crash');
    this.socket.off('player-death');
    this.socket.off('race-invite');
    this.socket.off('race-accept');
    this.socket.off('race-decline');

    // Welcome message
    this.socket.on('welcome', (data) => {
      console.log('Server welcome:', data);
    });

    // Player joined
    this.socket.on('player-joined', (data) => {
      console.log(`Player joined: ${data.username}`);
      this.addOtherPlayer(data.playerId, data.username);
    });

    // Player left
    this.socket.on('player-left', (data) => {
      console.log(`Player left: ${data.username}`);
      this.removeOtherPlayer(data.playerId);
    });

    // Active players list
    this.socket.on('active-players', (players) => {
      console.log(`📋 Received ${players.length} active players`);
      players.forEach(player => {
        if (player.playerId !== this.playerId) {
          this.addOtherPlayer(player.playerId, player.username);
        }
      });
    });

    // Player state updates
    this.socket.on('player-state-update', (data) => {
      this.updateOtherPlayer(data.playerId, data);
    });

    // Chat messages
    this.socket.on('chat-message', (data) => {
      this.handleChatMessage(data);
    });

    // Traffic master assignment
    this.socket.on('traffic-master-assigned', (isMaster) => {
      this.isTrafficMaster = isMaster;
      console.log(`Traffic master status: ${isMaster ? 'Master' : 'Slave'}`);
      
      // Notify traffic system
      if (this.game && this.game.trafficSystem) {
        this.game.trafficSystem.setMaster(isMaster);
      }
    });

    // Traffic synchronization events
    this.socket.on('traffic-vehicle-spawn', (vehicleData) => {
      if (this.game && this.game.trafficSystem) {
        this.game.trafficSystem.onVehicleSpawn(vehicleData);
      }
    });

    this.socket.on('traffic-update', (trafficData) => {
      if (this.game && this.game.trafficSystem) {
        this.game.trafficSystem.onTrafficUpdate(trafficData);
      }
    });

    this.socket.on('traffic-vehicle-remove', (vehicleId) => {
      if (this.game && this.game.trafficSystem) {
        this.game.trafficSystem.onVehicleRemove(vehicleId);
      }
    });

    // Player crash events
    this.socket.on('player-crash', (data) => {
      console.log(`🚨 RECEIVED CRASH EVENT: Player ${data.username} crashed!`, data);
      this.handlePlayerCrash(data);
    });

    this.socket.on('player-death', (data) => {
      console.log(`💀 RECEIVED DEATH EVENT: Player ${data.username} died!`, data);
      this.handlePlayerDeath(data);
    });

    // Race invite system
    this.socket.on('race-invite', (data) => {
      console.log(`🏁 Race invite from ${data.from}`, data);
      if (this.game && this.game.showRaceInvite) {
        this.game.showRaceInvite(data.from, data.distance);
      }
    });

    this.socket.on('race-accept', (data) => {
      console.log(`✅ Race accepted by ${data.from}`, data);
      if (this.game && this.game.startRaceCountdown) {
        this.game.showRaceInviteStatus('Invite accepted! Starting race...');
        this.game.startRaceCountdown(data.distance, data.from);
      }
    });

    this.socket.on('race-decline', (data) => {
      console.log(`❌ Race declined by ${data.from}`, data);
      if (this.game && this.game.showRaceInviteStatus) {
        this.game.showRaceInviteStatus('Invite declined.');
      }
    });

    // Disconnection
    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.isConnected = false;
      this.isTrafficMaster = false;
    });
  }

  setupSupabaseRealtime() {
    // Supabase realtime disabled - using WebSocket only
    console.log('Using WebSocket-only multiplayer (no Supabase)');
  }

  createOtherPlayerMotorcycle(username) {
    // Generate consistent colors for bike and rider based on username
    const bikeColor = MotorcycleFactory.getUsernameColor(username);
    const riderColor = new THREE.Color().setHSL((bikeColor.getHSL({}).h + 0.3) % 1, 0.6, 0.4); // Complementary color
    
    // Use MotorcycleFactory to create motorcycle with rider
    const motorcycle = MotorcycleFactory.createMotorcycle({
      bikeColor: bikeColor,
      riderColor: riderColor,
      username: username,
      includeRider: true
    });
    
    return motorcycle;
  }

  addOtherPlayer(playerId, username) {
    if (this.otherPlayers.has(playerId)) {
      return; // Reduced logging to prevent memory buildup
    }

    console.log(`✅ Adding new player: ${username} (${playerId})`);
    console.log(`Current players before add:`, Array.from(this.otherPlayers.keys()));
    console.log(`My player ID: ${this.playerId}`);

    // Create player data
    const playerData = {
      playerId,
      username,
      position: new THREE.Vector3(0, 0.5, 0),
      rotation: new THREE.Euler(0, 0, 0),
      speed: 0,
      leanAngle: 0,
      isCrashed: false,
      isDead: false
    };

    this.otherPlayers.set(playerId, playerData);

    // Create motorcycle model for other players
    const motorcycle = this.createOtherPlayerMotorcycle(username);
    
    // Position at ground level, near main player for visibility but not random
    // Start slightly to the side and behind the main player
    const mainPlayerPos = this.game.physics?.getState()?.position || { x: 0, y: 0, z: 0 };
    const offsetX = ((this.otherPlayers.size % 4) - 1.5) * 3; // Spread players across lanes
    motorcycle.position.set(
      mainPlayerPos.x + offsetX,
      0, // Ground level - no floating
      mainPlayerPos.z - 10 - (this.otherPlayers.size * 5) // Behind main player, spaced out
    );
    
    // Add motorcycle to scene (username label already included by MotorcycleFactory)
    if (this.game && this.game.scene) {
      this.game.scene.add(motorcycle);
      console.log(`🏍️ Added ${username}'s motorcycle with rider to scene`);
    }
    
    this.playerMeshes.set(playerId, motorcycle);
  }

  removeOtherPlayer(playerId) {
    const mesh = this.playerMeshes.get(playerId);
    if (mesh && this.game && this.game.scene) {
      this.game.scene.remove(mesh);
      mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }

    // Remove from minimap
    if (this.game && this.game.minimap) {
      this.game.minimap.removePlayer(playerId);
    }

    this.playerMeshes.delete(playerId);
    this.otherPlayers.delete(playerId);
  }

  updateOtherPlayer(playerId, data) {
    const player = this.otherPlayers.get(playerId);
    const mesh = this.playerMeshes.get(playerId);
    
    if (!player || !mesh) {
      console.log(`Player ${playerId} not found for update`);
      return;
    }

    // Update player data
    if (data.position) {
      player.position.set(data.position.x, data.position.y, data.position.z);
    }
    if (data.rotation) {
      player.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
    }
    if (data.speed !== undefined) player.speed = data.speed;
    if (data.leanAngle !== undefined) player.leanAngle = data.leanAngle;
    if (data.isCrashed !== undefined) player.isCrashed = data.isCrashed;
    if (data.isDead !== undefined) player.isDead = data.isDead;

    // Don't interpolate position directly - set it based on relative position
    // The mesh position will be updated in the update() method relative to highway
    
    // Apply lean rotation
    mesh.rotation.z = -player.leanAngle * 0.5;
    mesh.rotation.y = player.rotation.y;
    
    console.log(`Updated player ${playerId} at position:`, player.position);
  }

  updateOtherPlayerFromSupabase(playerState) {
    const playerId = playerState.player_id;
    
    this.updateOtherPlayer(playerId, {
      position: {
        x: playerState.position_x,
        y: playerState.position_y,
        z: playerState.position_z
      },
      rotation: {
        x: playerState.rotation_x,
        y: playerState.rotation_y,
        z: playerState.rotation_z
      },
      speed: playerState.speed,
      leanAngle: playerState.lean_angle
    });
  }

  sendPlayerUpdate(bikeState) {
    if (!this.socket || !this.isConnected) return;

    const updateData = {
      position: {
        x: bikeState.position.x,
        y: bikeState.position.y,
        z: bikeState.position.z
      },
      rotation: {
        x: bikeState.rotation.x || 0,
        y: bikeState.rotation.yaw || 0, // Use yaw for Y rotation
        z: bikeState.rotation.roll || 0 // Use roll for Z rotation
      },
      speed: bikeState.speed,
      leanAngle: bikeState.leanAngle || bikeState.rotation.roll || 0,
      gear: bikeState.gear,
      isWheelie: bikeState.isWheelie,
      isStoppie: bikeState.isStoppie,
      isCrashed: bikeState.collision?.isCrashed || false,
      isDead: this.game?.isDead || false,
      velocity: bikeState.velocity || { x: 0, y: 0, z: 0 }
    };

    // Debug crash state
    // if (updateData.isCrashed || updateData.isDead) {
    //   console.log(`🔍 SENDING CRASH/DEATH STATE:`, {
    //     isCrashed: updateData.isCrashed,
    //     isDead: updateData.isDead,
    //     position: updateData.position,
    //     velocity: updateData.velocity
    //   });
    // }

    // Debug occasional updates
    // if (Math.random() < 0.005) { // 0.5% of updates
    //   console.log(`Sending update: pos(${updateData.position.x?.toFixed(1)}, ${updateData.position.z?.toFixed(1)}) speed=${updateData.speed?.toFixed(0)}`);
    // }

    this.socket.emit('player-update', updateData);
  }

  sendChatMessage(message) {
    if (!this.socket || !this.isConnected) return;

    this.socket.emit('chat-message', { message });
  }

  sendMessage(data) {
    if (!this.socket || !this.isConnected) return;

    // Send custom message through WebSocket
    this.socket.emit(data.type, data);
  }

  handleChatMessage(data) {
    // Display chat message in UI
    console.log(`[${data.username}]: ${data.message}`);
    
    // You can emit an event or call a UI method to display the message
    if (this.game && this.game.displayChatMessage) {
      this.game.displayChatMessage(data);
    }
  }

  handlePlayerCrash(data) {
    console.log(`🔍 handlePlayerCrash called for ${data.username}`, data);
    
    const player = this.otherPlayers.get(data.playerId);
    if (!player) {
      console.log(`❌ Player ${data.playerId} not found in otherPlayers map`);
      return;
    }
    
    // Update player crash state
    player.isCrashed = true;
    player.lastCrashTime = Date.now();
    console.log(`✅ Updated crash state for ${data.username}`);
    
    // Create visual crash effect at crash location
    if (this.game && this.game.deathAnimation) {
      const crashPosition = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
      const crashVelocity = new THREE.Vector3(data.velocity.x || 0, data.velocity.y || 0, data.velocity.z || 0);
      
      console.log(`🎬 Triggering crash animation for ${data.username} at`, crashPosition);
      // Trigger a smaller crash effect for other players
      this.game.deathAnimation.triggerRemoteCrash(crashPosition, crashVelocity, data.username);
    } else {
      console.log(`❌ Cannot trigger crash animation - game or deathAnimation not available`);
    }
    
    // Show crash message in chat/HUD
    if (this.game && this.game.showGameMessage) {
      this.game.showGameMessage(`${data.username} crashed!`, 'crash');
      console.log(`💬 Showed crash message for ${data.username}`);
    }
    
    console.log(`💥 Finished showing crash effect for ${data.username} at position (${data.position.x?.toFixed(1)}, ${data.position.z?.toFixed(1)})`);
  }

  handlePlayerDeath(data) {
    console.log(`🔍 handlePlayerDeath called for ${data.username}`, data);
    
    const player = this.otherPlayers.get(data.playerId);
    if (!player) {
      console.log(`❌ Player ${data.playerId} not found in otherPlayers map`);
      return;
    }
    
    // Update player death state
    player.isDead = true;
    player.isCrashed = false; // Clear crash state
    player.lastDeathTime = Date.now();
    console.log(`✅ Updated death state for ${data.username}`);
    
    // Create full death animation at death location
    if (this.game && this.game.deathAnimation) {
      const deathPosition = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
      const deathVelocity = new THREE.Vector3(data.velocity.x || 0, data.velocity.y || 0, data.velocity.z || 0);
      
      console.log(`🎬 Triggering death animation for ${data.username} at`, deathPosition);
      // Trigger full death animation for other players to see
      this.game.deathAnimation.triggerRemoteDeath(deathPosition, deathVelocity, data.username);
    } else {
      console.log(`❌ Cannot trigger death animation - game or deathAnimation not available`);
    }
    
    // Register crash site with blood track system
    if (this.game && this.game.bloodTrackSystem) {
      const deathPos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
      this.game.bloodTrackSystem.registerCrashSite(deathPos);
      console.log(`🩸 Registered crash site in blood track system`);
    }
    
    // Show death message
    if (this.game && this.game.showGameMessage) {
      this.game.showGameMessage(`💀 ${data.username} died!`, 'death');
      console.log(`💬 Showed death message for ${data.username}`);
    }
    
    console.log(`💀 Finished showing death effect for ${data.username} at position (${data.position.x?.toFixed(1)}, ${data.position.z?.toFixed(1)})`);
  }

  update() {
    // Update other players' motorcycles
    this.playerMeshes.forEach((motorcycle, playerId) => {
      const player = this.otherPlayers.get(playerId);
      if (player && this.game) {
        // Use absolute world positions - reuse temp vector to prevent garbage collection
        this.tempVector3.set(
          player.position.x,
          player.position.y,
          player.position.z
        );
        
        // Smooth interpolation
        motorcycle.position.lerp(this.tempVector3, 0.3);
        
        // Apply rotations like the main player's motorcycle
        motorcycle.rotation.set(0, 0, 0);
        motorcycle.rotateY(player.rotation.y || 0);
        motorcycle.rotateZ(player.leanAngle || 0);
        motorcycle.rotateX(player.rotation.x || 0);
        
        // Handle crash/death states with debugging
        if (player.isDead) {
          // Hide motorcycle when dead (like main player)
          motorcycle.visible = false;
          if (Math.random() < 0.01) { // Occasional debug
            console.log(`Player ${player.username} is dead - hiding motorcycle`);
          }
        } else if (player.isCrashed) {
          // Flash red when crashed - use frame-based timing to avoid setTimeout memory leaks
          if (motorcycle.userData.body && motorcycle.userData.originalColor) {
            if (!motorcycle.userData.flashTimer) {
              motorcycle.userData.flashTimer = 0;
              motorcycle.userData.body.material.color.setHex(0xff0000);
            }
            motorcycle.userData.flashTimer += 16.67; // ~60fps in milliseconds
            if (motorcycle.userData.flashTimer >= 200) {
              motorcycle.userData.body.material.color.copy(motorcycle.userData.originalColor);
              motorcycle.userData.flashTimer = 0;
            }
          }
          motorcycle.visible = true;
        } else {
          // Animate wheels based on speed
          if (motorcycle.userData.frontWheel && motorcycle.userData.rearWheel) {
            const wheelSpeed = (player.speed || 0) * 0.1;
            motorcycle.userData.frontWheel.rotation.x += wheelSpeed;
            motorcycle.userData.rearWheel.rotation.x += wheelSpeed;
          }
          
          // Animate rider lean (same as main player)
          if (motorcycle.userData.rider) {
            motorcycle.userData.rider.rotation.z = -player.leanAngle * 0.5;
            motorcycle.userData.rider.rotation.x = (player.rotation.x || 0) * 0.3;
          }
          
          // Normal visibility
          motorcycle.visible = true;
          
          // Reset color if needed
          if (motorcycle.userData.body && motorcycle.userData.originalColor) {
            motorcycle.userData.body.material.color.copy(motorcycle.userData.originalColor);
          }
        }
      }
    });
  }

  disconnect() {
    if (this.socket) {
      // Remove all listeners before disconnecting
      this.socket.off('welcome');
      this.socket.off('player-joined');
      this.socket.off('player-left');
      this.socket.off('active-players');
      this.socket.off('player-state-update');
      this.socket.off('chat-message');
      this.socket.off('disconnect');
      this.socket.off('traffic-master-assigned');
      this.socket.off('traffic-vehicle-spawn');
      this.socket.off('traffic-update');
      this.socket.off('traffic-vehicle-remove');
      this.socket.off('player-crash');
      this.socket.off('player-death');
      
      this.socket.disconnect();
      this.socket = null;
    }

    // Clean up all player meshes
    this.playerMeshes.forEach((mesh, playerId) => {
      this.removeOtherPlayer(playerId);
    });

    // Clear circular reference to prevent memory leak
    this.game = null;
    
    this.isConnected = false;
    this.isTrafficMaster = false;
    this.playerId = null;
    this.sessionId = null;
  }

  getPlayerCount() {
    return this.otherPlayers.size + 1; // Other players + self
  }

  getPlayerList() {
    const players = [{
      id: this.playerId,
      username: this.username,
      state: null // Local player state is handled separately
    }];

    this.otherPlayers.forEach((data, id) => {
      players.push({
        id,
        username: data.username,
        state: {
          position: data.position,
          speed: data.speed,
          rotation: data.rotation
        }
      });
    });
    return players;
  }
}