import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './utils/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { leaderboardManager } from './leaderboard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static client files from dist directory
const clientDistPath = path.join(__dirname, 'client', 'dist');
console.log('Serving static files from:', clientDistPath);
app.use(express.static(clientDistPath));

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

// Traffic synchronization
let trafficMaster = null; // socketId of the traffic master client

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
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

// Debug report endpoint for memory leak tracking
app.post('/api/save-debug-report', async (req, res) => {
  try {
    const { filename, data, reportType, size } = req.body;

    // Create reports directory if it doesn't exist
    const reportsDir = path.join(__dirname, 'debug-reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Save the report
    const filePath = path.join(reportsDir, filename);
    fs.writeFileSync(filePath, data, 'utf8');

    console.log(`📄 Debug report saved: ${filename} (${(size / 1024).toFixed(1)}KB)`);

    // Also log a summary for immediate visibility
    if (reportType === 'memory-leak') {
      try {
        const reportData = JSON.parse(data);
        console.log(`🚨 MEMORY LEAK REPORT: ${reportData.totalUndisposed} undisposed materials`);
        console.log(`Top leak source: ${reportData.topLeakSources[0]?.[1]}x from ${reportData.topLeakSources[0]?.[0]}`);
      } catch (e) {
        console.log('🚨 Memory leak report saved but could not parse summary');
      }
    }

    res.json({
      success: true,
      filename: filename,
      size: size,
      path: filePath
    });

  } catch (error) {
    console.error('Error saving debug report:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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

// Leaderboard API endpoints
app.post('/api/leaderboard/update', async (req, res) => {
  const { playerId, username, stats } = req.body;

  try {
    const sessionStats = leaderboardManager.updateSessionStats(playerId, {
      username,
      ...stats
    });

    res.json({
      success: true,
      stats: sessionStats
    });
  } catch (error) {
    console.error('Error updating stats:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leaderboard/submit', async (req, res) => {
  const { playerId, username, stats } = req.body;

  try {
    const result = await leaderboardManager.submitScore(playerId, username, stats);
    res.json(result);
  } catch (error) {
    console.error('Error submitting score:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leaderboard/top', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const topScores = await leaderboardManager.getTopScores(limit);
    res.json({
      success: true,
      leaderboard: topScores
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leaderboard/daily', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const dailyScores = await leaderboardManager.getDailyTopScores(limit);
    res.json({
      success: true,
      leaderboard: dailyScores
    });
  } catch (error) {
    console.error('Error fetching daily leaderboard:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leaderboard/player/:playerId', async (req, res) => {
  const { playerId } = req.params;

  try {
    const playerBest = await leaderboardManager.getPlayerBest(playerId);
    const currentSession = leaderboardManager.getCurrentSession(playerId);

    res.json({
      success: true,
      bestScore: playerBest,
      currentSession: currentSession
    });
  } catch (error) {
    console.error('Error fetching player stats:', error);
    res.status(500).json({ error: error.message });
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
      lastUpdate: Date.now(),
      previousState: null
    });
    playerSockets.set(socket.id, playerId);

    // Join session room
    socket.join(`session-${sessionId}`);

    // Assign traffic master if none exists
    if (!trafficMaster) {
      trafficMaster = socket.id;
      socket.emit('traffic-master-assigned', true);
      console.log(`Assigned traffic master to ${username} (${socket.id})`);
    } else {
      socket.emit('traffic-master-assigned', false);
    }

    // Notify other players
    socket.to(`session-${sessionId}`).emit('player-joined', {
      playerId,
      username
    });

    // Send current active players from activePlayers (truly online players only)
    const sessionPlayers = Array.from(activePlayers.entries())
      .filter(([id, player]) => player.sessionId === sessionId && id !== playerId)
      .map(([id, player]) => ({
        playerId: id,
        username: player.username
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

    // Check for new crash event
    const wasCrashed = player.previousState?.isCrashed || false;
    const isCrashed = data.isCrashed || false;
    
    if (isCrashed && !wasCrashed) {
      // Player just crashed - broadcast crash event with details
      console.log(`🚨 CRASH EVENT: Player ${player.username} crashed! Broadcasting to session ${player.sessionId}`);
      socket.to(`session-${player.sessionId}`).emit('player-crash', {
        playerId,
        username: player.username,
        position: data.position,
        velocity: data.velocity || { x: 0, y: 0, z: 0 },
        timestamp: Date.now()
      });
      console.log(`Player ${player.username} crashed at position (${data.position?.x?.toFixed(1)}, ${data.position?.z?.toFixed(1)})`);
    }

    // Check for death event  
    const wasDead = player.previousState?.isDead || false;
    const isDead = data.isDead || false;
    
    if (isDead && !wasDead) {
      // Player just died - broadcast death event
      console.log(`💀 DEATH EVENT: Player ${player.username} died! Broadcasting to session ${player.sessionId}`);
      socket.to(`session-${player.sessionId}`).emit('player-death', {
        playerId,
        username: player.username,
        position: data.position,
        velocity: data.velocity || { x: 0, y: 0, z: 0 },
        timestamp: Date.now()
      });
      console.log(`Player ${player.username} died at position (${data.position?.x?.toFixed(1)}, ${data.position?.z?.toFixed(1)})`);
    }

    // Store previous state for event detection
    player.previousState = { ...data };

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

  // Handle race invite
  socket.on('race-invite', async (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    const player = activePlayers.get(playerId);
    if (!player) return;

    // Find target player's socket
    const targetSocketId = Array.from(playerSockets.entries())
      .find(([sid, pid]) => pid === data.to)?.[0];

    if (targetSocketId) {
      io.to(targetSocketId).emit('race-invite', {
        from: data.from,
        distance: data.distance
      });
      console.log(`Race invite sent from ${data.from} to ${data.to} for ${data.distance}km`);
    }
  });

  // Handle race accept
  socket.on('race-accept', async (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    // Find target player's socket
    const targetSocketId = Array.from(playerSockets.entries())
      .find(([sid, pid]) => pid === data.to)?.[0];

    if (targetSocketId) {
      io.to(targetSocketId).emit('race-accept', {
        from: data.from,
        distance: data.distance
      });
      console.log(`Race accepted by ${data.from} to ${data.to}`);
    }
  });

  // Handle race decline
  socket.on('race-decline', async (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    // Find target player's socket
    const targetSocketId = Array.from(playerSockets.entries())
      .find(([sid, pid]) => pid === data.to)?.[0];

    if (targetSocketId) {
      io.to(targetSocketId).emit('race-decline', {
        from: data.from
      });
      console.log(`Race declined by ${data.from} to ${data.to}`);
    }
  });
  
  // Handle traffic synchronization events
  socket.on('traffic-vehicle-spawn', (vehicleData) => {
    const playerId = playerSockets.get(socket.id);
    const player = activePlayers.get(playerId);
    
    if (player && socket.id === trafficMaster) {
      // Broadcast to all other players in session
      socket.to(`session-${player.sessionId}`).emit('traffic-vehicle-spawn', vehicleData);
    }
  });

  socket.on('traffic-update', (trafficData) => {
    const playerId = playerSockets.get(socket.id);
    const player = activePlayers.get(playerId);
    
    if (player && socket.id === trafficMaster) {
      // Broadcast to all other players in session
      socket.to(`session-${player.sessionId}`).emit('traffic-update', trafficData);
    }
  });

  socket.on('traffic-vehicle-remove', (vehicleId) => {
    const playerId = playerSockets.get(socket.id);
    const player = activePlayers.get(playerId);
    
    if (player && socket.id === trafficMaster) {
      // Broadcast to all other players in session
      socket.to(`session-${player.sessionId}`).emit('traffic-vehicle-remove', vehicleId);
    }
  });

  // Handle ping for latency testing
  socket.on('ping', (timestamp) => {
    socket.emit('pong', timestamp);
  });

  // Handle memory profiler logs
  socket.on('memory-log', (data) => {
    const { sessionId, playerId, logEntry } = data;

    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, 'memory-logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create filename with date and session
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const filename = `memory-${dateStr}-${sessionId || 'unknown'}.jsonl`;
    const filepath = path.join(logsDir, filename);

    // Append log entry as JSON line
    const logLine = JSON.stringify({
      ...logEntry,
      serverTimestamp: date.toISOString(),
      playerId,
      sessionId,
      socketId: socket.id
    }) + '\n';

    // Write to file asynchronously
    fs.appendFile(filepath, logLine, (err) => {
      if (err) {
        console.error('Error writing memory log:', err);
        socket.emit('memory-log-error', { error: err.message });
      }
    });

    // Broadcast to monitoring tools
    io.emit('memory-log-broadcast', { playerId, sessionId, logEntry });

    // Log critical issues to console
    if (logEntry.leaks && logEntry.leaks.length > 0) {
      console.warn(`⚠️ Memory leak detected for player ${playerId}:`, logEntry.leaks);
    }
  });

  // Handle memory profiler snapshots (larger data)
  socket.on('memory-snapshot', (data) => {
    const { sessionId, playerId, snapshot } = data;

    // Check if snapshot data exists
    if (!snapshot) {
      console.error('Memory snapshot received with no data');
      socket.emit('memory-snapshot-error', { error: 'No snapshot data provided' });
      return;
    }

    const logsDir = path.join(__dirname, 'memory-logs', 'snapshots');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = `snapshot-${timestamp}-${playerId || 'unknown'}.json`;
    const filepath = path.join(logsDir, filename);

    fs.writeFile(filepath, JSON.stringify(snapshot, null, 2), (err) => {
      if (err) {
        console.error('Error writing memory snapshot:', err);
        socket.emit('memory-snapshot-error', { error: err.message });
      } else {
        console.log(`Memory snapshot saved: ${filename}`);
        socket.emit('memory-snapshot-saved', { filename, timestamp });
      }
    });
  });

  // Handle stats updates
  socket.on('stats-update', (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    const player = activePlayers.get(playerId);
    if (!player) return;

    // Update session stats
    leaderboardManager.updateSessionStats(playerId, {
      username: player.username,
      ...data.stats
    });

    // Optional: broadcast to other players for live leaderboard
    socket.to(`session-${player.sessionId}`).emit('player-stats-update', {
      playerId,
      username: player.username,
      vehiclesPassed: data.stats.vehiclesPassed
    });
  });

  // Handle score submission (end of session)
  socket.on('submit-score', async (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    const player = activePlayers.get(playerId);
    if (!player) return;

    try {
      const result = await leaderboardManager.submitScore(
        playerId,
        player.username,
        data.stats
      );

      socket.emit('score-submitted', result);

      // Broadcast new high score if it's in top 10
      if (result.rank && result.rank <= 10) {
        io.emit('new-high-score', {
          username: player.username,
          rank: result.rank,
          vehiclesPassed: data.stats.vehiclesPassed
        });
      }
    } catch (error) {
      console.error('Error submitting score:', error);
      socket.emit('score-submit-error', { error: error.message });
    }
  });

  // Handle memory profiler alerts
  socket.on('memory-alert', (data) => {
    const { sessionId, playerId, alert } = data;

    console.error(`🚨 MEMORY ALERT from ${playerId}:`, alert);

    // Log alerts to separate file for critical issues
    const logsDir = path.join(__dirname, 'memory-logs');
    const alertFile = path.join(logsDir, 'alerts.jsonl');

    const alertEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      playerId,
      sessionId,
      socketId: socket.id,
      alert
    }) + '\n';

    fs.appendFile(alertFile, alertEntry, (err) => {
      if (err) console.error('Error logging alert:', err);
    });

    // Broadcast to monitoring tools
    io.emit('memory-alert-broadcast', { playerId, sessionId, alert });
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

      // Clean up all references to this player
      activePlayers.delete(playerId);
      playerSockets.delete(socket.id);
      players.delete(playerId);
      playerStates.delete(playerId);

      // Reassign traffic master if this was the master
      if (socket.id === trafficMaster) {
        trafficMaster = null;
        
        // Find another player to be master
        const remainingPlayers = Array.from(activePlayers.values());
        if (remainingPlayers.length > 0) {
          const newMaster = remainingPlayers[0];
          trafficMaster = newMaster.socketId;
          io.to(newMaster.socketId).emit('traffic-master-assigned', true);
          console.log(`Reassigned traffic master to ${newMaster.username} (${newMaster.socketId})`);
          
          // Notify other players they are not master
          remainingPlayers.slice(1).forEach(player => {
            io.to(player.socketId).emit('traffic-master-assigned', false);
          });
        }
      }
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
      players.delete(playerId);
      playerStates.delete(playerId);
    }
  }
}, 10000); // Check every 10 seconds

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Motosai multiplayer server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Client files served from: ${clientDistPath}`);
});