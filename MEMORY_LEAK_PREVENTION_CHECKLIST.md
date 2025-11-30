# Memory Leak Prevention Checklist for Motosai

## Overview

This checklist ensures all classes in the Motosai game properly clean up resources to prevent memory leaks. Use this when creating new classes or reviewing existing ones.

---

## ✅ Animation Frames

### Rules:

- **ALWAYS** store `requestAnimationFrame` IDs
- **ALWAYS** cancel with `cancelAnimationFrame()` in cleanup
- **NEVER** use `requestAnimationFrame` without tracking the ID

### Checklist:

- [ ] All `requestAnimationFrame` calls store their ID in an instance variable
- [ ] IDs are nulled after cancellation: `this.animationId = null`
- [ ] Cleanup/destroy method cancels ALL animation frames
- [ ] Animation loops check for cancellation flags before continuing

### Example:

```javascript
// Constructor
this.myAnimationId = null;

// Animation method
this.myAnimationId = requestAnimationFrame(this.animate.bind(this));

// Cleanup
if (this.myAnimationId) {
  cancelAnimationFrame(this.myAnimationId);
  this.myAnimationId = null;
}
```

---

## ✅ Event Listeners

### Rules:

- **ALWAYS** store bound event handlers as instance variables
- **NEVER** use `.bind()` directly in `addEventListener` (creates new function each time)
- **ALWAYS** remove listeners in cleanup with the EXACT same bound function

### Checklist:

- [ ] All event handlers are bound once in constructor
- [ ] Bound handlers are stored as instance variables (e.g., `this.boundOnResize`)
- [ ] `addEventListener` uses the stored bound handler
- [ ] `removeEventListener` uses the EXACT SAME bound handler
- [ ] All bound handlers are nulled after removal

### Example:

```javascript
// Constructor
this.boundOnResize = this.onResize.bind(this);
window.addEventListener("resize", this.boundOnResize);

// Cleanup
window.removeEventListener("resize", this.boundOnResize);
this.boundOnResize = null;
```

### Common Event Sources:

- [ ] `window` (resize, beforeunload, etc.)
- [ ] `document` (keydown, keyup, click, etc.)
- [ ] DOM elements (click, touchstart, mousedown, etc.)
- [ ] Canvas/Renderer elements (webglcontextlost, webglcontextrestored)

---

## ✅ Timers

### Rules:

- **ALWAYS** track timer IDs (setTimeout, setInterval)
- **ALWAYS** clear timers in cleanup
- **CONSIDER** using a Set to track multiple timers

### Checklist:

- [ ] All `setTimeout` IDs are stored
- [ ] All `setInterval` IDs are stored
- [ ] Timers are cleared in cleanup: `clearTimeout()` / `clearInterval()`
- [ ] Timer IDs are nulled after clearing
- [ ] Collections of timers (Sets/Arrays) are cleared

### Example:

```javascript
// Constructor
this.activeTimers = new Set();
this.myInterval = null;

// Usage
const timer = setTimeout(() => {
  /*...*/
}, 1000);
this.activeTimers.add(timer);

this.myInterval = setInterval(() => {
  /*...*/
}, 5000);

// Cleanup
this.activeTimers.forEach((timer) => clearTimeout(timer));
this.activeTimers.clear();

if (this.myInterval) {
  clearInterval(this.myInterval);
  this.myInterval = null;
}
```

---

## ✅ Three.js Resources

### Rules:

- **ALWAYS** call `.dispose()` on geometries, materials, and textures
- **BE CAREFUL** with shared/preloaded resources (don't dispose if shared)
- **ALWAYS** remove objects from scene before disposing

### Checklist:

- [ ] All geometries have `.dispose()` called
- [ ] All materials have `.dispose()` called
- [ ] All textures have `.dispose()` called
- [ ] Objects are removed from scene: `scene.remove(object)`
- [ ] Shared resources are NOT disposed (check if cloned from preloaded models)
- [ ] Large object references are nulled: `this.myModel = null`

### Example:

```javascript
// Cleanup
if (this.myMesh) {
  this.scene.remove(this.myMesh);

  if (this.myMesh.geometry) {
    this.myMesh.geometry.dispose();
  }

  if (this.myMesh.material) {
    // Handle array of materials
    if (Array.isArray(this.myMesh.material)) {
      this.myMesh.material.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    } else {
      if (this.myMesh.material.map) {
        this.myMesh.material.map.dispose();
      }
      this.myMesh.material.dispose();
    }
  }

  this.myMesh = null;
}
```

---

## ✅ Canvas & Context

### Rules:

- **ALWAYS** null out canvas contexts explicitly
- **ALWAYS** remove canvas from DOM

### Checklist:

- [ ] Canvas 2D/WebGL context is nulled: `this.ctx = null`
- [ ] Canvas element is removed from DOM: `this.canvas.remove()`
- [ ] Canvas reference is nulled: `this.canvas = null`

---

## ✅ WebSocket Connections

### Rules:

- **ALWAYS** close WebSocket connections in cleanup
- **ALWAYS** remove WebSocket event listeners

### Checklist:

- [ ] Socket is closed: `this.socket.close()`
- [ ] Socket event listeners are removed or socket is nulled
- [ ] Socket reference is nulled: `this.socket = null`

---

## ✅ DOM Elements

### Rules:

- **ALWAYS** remove event listeners before removing elements
- **ALWAYS** null out references after removal

### Checklist:

- [ ] All event listeners removed from elements
- [ ] Elements removed from DOM: `element.remove()` or `parent.removeChild(element)`
- [ ] Element references nulled: `this.myElement = null`

---

## ✅ Class Cleanup Pattern

### Every class should have:

```javascript
class MyClass {
  constructor() {
    // Initialize all tracking variables
    this.animationId = null;
    this.boundHandlers = {};
    this.activeTimers = new Set();
    this.resources = [];
  }

  // ... class methods ...

  cleanup() {
    // or destroy()

    // 1. Cancel animation frames
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // 2. Remove event listeners
    Object.entries(this.boundHandlers).forEach(([key, handler]) => {
      // Remove listener
      this.boundHandlers[key] = null;
    });

    // 3. Clear timers
    this.activeTimers.forEach((timer) => clearTimeout(timer));
    this.activeTimers.clear();

    // 4. Dispose Three.js resources
    this.resources.forEach((resource) => {
      if (resource && resource.dispose) {
        resource.dispose();
      }
    });
    this.resources = [];

    // 5. Remove DOM elements
    if (this.element) {
      this.element.remove();
      this.element = null;
    }

    // 6. Close connections
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    // 7. Null out large references
    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }
}
```

---

## ✅ Testing Checklist

### Manual Testing:

- [ ] Open Chrome DevTools → Performance → Memory
- [ ] Record heap snapshot before starting
- [ ] Play game for 5 minutes
- [ ] Trigger cleanup/restart game
- [ ] Take another heap snapshot
- [ ] Compare snapshots - memory should not continuously grow
- [ ] Check for "Detached DOM tree" warnings

### Automated Testing:

- [ ] Test that `cleanup()` is called when game restarts
- [ ] Test that `cleanup()` is called when page unloads
- [ ] Verify no "Detached DOM tree" errors in console
- [ ] Monitor memory usage over extended gameplay (30+ minutes)

---

## ✅ Code Review Checklist

When reviewing code, ask:

- [ ] Does this class have a `cleanup()` or `destroy()` method?
- [ ] Is the cleanup method called when the object is no longer needed?
- [ ] Are all `requestAnimationFrame` calls tracked and cancelled?
- [ ] Are all `addEventListener` calls paired with `removeEventListener`?
- [ ] Are event handlers bound once (not in `addEventListener`)?
- [ ] Are all `setTimeout`/`setInterval` calls cleared?
- [ ] Are Three.js geometries/materials/textures disposed?
- [ ] Are large object references nulled?
- [ ] Are WebSocket connections closed?
- [ ] Are canvas contexts nulled?

---

## 🔍 Common Memory Leak Patterns to Avoid

### ❌ BAD: Binding in addEventListener

```javascript
window.addEventListener("resize", this.onResize.bind(this)); // Creates new function
window.removeEventListener("resize", this.onResize.bind(this)); // Won't work! Different function
```

### ✅ GOOD: Store bound handler

```javascript
this.boundOnResize = this.onResize.bind(this);
window.addEventListener("resize", this.boundOnResize);
window.removeEventListener("resize", this.boundOnResize); // Works!
```

---

### ❌ BAD: Untracked animation frame

```javascript
const animate = () => {
  // Do stuff
  requestAnimationFrame(animate); // Can't cancel this!
};
animate();
```

### ✅ GOOD: Tracked animation frame

```javascript
this.animationId = null;

const animate = () => {
  // Do stuff
  this.animationId = requestAnimationFrame(animate);
};
this.animationId = requestAnimationFrame(animate);

// In cleanup:
if (this.animationId) {
  cancelAnimationFrame(this.animationId);
}
```

---

### ❌ BAD: Untracked timers

```javascript
setTimeout(() => {
  /*...*/
}, 5000); // Can't clear this if cleanup is called!
```

### ✅ GOOD: Tracked timers

```javascript
const timerId = setTimeout(() => {
  this.activeTimers.delete(timerId);
  /*...*/
}, 5000);
this.activeTimers.add(timerId);

// In cleanup:
this.activeTimers.forEach((timer) => clearTimeout(timer));
```

---

## 📋 Summary

**Key Principles:**

1. **If you create it, you must destroy it**
2. **If you add it, you must remove it**
3. **If you open it, you must close it**
4. **If you allocate it, you must free it**

**When in doubt:**

- Store the reference/ID
- Track it in a collection
- Clean it up in the cleanup method
- Null it out after cleanup

---

## 🐛 Debugging Memory Leaks

If you suspect a memory leak:

1. Open Chrome DevTools → Memory tab
2. Take heap snapshot
3. Interact with the feature
4. Trigger cleanup
5. Take another snapshot
6. Click "Comparison" and look for:
   - Objects that should be garbage collected but aren't
   - Detached DOM trees
   - Large arrays/objects that keep growing
7. Use the "Retainers" view to see what's holding references

Common culprits:

- Event listeners not removed
- Animation frames not cancelled
- Timers not cleared
- Three.js resources not disposed
- Circular references preventing garbage collection

---

**Last Updated:** 2025-10-12
**Version:** 1.0
**Maintained By:** Motosai Development Team
