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

  addOtherPlayer(playerId, username) {
    if (this.otherPlayers.has(playerId)) return;

    console.log(`Adding other player: ${username} (${playerId})`);

    // Create player data
    const playerData = {
      playerId,
      username,
      position: new THREE.Vector3(0, 0.5, 0),
      rotation: new THREE.Euler(0, 0, 0),
      speed: 0,
      leanAngle: 0
    };

    this.otherPlayers.set(playerId, playerData);

    // Create visual representation (bright colored box for visibility)
    const geometry = new THREE.BoxGeometry(2, 3, 4); // Made bigger for visibility
    const material = new THREE.MeshPhongMaterial({ 
      color: new THREE.Color().setHSL(Math.random(), 1.0, 0.6),
      emissive: new THREE.Color().setHSL(Math.random(), 0.8, 0.3),
      emissiveIntensity: 0.5
    });
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position it somewhere visible initially
    mesh.position.set(
      Math.random() * 20 - 10, // Random X position
      2, // Above ground
      Math.random() * 20 - 10  // Random Z position
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
      
      mesh.add(sprite);
      this.game.scene.add(mesh);
      
      console.log(`Added player mesh to scene at position:`, mesh.position);
    }
    
    this.playerMeshes.set(playerId, mesh);
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
        x: bikeState.rotation.x,
        y: bikeState.rotation.y,
        z: bikeState.rotation.z
      },
      speed: bikeState.speed,
      leanAngle: bikeState.leanAngle,
      gear: bikeState.gear,
      isWheelie: bikeState.isWheelie,
      isStoppie: bikeState.isStoppie
    };

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
    // Update other players' positions smoothly
    this.playerMeshes.forEach((mesh, playerId) => {
      const player = this.otherPlayers.get(playerId);
      if (player) {
        // Update mesh position with interpolation
        const targetPos = new THREE.Vector3(
          player.position.x,
          player.position.y,
          player.position.z
        );
        
        // Smooth interpolation
        mesh.position.lerp(targetPos, 0.3);
        
        // Make mesh more visible for debugging
        mesh.scale.set(1.5, 1.5, 1.5);
        
        // Ensure mesh is visible
        mesh.visible = true;
        mesh.traverse(child => {
          if (child.material) {
            child.material.emissiveIntensity = 0.5;
          }
        });
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