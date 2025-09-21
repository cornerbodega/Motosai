export class MemoryMonitor {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.statsElement = null;
    this.updateInterval = 1000; // Update every second
    this.lastUpdate = 0;

    // Track resource counts over time to detect leaks
    this.history = {
      geometries: [],
      textures: [],
      materials: [],
      meshes: [],
      memory: []
    };
    this.maxHistoryLength = 60; // Keep 1 minute of history

    this.createStatsDisplay();
  }

  createStatsDisplay() {
    this.statsElement = document.createElement('div');
    this.statsElement.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: #0f0;
      font-family: monospace;
      font-size: 12px;
      padding: 10px;
      border: 1px solid #0f0;
      z-index: 10000;
      min-width: 250px;
    `;
    document.body.appendChild(this.statsElement);
  }

  update() {
    const now = performance.now();
    if (now - this.lastUpdate < this.updateInterval) return;
    this.lastUpdate = now;

    const info = this.renderer.info;
    const memory = info.memory;
    const programs = info.programs;

    // Count scene objects
    let meshCount = 0;
    let lightCount = 0;
    this.scene.traverse((obj) => {
      if (obj.isMesh) meshCount++;
      if (obj.isLight) lightCount++;
    });

    // Track history
    this.addToHistory('geometries', memory.geometries);
    this.addToHistory('textures', memory.textures);
    this.addToHistory('materials', memory.geometries || 0); // materials not directly available, use geometries as proxy
    this.addToHistory('meshes', meshCount);

    // Calculate trends
    const geoTrend = this.calculateTrend('geometries');
    const texTrend = this.calculateTrend('textures');
    const meshTrend = this.calculateTrend('meshes');

    // Estimate memory usage (rough approximation)
    const estimatedMemoryMB = this.estimateMemoryUsage(memory);

    // Check for leaks
    const leakWarning = this.detectLeaks();

    // Update display
    this.statsElement.innerHTML = `
      <div style="color: #0f0; font-weight: bold; margin-bottom: 5px;">MEMORY STATS</div>
      <div>Geometries: ${memory.geometries} ${geoTrend}</div>
      <div>Textures: ${memory.textures} ${texTrend}</div>
      <div>Programs: ${programs ? programs.length : 'N/A'}</div>
      <div>Meshes: ${meshCount} ${meshTrend}</div>
      <div>Lights: ${lightCount}</div>
      <div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid #0f0;">
        <div>Est. VRAM: ~${estimatedMemoryMB.toFixed(1)} MB</div>
        <div>Render Calls: ${info.render.calls}</div>
        <div>Triangles: ${info.render.triangles}</div>
      </div>
      ${leakWarning ? `<div style="color: #f00; margin-top: 5px;">⚠️ LEAK: ${leakWarning}</div>` : ''}
    `;
  }

  addToHistory(key, value) {
    if (!this.history[key]) this.history[key] = [];
    this.history[key].push(value);
    if (this.history[key].length > this.maxHistoryLength) {
      this.history[key].shift();
    }
  }

  calculateTrend(key) {
    const history = this.history[key];
    if (history.length < 2) return '';

    const recent = history.slice(-10);
    const older = history.slice(-20, -10);

    if (older.length === 0) return '';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const diff = recentAvg - olderAvg;
    if (Math.abs(diff) < 0.5) return '→';
    return diff > 0 ? `↑${Math.round(diff)}` : `↓${Math.round(-diff)}`;
  }

  detectLeaks() {
    // Check if any resource is continuously growing
    const checks = ['geometries', 'textures', 'meshes'];

    for (const key of checks) {
      const history = this.history[key];
      if (history.length < 30) continue;

      // Check last 30 seconds
      const recent = history.slice(-30);
      const start = recent[0];
      const end = recent[recent.length - 1];

      // If grown by more than 20% and consistently increasing
      if (end > start * 1.2) {
        const increasing = recent.every((val, i) =>
          i === 0 || val >= recent[i - 1] - 1
        );

        if (increasing) {
          return `${key} growing: ${start} → ${end}`;
        }
      }
    }

    return null;
  }

  estimateMemoryUsage(memory) {
    // Rough estimates in MB
    const geoMemory = memory.geometries * 0.5; // ~500KB per geometry average
    const texMemory = memory.textures * 2.0;   // ~2MB per texture average
    return geoMemory + texMemory;
  }

  dispose() {
    if (this.statsElement && this.statsElement.parentNode) {
      this.statsElement.parentNode.removeChild(this.statsElement);
    }
    this.statsElement = null;
    this.history = null;
  }
}