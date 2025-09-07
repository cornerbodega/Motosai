import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './utils/supabase.js';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  }
});

// Store active players in memory for quick access
const activePlayers = new Map();
const playerSockets = new Map(); // socketId -> playerId mapping

// Health check endpoint for Cloud Run
app.get('/', (req, res) => {
  res.json({ 
    message: 'Motosai Server Running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    activePlayers: activePlayers.size
  });
});

// Hello World REST endpoint
app.get('/api/hello', (req, res) => {
  res.json({ 
    message: 'Hello World from Motosai!',
    server: 'motosai-websocket',
    time: new Date().toISOString()
  });
});

// In-memory storage fallback (when Supabase tables don't exist)
const sessions = new Map();
const players = new Map();
const playerStates = new Map();

// Create default global session
sessions.set('global', {
  id: 'global-session',
  session_name: 'global',
  max_players: 50,
  current_players: 0,
  status: 'active'
});

// Create or join session
app.post('/api/session/join', async (req, res) => {
  const { username, sessionName = 'global' } = req.body;
  
  try {
    // Use in-memory storage instead of Supabase
    let session = sessions.get(sessionName);
    if (!session) {
      session = {
        id: uuidv4(),
        session_name: sessionName,
        max_players: 50,
        current_players: 0,
        status: 'active'
      };
      sessions.set(sessionName, session);
    }

    // Create player
    const playerId = uuidv4();
    const player = {
      id: playerId,
      username: username || `Rider_${playerId.substring(0, 6)}`,
      bike_color: `#${Math.floor(Math.random()*16777215).toString(16)}`
    };
    players.set(playerId, player);

    // Create player state
    const playerState = {
      player_id: playerId,
      session_id: session.id,
      position_x: Math.random() * 10 - 5,
      position_y: 0.5,
      position_z: 0,
      is_active: true
    };
    playerStates.set(playerId, playerState);

    // Update session player count
    session.current_players++;

    res.json({
      success: true,
      player,
      session,
      playerState
    });

    console.log(`Player ${player.username} joined session ${sessionName}`);

  } catch (error) {
    console.error('Error joining session:', error.message || error);
    res.status(500).json({ error: error.message || 'Failed to join session' });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Send welcome message
  socket.emit('welcome', {
    message: 'Welcome to Motosai Multiplayer!',
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });

  // Handle player join
  socket.on('player-join', async (data) => {
    const { playerId, sessionId, username } = data;
    
    // Store player info
    activePlayers.set(playerId, {
      socketId: socket.id,
      playerId,
      sessionId,
      username,
      lastUpdate: Date.now()
    });
    playerSockets.set(socket.id, playerId);

    // Join session room
    socket.join(`session-${sessionId}`);

    // Notify other players
    socket.to(`session-${sessionId}`).emit('player-joined', {
      playerId,
      username
    });

    // Send current active players from in-memory storage
    const sessionPlayers = Array.from(playerStates.entries())
      .filter(([id, state]) => state.session_id === sessionId && state.is_active)
      .map(([id, state]) => ({
        playerId: id,
        username: players.get(id)?.username || 'Unknown'
      }));
    
    console.log(`Sending active players to ${username}:`, sessionPlayers);
    socket.emit('active-players', sessionPlayers);

    console.log(`Player ${username} joined session ${sessionId}`);
  });

  // Handle player state updates
  socket.on('player-update', async (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    const player = activePlayers.get(playerId);
    if (!player) return;

    // Update in-memory state
    player.lastUpdate = Date.now();
    player.state = data;

    // Log occasional updates to verify they're coming through
    if (Math.random() < 0.01) { // 1% of updates
      console.log(`Player ${player.username} update: pos(${data.position?.x?.toFixed(1)}, ${data.position?.z?.toFixed(1)}) speed=${data.speed?.toFixed(0)}`);
    }

    // Broadcast to other players in session
    socket.to(`session-${player.sessionId}`).emit('player-state-update', {
      playerId,
      ...data
    });

    // Update in-memory player state
    const state = playerStates.get(playerId);
    if (state) {
      state.position_x = data.position?.x || 0;
      state.position_y = data.position?.y || 0;
      state.position_z = data.position?.z || 0;
      state.rotation_x = data.rotation?.x || 0;
      state.rotation_y = data.rotation?.y || 0;
      state.rotation_z = data.rotation?.z || 0;
      state.speed = data.speed || 0;
      state.lean_angle = data.leanAngle || 0;
      state.gear = data.gear || 1;
      state.is_wheelie = data.isWheelie || false;
      state.is_stoppie = data.isStoppie || false;
      state.last_update = Date.now();
    }
  });

  // Handle chat messages
  socket.on('chat-message', async (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    const player = activePlayers.get(playerId);
    if (!player) return;

    const message = {
      playerId,
      username: player.username,
      message: data.message,
      timestamp: new Date().toISOString()
    };

    // Broadcast to session
    io.to(`session-${player.sessionId}`).emit('chat-message', message);

    // Chat messages are only stored in memory for this session
  });
  
  // Handle ping for latency testing
  socket.on('ping', (timestamp) => {
    socket.emit('pong', timestamp);
  });
  
  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    
    const playerId = playerSockets.get(socket.id);
    if (playerId) {
      const player = activePlayers.get(playerId);
      
      if (player) {
        // Notify other players
        socket.to(`session-${player.sessionId}`).emit('player-left', {
          playerId,
          username: player.username
        });

        // Mark as inactive in memory
        const state = playerStates.get(playerId);
        if (state) {
          state.is_active = false;
        }
      }

      // Clean up
      activePlayers.delete(playerId);
      playerSockets.delete(socket.id);
    }
  });
});

// Cleanup inactive players periodically
setInterval(() => {
  const now = Date.now();
  const timeout = 30000; // 30 seconds
  
  for (const [playerId, player] of activePlayers.entries()) {
    if (now - player.lastUpdate > timeout) {
      console.log(`Removing inactive player: ${playerId}`);
      activePlayers.delete(playerId);
    }
  }
}, 10000); // Check every 10 seconds

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`Motosai multiplayer server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});