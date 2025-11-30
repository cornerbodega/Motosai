import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { supabase } from "./utils/supabase.js";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { leaderboardManager } from "./leaderboard.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static client files from dist directory
const clientDistPath = path.join(__dirname, "client", "dist");

app.use(express.static(clientDistPath));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
  },
});

// Store active players in memory for quick access
const activePlayers = new Map();
const playerSockets = new Map(); // socketId -> playerId mapping

// Traffic synchronization
let trafficMaster = null; // socketId of the traffic master client

// Health check endpoint for Cloud Run
app.get("/health", (req, res) => {
  res.json({
    message: "Motosai Server Running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    activePlayers: activePlayers.size,
  });
});

// Hello World REST endpoint
app.get("/api/hello", (req, res) => {
  res.json({
    message: "Hello World from Motosai!",
    server: "motosai-websocket",
    time: new Date().toISOString(),
  });
});

// Billboard textures endpoint - dynamically scan available textures
app.get("/api/billboards/textures", (req, res) => {
  try {
    // Path to billboard textures - they are in the client/public folder
    const billboardsPath = path.join(__dirname, "..", "client", "public", "textures", "billboards");

    // Check if directory exists
    if (!fs.existsSync(billboardsPath)) {
      console.warn("Billboard textures directory not found:", billboardsPath);
      return res.json({
        success: true,
        textures: ["default.png"],
        message: "Using default texture only"
      });
    }

    // Read all files in the directory
    const files = fs.readdirSync(billboardsPath);

    // Filter for image files (jpg, jpeg, png)
    const textureFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png'].includes(ext);
    });

    // Sort alphabetically but keep default.png at the end
    textureFiles.sort((a, b) => {
      if (a === 'default.png') return 1;
      if (b === 'default.png') return -1;
      return a.localeCompare(b);
    });

    console.log(`Found ${textureFiles.length} billboard textures:`, textureFiles);

    res.json({
      success: true,
      textures: textureFiles,
      count: textureFiles.length
    });
  } catch (error) {
    console.error("Error scanning billboard textures:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      textures: ["default.png"]
    });
  }
});

// Session tracking - each page load creates a new session record
const activeSessions = new Map(); // socketId -> sessionRecord

// Session tracking - simple row-based approach

// Get current visitor and visit counts from the database
app.get("/api/visitors/count", async (req, res) => {
  try {
    console.log("Fetching visitor counts...");

    // Get total visits (count all rows)
    const { count: totalVisits, error: countError } = await supabase
      .from("mo_visitors")
      .select("*", { count: "exact", head: true });

    if (countError) {
      console.error("Count error:", countError);
      throw countError;
    }

    console.log(`Total rows in mo_visitors: ${totalVisits}`);

    // Get all rows to count unique visitors
    const { data: allRows, error: dataError } = await supabase
      .from("mo_visitors")
      .select("player_id");

    if (dataError) {
      console.error("Data fetch error:", dataError);
      throw dataError;
    }

    console.log(`Fetched ${allRows?.length || 0} rows`);

    const uniqueVisitors = new Set(allRows?.map(r => r.player_id) || []).size;

    console.log(`Visitor count endpoint: ${uniqueVisitors} unique visitors, ${totalVisits} total visits`);

    res.json({
      success: true,
      visitors: uniqueVisitors,
      visits: totalVisits || 0,
      activeSessions: activePlayers.size,
      rowCount: allRows?.length || 0
    });

  } catch (error) {
    console.error("Error fetching visitor counts:", error);
    console.error("Full error details:", JSON.stringify(error, null, 2));
    res.json({
      success: false,
      visitors: 0,
      visits: 0,
      activeSessions: 0,
      error: error.message
    });
  }
});

// Get detailed visitor analytics
app.get("/api/visitors/analytics", async (req, res) => {
  try {
    // Get daily stats for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: dailyStats, error: dailyError } = await supabase
      .from("mo_sessions")
      .select("session_start, player_id, is_new_visitor")
      .gte("session_start", sevenDaysAgo.toISOString());

    if (dailyError) throw dailyError;

    // Group by date
    const statsByDate = {};
    dailyStats?.forEach(session => {
      const date = new Date(session.session_start).toISOString().split('T')[0];
      if (!statsByDate[date]) {
        statsByDate[date] = {
          date,
          uniqueVisitors: new Set(),
          totalVisits: 0,
          newVisitors: 0,
          returningVisits: 0
        };
      }
      statsByDate[date].uniqueVisitors.add(session.player_id);
      statsByDate[date].totalVisits++;
      if (session.is_new_visitor) {
        statsByDate[date].newVisitors++;
      } else {
        statsByDate[date].returningVisits++;
      }
    });

    // Convert sets to counts
    const dailyAnalytics = Object.values(statsByDate).map(day => ({
      ...day,
      uniqueVisitors: day.uniqueVisitors.size
    })).sort((a, b) => b.date.localeCompare(a.date));

    // Get hourly stats for today
    const today = new Date().toISOString().split('T')[0];
    const { data: todaysSessions, error: todayError } = await supabase
      .from("mo_sessions")
      .select("session_start, player_id")
      .gte("session_start", `${today}T00:00:00Z`)
      .lt("session_start", `${today}T23:59:59Z`);

    if (todayError) throw todayError;

    // Group by hour
    const hourlyStats = {};
    for (let hour = 0; hour < 24; hour++) {
      hourlyStats[hour] = {
        hour,
        uniqueVisitors: new Set(),
        totalVisits: 0
      };
    }

    todaysSessions?.forEach(session => {
      const hour = new Date(session.session_start).getHours();
      hourlyStats[hour].uniqueVisitors.add(session.player_id);
      hourlyStats[hour].totalVisits++;
    });

    const hourlyAnalytics = Object.values(hourlyStats).map(hour => ({
      hour: hour.hour,
      uniqueVisitors: hour.uniqueVisitors.size,
      totalVisits: hour.totalVisits
    }));

    // Get retention stats
    const { data: allSessions, error: retentionError } = await supabase
      .from("mo_sessions")
      .select("player_id, session_start")
      .order("session_start", { ascending: true });

    if (retentionError) throw retentionError;

    // Calculate retention
    const playerFirstVisit = {};
    const playerVisitDays = {};

    allSessions?.forEach(session => {
      const playerId = session.player_id;
      const visitDate = new Date(session.session_start).toISOString().split('T')[0];

      if (!playerFirstVisit[playerId]) {
        playerFirstVisit[playerId] = visitDate;
        playerVisitDays[playerId] = new Set();
      }
      playerVisitDays[playerId].add(visitDate);
    });

    const totalPlayers = Object.keys(playerFirstVisit).length;
    const returningPlayers = Object.values(playerVisitDays).filter(days => days.size > 1).length;
    const retentionRate = totalPlayers > 0 ? (returningPlayers / totalPlayers * 100).toFixed(1) : 0;

    res.json({
      success: true,
      analytics: {
        daily: dailyAnalytics,
        hourly: hourlyAnalytics,
        retention: {
          totalPlayers,
          returningPlayers,
          retentionRate: `${retentionRate}%`,
          avgVisitsPerPlayer: totalPlayers > 0 ? (allSessions?.length / totalPlayers).toFixed(1) : 0
        }
      }
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Debug report endpoint for memory leak tracking
app.post("/api/save-debug-report", async (req, res) => {
  try {
    const { filename, data, reportType, size } = req.body;

    // Create reports directory if it doesn't exist
    const reportsDir = path.join(__dirname, "debug-reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Save the report
    const filePath = path.join(reportsDir, filename);
    fs.writeFileSync(filePath, data, "utf8");

    // Also log a summary for immediate visibility
    if (reportType === "memory-leak") {
      try {
        const reportData = JSON.parse(data);
      } catch (e) {}
    }

    res.json({
      success: true,
      filename: filename,
      size: size,
      path: filePath,
    });
  } catch (error) {
    console.error("Error saving debug report:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// In-memory storage fallback (when Supabase tables don't exist)
const sessions = new Map();
const players = new Map();
const playerStates = new Map();

// Create default global session
sessions.set("global", {
  id: "global-session",
  session_name: "global",
  max_players: 50,
  current_players: 0,
  status: "active",
});

// Create or join session
app.post("/api/session/join", async (req, res) => {
  const {
    playerId: existingPlayerId,
    username,
    sessionName = "global",
  } = req.body;

  try {
    // Use in-memory storage instead of Supabase
    let session = sessions.get(sessionName);
    if (!session) {
      session = {
        id: uuidv4(),
        session_name: sessionName,
        max_players: 50,
        current_players: 0,
        status: "active",
      };
      sessions.set(sessionName, session);
    }

    // Use existing player ID if provided, otherwise generate new one
    const playerId = existingPlayerId || uuidv4();
    const player = {
      id: playerId,
      username: username || `Rider_${playerId.substring(0, 6)}`,
      bike_color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
    };
    players.set(playerId, player);

    if (existingPlayerId) {
    } else {
    }

    // Create player state
    const playerState = {
      player_id: playerId,
      session_id: session.id,
      position_x: Math.random() * 10 - 5,
      position_y: 0.5,
      position_z: 0,
      is_active: true,
    };
    playerStates.set(playerId, playerState);

    // Update session player count
    session.current_players++;

    res.json({
      success: true,
      player,
      session,
      playerState,
    });
  } catch (error) {
    console.error("Error joining session:", error.message || error);
    res.status(500).json({ error: error.message || "Failed to join session" });
  }
});

// Leaderboard API endpoints
app.post("/api/leaderboard/update", async (req, res) => {
  const { playerId, username, stats } = req.body;

  try {
    const sessionStats = leaderboardManager.updateSessionStats(playerId, {
      username,
      ...stats,
    });

    res.json({
      success: true,
      stats: sessionStats,
    });
  } catch (error) {
    console.error("Error updating stats:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/leaderboard/submit", async (req, res) => {
  const { playerId, username, stats } = req.body;

  try {
    const result = await leaderboardManager.submitScore(
      playerId,
      username,
      stats
    );
    res.json(result);
  } catch (error) {
    console.error("Error submitting score:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/leaderboard/top", async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const topScores = await leaderboardManager.getTopScores(limit);
    res.json({
      success: true,
      leaderboard: topScores,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/leaderboard/daily", async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const dailyScores = await leaderboardManager.getDailyTopScores(limit);
    res.json({
      success: true,
      leaderboard: dailyScores,
    });
  } catch (error) {
    console.error("Error fetching daily leaderboard:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/leaderboard/top-distance", async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const topScores = await leaderboardManager.getTopScoresByDistance(limit);
    res.json({
      success: true,
      leaderboard: topScores,
    });
  } catch (error) {
    console.error("Error fetching distance leaderboard:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/leaderboard/top-speed", async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const topScores = await leaderboardManager.getTopScoresBySpeed(limit);
    res.json({
      success: true,
      leaderboard: topScores,
    });
  } catch (error) {
    console.error("Error fetching speed leaderboard:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/leaderboard/daily-distance", async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const dailyScores = await leaderboardManager.getDailyTopScoresByDistance(
      limit
    );
    res.json({
      success: true,
      leaderboard: dailyScores,
    });
  } catch (error) {
    console.error("Error fetching daily distance leaderboard:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/leaderboard/daily-speed", async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const dailyScores = await leaderboardManager.getDailyTopScoresBySpeed(
      limit
    );
    res.json({
      success: true,
      leaderboard: dailyScores,
    });
  } catch (error) {
    console.error("Error fetching daily speed leaderboard:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/leaderboard/player/:playerId", async (req, res) => {
  const { playerId } = req.params;

  try {
    const playerBest = await leaderboardManager.getPlayerBest(playerId);
    const currentSession = leaderboardManager.getCurrentSession(playerId);

    res.json({
      success: true,
      bestScore: playerBest,
      currentSession: currentSession,
    });
  } catch (error) {
    console.error("Error fetching player stats:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get player position with neighbors (for contextual leaderboard display - Cars Passed)
app.get("/api/leaderboard/context/:playerId", async (req, res) => {
  const { playerId } = req.params;
  const isDaily = req.query.daily === "true";

  try {
    // Get full leaderboard
    const allScores = isDaily
      ? await leaderboardManager.getDailyTopScores(1000)
      : await leaderboardManager.getTopScores(1000);

    // Find player's index
    const playerIndex = allScores.findIndex((e) => e.player_id === playerId);

    let contextEntries = [];
    let playerRank = null;

    if (playerIndex !== -1) {
      // Player found - get their rank
      playerRank = playerIndex + 1;

      // Get one above, player, and one below with their ranks
      if (playerIndex > 0) {
        const above = { ...allScores[playerIndex - 1], rank: playerIndex };
        contextEntries.push(above);
      }

      const me = { ...allScores[playerIndex], rank: playerIndex + 1 };
      contextEntries.push(me);

      if (playerIndex < allScores.length - 1) {
        const below = { ...allScores[playerIndex + 1], rank: playerIndex + 2 };
        contextEntries.push(below);
      }
    } else {
      // Player not in leaderboard - return top 3 with ranks

      contextEntries = allScores.slice(0, 3).map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));
    }

    res.json({
      success: true,
      entries: contextEntries,
      playerRank: playerRank,
      totalPlayers: allScores.length,
    });
  } catch (error) {
    console.error("Error fetching leaderboard context:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get player position with neighbors (for contextual leaderboard display - Speed)
app.get("/api/leaderboard/context-speed/:playerId", async (req, res) => {
  const { playerId } = req.params;
  const isDaily = req.query.daily === "true";

  try {
    // Get full leaderboard
    const allScores = isDaily
      ? await leaderboardManager.getDailyTopScoresBySpeed(1000)
      : await leaderboardManager.getTopScoresBySpeed(1000);

    // Find player's index
    const playerIndex = allScores.findIndex((e) => e.player_id === playerId);

    let contextEntries = [];
    let playerRank = null;

    if (playerIndex !== -1) {
      // Player found - get their rank
      playerRank = playerIndex + 1;

      // Get one above, player, and one below with their ranks
      if (playerIndex > 0) {
        const above = { ...allScores[playerIndex - 1], rank: playerIndex };
        contextEntries.push(above);
      }

      const me = { ...allScores[playerIndex], rank: playerIndex + 1 };
      contextEntries.push(me);

      if (playerIndex < allScores.length - 1) {
        const below = { ...allScores[playerIndex + 1], rank: playerIndex + 2 };
        contextEntries.push(below);
      }
    } else {
      // Player not in leaderboard - return top 3 with ranks

      contextEntries = allScores.slice(0, 3).map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));
    }

    res.json({
      success: true,
      entries: contextEntries,
      playerRank: playerRank,
      totalPlayers: allScores.length,
    });
  } catch (error) {
    console.error("Error fetching speed leaderboard context:", error);
    res.status(500).json({ error: error.message });
  }
});

// Account Management Endpoints

// Helper function to verify Supabase JWT
async function verifySupabaseToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("No authorization token provided");
  }

  const token = authHeader.substring(7);
  const { data, error } = await supabase.auth.getUser(token);

  if (error) throw error;
  return data.user;
}

// Store player-to-user mappings in memory
const playerUserMappings = new Map(); // playerId -> userId

// Link player ID to Supabase user
app.post("/api/account/link", async (req, res) => {
  try {
    const user = await verifySupabaseToken(req.headers.authorization);
    const { playerId, userId } = req.body;

    if (!playerId || !userId) {
      return res.status(400).json({
        success: false,
        error: "playerId and userId are required",
      });
    }

    // Verify that the user ID matches the authenticated user
    if (user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized: User ID mismatch",
      });
    }

    // Store the mapping
    playerUserMappings.set(playerId, userId);

    res.json({
      success: true,
      message: "Player linked to account successfully",
    });
  } catch (error) {
    console.error("Error linking player to user:", error);
    res.status(401).json({
      success: false,
      error: error.message || "Authentication failed",
    });
  }
});

// Rename player account (requires authentication)
app.post("/api/account/rename", async (req, res) => {
  try {
    const user = await verifySupabaseToken(req.headers.authorization);
    const { playerId, newUsername } = req.body;

    if (!playerId || !newUsername) {
      return res.status(400).json({
        success: false,
        error: "playerId and newUsername are required",
      });
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) {
      return res.status(400).json({
        success: false,
        error:
          "Invalid username format. Use 3-20 characters (letters, numbers, underscores only)",
      });
    }

    // Verify that this player ID is linked to the authenticated user
    const linkedUserId = playerUserMappings.get(playerId);
    if (!linkedUserId || linkedUserId !== user.id) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized: This player ID is not linked to your account",
      });
    }

    // Check if username is already taken (in leaderboard)
    const existingScores = await leaderboardManager.getTopScores(1000);
    const usernameTaken = existingScores.some(
      (score) =>
        score.username.toLowerCase() === newUsername.toLowerCase() &&
        score.player_id !== playerId
    );

    if (usernameTaken) {
      return res.status(409).json({
        success: false,
        error: "Username already taken",
      });
    }

    // Update username in all leaderboard entries for this player
    // Note: This would typically be done with a database query
    // For now, we'll update it in memory and future submissions will use the new username
    const player = players.get(playerId);
    if (player) {
      player.username = newUsername;
    }

    // Update all existing leaderboard entries in Supabase
    try {
      const { error: updateError } = await supabase
        .from("mo_leaderboard")
        .update({ username: newUsername })
        .eq("player_id", playerId);

      if (updateError) {
        console.error("Error updating leaderboard entries:", updateError);
        // Don't fail the request - the update will apply to future scores
      }
    } catch (err) {
      console.error("Error updating leaderboard:", err);
    }

    res.json({
      success: true,
      message: "Username updated successfully",
      newUsername,
    });
  } catch (error) {
    console.error("Error renaming account:", error);
    res.status(401).json({
      success: false,
      error: error.message || "Authentication failed",
    });
  }
});

// WebSocket connection handling
io.on("connection", (socket) => {
  console.log(`New WebSocket connection: ${socket.id}`);

  // Send welcome message (visitor tracking happens on player-join)
  socket.emit("welcome", {
    message: "Welcome to Motosai Multiplayer!",
    socketId: socket.id,
    timestamp: new Date().toISOString(),
  });

  // Handle player join
  socket.on("player-join", async (data) => {
    console.log(`Player join event received:`, data);
    const { playerId, sessionId, username, isNewVisitor } = data;

    // SIMPLE: Insert a new row for EVERY page load
    try {
      const insertData = {
        timestamp: new Date().toISOString(),
        player_id: playerId,
        event_type: isNewVisitor ? "new_visitor" : "returning_visit",
        visitors: 0,  // Add default values for required columns
        visits: 0     // Add default values for required columns
      };

      console.log("Attempting to insert visitor row:", insertData);

      const { data, error } = await supabase
        .from("mo_visitors")
        .insert(insertData)
        .select();

      if (error) {
        console.error("Supabase insert error:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
      } else {
        console.log(`Successfully inserted visitor row for ${playerId}:`, data);
      }
    } catch (error) {
      console.error("Error inserting visitor row:", error);
      console.error("Full error:", JSON.stringify(error, null, 2));
    }

    // Count the rows to get stats
    let broadcastCounts = { visitors: 0, visits: 0 };

    try {
      // Get total visits (all rows)
      const { count: totalVisits } = await supabase
        .from("mo_visitors")
        .select("*", { count: "exact", head: true });

      // Get unique visitors (distinct player_ids)
      const { data: uniquePlayers } = await supabase
        .from("mo_visitors")
        .select("player_id");

      const uniqueVisitors = new Set(uniquePlayers?.map(r => r.player_id) || []).size;

      broadcastCounts = {
        visitors: uniqueVisitors,
        visits: totalVisits || 0
      };

      console.log(`Stats: ${uniqueVisitors} unique visitors, ${totalVisits} total visits`);
    } catch (error) {
      console.error("Error counting visitors:", error);
    }

    // Broadcast updated counts to all clients
    io.emit("visitor-count-update", broadcastCounts);

    // Store player info
    activePlayers.set(playerId, {
      socketId: socket.id,
      playerId,
      sessionId,
      username,
      lastUpdate: Date.now(),
      previousState: null,
    });
    playerSockets.set(socket.id, playerId);

    // Join session room
    socket.join(`session-${sessionId}`);

    // Assign traffic master if none exists
    if (!trafficMaster) {
      trafficMaster = socket.id;
      socket.emit("traffic-master-assigned", true);
    } else {
      socket.emit("traffic-master-assigned", false);
    }

    // Notify other players
    socket.to(`session-${sessionId}`).emit("player-joined", {
      playerId,
      username,
    });

    // Send current active players from activePlayers (truly online players only)
    const sessionPlayers = Array.from(activePlayers.entries())
      .filter(
        ([id, player]) => player.sessionId === sessionId && id !== playerId
      )
      .map(([id, player]) => ({
        playerId: id,
        username: player.username,
      }));

    socket.emit("active-players", sessionPlayers);
  });

  // Handle player state updates
  socket.on("player-update", async (data) => {
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

      socket.to(`session-${player.sessionId}`).emit("player-crash", {
        playerId,
        username: player.username,
        position: data.position,
        velocity: data.velocity || { x: 0, y: 0, z: 0 },
        timestamp: Date.now(),
      });
    }

    // Check for death event
    const wasDead = player.previousState?.isDead || false;
    const isDead = data.isDead || false;

    if (isDead && !wasDead) {
      // Player just died - broadcast death event

      socket.to(`session-${player.sessionId}`).emit("player-death", {
        playerId,
        username: player.username,
        position: data.position,
        velocity: data.velocity || { x: 0, y: 0, z: 0 },
        timestamp: Date.now(),
      });
    }

    // Store previous state for event detection
    player.previousState = { ...data };

    // Log occasional updates to verify they're coming through
    if (Math.random() < 0.01) {
      // 1% of updates
    }

    // Broadcast to other players in session
    socket.to(`session-${player.sessionId}`).emit("player-state-update", {
      playerId,
      ...data,
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
  socket.on("chat-message", async (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    const player = activePlayers.get(playerId);
    if (!player) return;

    const message = {
      playerId,
      username: player.username,
      message: data.message,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to session
    io.to(`session-${player.sessionId}`).emit("chat-message", message);

    // Chat messages are only stored in memory for this session
  });

  // Handle race invite
  socket.on("race-invite", async (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    const player = activePlayers.get(playerId);
    if (!player) return;

    // Find target player's socket
    const targetSocketId = Array.from(playerSockets.entries()).find(
      ([sid, pid]) => pid === data.to
    )?.[0];

    if (targetSocketId) {
      io.to(targetSocketId).emit("race-invite", {
        from: data.from,
        distance: data.distance,
      });
    }
  });

  // Handle race accept
  socket.on("race-accept", async (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    // Find target player's socket
    const targetSocketId = Array.from(playerSockets.entries()).find(
      ([sid, pid]) => pid === data.to
    )?.[0];

    if (targetSocketId) {
      io.to(targetSocketId).emit("race-accept", {
        from: data.from,
        distance: data.distance,
      });
    }
  });

  // Handle race decline
  socket.on("race-decline", async (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    // Find target player's socket
    const targetSocketId = Array.from(playerSockets.entries()).find(
      ([sid, pid]) => pid === data.to
    )?.[0];

    if (targetSocketId) {
      io.to(targetSocketId).emit("race-decline", {
        from: data.from,
      });
    }
  });

  // Handle traffic synchronization events
  socket.on("traffic-vehicle-spawn", (vehicleData) => {
    const playerId = playerSockets.get(socket.id);
    const player = activePlayers.get(playerId);

    if (player && socket.id === trafficMaster) {
      // Broadcast to all other players in session
      socket
        .to(`session-${player.sessionId}`)
        .emit("traffic-vehicle-spawn", vehicleData);
    }
  });

  socket.on("traffic-update", (trafficData) => {
    const playerId = playerSockets.get(socket.id);
    const player = activePlayers.get(playerId);

    if (player && socket.id === trafficMaster) {
      // Broadcast to all other players in session
      socket
        .to(`session-${player.sessionId}`)
        .emit("traffic-update", trafficData);
    }
  });

  socket.on("traffic-vehicle-remove", (vehicleId) => {
    const playerId = playerSockets.get(socket.id);
    const player = activePlayers.get(playerId);

    if (player && socket.id === trafficMaster) {
      // Broadcast to all other players in session
      socket
        .to(`session-${player.sessionId}`)
        .emit("traffic-vehicle-remove", vehicleId);
    }
  });

  // Handle ping for latency testing
  socket.on("ping", (timestamp) => {
    socket.emit("pong", timestamp);
  });

  // Handle memory profiler logs
  socket.on("memory-log", (data) => {
    const { sessionId, playerId, logEntry } = data;

    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, "memory-logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create filename with date and session
    const date = new Date();
    const dateStr = date.toISOString().split("T")[0];
    const filename = `memory-${dateStr}-${sessionId || "unknown"}.jsonl`;
    const filepath = path.join(logsDir, filename);

    // Append log entry as JSON line
    const logLine =
      JSON.stringify({
        ...logEntry,
        serverTimestamp: date.toISOString(),
        playerId,
        sessionId,
        socketId: socket.id,
      }) + "\n";

    // Write to file asynchronously
    fs.appendFile(filepath, logLine, (err) => {
      if (err) {
        console.error("Error writing memory log:", err);
        socket.emit("memory-log-error", { error: err.message });
      }
    });

    // Broadcast to monitoring tools
    io.emit("memory-log-broadcast", { playerId, sessionId, logEntry });

    // Log critical issues to console
    if (logEntry.leaks && logEntry.leaks.length > 0) {
      console.warn(
        `⚠️ Memory leak detected for player ${playerId}:`,
        logEntry.leaks
      );
    }
  });

  // Handle memory profiler snapshots (larger data)
  socket.on("memory-snapshot", (data) => {
    const { sessionId, playerId, snapshot } = data;

    // Check if snapshot data exists
    if (!snapshot) {
      console.error("Memory snapshot received with no data");
      socket.emit("memory-snapshot-error", {
        error: "No snapshot data provided",
      });
      return;
    }

    const logsDir = path.join(__dirname, "memory-logs", "snapshots");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = `snapshot-${timestamp}-${playerId || "unknown"}.json`;
    const filepath = path.join(logsDir, filename);

    fs.writeFile(filepath, JSON.stringify(snapshot, null, 2), (err) => {
      if (err) {
        console.error("Error writing memory snapshot:", err);
        socket.emit("memory-snapshot-error", { error: err.message });
      } else {
        socket.emit("memory-snapshot-saved", { filename, timestamp });
      }
    });
  });

  // Handle stats updates
  socket.on("stats-update", (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    const player = activePlayers.get(playerId);
    if (!player) return;

    // Update session stats
    leaderboardManager.updateSessionStats(playerId, {
      username: player.username,
      ...data.stats,
    });

    // Optional: broadcast to other players for live leaderboard
    socket.to(`session-${player.sessionId}`).emit("player-stats-update", {
      playerId,
      username: player.username,
      vehiclesPassed: data.stats.vehiclesPassed,
    });
  });

  // Handle score submission (end of session)
  socket.on("submit-score", async (data) => {
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

      socket.emit("score-submitted", result);

      // Only broadcast if it's a NEW personal best AND in top 10
      if (result.isNewBest && result.rank && result.rank <= 10) {
        io.emit("new-high-score", {
          username: player.username,
          rank: result.rank,
          vehiclesPassed: data.stats.vehiclesPassed,
        });
      }
    } catch (error) {
      console.error("Error submitting score:", error);
      socket.emit("score-submit-error", { error: error.message });
    }
  });

  // Handle memory profiler alerts
  socket.on("memory-alert", (data) => {
    const { sessionId, playerId, alert } = data;

    console.error(`🚨 MEMORY ALERT from ${playerId}:`, alert);

    // Log alerts to separate file for critical issues
    const logsDir = path.join(__dirname, "memory-logs");
    const alertFile = path.join(logsDir, "alerts.jsonl");

    const alertEntry =
      JSON.stringify({
        timestamp: new Date().toISOString(),
        playerId,
        sessionId,
        socketId: socket.id,
        alert,
      }) + "\n";

    fs.appendFile(alertFile, alertEntry, (err) => {
      if (err) console.error("Error logging alert:", err);
    });

    // Broadcast to monitoring tools
    io.emit("memory-alert-broadcast", { playerId, sessionId, alert });
  });

  socket.on("disconnect", async () => {
    const playerId = playerSockets.get(socket.id);

    // Update session end time in database
    const sessionRecord = activeSessions.get(socket.id);
    if (sessionRecord) {
      try {
        await supabase
          .from("mo_sessions")
          .update({ session_end: new Date().toISOString() })
          .eq("session_id", sessionRecord.session_id);
      } catch (error) {
        console.error("Error updating session end time:", error);
      }
      activeSessions.delete(socket.id);
    }

    if (playerId) {
      const player = activePlayers.get(playerId);

      if (player) {
        // Notify other players
        socket.to(`session-${player.sessionId}`).emit("player-left", {
          playerId,
          username: player.username,
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
          io.to(newMaster.socketId).emit("traffic-master-assigned", true);

          // Notify other players they are not master
          remainingPlayers.slice(1).forEach((player) => {
            io.to(player.socketId).emit("traffic-master-assigned", false);
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
      activePlayers.delete(playerId);
      players.delete(playerId);
      playerStates.delete(playerId);
    }
  }
}, 10000); // Check every 10 seconds

// Serve devlog as HTML
app.get("/devlog", (req, res) => {
  const devlogPath = path.join(__dirname, "..", "DEVELOPMENT_JOURNAL_2025-10-13.md");

  if (!fs.existsSync(devlogPath)) {
    return res.status(404).send("Development journal not found");
  }

  const markdown = fs.readFileSync(devlogPath, "utf8");

  // Simple markdown to HTML conversion
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Motosai Development Journal</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown-dark.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/11.1.1/marked.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <style>
    body {
      background: #0d1117;
      padding: 20px;
      max-width: 1000px;
      margin: 0 auto;
    }
    .markdown-body {
      padding: 45px;
      border-radius: 8px;
      background: #161b22;
    }
    .back-link {
      display: inline-block;
      margin-bottom: 20px;
      color: #58a6ff;
      text-decoration: none;
    }
    .back-link:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <a href="/" class="back-link">← Back to Motosai</a>
  <article class="markdown-body" id="content"></article>
  <script>
    marked.setOptions({
      highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      }
    });
    document.getElementById('content').innerHTML = marked.parse(${JSON.stringify(markdown)});
  </script>
</body>
</html>
  `;

  res.send(html);
});

// Serve index.html for all other routes (SPA fallback)
app.get("*", (req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, "0.0.0.0", () => {});
