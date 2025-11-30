#!/usr/bin/env node

import { io } from "socket.io-client";
import chalk from "chalk";

// Configuration
const SERVER_URL = process.env.SERVER_URL || "http://localhost:8080";

// Connect to server
const socket = io(SERVER_URL, {
  transports: ["websocket", "polling"],
});

// Statistics
const stats = {
  totalLogs: 0,
  lastLog: null,
  leaks: [],
  resources: {},
  memory: { jsHeap: 0, gpu: 0 },
  fps: 0,
};

// Clear console and show header
console.clear();
console.log(
  chalk.green.bold(`
╔════════════════════════════════════════════════╗
║     MOTOSAI MEMORY LEAK DETECTOR               ║
║     Connected to: ${SERVER_URL}                ║
╚════════════════════════════════════════════════╝
`)
);

socket.on("connect", () => {});

socket.on("disconnect", () => {});

// Handle memory logs
socket.on("memory-log-broadcast", (data) => {
  const { playerId, sessionId, logEntry } = data;

  if (!logEntry) return;

  stats.totalLogs++;
  stats.lastLog = Date.now();

  // Clear console for fresh update
  console.clear();

  // Header

  // Player info

  // Performance

  // Memory

  if (logEntry.memory) {
    console.log(
      chalk.white("├─ JS Heap:"),
      logEntry.memory.jsHeap?.used || "N/A",
      "/",
      logEntry.memory.jsHeap?.total || "N/A",
      `(${logEntry.memory.jsHeap?.percentage || "N/A"})`
    );
  }

  // Resources

  if (logEntry.resources) {
    // Track resource growth
    if (stats.resources.geometries !== undefined) {
      const geoGrowth =
        (logEntry.resources.geometries || 0) - stats.resources.geometries;
      const matGrowth =
        (logEntry.resources.materials || 0) - stats.resources.materials;
      const texGrowth =
        (logEntry.resources.textures || 0) - stats.resources.textures;

      if (geoGrowth > 0 || matGrowth > 0 || texGrowth > 0) {
        if (geoGrowth > 0)

        if (matGrowth > 0)

        if (texGrowth > 0)

      }
    }

    stats.resources = logEntry.resources;
  }

  // Scene
  if (logEntry.scene) {
  }

  // LEAKS - Most Important!
  if (logEntry.leaks && logEntry.leaks.length > 0) {
    logEntry.leaks.forEach((leak) => {
      const icon = leak.severity === "critical" ? "🚨" : "⚠️";
      const color = leak.severity === "critical" ? chalk.red : chalk.yellow;
    });

    stats.leaks = logEntry.leaks;
  } else if (stats.leaks.length > 0) {
    stats.leaks = [];
  }
});

// Handle alerts
socket.on("memory-alert-broadcast", (data) => {
  const { playerId, alert } = data;
});

// Handle exit
process.on("SIGINT", () => {
  socket.disconnect();
  process.exit(0);
});

// Periodic connection check
setInterval(() => {
  if (stats.lastLog && Date.now() - stats.lastLog > 10000) {
  }
}, 10000);
