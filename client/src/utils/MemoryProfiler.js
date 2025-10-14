import * as THREE from 'three';
import io from 'socket.io-client';

export class MemoryProfiler {
  constructor(renderer, scene, camera, config = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // Configuration
    this.config = {
      enableServerLogging: config.enableServerLogging !== false,
      serverUrl: config.serverUrl || (window.location.hostname === 'localhost'
        ? 'http://localhost:3001'
        : 'https://motosai-websocket-9z3mknbcfa-uw.a.run.app'),
      sessionId: config.sessionId || `session-${Date.now()}`,
      playerId: config.playerId || `player-${Math.random().toString(36).substring(7)}`,
      logInterval: config.logInterval || 1000, // Send logs every second
      snapshotInterval: config.snapshotInterval || 30000, // Send snapshots every 30 seconds
      ...config
    };

    // WebSocket connection for real-time logging
    this.socket = null;
    this.isConnected = false;
    this.logBuffer = [];
    this.maxBufferSize = 100;

    // Comprehensive tracking objects
    this.resources = {
      geometries: new Map(),
      materials: new Map(),
      textures: new Map(),
      renderTargets: new Map(),
      buffers: new Map(),
      programs: new Map(),
      meshes: new Map(),
      lights: new Map(),
      objects3D: new Map(),
      animations: new Map(),
      audioBuffers: new Map(),
      fonts: new Map(),
      shaders: new Map()
    };

    // Memory snapshots for leak detection
    this.snapshots = [];
    this.maxSnapshots = 100;
    this.snapshotInterval = 5000; // Take snapshot every 5 seconds
    this.lastSnapshotTime = 0;

    // Detailed memory metrics
    this.metrics = {
      jsHeapUsed: 0,
      jsHeapTotal: 0,
      gpuMemoryEstimate: 0,
      textureMemory: 0,
      geometryMemory: 0,
      bufferMemory: 0,
      programMemory: 0,
      renderTargetMemory: 0,
      totalThreeJSObjects: 0,
      disposalQueue: [],
      undisposedResources: new Set(),
      leakSuspects: [],
      eventListeners: new Map(),
      animationFrameCallbacks: [],
      timeouts: new Set(),
      intervals: new Set()
    };

    // Allocation tracking
    this.allocationStack = [];
    this.disposalLog = [];
    this.maxLogSize = 1000;

    // Performance metrics
    this.frameMetrics = {
      drawCalls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
      frameTime: 0,
      renderTime: 0,
      updateTime: 0
    };

    // Leak detection thresholds
    this.leakThresholds = {
      geometry: 500,
      material: 500,
      texture: 100,
      mesh: 1000,
      growthRate: 1.2, // 20% growth considered suspicious
      checkInterval: 30000 // Check every 30 seconds
    };

    // Start monitoring
    this.startTime = performance.now();
    this.frameCount = 0;
    this.isMonitoring = true;

    // Inject tracking into Three.js constructors
    this.injectTracking();

    // Create monitoring UI
    this.createAdvancedUI();

    // Connect to WebSocket server for real-time logging
    if (this.config.enableServerLogging) {
      this.connectToServer();
    }

    // Start automatic logging
    this.startLogging();

    console.log('%c🔍 Advanced Memory Profiler Initialized', 'color: #00ff00; font-weight: bold');
    console.log('Access profiler via: window.memoryProfiler');
    window.memoryProfiler = this;
  }

  injectTracking() {
    // Track geometry creation - use prototype wrapping instead
    const self = this;

    // Store original constructors
    const originals = {
      BufferGeometry: THREE.BufferGeometry,
      MeshBasicMaterial: THREE.MeshBasicMaterial,
      MeshStandardMaterial: THREE.MeshStandardMaterial,
      MeshPhongMaterial: THREE.MeshPhongMaterial,
      Texture: THREE.Texture,
      DataTexture: THREE.DataTexture,
      WebGLRenderTarget: THREE.WebGLRenderTarget
    };

    // Wrap BufferGeometry
    if (originals.BufferGeometry) {
      const originalDispose = originals.BufferGeometry.prototype.dispose;
      originals.BufferGeometry.prototype.dispose = function() {
        self.trackDisposal('geometry', this.uuid, 'BufferGeometry.dispose()');
        return originalDispose.call(this);
      };

      // Track on first use
      const originalSetAttribute = originals.BufferGeometry.prototype.setAttribute;
      originals.BufferGeometry.prototype.setAttribute = function(name, attribute) {
        if (!this._memoryTracked) {
          this._memoryTracked = true;
          self.trackAllocation('geometry', this.uuid, this, 'BufferGeometry.setAttribute');
        }
        return originalSetAttribute.call(this, name, attribute);
      };
    }

    // Track material creation through prototype
    const materialTypes = [
      'MeshBasicMaterial', 'MeshStandardMaterial', 'MeshPhongMaterial',
      'MeshLambertMaterial', 'MeshPhysicalMaterial', 'ShaderMaterial',
      'RawShaderMaterial', 'LineBasicMaterial', 'LineDashedMaterial',
      'PointsMaterial', 'SpriteMaterial'
    ];

    materialTypes.forEach(type => {
      if (THREE[type] && THREE[type].prototype) {
        const originalDispose = THREE[type].prototype.dispose;
        THREE[type].prototype.dispose = function() {
          self.trackDisposal('material', this.uuid, `${type}.dispose()`);
          return originalDispose.call(this);
        };

        // Track when material is first used
        const originalSetValues = THREE[type].prototype.setValues;
        if (originalSetValues) {
          THREE[type].prototype.setValues = function(values) {
            if (!this._memoryTracked) {
              this._memoryTracked = true;
              self.trackAllocation('material', this.uuid, this, type);
            }
            return originalSetValues.call(this, values);
          };
        }
      }
    });

    // Track texture creation through prototype
    const textureTypes = [
      'Texture', 'DataTexture', 'Data3DTexture', 'CompressedTexture',
      'CubeTexture', 'CanvasTexture', 'VideoTexture'
    ];

    textureTypes.forEach(type => {
      if (THREE[type] && THREE[type].prototype) {
        const originalDispose = THREE[type].prototype.dispose;
        THREE[type].prototype.dispose = function() {
          self.trackDisposal('texture', this.uuid, `${type}.dispose()`);
          return originalDispose.call(this);
        };

        // Track when texture is first used
        const originalNeedsUpdate = Object.getOwnPropertyDescriptor(THREE[type].prototype, 'needsUpdate');
        if (originalNeedsUpdate && originalNeedsUpdate.configurable) {
          try {
            Object.defineProperty(THREE[type].prototype, 'needsUpdate', {
              get: originalNeedsUpdate.get,
              set: function(value) {
                if (!this._memoryTracked && value) {
                  this._memoryTracked = true;
                  self.trackAllocation('texture', this.uuid, this, type);
                }
                return originalNeedsUpdate.set.call(this, value);
              },
              configurable: true
            });
          } catch (e) {
            console.warn(`Could not patch ${type}.needsUpdate (Safari):`, e.message);
          }
        }
      }
    });

    // Track WebGLRenderTarget through prototype
    if (THREE.WebGLRenderTarget && THREE.WebGLRenderTarget.prototype) {
      const originalDispose = THREE.WebGLRenderTarget.prototype.dispose;
      THREE.WebGLRenderTarget.prototype.dispose = function() {
        self.trackDisposal('renderTarget', this.uuid, 'WebGLRenderTarget.dispose()');
        return originalDispose.call(this);
      };

      const originalSetSize = THREE.WebGLRenderTarget.prototype.setSize;
      THREE.WebGLRenderTarget.prototype.setSize = function(width, height) {
        if (!this._memoryTracked) {
          this._memoryTracked = true;
          self.trackAllocation('renderTarget', this.uuid, this, 'WebGLRenderTarget');
        }
        return originalSetSize.call(this, width, height);
      };
    }

    console.log('%c✅ Memory tracking injected into Three.js', 'color: #00ff00');
  }

  trackAllocation(type, uuid, object, stack) {
    const timestamp = performance.now();
    const allocation = {
      uuid,
      type,
      object: new WeakRef(object),
      stack,
      timestamp,
      frame: this.frameCount,
      memoryEstimate: this.estimateObjectMemory(object, type)
    };

    this.allocationStack.push(allocation);
    if (this.allocationStack.length > this.maxLogSize) {
      this.allocationStack.shift();
    }

    // Track in resources map
    const resourceMap = this.resources[type + 's'];
    if (resourceMap) {
      resourceMap.set(uuid, allocation);
    }

    // Add to undisposed set
    this.metrics.undisposedResources.add(uuid);

    console.log(`%c+ Allocated ${type}: ${uuid}`, 'color: #ffff00', {
      memory: allocation.memoryEstimate,
      frame: this.frameCount
    });
  }

  trackDisposal(type, uuid, originalStack) {
    const timestamp = performance.now();
    const disposal = {
      uuid,
      type,
      timestamp,
      frame: this.frameCount,
      originalStack
    };

    this.disposalLog.push(disposal);
    if (this.disposalLog.length > this.maxLogSize) {
      this.disposalLog.shift();
    }

    // Remove from resources map
    const resourceMap = this.resources[type + 's'];
    if (resourceMap && resourceMap.has(uuid)) {
      resourceMap.delete(uuid);
    }

    // Remove from undisposed set
    this.metrics.undisposedResources.delete(uuid);

    console.log(`%c- Disposed ${type}: ${uuid}`, 'color: #00ff00', {
      frame: this.frameCount
    });
  }

  estimateObjectMemory(object, type) {
    let bytes = 0;

    try {
      switch (type) {
        case 'geometry':
          if (object.attributes) {
            for (const key in object.attributes) {
              const attribute = object.attributes[key];
              if (attribute && attribute.array) {
                bytes += attribute.array.byteLength || 0;
              }
            }
          }
          if (object.index && object.index.array) {
            bytes += object.index.array.byteLength || 0;
          }
          break;

        case 'texture':
          if (object.image) {
            const img = object.image;
            if (img.data && img.data.byteLength) {
              bytes = img.data.byteLength;
            } else if (img.width && img.height) {
              // Estimate based on dimensions and format
              const pixelSize = object.format === THREE.RGBAFormat ? 4 : 3;
              bytes = img.width * img.height * pixelSize;
            }
          }
          break;

        case 'material':
          // Materials themselves don't use much memory, but track their maps
          const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap',
                       'aoMap', 'emissiveMap', 'bumpMap', 'displacementMap',
                       'alphaMap', 'envMap'];
          maps.forEach(mapName => {
            if (object[mapName]) {
              bytes += 1024; // Small overhead for reference
            }
          });
          break;

        case 'renderTarget':
          if (object.width && object.height) {
            // 4 bytes per pixel for RGBA
            bytes = object.width * object.height * 4;
            if (object.depthBuffer) bytes += object.width * object.height * 4;
            if (object.stencilBuffer) bytes += object.width * object.height;
          }
          break;
      }
    } catch (e) {
      console.warn('Error estimating memory for', type, e);
    }

    return bytes;
  }

  captureSnapshot() {
    const now = performance.now();
    if (now - this.lastSnapshotTime < this.snapshotInterval) return;

    this.lastSnapshotTime = now;

    const snapshot = {
      timestamp: now,
      frame: this.frameCount,
      jsHeap: performance.memory ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      } : null,
      resources: {
        geometries: this.resources.geometries.size,
        materials: this.resources.materials.size,
        textures: this.resources.textures.size,
        renderTargets: this.resources.renderTargets.size,
        meshes: this.resources.meshes.size,
        totalUndisposed: this.metrics.undisposedResources.size
      },
      renderer: this.renderer.info.memory,
      sceneStats: this.analyzeScene(),
      gpuMemoryEstimate: this.calculateGPUMemory()
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    // Detect leaks
    this.detectMemoryLeaks();

    return snapshot;
  }

  analyzeScene() {
    const stats = {
      totalObjects: 0,
      meshes: 0,
      lights: 0,
      cameras: 0,
      groups: 0,
      sprites: 0,
      lines: 0,
      points: 0,
      helpers: 0,
      materials: new Set(),
      geometries: new Set(),
      textures: new Set()
    };

    this.scene.traverse((object) => {
      stats.totalObjects++;

      if (object.isMesh) {
        stats.meshes++;
        if (object.geometry) stats.geometries.add(object.geometry.uuid);
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(m => stats.materials.add(m.uuid));
          } else {
            stats.materials.add(object.material.uuid);
          }
        }
      } else if (object.isLight) {
        stats.lights++;
      } else if (object.isCamera) {
        stats.cameras++;
      } else if (object.isGroup) {
        stats.groups++;
      } else if (object.isSprite) {
        stats.sprites++;
      } else if (object.isLine) {
        stats.lines++;
      } else if (object.isPoints) {
        stats.points++;
      } else if (object.isHelper) {
        stats.helpers++;
      }

      // Check for textures in materials
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(mat => {
          const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap',
                       'aoMap', 'emissiveMap', 'bumpMap', 'displacementMap',
                       'alphaMap', 'envMap'];
          maps.forEach(mapName => {
            if (mat[mapName]) stats.textures.add(mat[mapName].uuid);
          });
        });
      }
    });

    return {
      ...stats,
      uniqueMaterials: stats.materials.size,
      uniqueGeometries: stats.geometries.size,
      uniqueTextures: stats.textures.size
    };
  }

  calculateGPUMemory() {
    let totalBytes = 0;

    // Calculate texture memory
    this.resources.textures.forEach(allocation => {
      totalBytes += allocation.memoryEstimate || 0;
    });

    // Calculate geometry memory
    this.resources.geometries.forEach(allocation => {
      totalBytes += allocation.memoryEstimate || 0;
    });

    // Calculate render target memory
    this.resources.renderTargets.forEach(allocation => {
      totalBytes += allocation.memoryEstimate || 0;
    });

    return totalBytes;
  }

  detectMemoryLeaks() {
    const leaks = [];

    if (this.snapshots.length < 10) return leaks;

    // Check for continuous growth
    const recentSnapshots = this.snapshots.slice(-10);
    const oldSnapshot = recentSnapshots[0];
    const newSnapshot = recentSnapshots[recentSnapshots.length - 1];

    // Check each resource type
    for (const resourceType in newSnapshot.resources) {
      const oldCount = oldSnapshot.resources[resourceType];
      const newCount = newSnapshot.resources[resourceType];

      if (newCount > oldCount * this.leakThresholds.growthRate) {
        leaks.push({
          type: resourceType,
          oldCount,
          newCount,
          growth: ((newCount - oldCount) / oldCount * 100).toFixed(1) + '%',
          severity: newCount > oldCount * 2 ? 'critical' : 'warning'
        });
      }
    }

    // Check JS heap
    if (newSnapshot.jsHeap && oldSnapshot.jsHeap) {
      const heapGrowth = newSnapshot.jsHeap.used / oldSnapshot.jsHeap.used;
      if (heapGrowth > this.leakThresholds.growthRate) {
        leaks.push({
          type: 'jsHeap',
          oldSize: (oldSnapshot.jsHeap.used / 1024 / 1024).toFixed(1) + 'MB',
          newSize: (newSnapshot.jsHeap.used / 1024 / 1024).toFixed(1) + 'MB',
          growth: ((heapGrowth - 1) * 100).toFixed(1) + '%',
          severity: heapGrowth > 2 ? 'critical' : 'warning'
        });
      }
    }

    // Check for undisposed resources
    const undisposedCount = this.metrics.undisposedResources.size;
    if (undisposedCount > 1000) {
      leaks.push({
        type: 'undisposedResources',
        count: undisposedCount,
        severity: undisposedCount > 5000 ? 'critical' : 'warning',
        uuids: Array.from(this.metrics.undisposedResources).slice(-10)
      });
    }

    if (leaks.length > 0) {
      console.warn('%c⚠️ MEMORY LEAKS DETECTED', 'color: #ff0000; font-weight: bold', leaks);
      this.metrics.leakSuspects = leaks;
    }

    return leaks;
  }

  createAdvancedUI() {
    // Main container
    this.ui = document.createElement('div');
    this.ui.id = 'memory-profiler-ui';
    this.ui.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 400px;
      max-height: 80vh;
      background: rgba(0, 0, 0, 0.95);
      border: 2px solid #00ff00;
      color: #00ff00;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      padding: 10px;
      overflow-y: auto;
      z-index: 100000;
      box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
    `;

    // Header
    const header = document.createElement('div');
    header.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h3 style="margin: 0; color: #00ff00; text-shadow: 0 0 5px #00ff00;">
          🔍 MEMORY PROFILER
        </h3>
        <div>
          <button id="prof-minimize" style="background: #00ff00; color: black; border: none; padding: 2px 5px; cursor: pointer; margin-right: 5px;">_</button>
          <button id="prof-snapshot" style="background: #00ff00; color: black; border: none; padding: 2px 5px; cursor: pointer; margin-right: 5px;">📸</button>
          <button id="prof-export" style="background: #00ff00; color: black; border: none; padding: 2px 5px; cursor: pointer;">💾</button>
        </div>
      </div>
    `;
    this.ui.appendChild(header);

    // Stats container
    this.statsContainer = document.createElement('div');
    this.statsContainer.id = 'prof-stats';
    this.ui.appendChild(this.statsContainer);

    // Graph container
    this.graphContainer = document.createElement('canvas');
    this.graphContainer.width = 380;
    this.graphContainer.height = 100;
    this.graphContainer.style.cssText = 'border: 1px solid #00ff00; margin-top: 10px;';
    this.ui.appendChild(this.graphContainer);
    this.graphContext = this.graphContainer.getContext('2d');

    // Leak warnings container
    this.leakContainer = document.createElement('div');
    this.leakContainer.id = 'prof-leaks';
    this.leakContainer.style.cssText = 'margin-top: 10px; padding: 5px; border: 1px solid #ff0000; display: none;';
    this.ui.appendChild(this.leakContainer);

    // Details container
    this.detailsContainer = document.createElement('div');
    this.detailsContainer.id = 'prof-details';
    this.detailsContainer.style.cssText = 'margin-top: 10px; max-height: 200px; overflow-y: auto;';
    this.ui.appendChild(this.detailsContainer);

    document.body.appendChild(this.ui);

    // Add event listeners
    document.getElementById('prof-minimize').addEventListener('click', () => {
      const isMinimized = this.statsContainer.style.display === 'none';
      this.statsContainer.style.display = isMinimized ? 'block' : 'none';
      this.graphContainer.style.display = isMinimized ? 'block' : 'none';
      this.leakContainer.style.display = isMinimized && this.metrics.leakSuspects.length > 0 ? 'block' : 'none';
      this.detailsContainer.style.display = isMinimized ? 'block' : 'none';
    });

    document.getElementById('prof-snapshot').addEventListener('click', () => {
      const snapshot = this.captureSnapshot();
      console.log('Memory Snapshot:', snapshot);

      // Send to server
      this.sendSnapshotToServer(snapshot);

      alert('Snapshot saved to console and sent to server');
    });

    document.getElementById('prof-export').addEventListener('click', () => {
      this.exportReport();
    });
  }

  updateUI() {
    if (!this.statsContainer) return;

    const snapshot = this.captureSnapshot();
    const sceneStats = snapshot.sceneStats;
    const rendererInfo = this.renderer.info;

    // Update main stats
    this.statsContainer.innerHTML = `
      <div style="border-bottom: 1px solid #00ff00; padding-bottom: 5px; margin-bottom: 5px;">
        <strong>PERFORMANCE</strong>
        <div>FPS: ${(1000 / this.frameMetrics.frameTime).toFixed(1)}</div>
        <div>Frame: ${this.frameCount}</div>
        <div>Draw Calls: ${rendererInfo.render.calls}</div>
        <div>Triangles: ${rendererInfo.render.triangles.toLocaleString()}</div>
      </div>

      <div style="border-bottom: 1px solid #00ff00; padding-bottom: 5px; margin-bottom: 5px;">
        <strong>MEMORY</strong>
        ${snapshot.jsHeap ? `
          <div>JS Heap: ${(snapshot.jsHeap.used / 1024 / 1024).toFixed(1)}MB / ${(snapshot.jsHeap.total / 1024 / 1024).toFixed(1)}MB</div>
          <div>Heap Limit: ${(snapshot.jsHeap.limit / 1024 / 1024).toFixed(1)}MB</div>
        ` : '<div>JS Heap: N/A</div>'}
        <div>GPU Est: ${(snapshot.gpuMemoryEstimate / 1024 / 1024).toFixed(1)}MB</div>
      </div>

      <div style="border-bottom: 1px solid #00ff00; padding-bottom: 5px; margin-bottom: 5px;">
        <strong>THREE.JS RESOURCES</strong>
        <div>Geometries: ${snapshot.resources.geometries} (${rendererInfo.memory.geometries})</div>
        <div>Materials: ${snapshot.resources.materials}</div>
        <div>Textures: ${snapshot.resources.textures} (${rendererInfo.memory.textures})</div>
        <div>Programs: ${rendererInfo.programs ? rendererInfo.programs.length : 'N/A'}</div>
        <div>Render Targets: ${snapshot.resources.renderTargets}</div>
        <div>Undisposed: ${snapshot.resources.totalUndisposed}</div>
      </div>

      <div>
        <strong>SCENE</strong>
        <div>Total Objects: ${sceneStats.totalObjects}</div>
        <div>Meshes: ${sceneStats.meshes}</div>
        <div>Lights: ${sceneStats.lights}</div>
        <div>Unique Geo: ${sceneStats.uniqueGeometries}</div>
        <div>Unique Mat: ${sceneStats.uniqueMaterials}</div>
        <div>Unique Tex: ${sceneStats.uniqueTextures}</div>
      </div>
    `;

    // Update leak warnings
    if (this.metrics.leakSuspects.length > 0) {
      this.leakContainer.style.display = 'block';
      this.leakContainer.innerHTML = `
        <strong style="color: #ff0000;">⚠️ MEMORY LEAKS DETECTED</strong>
        ${this.metrics.leakSuspects.map(leak => `
          <div style="color: ${leak.severity === 'critical' ? '#ff0000' : '#ffaa00'};">
            ${leak.type}: ${leak.growth || leak.count || 'Growing'}
          </div>
        `).join('')}
      `;
    } else {
      this.leakContainer.style.display = 'none';
    }

    // Update graph
    this.updateGraph();
  }

  updateGraph() {
    const ctx = this.graphContext;
    const width = this.graphContainer.width;
    const height = this.graphContainer.height;

    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, width, height);

    // Draw memory usage graph
    if (this.snapshots.length > 1) {
      const maxMemory = Math.max(...this.snapshots.map(s => s.jsHeap ? s.jsHeap.used : 0));

      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 1;
      ctx.beginPath();

      this.snapshots.forEach((snapshot, i) => {
        if (snapshot.jsHeap) {
          const x = (i / (this.snapshots.length - 1)) * width;
          const y = height - (snapshot.jsHeap.used / maxMemory) * height;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      });

      ctx.stroke();

      // Draw GPU memory estimate
      ctx.strokeStyle = '#ffaa00';
      ctx.beginPath();

      const maxGPU = Math.max(...this.snapshots.map(s => s.gpuMemoryEstimate));

      this.snapshots.forEach((snapshot, i) => {
        const x = (i / (this.snapshots.length - 1)) * width;
        const y = height - (snapshot.gpuMemoryEstimate / maxGPU) * height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    }
  }

  connectToServer() {
    console.log(`%c🔌 Connecting to memory monitoring server...`, 'color: #ffaa00');

    this.socket = io(this.config.serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log(`%c✅ Connected to memory monitoring server`, 'color: #00ff00');

      // Send any buffered logs
      while (this.logBuffer.length > 0 && this.isConnected) {
        const log = this.logBuffer.shift();
        this.sendLogToServer(log);
      }
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      console.log(`%c❌ Disconnected from memory monitoring server`, 'color: #ff0000');
    });

    this.socket.on('memory-log-error', (error) => {
      console.error('Memory log error:', error);
    });

    this.socket.on('memory-snapshot-saved', ({ filename, timestamp }) => {
      console.log(`%c📸 Snapshot saved on server: ${filename}`, 'color: #00ff00');
    });
  }

  sendLogToServer(logEntry) {
    if (!this.socket) return;

    if (this.isConnected) {
      this.socket.emit('memory-log', {
        sessionId: this.config.sessionId,
        playerId: this.config.playerId,
        logEntry
      });
    } else {
      // Buffer logs when disconnected
      this.logBuffer.push(logEntry);
      if (this.logBuffer.length > this.maxBufferSize) {
        this.logBuffer.shift();
      }
    }
  }

  sendSnapshotToServer(snapshot) {
    if (!this.socket || !this.isConnected) return;

    this.socket.emit('memory-snapshot', {
      sessionId: this.config.sessionId,
      playerId: this.config.playerId,
      snapshot
    });
  }

  sendAlertToServer(alert) {
    if (!this.socket || !this.isConnected) return;

    this.socket.emit('memory-alert', {
      sessionId: this.config.sessionId,
      playerId: this.config.playerId,
      alert
    });
  }

  startLogging() {
    // Log to console every second
    this.loggingInterval = setInterval(() => {
      if (!this.isMonitoring) return;

      const snapshot = this.captureSnapshot();

      // Create detailed log entry
      const logEntry = {
        timestamp: new Date().toISOString(),
        frame: this.frameCount,
        fps: (1000 / this.frameMetrics.frameTime).toFixed(1),
        memory: {
          jsHeap: snapshot && snapshot.jsHeap ? {
            used: (snapshot.jsHeap.used / 1024 / 1024).toFixed(2) + 'MB',
            total: (snapshot.jsHeap.total / 1024 / 1024).toFixed(2) + 'MB',
            percentage: ((snapshot.jsHeap.used / snapshot.jsHeap.total) * 100).toFixed(1) + '%'
          } : { used: '0MB', total: '0MB', percentage: '0%' },
          gpu: snapshot ? (snapshot.gpuMemoryEstimate / 1024 / 1024).toFixed(2) + 'MB' : '0MB'
        },
        resources: snapshot ? snapshot.resources : {},
        renderer: this.renderer.info.memory,
        scene: snapshot && snapshot.sceneStats ? {
          objects: snapshot.sceneStats.totalObjects,
          meshes: snapshot.sceneStats.meshes,
          uniqueGeometries: snapshot.sceneStats.uniqueGeometries,
          uniqueMaterials: snapshot.sceneStats.uniqueMaterials,
          uniqueTextures: snapshot.sceneStats.uniqueTextures
        } : {},
        performance: {
          drawCalls: this.renderer.info.render.calls,
          triangles: this.renderer.info.render.triangles,
          points: this.renderer.info.render.points,
          lines: this.renderer.info.render.lines
        },
        leaks: this.metrics.leakSuspects.length > 0 ? this.metrics.leakSuspects : null
      };

      // Log with styling
      if (this.metrics.leakSuspects.length > 0) {
        console.warn('%c⚠️ Memory Status', 'color: #ffaa00; font-weight: bold', logEntry);

        // Send alert to server for critical leaks
        if (this.metrics.leakSuspects.some(l => l.severity === 'critical')) {
          this.sendAlertToServer({
            type: 'critical-leak',
            leaks: this.metrics.leakSuspects,
            timestamp: Date.now()
          });
        }
      } else {
        console.log('%c📊 Memory Status', 'color: #00ff00', logEntry);
      }

      // Send log to server
      this.sendLogToServer(logEntry);

      // Store in window for external access
      if (!window.memoryLogs) window.memoryLogs = [];
      window.memoryLogs.push(logEntry);
      if (window.memoryLogs.length > 1000) window.memoryLogs.shift();

    }, 1000);

    // Update UI every frame
    this.updateLoop = () => {
      if (this.isMonitoring) {
        this.frameCount++;
        this.frameMetrics.frameTime = performance.now() - (this.lastFrameTime || performance.now());
        this.lastFrameTime = performance.now();

        // Update UI less frequently to avoid performance impact
        if (this.frameCount % 30 === 0) {
          this.updateUI();
        }

        requestAnimationFrame(this.updateLoop);
      }
    };
    requestAnimationFrame(this.updateLoop);
  }

  exportReport() {
    const report = {
      timestamp: new Date().toISOString(),
      duration: ((performance.now() - this.startTime) / 1000).toFixed(1) + 's',
      frames: this.frameCount,
      snapshots: this.snapshots,
      currentResources: {
        geometries: Array.from(this.resources.geometries.values()).map(a => ({
          uuid: a.uuid,
          frame: a.frame,
          memory: a.memoryEstimate
        })),
        materials: Array.from(this.resources.materials.values()).map(a => ({
          uuid: a.uuid,
          frame: a.frame
        })),
        textures: Array.from(this.resources.textures.values()).map(a => ({
          uuid: a.uuid,
          frame: a.frame,
          memory: a.memoryEstimate
        }))
      },
      allocationLog: this.allocationStack.slice(-100),
      disposalLog: this.disposalLog.slice(-100),
      leaks: this.metrics.leakSuspects,
      undisposedCount: this.metrics.undisposedResources.size,
      logs: window.memoryLogs || []
    };

    // Create download link
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memory-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('%c💾 Memory report exported', 'color: #00ff00; font-weight: bold', report);
  }

  // Public API methods
  forceGC() {
    console.log('%c🗑️ Forcing garbage collection...', 'color: #ffaa00');

    // Clear Three.js caches
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.forceContextRestore();

    // Log results
    setTimeout(() => {
      const snapshot = this.captureSnapshot();
      console.log('%c✅ Garbage collection complete', 'color: #00ff00', snapshot);
    }, 100);
  }

  findLeakyObjects() {
    const suspects = [];

    // Find geometries that haven't been disposed
    this.resources.geometries.forEach((allocation, uuid) => {
      const age = this.frameCount - allocation.frame;
      if (age > 1000 && this.metrics.undisposedResources.has(uuid)) {
        suspects.push({
          type: 'geometry',
          uuid,
          age,
          memory: allocation.memoryEstimate,
          stack: allocation.stack
        });
      }
    });

    // Find textures that haven't been disposed
    this.resources.textures.forEach((allocation, uuid) => {
      const age = this.frameCount - allocation.frame;
      if (age > 1000 && this.metrics.undisposedResources.has(uuid)) {
        suspects.push({
          type: 'texture',
          uuid,
          age,
          memory: allocation.memoryEstimate,
          stack: allocation.stack
        });
      }
    });

    return suspects;
  }

  getMemorySummary() {
    const snapshot = this.captureSnapshot();
    return {
      jsHeap: snapshot.jsHeap,
      gpu: (snapshot.gpuMemoryEstimate / 1024 / 1024).toFixed(2) + 'MB',
      resources: snapshot.resources,
      scene: snapshot.sceneStats,
      leaks: this.metrics.leakSuspects,
      undisposed: this.metrics.undisposedResources.size,
      suspects: this.findLeakyObjects()
    };
  }

  dispose() {
    this.isMonitoring = false;

    if (this.loggingInterval) {
      clearInterval(this.loggingInterval);
    }

    if (this.ui && this.ui.parentNode) {
      this.ui.parentNode.removeChild(this.ui);
    }

    // Clear all tracking
    this.resources = null;
    this.snapshots = null;
    this.metrics = null;

    console.log('%c🛑 Memory Profiler disposed', 'color: #ff0000');
  }
}