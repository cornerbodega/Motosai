# Motosai Refactoring Migration Guide

## Phase 1 Implementation Complete

### Core Components Implemented

#### 1. EventManager (`src/core/EventManager.js`)

- Centralized event listener management
- Automatic cleanup on disposal
- Context-based grouping for partial cleanup
- Prevents duplicate bindings with WeakMap tracking

**Migration Example:**

```javascript
// OLD - Direct event listeners (memory leak risk)
element.addEventListener("click", this.handleClick.bind(this));

// NEW - Using EventManager
import { getGlobalEventManager } from "./refactoring/src/core/EventManager.js";

const eventManager = getGlobalEventManager();
eventManager.add(
  element,
  "click",
  this.handleClick,
  {
    bindContext: this,
  },
  "myComponent"
);

// Cleanup
eventManager.removeContext("myComponent"); // Removes all events for this context
```

#### 2. ResourcePool (`src/core/ResourcePool.js`)

- Three.js resource management with reference counting
- Shared geometry/material caching
- Memory usage tracking
- Automatic disposal when references reach zero

**Migration Example:**

```javascript
// OLD - Creating geometries directly (duplicate memory)
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });

// NEW - Using ResourcePool
import { getGlobalResourcePool } from "./refactoring/src/core/ResourcePool.js";

const pool = getGlobalResourcePool();
const geometry = pool.getSharedGeometry("box", {
  width: 1,
  height: 1,
  depth: 1,
});
const material = pool.getSharedMaterial("car", { color: 0xff0000 });

// When done, release references
pool.release(geometry);
pool.release(material);
```

#### 3. DisposalUtils (`src/utils/DisposalUtils.js`)

- Comprehensive Three.js disposal functions
- Handles textures, materials, geometries, meshes
- Recursive disposal for object hierarchies
- Memory leak detector for debugging

**Usage:**

```javascript
import {
  disposeObject3D,
  disposeScene,
} from "./refactoring/src/utils/DisposalUtils.js";

// Dispose a single object and its children
disposeObject3D(mesh, true, true); // dispose geometry and materials

// Dispose an entire scene
disposeScene(scene, true, true);
```

#### 4. AudioManager (`src/audio/AudioManager.js`)

- Centralized audio handling
- Sound pooling for frequently used effects
- Category-based volume control
- Automatic fade in/out support
- Proper cleanup of audio resources

**Migration Example:**

```javascript
// OLD - Direct audio creation
const audio = new Audio("engine.mp3");
audio.play();

// NEW - Using AudioManager
import { getGlobalAudioManager } from "./refactoring/src/audio/AudioManager.js";

const audioManager = getGlobalAudioManager();
await audioManager.initialize(); // After user interaction

// Create sound pool for frequently used sounds
await audioManager.createSoundPool("engine", "sounds/engine.mp3", 3, "sfx");

// Play pooled sound
audioManager.playPooledSound("engine", { volume: 0.5, loop: true });

// Play one-shot sound
audioManager.playOneShot("sounds/crash.mp3", "sfx");

// Control volume
audioManager.setMasterVolume(0.8);
audioManager.setCategoryVolume("sfx", 0.5);
audioManager.toggleMute(); // Toggle mute state
```

### Refactored Components

#### GraphicsSettingsRefactored

Located at: `src/game/GraphicsSettingsRefactored.js`

Key improvements:

- Uses EventManager for all event listeners
- Proper cleanup in dispose()
- No more memory leaks from unremoved listeners

#### BackgroundSystemRefactored

Located at: `src/systems/BackgroundSystemRefactored.js`

Key improvements:

- Tracks all animation frame IDs
- Cancels animations on disposal
- Uses ResourcePool for shared geometries
- Proper texture disposal

## Integration Steps

### Step 1: Import Core Utilities

Add to your main game file:

```javascript
import { getGlobalEventManager } from "./refactoring/src/core/EventManager.js";
import { getGlobalResourcePool } from "./refactoring/src/core/ResourcePool.js";
import { getGlobalAudioManager } from "./refactoring/src/audio/AudioManager.js";
```

### Step 2: Initialize Managers

In your game initialization:

```javascript
// Initialize audio after first user interaction
document.addEventListener(
  "click",
  async () => {
    const audioManager = getGlobalAudioManager();
    await audioManager.initialize();
  },
  { once: true }
);
```

### Step 3: Update Components

Replace components one by one:

1. Replace `GraphicsSettings` with `GraphicsSettingsRefactored`
2. Replace `BackgroundSystem` with `BackgroundSystemRefactored`
3. Update audio code to use AudioManager

### Step 4: Add Cleanup

In your game cleanup/restart:

```javascript
dispose() {
  // Dispose managers
  getGlobalEventManager().dispose();
  getGlobalResourcePool().dispose();
  getGlobalAudioManager().dispose();

  // Dispose scene
  disposeScene(this.scene);
}
```

## Memory Leak Detection

Use the MemoryLeakDetector for debugging:

```javascript
import {
  memoryLeakDetector,
  patchThreeJSForTracking,
} from "./refactoring/src/utils/DisposalUtils.js";

// Enable tracking (call once at startup)
patchThreeJSForTracking();

// Check for leaks
const stats = memoryLeakDetector.getStats();
```

## Performance Monitoring

Monitor resource usage:

```javascript
// ResourcePool stats
const poolStats = getGlobalResourcePool().getStats();

// EventManager stats
const eventStats = getGlobalEventManager().getStats();

// AudioManager stats
const audioStats = getGlobalAudioManager().getStats();
```

## Next Phases

### Phase 2: Code Consolidation

- Unify SimpleBikePhysics and MotorcyclePhysicsV2
- Merge similar particle systems
- Combine traffic vehicle types

### Phase 3: Performance Optimization

- Implement unified update loop
- Add frame rate limiter
- Optimize collision detection

### Phase 4: Architecture Improvements

- Implement Entity-Component-System
- Add spatial partitioning
- Create plugin system

### Phase 5: Monitoring & Testing

- Add performance profiler
- Create automated tests
- Implement error tracking

## Troubleshooting

### Issue: Events not firing

- Ensure EventManager is not disposed
- Check context name matches
- Verify bindContext is set correctly

### Issue: Resources not sharing

- Check key uniqueness in ResourcePool
- Ensure same parameters generate same key
- Verify release() is called when done

### Issue: Audio not playing

- AudioManager must be initialized after user interaction
- Check mute state
- Verify sound pool is created before playing

### Issue: Memory still increasing

- Check all animation frames are tracked
- Ensure dispose() is called on all components
- Use MemoryLeakDetector to find leaks
