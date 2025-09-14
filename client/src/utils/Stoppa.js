/**
 * Stoppa - Advanced Memory Management and Leak Detection Tool for Motosai
 *
 * This tool provides comprehensive memory leak detection and prevention
 * by tracking object allocation, monitoring disposal, and enforcing cleanup.
 */

export class Stoppa {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.verbose = config.verbose || false;
    this.autoCleanup = config.autoCleanup !== false;
    this.memoryThreshold = config.memoryThreshold || 500 * 1024 * 1024; // 500MB default

    // Track all registered resources
    this.resources = new Map();
    this.disposalQueue = new Set();
    this.eventListeners = new Map();
    this.timers = new Set();
    this.animationFrames = new Set();
    this.textureCache = new WeakMap();
    this.geometryCache = new WeakMap();
    this.materialCache = new WeakMap();

    // Memory tracking
    this.memorySnapshots = [];
    this.leakDetectionInterval = null;
    this.lastGCTime = 0;

    // Start monitoring if enabled
    if (this.enabled) {
      this.startMonitoring();
    }
  }

  /**
   * Register a resource for tracking
   */
  register(resource, type, identifier = null) {
    if (!this.enabled) return;

    const id = identifier || this.generateId();
    const entry = {
      resource,
      type,
      id,
      createdAt: Date.now(),
      stackTrace: this.getStackTrace(),
      disposed: false
    };

    this.resources.set(id, entry);

    // Add weak references for Three.js objects
    if (type === 'texture' && resource.isTexture) {
      this.textureCache.set(resource, id);
    } else if (type === 'geometry' && resource.isBufferGeometry) {
      this.geometryCache.set(resource, id);
    } else if (type === 'material' && resource.isMaterial) {
      this.materialCache.set(resource, id);
    }

    return id;
  }

  /**
   * Track event listener addition
   */
  addEventListener(target, event, handler, options) {
    if (!this.enabled) {
      target.addEventListener(event, handler, options);
      return;
    }

    const key = `${target.constructor.name}_${event}`;
    if (!this.eventListeners.has(key)) {
      this.eventListeners.set(key, new Set());
    }

    this.eventListeners.get(key).add({
      target,
      event,
      handler,
      options
    });

    target.addEventListener(event, handler, options);
  }

  /**
   * Track timer creation
   */
  setTimeout(callback, delay) {
    const timerId = setTimeout(() => {
      this.timers.delete(timerId);
      callback();
    }, delay);

    if (this.enabled) {
      this.timers.add(timerId);
    }

    return timerId;
  }

  /**
   * Track animation frame
   */
  requestAnimationFrame(callback) {
    const frameId = requestAnimationFrame(() => {
      this.animationFrames.delete(frameId);
      callback();
    });

    if (this.enabled) {
      this.animationFrames.add(frameId);
    }

    return frameId;
  }

  /**
   * Dispose a specific resource
   */
  dispose(resourceId) {
    if (!this.enabled) return;

    const entry = this.resources.get(resourceId);
    if (!entry || entry.disposed) return;

    const { resource, type } = entry;

    // Dispose based on type
    switch (type) {
      case 'texture':
        if (resource.dispose) resource.dispose();
        break;

      case 'geometry':
        if (resource.dispose) resource.dispose();
        break;

      case 'material':
        if (resource.dispose) resource.dispose();
        if (resource.map) resource.map.dispose();
        if (resource.normalMap) resource.normalMap.dispose();
        if (resource.roughnessMap) resource.roughnessMap.dispose();
        if (resource.metalnessMap) resource.metalnessMap.dispose();
        if (resource.aoMap) resource.aoMap.dispose();
        if (resource.emissiveMap) resource.emissiveMap.dispose();
        if (resource.envMap) resource.envMap.dispose();
        break;

      case 'mesh':
        if (resource.geometry) resource.geometry.dispose();
        if (resource.material) {
          if (Array.isArray(resource.material)) {
            resource.material.forEach(mat => mat.dispose());
          } else {
            resource.material.dispose();
          }
        }
        break;

      case 'scene':
        resource.traverse((object) => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(mat => mat.dispose());
            } else {
              object.material.dispose();
            }
          }
        });
        break;

      case 'renderer':
        if (resource.dispose) resource.dispose();
        if (resource.forceContextLoss) resource.forceContextLoss();
        if (resource.domElement && resource.domElement.parentNode) {
          resource.domElement.parentNode.removeChild(resource.domElement);
        }
        break;

      case 'audio':
        if (resource.pause) resource.pause();
        if (resource.src) resource.src = '';
        if (resource.remove) resource.remove();
        break;

      default:
        if (resource.dispose && typeof resource.dispose === 'function') {
          resource.dispose();
        }
    }

    entry.disposed = true;
    entry.disposedAt = Date.now();
  }

  /**
   * Clean up all event listeners
   */
  removeAllEventListeners() {
    if (!this.enabled) return;

    for (const [key, listeners] of this.eventListeners) {
      for (const { target, event, handler, options } of listeners) {
        target.removeEventListener(event, handler, options);
      }
    }

    this.eventListeners.clear();
  }

  /**
   * Clear all timers
   */
  clearAllTimers() {
    for (const timerId of this.timers) {
      clearTimeout(timerId);
    }
    this.timers.clear();
  }

  /**
   * Cancel all animation frames
   */
  cancelAllAnimationFrames() {
    for (const frameId of this.animationFrames) {
      cancelAnimationFrame(frameId);
    }
    this.animationFrames.clear();
  }

  /**
   * Perform complete cleanup
   */
  cleanup() {
    // Dispose all tracked resources
    for (const [id, entry] of this.resources) {
      if (!entry.disposed) {
        this.dispose(id);
      }
    }

    // Clear all event listeners
    this.removeAllEventListeners();

    // Clear all timers
    this.clearAllTimers();

    // Cancel all animation frames
    this.cancelAllAnimationFrames();

    // Clear disposal queue
    this.disposalQueue.clear();

    // Force garbage collection if available
    this.forceGC();
  }

  /**
   * Detect memory leaks
   */
  detectLeaks() {
    const leaks = [];
    const now = Date.now();

    for (const [id, entry] of this.resources) {
      if (!entry.disposed) {
        const age = now - entry.createdAt;

        // Resources older than 5 minutes are potential leaks
        if (age > 5 * 60 * 1000) {
          leaks.push({
            id,
            type: entry.type,
            age: Math.round(age / 1000),
            stackTrace: entry.stackTrace
          });
        }
      }
    }

    if (leaks.length > 0 && this.verbose) {
      console.warn(`[Stoppa] Detected ${leaks.length} potential memory leaks:`, leaks);
    }

    return leaks;
  }

  /**
   * Take memory snapshot
   */
  takeSnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      resourceCount: this.resources.size,
      activeResources: 0,
      disposedResources: 0,
      eventListeners: this.eventListeners.size,
      timers: this.timers.size,
      animationFrames: this.animationFrames.size
    };

    for (const entry of this.resources.values()) {
      if (entry.disposed) {
        snapshot.disposedResources++;
      } else {
        snapshot.activeResources++;
      }
    }

    // Get memory info if available
    if (performance.memory) {
      snapshot.memory = {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      };
    }

    this.memorySnapshots.push(snapshot);

    // Keep only last 100 snapshots
    if (this.memorySnapshots.length > 100) {
      this.memorySnapshots.shift();
    }

    return snapshot;
  }

  /**
   * Check memory usage and trigger cleanup if needed
   */
  checkMemory() {
    if (!performance.memory) return;

    const used = performance.memory.usedJSHeapSize;
    const limit = performance.memory.jsHeapSizeLimit;
    const usage = used / limit;

    if (used > this.memoryThreshold || usage > 0.9) {
      console.warn(`[Stoppa] High memory usage detected: ${Math.round(used / 1024 / 1024)}MB (${Math.round(usage * 100)}%)`);

      if (this.autoCleanup) {
        this.performAutoCleanup();
      }
    }
  }

  /**
   * Perform automatic cleanup of old resources
   */
  performAutoCleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, entry] of this.resources) {
      if (!entry.disposed) {
        const age = now - entry.createdAt;

        // Auto-dispose resources older than 10 minutes
        if (age > 10 * 60 * 1000) {
          this.dispose(id);
          cleaned++;
        }
      }
    }

    // Remove disposed entries older than 1 minute
    const toRemove = [];
    for (const [id, entry] of this.resources) {
      if (entry.disposed && entry.disposedAt) {
        const disposedAge = now - entry.disposedAt;
        if (disposedAge > 60 * 1000) {
          toRemove.push(id);
        }
      }
    }

    for (const id of toRemove) {
      this.resources.delete(id);
    }

    if (cleaned > 0) {
      console.log(`[Stoppa] Auto-cleaned ${cleaned} old resources`);
    }

    // Force GC after cleanup
    this.forceGC();
  }

  /**
   * Force garbage collection if available
   */
  forceGC() {
    const now = Date.now();

    // Don't GC too frequently
    if (now - this.lastGCTime < 5000) return;

    if (window.gc) {
      window.gc();
      this.lastGCTime = now;

      if (this.verbose) {
        console.log('[Stoppa] Forced garbage collection');
      }
    }
  }

  /**
   * Start monitoring
   */
  startMonitoring() {
    // Take snapshots every 10 seconds
    this.leakDetectionInterval = setInterval(() => {
      this.takeSnapshot();
      this.checkMemory();

      // Detect leaks every minute
      if (this.memorySnapshots.length % 6 === 0) {
        this.detectLeaks();
      }
    }, 10000);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.leakDetectionInterval) {
      clearInterval(this.leakDetectionInterval);
      this.leakDetectionInterval = null;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const stats = {
      totalResources: this.resources.size,
      activeResources: 0,
      disposedResources: 0,
      resourcesByType: {},
      memoryUsage: null,
      leaks: []
    };

    for (const entry of this.resources.values()) {
      if (entry.disposed) {
        stats.disposedResources++;
      } else {
        stats.activeResources++;
      }

      if (!stats.resourcesByType[entry.type]) {
        stats.resourcesByType[entry.type] = { active: 0, disposed: 0 };
      }

      if (entry.disposed) {
        stats.resourcesByType[entry.type].disposed++;
      } else {
        stats.resourcesByType[entry.type].active++;
      }
    }

    if (performance.memory) {
      stats.memoryUsage = {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
      };
    }

    stats.leaks = this.detectLeaks();

    return stats;
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get stack trace for debugging
   */
  getStackTrace() {
    const stack = new Error().stack;
    return stack ? stack.split('\n').slice(2, 5).join('\n') : 'No stack trace available';
  }

  /**
   * Destroy Stoppa instance
   */
  destroy() {
    this.stopMonitoring();
    this.cleanup();
    this.resources.clear();
    this.memorySnapshots = [];
  }
}

// Singleton instance
let stoppaInstance = null;

/**
 * Get or create Stoppa singleton
 */
export function getStoppa(config) {
  if (!stoppaInstance) {
    stoppaInstance = new Stoppa(config);
  }
  return stoppaInstance;
}

/**
 * Helper to wrap Three.js object creation with automatic tracking
 */
export function trackThreeObject(object, type) {
  const stoppa = getStoppa();
  const id = stoppa.register(object, type);

  // Override dispose method to track disposal
  const originalDispose = object.dispose;
  if (originalDispose) {
    object.dispose = function() {
      stoppa.dispose(id);
      originalDispose.call(this);
    };
  }

  return object;
}