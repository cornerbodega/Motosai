#!/usr/bin/env node

import { io } from 'socket.io-client';
import chalk from 'chalk';
import blessed from 'blessed';
import contrib from 'blessed-contrib';

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:8080';
const SESSION_ID = process.env.SESSION_ID || 'monitor-session';

// Connect to server
const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling']
});

// Create blessed screen
const screen = blessed.screen({
  smartCSR: true,
  title: 'Motosai Memory Monitor'
});

// Create grid layout
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// Memory usage line chart
const memoryChart = grid.set(0, 0, 4, 8, contrib.line, {
  style: {
    line: 'yellow',
    text: 'green',
    baseline: 'black'
  },
  xLabelPadding: 3,
  xPadding: 5,
  showLegend: true,
  wholeNumbersOnly: false,
  label: 'Memory Usage (MB)'
});

// Resource count chart
const resourceChart = grid.set(4, 0, 4, 8, contrib.line, {
  style: {
    line: 'cyan',
    text: 'green',
    baseline: 'black'
  },
  xLabelPadding: 3,
  xPadding: 5,
  showLegend: true,
  label: 'Resource Counts'
});

// Performance metrics
const perfTable = grid.set(8, 0, 4, 4, contrib.table, {
  keys: true,
  fg: 'white',
  selectedFg: 'white',
  selectedBg: 'blue',
  interactive: false,
  label: 'Performance Metrics',
  width: '30%',
  height: '30%',
  border: { type: 'line', fg: 'cyan' },
  columnSpacing: 3,
  columnWidth: [20, 15]
});

// Leak warnings box
const leakBox = grid.set(0, 8, 6, 4, contrib.log, {
  fg: 'green',
  selectedFg: 'green',
  label: 'Leak Detection',
  border: { type: 'line', fg: 'red' }
});

// Active sessions list
const sessionsList = grid.set(6, 8, 3, 4, contrib.table, {
  keys: true,
  fg: 'white',
  selectedFg: 'white',
  selectedBg: 'blue',
  interactive: false,
  label: 'Active Sessions',
  width: '30%',
  height: '30%',
  border: { type: 'line', fg: 'cyan' },
  columnSpacing: 3,
  columnWidth: [15, 10, 10]
});

// Recent logs
const logBox = grid.set(9, 8, 3, 4, contrib.log, {
  fg: 'green',
  selectedFg: 'green',
  label: 'Recent Logs',
  border: { type: 'line', fg: 'cyan' }
});

// Stats box
const statsBox = grid.set(8, 4, 4, 4, blessed.box, {
  label: 'Statistics',
  border: { type: 'line', fg: 'cyan' },
  content: '',
  tags: true,
  style: {
    fg: 'white'
  }
});

// Data storage
const memoryData = {
  jsHeap: { x: [], y: [] },
  gpu: { x: [], y: [] }
};

const resourceData = {
  geometries: { x: [], y: [] },
  materials: { x: [], y: [] },
  textures: { x: [], y: [] },
  meshes: { x: [], y: [] }
};

const sessions = new Map();
let dataPoints = 0;
const maxDataPoints = 60; // Show last 60 seconds

// Track statistics
const stats = {
  totalLogs: 0,
  totalLeaks: 0,
  criticalAlerts: 0,
  avgFPS: 0,
  avgMemory: 0,
  peakMemory: 0,
  startTime: Date.now()
};

// Socket event handlers
socket.on('connect', () => {
  logBox.log(chalk.green('✓ Connected to server'));

  // Join monitoring room
  socket.emit('join-monitor', { sessionId: SESSION_ID });
});

socket.on('disconnect', () => {
  logBox.log(chalk.red('✗ Disconnected from server'));
});

// Handle memory log data
socket.on('memory-log-broadcast', (data) => {
  const { playerId, sessionId, logEntry } = data;

  stats.totalLogs++;

  // Update session tracking
  if (!sessions.has(playerId)) {
    sessions.set(playerId, {
      playerId,
      sessionId,
      lastUpdate: Date.now(),
      fps: 0,
      memory: 0,
      resources: {}
    });
  }

  const session = sessions.get(playerId);
  session.lastUpdate = Date.now();

  // Process log entry
  if (logEntry) {
    const timeLabel = new Date().toLocaleTimeString();
    dataPoints++;

    // Update memory chart
    if (logEntry.memory) {
      if (logEntry.memory.jsHeap) {
        const memMB = parseFloat(logEntry.memory.jsHeap.used.replace('MB', ''));
        memoryData.jsHeap.x.push(timeLabel);
        memoryData.jsHeap.y.push(memMB);

        session.memory = memMB;
        stats.avgMemory = (stats.avgMemory * (stats.totalLogs - 1) + memMB) / stats.totalLogs;
        stats.peakMemory = Math.max(stats.peakMemory, memMB);
      }

      if (logEntry.memory.gpu) {
        const gpuMB = parseFloat(logEntry.memory.gpu.replace('MB', ''));
        memoryData.gpu.x.push(timeLabel);
        memoryData.gpu.y.push(gpuMB);
      }
    }

    // Update resource chart
    if (logEntry.resources) {
      resourceData.geometries.x.push(timeLabel);
      resourceData.geometries.y.push(logEntry.resources.geometries || 0);

      resourceData.materials.x.push(timeLabel);
      resourceData.materials.y.push(logEntry.resources.materials || 0);

      resourceData.textures.x.push(timeLabel);
      resourceData.textures.y.push(logEntry.resources.textures || 0);

      resourceData.meshes.x.push(timeLabel);
      resourceData.meshes.y.push(logEntry.resources.meshes || 0);

      session.resources = logEntry.resources;
    }

    // Update performance metrics
    if (logEntry.fps) {
      session.fps = parseFloat(logEntry.fps);
      stats.avgFPS = (stats.avgFPS * (stats.totalLogs - 1) + session.fps) / stats.totalLogs;
    }

    // Check for leaks
    if (logEntry.leaks && logEntry.leaks.length > 0) {
      stats.totalLeaks++;
      logEntry.leaks.forEach(leak => {
        const severity = leak.severity === 'critical' ? chalk.red('CRITICAL') : chalk.yellow('WARNING');
        leakBox.log(`${severity} [${playerId.substring(0, 8)}] ${leak.type}: ${leak.growth || leak.count}`);

        if (leak.severity === 'critical') {
          stats.criticalAlerts++;
        }
      });
    }

    // Trim data to max points
    if (dataPoints > maxDataPoints) {
      Object.values(memoryData).forEach(data => {
        data.x.shift();
        data.y.shift();
      });
      Object.values(resourceData).forEach(data => {
        data.x.shift();
        data.y.shift();
      });
    }

    // Update charts
    updateCharts();
    updateTables();
    updateStats();
  }
});

// Handle memory alerts
socket.on('memory-alert-broadcast', (data) => {
  const { playerId, alert } = data;
  stats.criticalAlerts++;

  leakBox.log(chalk.red(`🚨 ALERT [${playerId.substring(0, 8)}]`));
  leakBox.log(chalk.red(JSON.stringify(alert, null, 2)));
});

// Handle memory snapshots
socket.on('memory-snapshot-broadcast', (data) => {
  const { playerId, filename } = data;
  logBox.log(chalk.cyan(`📸 Snapshot saved: ${filename}`));
});

function updateCharts() {
  // Update memory chart
  memoryChart.setData([
    {
      title: 'JS Heap',
      x: memoryData.jsHeap.x.slice(-maxDataPoints),
      y: memoryData.jsHeap.y.slice(-maxDataPoints),
      style: { line: 'yellow' }
    },
    {
      title: 'GPU Est',
      x: memoryData.gpu.x.slice(-maxDataPoints),
      y: memoryData.gpu.y.slice(-maxDataPoints),
      style: { line: 'magenta' }
    }
  ]);

  // Update resource chart
  resourceChart.setData([
    {
      title: 'Geometries',
      x: resourceData.geometries.x.slice(-maxDataPoints),
      y: resourceData.geometries.y.slice(-maxDataPoints),
      style: { line: 'cyan' }
    },
    {
      title: 'Materials',
      x: resourceData.materials.x.slice(-maxDataPoints),
      y: resourceData.materials.y.slice(-maxDataPoints),
      style: { line: 'green' }
    },
    {
      title: 'Textures',
      x: resourceData.textures.x.slice(-maxDataPoints),
      y: resourceData.textures.y.slice(-maxDataPoints),
      style: { line: 'red' }
    },
    {
      title: 'Meshes',
      x: resourceData.meshes.x.slice(-maxDataPoints),
      y: resourceData.meshes.y.slice(-maxDataPoints),
      style: { line: 'blue' }
    }
  ]);
}

function updateTables() {
  // Update performance table
  const perfData = [];
  sessions.forEach(session => {
    perfData.push([
      session.playerId.substring(0, 12),
      `${session.fps.toFixed(1)} FPS`,
      `${session.memory.toFixed(1)} MB`
    ]);
  });

  perfTable.setData({
    headers: ['Player', 'FPS', 'Memory'],
    data: perfData
  });

  // Update sessions list
  const sessionData = [];
  sessions.forEach(session => {
    const age = Math.floor((Date.now() - session.lastUpdate) / 1000);
    sessionData.push([
      session.playerId.substring(0, 12),
      session.sessionId.substring(0, 10),
      `${age}s ago`
    ]);
  });

  sessionsList.setData({
    headers: ['Player', 'Session', 'Last Update'],
    data: sessionData
  });
}

function updateStats() {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;

  const content = `
{bold}Uptime:{/bold} ${hours}h ${minutes}m ${seconds}s
{bold}Total Logs:{/bold} ${stats.totalLogs}
{bold}Active Sessions:{/bold} ${sessions.size}

{yellow-fg}{bold}Performance{/bold}{/}
{bold}Avg FPS:{/bold} ${stats.avgFPS.toFixed(1)}
{bold}Avg Memory:{/bold} ${stats.avgMemory.toFixed(1)} MB
{bold}Peak Memory:{/bold} ${stats.peakMemory.toFixed(1)} MB

{red-fg}{bold}Issues{/bold}{/}
{bold}Leak Detections:{/bold} ${stats.totalLeaks}
{bold}Critical Alerts:{/bold} ${stats.criticalAlerts}

Press {bold}q{/bold} or {bold}Ctrl+C{/bold} to exit
Press {bold}c{/bold} to clear leak warnings
Press {bold}s{/bold} to save snapshot
`;

  statsBox.setContent(content);
}

// Keyboard controls
screen.key(['q', 'C-c'], () => {
  socket.disconnect();
  process.exit(0);
});

screen.key(['c'], () => {
  leakBox.setContent('');
  stats.totalLeaks = 0;
  stats.criticalAlerts = 0;
  screen.render();
});

screen.key(['s'], () => {
  // Request snapshot from all active sessions
  socket.emit('request-snapshot', { sessionId: SESSION_ID });
  logBox.log(chalk.cyan('📸 Snapshot requested'));
});

// Clean up old sessions periodically
setInterval(() => {
  const now = Date.now();
  const timeout = 30000; // 30 seconds

  sessions.forEach((session, playerId) => {
    if (now - session.lastUpdate > timeout) {
      sessions.delete(playerId);
      logBox.log(chalk.gray(`Session timeout: ${playerId.substring(0, 8)}`));
    }
  });

  screen.render();
}, 5000);

// Initial render
updateStats();
screen.render();

// Update screen every second
setInterval(() => {
  screen.render();
}, 1000);

console.log(chalk.green(`
╔════════════════════════════════════════╗
║   Motosai Memory Monitor Started       ║
║   Connected to: ${SERVER_URL}          ║
║   Session: ${SESSION_ID}               ║
╚════════════════════════════════════════╝
`));