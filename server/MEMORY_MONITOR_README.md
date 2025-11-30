# Memory Monitor Instructions

## Overview
The memory monitor is a real-time tool for tracking Three.js memory leaks in the Motosai game. It displays resource counts, performance metrics, and alerts when memory leaks are detected.

## Prerequisites
- Server must be running (`npm start` in the server directory)
- Game must be running in a browser at http://localhost:8080

## How to Run the Memory Monitor

### Option 1: NPM Script (Recommended)
```bash
cd /Users/fromastermarv/Documents/Codeyard/Motosai/server
npm run monitor
```

### Option 2: Direct Node Command
```bash
cd /Users/fromastermarv/Documents/Codeyard/Motosai/server
node monitor-simple.js
```

## What the Monitor Shows

### Performance Metrics
- **FPS**: Current frames per second
- **Frame**: Frame counter
- **Draw Calls**: Number of WebGL draw calls
- **Triangles**: Total triangles being rendered

### Memory Stats
- **JS Heap**: JavaScript heap usage (current/max)
- **GPU Est**: Estimated GPU memory usage

### Resource Tracking
- **Geometries**: THREE.BufferGeometry instances
- **Materials**: THREE.Material instances (THIS IS THE KEY METRIC!)
- **Textures**: THREE.Texture instances
- **Meshes**: THREE.Mesh instances
- **Undisposed**: Total resources not properly disposed

### Scene Information
- **Total Objects**: All objects in the scene
- **Unique Geometries/Materials/Textures**: Should match actual counts when properly pooled

## Understanding the Output

### Healthy Game State
```
RESOURCES
├─ Geometries: 800-1000
├─ Materials: 100-200  ✅ (Should stay stable)
├─ Textures: 1-10
├─ Meshes: 1000-1500
└─ Undisposed: < 2000
```

### Memory Leak State
```
RESOURCES
├─ Geometries: 800-1000
├─ Materials: 50000+  🚨 (CRITICAL LEAK!)
├─ Textures: 1-10
├─ Meshes: 1000-1500
└─ Undisposed: 100000+ 🚨
```

## Key Indicators of Memory Leaks

1. **Materials Growing Rapidly**: If materials count increases by 500+ per second, there's a leak
2. **Unique vs Total Mismatch**: If you have 50,000 materials but only 100 unique, materials aren't being reused
3. **Undisposed Growing**: Resources aren't being properly cleaned up
4. **JS Heap Climbing**: Memory usage continuously increasing

## Alerts

The monitor will show `🚨 CRITICAL MEMORY ALERT 🚨` when it detects:
- Materials growth > 150%
- Undisposed resources > 10,000
- JS Heap growth > 50%

## Files Involved

### Monitor Files
- `/server/monitor-simple.js` - Simple CLI monitor (recommended)
- `/server/memory-monitor.js` - Advanced monitor with UI (may have issues)
- `/server/package.json` - Contains the `npm run monitor` script

### Supporting Files
- `/client/src/utils/MemoryProfiler.js` - Client-side profiler that sends data
- `/server/server.js` - WebSocket handlers for memory logging
- `/server/memory-logs/` - Directory where logs are saved

## Troubleshooting

### Monitor shows all zeros
- Make sure the game is running
- Refresh the game page
- Check that WebSocket connection is established on port 8080

### Monitor crashes
- Use `monitor-simple.js` instead of `memory-monitor.js`
- Check for port conflicts on 8080

### Old session data showing
- The monitor may show data from a previous game session
- Refresh the game page to start a new session
- Look for the Session ID to change

## How Memory Profiling Works

1. **Client Side**: MemoryProfiler.js hooks into Three.js to track all resource creation/disposal
2. **WebSocket**: Real-time data sent to server via Socket.io
3. **Server Side**: Logs data to files and broadcasts to monitors
4. **Monitor**: Displays the data in real-time CLI interface

## Expected Behavior After Fixes

With the memory leak fixes implemented:
- Materials should stabilize around 100-200
- No critical alerts after initial game load
- Undisposed resources should remain proportional to active game objects
- Memory usage should plateau, not continuously grow

## Commands to Run Together

For complete memory leak investigation, run these in separate terminals:

```bash
# Terminal 1: Start the server
cd /Users/fromastermarv/Documents/Codeyard/Motosai/server
npm start

# Terminal 2: Start the monitor
cd /Users/fromastermarv/Documents/Codeyard/Motosai/server
npm run monitor

# Terminal 3: (Optional) Watch the log files
cd /Users/fromastermarv/Documents/Codeyard/Motosai/server
tail -f memory-logs/game-*.json
```

Then open http://localhost:8080 in your browser to start the game.

## Notes for Future Agents

- The monitor tracks the OLD game instance until the browser is refreshed
- Materials count is the most important metric for detecting leaks
- If you see 50,000+ materials, there's definitely a leak
- After implementing fixes, you must reload the game for them to take effect
- The monitor will show alternating zero values if the game connection is unstable