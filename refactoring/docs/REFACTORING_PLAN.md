# Motosai Game Refactoring Plan

## Overview
This document outlines a systematic approach to refactor the Motosai motorcycle game for improved performance, memory management, and code maintainability.

## Goals
1. **Eliminate Memory Leaks** - Ensure all resources are properly disposed
2. **DRY Principle** - Remove code duplication
3. **Performance** - Optimize render loops and update cycles
4. **Maintainability** - Improve code organization and testability

## Phase 1: Critical Memory Leak Fixes (Week 1)

### 1.1 Event Listener Management
**Priority: HIGH**
**Files Affected:**
- `GraphicsSettings.js`
- `BackgroundSystem.js`

**Tasks:**
- [ ] Create `EventManager` class for centralized event handling
- [ ] Implement weak references for event callbacks
- [ ] Add automatic cleanup on component disposal
- [ ] Track all event listeners with `WeakMap`

```javascript
// EventManager.js
class EventManager {
  constructor() {
    this.listeners = new WeakMap();
    this.activeListeners = new Set();
  }

  add(target, event, handler, options) {
    const boundHandler = handler.bind(this);
    target.addEventListener(event, boundHandler, options);
    this.activeListeners.add({ target, event, handler: boundHandler });
    return boundHandler;
  }

  removeAll() {
    this.activeListeners.forEach(({ target, event, handler }) => {
      target.removeEventListener(event, handler);
    });
    this.activeListeners.clear();
  }
}
```

### 1.2 Three.js Resource Management
**Priority: HIGH**
**Files Affected:**
- `TrafficSystem.js`
- `Highway101.js`
- `BloodTrackSystem.js`

**Tasks:**
- [ ] Create `ResourcePool` for geometry/material reuse
- [ ] Implement reference counting for shared resources
- [ ] Add disposal tracking to Stoppa system
- [ ] Create `disposeThreeObject()` utility function

```javascript
// ResourcePool.js
class ResourcePool {
  constructor() {
    this.geometries = new Map();
    this.materials = new Map();
    this.textures = new Map();
    this.refCounts = new WeakMap();
  }

  getGeometry(key, factory) {
    if (!this.geometries.has(key)) {
      const geo = factory();
      this.geometries.set(key, geo);
      this.refCounts.set(geo, 0);
    }
    const geo = this.geometries.get(key);
    this.refCounts.set(geo, this.refCounts.get(geo) + 1);
    return geo;
  }

  release(resource) {
    const count = this.refCounts.get(resource) - 1;
    if (count <= 0) {
      resource.dispose();
      // Remove from appropriate map
    } else {
      this.refCounts.set(resource, count);
    }
  }
}
```

## Phase 2: Code Consolidation (Week 2)

### 2.1 Physics System Unification
**Priority: HIGH**
**Files Affected:**
- `MotorcyclePhysics.js`
- `MotorcyclePhysicsV2.js`
- `SimpleBikePhysics.js`

**Tasks:**
- [ ] Create abstract `BasePhysicsEngine` class
- [ ] Extract common physics calculations
- [ ] Implement strategy pattern for physics modes
- [ ] Create physics configuration system

```javascript
// BasePhysicsEngine.js
class BasePhysicsEngine {
  constructor(config) {
    this.config = config;
    this.state = this.createInitialState();
  }

  // Abstract methods
  abstract calculateForces(deltaTime);
  abstract applyCollisions(obstacles);

  // Common methods
  update(deltaTime) {
    const forces = this.calculateForces(deltaTime);
    this.applyForces(forces, deltaTime);
    this.updatePosition(deltaTime);
    return this.getState();
  }

  getState() {
    return {
      position: this.state.position,
      velocity: this.state.velocity,
      rotation: this.state.rotation,
      speed: this.calculateSpeed()
    };
  }
}
```

### 2.2 Material Factory Pattern
**Priority: MEDIUM**
**Files Affected:**
- `TrafficSystem.js`
- `Highway101.js`
- `MotorcycleMesh.js`

**Tasks:**
- [ ] Create `MaterialFactory` singleton
- [ ] Cache materials by configuration
- [ ] Implement material presets
- [ ] Add LOD-based material switching

```javascript
// MaterialFactory.js
class MaterialFactory {
  constructor() {
    this.cache = new Map();
  }

  getMaterial(type, config = {}) {
    const key = `${type}_${JSON.stringify(config)}`;
    if (!this.cache.has(key)) {
      const material = this.createMaterial(type, config);
      this.cache.set(key, material);
    }
    return this.cache.get(key);
  }

  createMaterial(type, config) {
    switch(type) {
      case 'vehicle':
        return new THREE.MeshStandardMaterial({
          color: config.color || 0xcccccc,
          metalness: 0.3,
          roughness: 0.4
        });
      // ... other types
    }
  }
}
```

## Phase 3: Performance Optimization (Week 3)

### 3.1 Update Loop Optimization
**Priority: HIGH**
**Files Affected:**
- `MotosaiGame.js` (animate method)
- `TrafficSystem.js` (update method)

**Tasks:**
- [ ] Split `animate()` into smaller functions
- [ ] Implement update priorities (physics > AI > rendering)
- [ ] Add frame skipping for non-critical updates
- [ ] Use spatial partitioning for collision detection

```javascript
// UpdateManager.js
class UpdateManager {
  constructor() {
    this.systems = new Map();
    this.priorities = new Map();
  }

  register(name, system, priority = 0, frequency = 1) {
    this.systems.set(name, {
      system,
      priority,
      frequency,
      frameCount: 0
    });
  }

  update(deltaTime) {
    const sortedSystems = Array.from(this.systems.entries())
      .sort((a, b) => b[1].priority - a[1].priority);

    for (const [name, config] of sortedSystems) {
      config.frameCount++;
      if (config.frameCount >= config.frequency) {
        config.system.update(deltaTime);
        config.frameCount = 0;
      }
    }
  }
}
```

### 3.2 Spatial Indexing for Traffic
**Priority: MEDIUM**
**Files Affected:**
- `TrafficSystem.js`

**Tasks:**
- [ ] Implement grid-based spatial partitioning
- [ ] Reduce O(n²) collision checks to O(n)
- [ ] Add distance-based LOD for vehicle updates
- [ ] Cache nearest vehicle calculations

```javascript
// SpatialGrid.js
class SpatialGrid {
  constructor(cellSize = 50) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  insert(entity) {
    const key = this.getKey(entity.position);
    if (!this.grid.has(key)) {
      this.grid.set(key, new Set());
    }
    this.grid.get(key).add(entity);
  }

  getNearby(position, radius) {
    const nearby = [];
    const cells = this.getCellsInRadius(position, radius);
    for (const cell of cells) {
      if (this.grid.has(cell)) {
        nearby.push(...this.grid.get(cell));
      }
    }
    return nearby;
  }
}
```

## Phase 4: Architecture Improvements (Week 4)

### 4.1 Component System
**Priority: MEDIUM**
**Files Affected:**
- All game entity classes

**Tasks:**
- [ ] Implement Entity-Component-System (ECS) pattern
- [ ] Separate rendering from logic
- [ ] Create component pools for memory efficiency
- [ ] Add component lifecycle management

```javascript
// Entity.js
class Entity {
  constructor(id) {
    this.id = id;
    this.components = new Map();
    this.active = true;
  }

  addComponent(component) {
    this.components.set(component.constructor.name, component);
    component.entity = this;
    component.onAttach?.();
  }

  getComponent(ComponentClass) {
    return this.components.get(ComponentClass.name);
  }

  dispose() {
    for (const component of this.components.values()) {
      component.onDetach?.();
    }
    this.components.clear();
  }
}
```

### 4.2 State Management
**Priority: LOW**
**Files Affected:**
- `MotosaiGame.js`

**Tasks:**
- [ ] Implement state machine for game states
- [ ] Create save/load system
- [ ] Add state rollback for debugging
- [ ] Implement replay system

## Phase 5: Monitoring & Testing (Ongoing)

### 5.1 Performance Profiling
**Tasks:**
- [ ] Add performance markers to critical paths
- [ ] Integrate Chrome DevTools profiling
- [ ] Create performance dashboard
- [ ] Set up automated performance regression tests

### 5.2 Memory Monitoring
**Tasks:**
- [ ] Enhance Stoppa integration
- [ ] Add heap snapshot analysis
- [ ] Create memory leak detection tests
- [ ] Implement resource usage alerts

## Implementation Schedule

### Week 1: Foundation
- Day 1-2: Event listener management system
- Day 3-4: Resource pool implementation
- Day 5: Testing and bug fixes

### Week 2: Consolidation
- Day 1-2: Physics system refactor
- Day 3-4: Material factory implementation
- Day 5: Integration testing

### Week 3: Optimization
- Day 1-2: Update loop refactor
- Day 3-4: Spatial indexing implementation
- Day 5: Performance testing

### Week 4: Architecture
- Day 1-3: Component system implementation
- Day 4-5: Migration of existing code

## Success Metrics

### Memory
- [ ] Zero memory leaks detected in 60-minute play session
- [ ] Memory usage plateau after 30 minutes
- [ ] < 500MB total memory usage

### Performance
- [ ] Consistent 60 FPS on mid-range hardware
- [ ] < 16ms frame time 95th percentile
- [ ] < 100 draw calls per frame

### Code Quality
- [ ] No methods > 50 lines
- [ ] No classes > 300 lines
- [ ] < 10% code duplication
- [ ] 80% test coverage for critical paths

## Risk Mitigation

### Backward Compatibility
- Keep old physics systems available via flag
- Gradual migration with feature flags
- Extensive testing on each phase

### Performance Regression
- Benchmark before and after each change
- Keep rollback points for each phase
- A/B testing for major changes

## Tools & Resources

### Development Tools
- **Memory Profiling**: Chrome DevTools, Heap Snapshot
- **Performance**: Lighthouse, WebPageTest
- **Code Quality**: ESLint, SonarJS
- **Testing**: Jest, Puppeteer

### Libraries
- **Memory Management**: WeakMap, WeakSet, FinalizationRegistry
- **Performance**: Web Workers, OffscreenCanvas
- **State Management**: Immer, MobX

## Notes

### Current Good Practices to Preserve
1. Stoppa memory tracking system
2. Pre-allocated camera objects
3. Shared geometry in TrafficSystem
4. Performance manager with dynamic LOD
5. Proper disposal in MotosaiGame

### Known Challenges
1. Three physics systems with different behaviors
2. Large animate() method is complex to split
3. Traffic AI tightly coupled to rendering
4. Dynamic imports may affect bundling

## Conclusion

This refactoring plan addresses the core issues identified in the Motosai codebase while preserving existing functionality. The phased approach allows for incremental improvements with minimal risk. Each phase builds upon the previous one, creating a more maintainable and performant codebase.

The key to success will be:
1. Incremental changes with thorough testing
2. Maintaining backward compatibility during transition
3. Regular performance and memory profiling
4. Clear documentation of new patterns

Expected outcome: 50% reduction in memory usage, 30% improvement in frame rate consistency, and significantly improved code maintainability.