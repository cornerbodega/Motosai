import * as THREE from 'three';

/**
 * MaterialTracker - Intercepts THREE.js material creation to track memory leaks
 */
export class MaterialTracker {
  constructor() {
    this.createdMaterials = new Map(); // uuid -> creation info
    this.creationCount = 0;
    this.disposalCount = 0;
    this.enabled = true;
    this.reportCounter = 0;
    this.lastSaveTime = Date.now();

    // Store original constructors
    this.originalConstructors = {
      MeshBasicMaterial: THREE.MeshBasicMaterial,
      MeshStandardMaterial: THREE.MeshStandardMaterial,
      MeshPhongMaterial: THREE.MeshPhongMaterial,
      MeshLambertMaterial: THREE.MeshLambertMaterial,
      MeshPhysicalMaterial: THREE.MeshPhysicalMaterial,
      PointsMaterial: THREE.PointsMaterial,
      LineBasicMaterial: THREE.LineBasicMaterial,
      SpriteMaterial: THREE.SpriteMaterial
    };

    this.initializeTracking();
  }

  initializeTracking() {
    if (!this.enabled) return;

    // Add to window for global access first
    window.materialTracker = this;

    // Use monkey patching approach that works with ES6 modules
    this.patchMaterialConstructors();

    console.log('🔍 Material tracking enabled - using Proxy-based approach');
  }

  patchMaterialConstructors() {
    // Use Proxy-based interception to avoid read-only property issues
    Object.keys(this.originalConstructors).forEach(materialType => {
      if (THREE[materialType]) {
        const OriginalConstructor = THREE[materialType];
        this.originalConstructors[materialType] = OriginalConstructor;

        try {
          // Create a Proxy that intercepts constructor calls
          const ProxyConstructor = new Proxy(OriginalConstructor, {
            construct(target, args) {
              // Create the material instance normally
              const instance = new target(...args);

              // Track the creation after successful construction
              if (window.materialTracker) {
                window.materialTracker.trackMaterialCreation(instance, materialType);
              }

              return instance;
            },

            // Preserve static properties and methods
            get(target, prop) {
              return target[prop];
            }
          });

          // Replace the constructor with the proxy
          Object.defineProperty(THREE, materialType, {
            value: ProxyConstructor,
            writable: true,
            configurable: true
          });

          console.log(`✅ Successfully patched ${materialType} with Proxy`);
        } catch (error) {
          console.warn(`Could not patch ${materialType}:`, error.message);
          // Fallback: manual tracking via MaterialManager hooks
        }
      }
    });
  }

  trackMaterialCreation(instance, materialType) {
    const stack = new Error().stack;
    const creationInfo = {
      type: materialType,
      uuid: instance.uuid,
      timestamp: Date.now(),
      stack: stack,
      disposed: false
    };

    this.createdMaterials.set(instance.uuid, creationInfo);
    this.creationCount++;

    // Only log milestones to avoid spam
    if (this.creationCount % 100 === 0) {
      console.log(`🎨 MATERIAL MILESTONE: ${this.creationCount} materials created`);
    }

    // Patch the dispose method
    if (instance.dispose) {
      const originalDispose = instance.dispose.bind(instance);
      instance.dispose = () => {
        this.trackMaterialDisposal(instance.uuid, materialType);
        originalDispose();
      };
    }
  }

  trackMaterialDisposal(uuid, materialType) {
    const info = this.createdMaterials.get(uuid);
    if (info && !info.disposed) {
      info.disposed = true;
      this.disposalCount++;

      // Only log disposal milestones
      if (this.disposalCount % 100 === 0) {
        console.log(`🗑️ DISPOSAL MILESTONE: ${this.disposalCount} materials disposed`);
      }
    }
  }

  getStats() {
    const undisposed = Array.from(this.createdMaterials.values()).filter(info => !info.disposed);

    return {
      totalCreated: this.creationCount,
      totalDisposed: this.disposalCount,
      currentUndisposed: undisposed.length,
      undisposedByType: this.groupByType(undisposed)
    };
  }

  groupByType(materials) {
    const grouped = {};
    materials.forEach(info => {
      if (!grouped[info.type]) grouped[info.type] = 0;
      grouped[info.type]++;
    });
    return grouped;
  }

  getUndisposedMaterials() {
    return Array.from(this.createdMaterials.values()).filter(info => !info.disposed);
  }

  async logStats() {
    const stats = this.getStats();
    console.log('%c📊 MATERIAL TRACKER STATS', 'color: #ff6600; font-weight: bold; font-size: 16px');
    console.log(`Total Created: ${stats.totalCreated}`);
    console.log(`Total Disposed: ${stats.totalDisposed}`);
    console.log(`Currently Undisposed: ${stats.currentUndisposed}`);
    console.log('Undisposed by type:', stats.undisposedByType);

    // Only save reports if a debug server is available
    // Comment out to avoid 404 errors when no server is running
    // const report = this.generateDetailedReport(stats);
    // await this.saveReportToFile(report, 'material-stats');

    if (stats.currentUndisposed > 100) {
      console.log('%c⚠️ MEMORY LEAK DETECTED!', 'color: #ff0000; font-weight: bold; font-size: 14px');
      // const leakReport = await this.generateLeakReport();
      // await this.saveReportToFile(leakReport, 'memory-leak');
    }
  }

  async findLeakSource() {
    const undisposed = this.getUndisposedMaterials();
    const recentLeaks = undisposed.filter(info => Date.now() - info.timestamp < 10000); // Last 10 seconds

    console.log('%c🔍 LEAK SOURCE ANALYSIS', 'color: #ff0000; font-weight: bold');
    console.log(`${recentLeaks.length} materials created in last 10 seconds:`);

    const stackCounts = {};
    recentLeaks.forEach(info => {
      const line = info.stack.split('\n')[2]?.trim() || 'unknown';
      stackCounts[line] = (stackCounts[line] || 0) + 1;
    });

    // Sort by frequency
    const sorted = Object.entries(stackCounts).sort((a, b) => b[1] - a[1]);
    console.log('Most frequent leak sources:');
    sorted.slice(0, 5).forEach(([location, count]) => {
      console.log(`${count}x: ${location}`);
    });

    // Save detailed leak analysis to file
    const leakAnalysis = {
      timestamp: new Date().toISOString(),
      totalUndisposed: undisposed.length,
      recentLeaks: recentLeaks.length,
      topLeakSources: sorted.slice(0, 10),
      detailedMaterials: recentLeaks.map(info => ({
        type: info.type,
        uuid: info.uuid,
        age: Date.now() - info.timestamp,
        createdAt: new Date(info.timestamp).toISOString(),
        stack: info.stack.split('\n').slice(0, 10) // First 10 lines of stack
      }))
    };

    await this.saveReportToFile(leakAnalysis, 'leak-source-analysis');
    return sorted;
  }

  disable() {
    this.enabled = false;
    // Restore original constructors from proxy wrapping
    Object.keys(this.originalConstructors).forEach(materialType => {
      try {
        if (THREE[materialType] && this.originalConstructors[materialType]) {
          Object.defineProperty(THREE, materialType, {
            value: this.originalConstructors[materialType],
            writable: true,
            configurable: true
          });
          console.log(`✅ Restored original ${materialType} constructor`);
        }
      } catch (error) {
        console.warn(`Could not restore ${materialType}:`, error.message);
      }
    });
    console.log('🔍 Material tracking disabled - all constructors restored');
  }

  generateDetailedReport(stats) {
    const undisposed = this.getUndisposedMaterials();
    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalCreated: stats.totalCreated,
        totalDisposed: stats.totalDisposed,
        currentUndisposed: stats.currentUndisposed,
        undisposedByType: stats.undisposedByType
      },
      browserInfo: {
        userAgent: navigator.userAgent,
        memory: performance.memory ? {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
        } : null
      },
      undisposedMaterials: undisposed.slice(-50).map(info => ({
        type: info.type,
        uuid: info.uuid,
        age: Date.now() - info.timestamp,
        createdAt: new Date(info.timestamp).toISOString(),
        creationLocation: info.stack.split('\n')[2]?.trim()
      }))
    };
  }

  async generateLeakReport() {
    const undisposed = this.getUndisposedMaterials();
    const recentLeaks = undisposed.filter(info => Date.now() - info.timestamp < 30000); // Last 30 seconds

    const stackCounts = {};
    recentLeaks.forEach(info => {
      const line = info.stack.split('\n')[2]?.trim() || 'unknown';
      stackCounts[line] = (stackCounts[line] || 0) + 1;
    });

    const sorted = Object.entries(stackCounts).sort((a, b) => b[1] - a[1]);

    return {
      timestamp: new Date().toISOString(),
      severity: undisposed.length > 500 ? 'CRITICAL' : undisposed.length > 200 ? 'HIGH' : 'MEDIUM',
      totalUndisposed: undisposed.length,
      recentLeaks: recentLeaks.length,
      topLeakSources: sorted.slice(0, 20),
      memoryInfo: performance.memory ? {
        usedJSHeapSize: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + 'MB',
        totalJSHeapSize: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2) + 'MB',
        jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2) + 'MB'
      } : null,
      gameState: {
        url: window.location.href,
        timestamp: Date.now()
      },
      detailedStackTraces: recentLeaks.slice(0, 10).map(info => ({
        type: info.type,
        uuid: info.uuid,
        fullStack: info.stack
      }))
    };
  }

  async saveReportToFile(data, reportType) {
    try {
      this.reportCounter++;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${reportType}-${timestamp}-${this.reportCounter}.json`;

      const jsonData = JSON.stringify(data, null, 2);

      // Save via API endpoint
      const response = await fetch('/api/save-debug-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: filename,
          data: jsonData,
          reportType: reportType,
          size: jsonData.length
        })
      });

      if (response.ok) {
        console.log(`📄 Report saved: ${filename} (${(jsonData.length / 1024).toFixed(1)}KB)`);
      } else {
        console.error('Failed to save report:', response.statusText);
        // Fallback: save to localStorage as backup
        this.saveToLocalStorage(filename, data);
      }
    } catch (error) {
      console.error('Error saving report:', error);
      // Fallback: save to localStorage
      this.saveToLocalStorage(`${reportType}-${Date.now()}`, data);
    }
  }

  saveToLocalStorage(filename, data) {
    try {
      const key = `memory-report-${filename}`;
      localStorage.setItem(key, JSON.stringify(data));
      console.log(`💾 Report saved to localStorage: ${key}`);
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }
}

// Auto-start tracking with error handling
try {
  new MaterialTracker();
} catch (error) {
  console.warn('Material tracking failed to start:', error.message);
  console.log('Falling back to manual tracking via MaterialManager');
}