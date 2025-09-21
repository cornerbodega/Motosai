# Memory Leak Fix Implementation Plan

## Overview
Fix all memory leaks while maintaining 100% of game functionality. The goal is to reduce material count from 40,000+ to under 200 and eliminate the 500-1000 materials/sec leak rate.

---

## Phase 1: Create Material Management Infrastructure (Priority: CRITICAL)

### 1.1 Material Manager System
**File:** `client/src/utils/MaterialManager.js`
```javascript
class MaterialManager {
  constructor() {
    this.materials = new Map();      // Cache shared materials
    this.clonedMaterials = new Set(); // Track clones for disposal
    this.vehiclePool = new Map();    // Pooled vehicle materials
  }

  // Get or create shared material
  getMaterial(type, options) {
    const key = `${type}_${JSON.stringify(options)}`;
    if (!this.materials.has(key)) {
      const material = this.createMaterial(type, options);
      this.materials.set(key, material);
    }
    return this.materials.get(key);
  }

  // Clone with tracking
  cloneMaterial(original) {
    const clone = original.clone();
    this.clonedMaterials.add(clone);
    return clone;
  }

  // Dispose specific material
  disposeMaterial(material) {
    if (this.clonedMaterials.has(material)) {
      material.dispose();
      this.clonedMaterials.delete(material);
    }
  }

  // Cleanup all tracked materials
  dispose() {
    this.clonedMaterials.forEach(m => m.dispose());
    this.clonedMaterials.clear();
  }
}
```

**Benefits:**
- Centralized material creation
- Automatic tracking of clones
- Easy cleanup on scene changes
- Material reuse for common types

---

## Phase 2: Fix Traffic System Leaks

### 2.1 Vehicle Material Pooling
**File:** `client/src/game/TrafficSystem.js`

**Current Problem:**
```javascript
// LEAK: Creating new materials for every vehicle
const material = new THREE.MeshStandardMaterial({
  color: vehicleColor,
  metalness: 0.5
});
```

**Fix:**
```javascript
class TrafficSystem {
  constructor() {
    this.materialManager = new MaterialManager();
    this.vehicleMaterials = this.initVehicleMaterials();
    this.disposedVehicles = [];
  }

  initVehicleMaterials() {
    // Pre-create all vehicle materials once
    const colors = [0xff0000, 0x00ff00, 0x0000ff, /* ... */];
    const materials = new Map();

    colors.forEach(color => {
      materials.set(color, new THREE.MeshStandardMaterial({
        color,
        metalness: 0.5,
        roughness: 0.3
      }));
    });

    return materials;
  }

  createVehicle(type) {
    const vehicle = new THREE.Group();
    const color = this.getRandomColor();

    // REUSE existing material instead of creating new
    const material = this.vehicleMaterials.get(color);

    // Create mesh with shared material
    const mesh = new THREE.Mesh(geometry, material);
    vehicle.add(mesh);

    vehicle.userData.dispose = () => {
      // Don't dispose shared material!
      geometry.dispose(); // Only dispose geometry
    };

    return vehicle;
  }

  removeVehicle(vehicle) {
    if (vehicle.userData.dispose) {
      vehicle.userData.dispose();
    }
    this.scene.remove(vehicle);
  }

  dispose() {
    // Dispose all pooled materials once
    this.vehicleMaterials.forEach(m => m.dispose());
    this.vehicleMaterials.clear();
  }
}
```

---

## Phase 3: Fix Highway System Leaks

### 3.1 Road Segment Material Reuse
**File:** `client/src/game/Highway101.js`

**Current Problem:**
```javascript
// LEAK: Creating materials for each road segment
createRoadSegment() {
  const material = new THREE.MeshStandardMaterial({ color: 0x333333 });
  // Material never disposed
}
```

**Fix:**
```javascript
class Highway101 {
  constructor() {
    // Create materials once
    this.roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.8
    });

    this.lineMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff
    });

    this.segments = [];
  }

  createRoadSegment(position) {
    // REUSE the same material for all segments
    const mesh = new THREE.Mesh(this.roadGeometry, this.roadMaterial);
    mesh.position.copy(position);

    this.segments.push(mesh);
    this.scene.add(mesh);

    return mesh;
  }

  removeOldSegments() {
    const toRemove = this.segments.splice(0, 10);
    toRemove.forEach(segment => {
      // Only remove from scene, don't dispose shared material
      this.scene.remove(segment);
      // Dispose only geometry if unique
      if (segment.geometry !== this.roadGeometry) {
        segment.geometry.dispose();
      }
    });
  }

  dispose() {
    // Clean up materials once at the end
    this.roadMaterial.dispose();
    this.lineMaterial.dispose();
    this.roadGeometry.dispose();

    this.segments.forEach(s => this.scene.remove(s));
    this.segments = [];
  }
}
```

---

## Phase 4: Fix Particle System Leaks

### 4.1 Blood Track System
**File:** `client/src/game/BloodTrackSystem.js`

**Current Problem:**
```javascript
// LEAK: Creating materials for each blood particle
createBloodParticle() {
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
}
```

**Fix:**
```javascript
class BloodTrackSystem {
  constructor() {
    // Single shared material for all blood
    this.bloodMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.8
    });

    this.particles = [];
    this.maxParticles = 100;
  }

  createBloodSplatter(position) {
    let particle;

    // Reuse old particles if at max
    if (this.particles.length >= this.maxParticles) {
      particle = this.particles.shift();
      particle.position.copy(position);
      particle.visible = true;
    } else {
      // Create new particle with SHARED material
      particle = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.5),
        this.bloodMaterial // Shared!
      );
      particle.position.copy(position);
      this.scene.add(particle);
    }

    this.particles.push(particle);
    return particle;
  }

  fadeParticle(particle, deltaTime) {
    // Fade using mesh opacity, not material
    particle.material.opacity -= deltaTime * 0.5;

    if (particle.material.opacity <= 0) {
      particle.visible = false;
    }
  }

  dispose() {
    this.bloodMaterial.dispose();
    this.particles.forEach(p => {
      p.geometry.dispose();
      this.scene.remove(p);
    });
  }
}
```

---

## Phase 5: Fix Background System Leaks

### 5.1 Background Material Management
**File:** `client/src/game/backgrounds/BackgroundSystem.js`

**Fix:**
```javascript
class BackgroundSystem {
  constructor() {
    this.backgroundMaterials = new Map();
    this.currentBackground = null;
  }

  loadBackground(imageUrl) {
    // Check if we already have this material
    if (this.backgroundMaterials.has(imageUrl)) {
      return this.backgroundMaterials.get(imageUrl);
    }

    const texture = new THREE.TextureLoader().load(imageUrl, (tex) => {
      // Important: Mark for disposal
      tex.userData.shouldDispose = true;
    });

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide
    });

    this.backgroundMaterials.set(imageUrl, material);

    // Limit cache size
    if (this.backgroundMaterials.size > 10) {
      const firstKey = this.backgroundMaterials.keys().next().value;
      const oldMaterial = this.backgroundMaterials.get(firstKey);
      oldMaterial.dispose();
      oldMaterial.map.dispose();
      this.backgroundMaterials.delete(firstKey);
    }

    return material;
  }

  dispose() {
    this.backgroundMaterials.forEach(material => {
      if (material.map) material.map.dispose();
      material.dispose();
    });
    this.backgroundMaterials.clear();
  }
}
```

---

## Phase 6: Fix Death Animation Leaks

### 6.1 Death Effect Materials
**File:** `client/src/game/DeathAnimation.js`

**Fix:**
```javascript
class DeathAnimation {
  constructor() {
    // Create materials once
    this.explosionMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true
    });

    this.smokeMaterial = new THREE.MeshBasicMaterial({
      color: 0x333333,
      transparent: true
    });

    this.activeEffects = [];
  }

  playDeathEffect(position) {
    const effect = new THREE.Group();

    // Reuse materials
    const explosion = new THREE.Mesh(
      new THREE.SphereGeometry(2),
      this.explosionMaterial
    );

    effect.add(explosion);
    effect.position.copy(position);

    this.activeEffects.push(effect);
    this.scene.add(effect);

    // Animate and remove
    setTimeout(() => {
      this.scene.remove(effect);
      explosion.geometry.dispose();

      const index = this.activeEffects.indexOf(effect);
      if (index > -1) this.activeEffects.splice(index, 1);
    }, 2000);
  }

  dispose() {
    this.explosionMaterial.dispose();
    this.smokeMaterial.dispose();

    this.activeEffects.forEach(effect => {
      this.scene.remove(effect);
      effect.traverse(child => {
        if (child.geometry) child.geometry.dispose();
      });
    });
  }
}
```

---

## Phase 7: Global Cleanup Integration

### 7.1 Main Game Cleanup
**File:** `client/src/game/MotosaiGame.js`

**Add to dispose method:**
```javascript
dispose() {
  // ... existing code ...

  // Dispose all subsystems properly
  const systems = [
    this.traffic,
    this.highway,
    this.backgrounds,
    this.bloodTrackSystem,
    this.deathAnimation
  ];

  systems.forEach(system => {
    if (system && typeof system.dispose === 'function') {
      system.dispose();
    }
  });

  // Final scene cleanup
  this.scene.traverse((object) => {
    if (object.geometry) {
      object.geometry.dispose();
    }

    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach(mat => this.disposeMaterial(mat));
      } else {
        this.disposeMaterial(object.material);
      }
    }
  });

  // Clear scene
  while(this.scene.children.length > 0) {
    this.scene.remove(this.scene.children[0]);
  }
}

disposeMaterial(material) {
  if (!material) return;

  // Dispose all textures
  const textures = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap',
    'aoMap', 'emissiveMap', 'bumpMap', 'displacementMap',
    'alphaMap', 'envMap'
  ];

  textures.forEach(texName => {
    if (material[texName]) {
      material[texName].dispose();
    }
  });

  material.dispose();
}
```

---

## Testing & Validation

### Test Checklist
- [ ] Monitor shows materials < 200
- [ ] No growth in materials during gameplay
- [ ] Traffic spawning/removal doesn't leak
- [ ] Death animations clean up properly
- [ ] Background changes don't leak
- [ ] Memory stays stable over 10+ minutes
- [ ] All visual effects still work
- [ ] Performance remains at 60+ FPS

### Monitoring Command
```bash
# Terminal 1
cd Motosai/server && npm start

# Terminal 2
cd Motosai/server && node monitor-simple.js

# Watch for:
# - Materials staying under 200
# - Undisposed resources under 100
# - No growth patterns
```

---

## Implementation Order

1. **Day 1:** Create MaterialManager (1 hour)
2. **Day 1:** Fix Traffic System (2 hours)
3. **Day 1:** Fix Highway System (1 hour)
4. **Day 2:** Fix Blood/Particle Systems (1 hour)
5. **Day 2:** Fix Death Animation (1 hour)
6. **Day 2:** Fix Background System (1 hour)
7. **Day 3:** Integration testing (2 hours)
8. **Day 3:** Performance validation (1 hour)

**Total Time Estimate:** 10 hours

---

## Success Metrics

### Before Fix
- Materials: 40,000+
- Leak Rate: 500-1000/sec
- Memory Growth: 23MB/8sec
- Stability: 3-5 minutes

### After Fix
- Materials: < 200
- Leak Rate: 0/sec
- Memory Growth: 0MB/min
- Stability: Hours

---

## Notes

- All fixes preserve 100% functionality
- Visual quality remains unchanged
- Performance will actually improve
- Code becomes more maintainable
- Material pooling can be extended for future features