#!/usr/bin/env node

import { io } from 'socket.io-client';
import chalk from 'chalk';

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:8080';

// Connect to server
const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling']
});

// Statistics
const stats = {
  totalLogs: 0,
  lastLog: null,
  leaks: [],
  resources: {},
  memory: { jsHeap: 0, gpu: 0 },
  fps: 0
};

// Clear console and show header
console.clear();
console.log(chalk.green.bold(`
╔════════════════════════════════════════════════╗
║     MOTOSAI MEMORY LEAK DETECTOR               ║
║     Connected to: ${SERVER_URL}                ║
╚════════════════════════════════════════════════╝
`));

socket.on('connect', () => {
  console.log(chalk.green('✓ Connected to server'));
  console.log(chalk.gray('Waiting for game data...\n'));
});

socket.on('disconnect', () => {
  console.log(chalk.red('✗ Disconnected from server'));
});

// Handle memory logs
socket.on('memory-log-broadcast', (data) => {
  const { playerId, sessionId, logEntry } = data;

  if (!logEntry) return;

  stats.totalLogs++;
  stats.lastLog = Date.now();

  // Clear console for fresh update
  console.clear();

  // Header
  console.log(chalk.green.bold('═══════════════════════════════════════════════════════'));
  console.log(chalk.green.bold('     MOTOSAI MEMORY MONITOR - REAL TIME'));
  console.log(chalk.green.bold('═══════════════════════════════════════════════════════'));
  console.log();

  // Player info
  console.log(chalk.cyan('📍 Session:'), sessionId || 'Unknown');
  console.log(chalk.cyan('👤 Player:'), playerId ? playerId.substring(0, 16) : 'Unknown');
  console.log(chalk.cyan('📊 Total Logs:'), stats.totalLogs);
  console.log();

  // Performance
  console.log(chalk.yellow.bold('PERFORMANCE'));
  console.log(chalk.white('├─ FPS:'), logEntry.fps || 'N/A');
  console.log(chalk.white('├─ Frame:'), logEntry.frame || 'N/A');
  console.log(chalk.white('├─ Draw Calls:'), logEntry.performance?.drawCalls || 'N/A');
  console.log(chalk.white('└─ Triangles:'), logEntry.performance?.triangles?.toLocaleString() || 'N/A');
  console.log();

  // Memory
  console.log(chalk.blue.bold('MEMORY'));
  if (logEntry.memory) {
    console.log(chalk.white('├─ JS Heap:'), logEntry.memory.jsHeap?.used || 'N/A',
                '/', logEntry.memory.jsHeap?.total || 'N/A',
                `(${logEntry.memory.jsHeap?.percentage || 'N/A'})`);
    console.log(chalk.white('└─ GPU Est:'), logEntry.memory.gpu || 'N/A');
  }
  console.log();

  // Resources
  console.log(chalk.magenta.bold('RESOURCES'));
  if (logEntry.resources) {
    console.log(chalk.white('├─ Geometries:'), logEntry.resources.geometries || 0);
    console.log(chalk.white('├─ Materials:'), logEntry.resources.materials || 0);
    console.log(chalk.white('├─ Textures:'), logEntry.resources.textures || 0);
    console.log(chalk.white('├─ Meshes:'), logEntry.resources.meshes || 0);
    console.log(chalk.white('└─ Undisposed:'), logEntry.resources.totalUndisposed || 0);

    // Track resource growth
    if (stats.resources.geometries !== undefined) {
      const geoGrowth = (logEntry.resources.geometries || 0) - stats.resources.geometries;
      const matGrowth = (logEntry.resources.materials || 0) - stats.resources.materials;
      const texGrowth = (logEntry.resources.textures || 0) - stats.resources.textures;

      if (geoGrowth > 0 || matGrowth > 0 || texGrowth > 0) {
        console.log();
        console.log(chalk.yellow('   Growth since last:'));
        if (geoGrowth > 0) console.log(chalk.yellow(`   • Geometries: +${geoGrowth}`));
        if (matGrowth > 0) console.log(chalk.yellow(`   • Materials: +${matGrowth}`));
        if (texGrowth > 0) console.log(chalk.yellow(`   • Textures: +${texGrowth}`));
      }
    }

    stats.resources = logEntry.resources;
  }
  console.log();

  // Scene
  if (logEntry.scene) {
    console.log(chalk.green.bold('SCENE'));
    console.log(chalk.white('├─ Total Objects:'), logEntry.scene.objects || 0);
    console.log(chalk.white('├─ Meshes:'), logEntry.scene.meshes || 0);
    console.log(chalk.white('├─ Unique Geometries:'), logEntry.scene.uniqueGeometries || 0);
    console.log(chalk.white('├─ Unique Materials:'), logEntry.scene.uniqueMaterials || 0);
    console.log(chalk.white('└─ Unique Textures:'), logEntry.scene.uniqueTextures || 0);
    console.log();
  }

  // LEAKS - Most Important!
  if (logEntry.leaks && logEntry.leaks.length > 0) {
    console.log(chalk.red.bold('⚠️  MEMORY LEAKS DETECTED ⚠️'));
    logEntry.leaks.forEach(leak => {
      const icon = leak.severity === 'critical' ? '🚨' : '⚠️';
      const color = leak.severity === 'critical' ? chalk.red : chalk.yellow;

      console.log(color(`${icon} ${leak.type}:`));
      console.log(color(`   Growth: ${leak.growth || 'N/A'}`));
      console.log(color(`   Old: ${leak.oldCount || leak.oldSize || 'N/A'}`));
      console.log(color(`   New: ${leak.newCount || leak.newSize || 'N/A'}`));
    });

    stats.leaks = logEntry.leaks;
  } else if (stats.leaks.length > 0) {
    console.log(chalk.green.bold('✅ Previous leaks may be resolved'));
    stats.leaks = [];
  }

  console.log();
  console.log(chalk.gray('─────────────────────────────────────────────────'));
  console.log(chalk.gray('Press Ctrl+C to exit'));
});

// Handle alerts
socket.on('memory-alert-broadcast', (data) => {
  const { playerId, alert } = data;
  console.log();
  console.log(chalk.red.bold('═══════════════════════════════════════════════════════'));
  console.log(chalk.red.bold('🚨 CRITICAL MEMORY ALERT 🚨'));
  console.log(chalk.red.bold('═══════════════════════════════════════════════════════'));
  console.log(chalk.red('Player:'), playerId ? playerId.substring(0, 16) : 'Unknown');
  console.log(chalk.red('Alert:'), JSON.stringify(alert, null, 2));
  console.log(chalk.red.bold('═══════════════════════════════════════════════════════'));
  console.log();
});

// Handle exit
process.on('SIGINT', () => {
  console.log(chalk.gray('\n\nShutting down monitor...'));
  socket.disconnect();
  process.exit(0);
});

// Periodic connection check
setInterval(() => {
  if (stats.lastLog && Date.now() - stats.lastLog > 10000) {
    console.log(chalk.gray('\nNo data received for 10 seconds...'));
    console.log(chalk.gray('Make sure the game is running.'));
  }
}, 10000);