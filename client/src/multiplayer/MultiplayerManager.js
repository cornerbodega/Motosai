import io from 'socket.io-client';
import * as THREE from 'three';
import { supabase } from '../utils/supabase.js';

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
      console.log(`Received active players list:`, players);
      players.forEach(player => {
        if (player.playerId !== this.playerId) {
          console.log(`Adding active player: ${player.username}`);
          this.addOtherPlayer(player.playerId, player.username);
        } else {
          console.log(`Skipping self: ${player.username}`);
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

    // Disconnection
    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.isConnected = false;
    });
  }

  setupSupabaseRealtime() {
    // Supabase realtime disabled - using WebSocket only
    console.log('Using WebSocket-only multiplayer (no Supabase)');
  }

  createOtherPlayerMotorcycle(username) {
    const motorcycle = new THREE.Group();
    
    // Generate consistent color based on username
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = (hash % 360) / 360;
    
    // Body (same as main motorcycle but different color)
    const bodyGeo = new THREE.BoxGeometry(0.3, 0.4, 1.4, 2, 2, 4);
    const bodyMat = new THREE.MeshStandardMaterial({ 
      color: new THREE.Color().setHSL(hue, 0.8, 0.5),
      metalness: 0.6,
      roughness: 0.3,
      envMapIntensity: 1.2
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    body.position.z = 0.05;
    body.castShadow = true;
    motorcycle.add(body);
    
    // Tank
    const tankGeo = new THREE.BoxGeometry(0.35, 0.3, 0.6);
    const tank = new THREE.Mesh(tankGeo, bodyMat);
    tank.position.set(0, 0.55, 0.2);
    motorcycle.add(tank);
    
    // Seat
    const seatGeo = new THREE.BoxGeometry(0.25, 0.1, 0.4, 2, 1, 2);
    const seatMat = new THREE.MeshStandardMaterial({ 
      color: 0x1a1a1a,
      roughness: 0.8,
      metalness: 0
    });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(0, 0.65, -0.25);
    motorcycle.add(seat);
    
    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ 
      color: 0x2a2a2a,
      roughness: 0.9,
      metalness: 0
    });
    
    const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
    frontWheel.rotation.z = Math.PI / 2;
    frontWheel.position.set(0, 0.3, 0.7);
    frontWheel.castShadow = true;
    motorcycle.add(frontWheel);
    
    const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
    rearWheel.rotation.z = Math.PI / 2;
    rearWheel.position.set(0, 0.32, -0.7);
    rearWheel.castShadow = true;
    motorcycle.add(rearWheel);
    
    // Store references for animation
    motorcycle.userData.frontWheel = frontWheel;
    motorcycle.userData.rearWheel = rearWheel;
    motorcycle.userData.body = body;
    motorcycle.userData.originalColor = bodyMat.color.clone();
    
    return motorcycle;
  }

  addOtherPlayer(playerId, username) {
    if (this.otherPlayers.has(playerId)) return;

    // Adding other player (removed debug log)

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
    
    // Position it near the player for visibility
    const offsetX = (Math.random() - 0.5) * 20; // -10 to +10
    const offsetZ = (Math.random() - 0.5) * 20; // -10 to +10
    motorcycle.position.set(
      offsetX, // Side by side
      0.3, // Ground level like regular motorcycle
      offsetZ  // In front or behind
    );
    
    // Add username label
    if (this.game && this.game.scene) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = 256;
      canvas.height = 64;
      
      context.fillStyle = 'rgba(0,0,0,0.8)';
      context.fillRect(0, 0, 256, 64);
      
      context.font = '32px Arial';
      context.fillStyle = 'white';
      context.textAlign = 'center';
      context.fillText(username, 128, 40);
      
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(4, 1, 1); // Made bigger
      sprite.position.y = 3;
      
      motorcycle.add(sprite);
      this.game.scene.add(motorcycle);
      
      // Player motorcycle added to scene
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
      isDead: this.game?.isDead || false
    };

    // Debug occasional updates
    if (Math.random() < 0.005) { // 0.5% of updates
      console.log(`Sending update: pos(${updateData.position.x?.toFixed(1)}, ${updateData.position.z?.toFixed(1)}) speed=${updateData.speed?.toFixed(0)}`);
    }

    this.socket.emit('player-update', updateData);
  }

  sendChatMessage(message) {
    if (!this.socket || !this.isConnected) return;
    
    this.socket.emit('chat-message', { message });
  }

  handleChatMessage(data) {
    // Display chat message in UI
    console.log(`[${data.username}]: ${data.message}`);
    
    // You can emit an event or call a UI method to display the message
    if (this.game && this.game.displayChatMessage) {
      this.game.displayChatMessage(data);
    }
  }

  update() {
    // Update other players' motorcycles
    this.playerMeshes.forEach((motorcycle, playerId) => {
      const player = this.otherPlayers.get(playerId);
      if (player && this.game) {
        // Use absolute world positions
        const targetPos = new THREE.Vector3(
          player.position.x,
          player.position.y,
          player.position.z
        );
        
        // Smooth interpolation
        motorcycle.position.lerp(targetPos, 0.3);
        
        // Apply rotations like the main player's motorcycle
        motorcycle.rotation.set(0, 0, 0);
        motorcycle.rotateY(player.rotation.y || 0);
        motorcycle.rotateZ(player.leanAngle || 0);
        motorcycle.rotateX(player.rotation.x || 0);
        
        // Handle crash/death states
        if (player.isDead) {
          // Hide motorcycle when dead (like main player)
          motorcycle.visible = false;
        } else if (player.isCrashed) {
          // Flash red when crashed
          if (motorcycle.userData.body && motorcycle.userData.originalColor) {
            motorcycle.userData.body.material.color.setHex(0xff0000);
            setTimeout(() => {
              if (motorcycle.userData.body && motorcycle.userData.originalColor) {
                motorcycle.userData.body.material.color.copy(motorcycle.userData.originalColor);
              }
            }, 200);
          }
          motorcycle.visible = true;
        } else {
          // Animate wheels based on speed
          if (motorcycle.userData.frontWheel && motorcycle.userData.rearWheel) {
            const wheelSpeed = (player.speed || 0) * 0.1;
            motorcycle.userData.frontWheel.rotation.x += wheelSpeed;
            motorcycle.userData.rearWheel.rotation.x += wheelSpeed;
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
      this.socket.disconnect();
      this.socket = null;
    }

    // Clean up all player meshes
    this.playerMeshes.forEach((mesh, playerId) => {
      this.removeOtherPlayer(playerId);
    });

    this.isConnected = false;
    this.playerId = null;
    this.sessionId = null;
  }

  getPlayerCount() {
    return this.otherPlayers.size + 1; // Other players + self
  }

  getPlayerList() {
    const players = [{ id: this.playerId, username: this.username }];
    this.otherPlayers.forEach((data, id) => {
      players.push({ id, username: data.username });
    });
    return players;
  }
}