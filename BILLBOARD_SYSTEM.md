# Billboard System - Motosai

## Overview

Memory-efficient billboard advertising system with dynamic texture loading and Supabase CMS integration.

## Features

✅ **Memory-Optimized**
- Conservative 15MB texture cache limit
- LRU (Least Recently Used) eviction
- Reference-counted texture sharing
- Distance-based loading/unloading (400m load, 600m unload)
- Maximum 8 billboards loaded simultaneously

✅ **Performance**
- Lazy loading (only load nearby billboards)
- Aggressive culling (hide billboards behind player)
- Shared geometry instancing (2 geometries for all billboards)
- No mipmaps (saves memory on flat billboards)
- Throttled distance checks (0.5s intervals)
- Memory optimization: ~10KB for 2 shared geometries vs ~100KB for 10 individual geometries

✅ **Integration**
- Stoppa memory manager tracking
- Proper disposal lifecycle
- Debug logging and statistics
- Material Manager compatible

## Architecture

### Core Classes

#### `TextureCache` (`/client/src/services/TextureCache.js`)
- Singleton texture cache with reference counting
- Automatic LRU eviction when memory limit reached
- Memory tracking and statistics
- Optimized texture settings (no mipmaps, RGB format)

#### `Billboard` (`/client/src/game/Billboard.js`)
- Individual billboard with texture loading
- State management (unloaded, loading, loaded, culled, error)
- Automatic retry with fallback texture
- Stoppa integration for memory tracking
- Dynamic texture updates

#### `BillboardSystem` (`/client/src/game/BillboardSystem.js`)
- Manages all billboards in the game
- Distance-based loading/unloading
- Update throttling for performance
- Statistics and debugging tools
- Test billboard generation

## Usage

### Basic Setup (Already Integrated)

```javascript
// In MotosaiGame constructor
this.billboardSystem = null;

// In initBillboards()
this.billboardSystem = new BillboardSystem(this.scene);
this.billboardSystem.createTestBillboards(10, 500);

// In game loop update()
if (this.billboardSystem) {
  this.billboardSystem.update(deltaTime, state.position);
}

// In dispose()
if (this.billboardSystem) {
  this.billboardSystem.dispose();
  this.billboardSystem = null;
}
```

### Memory Configuration

Current conservative limits:
- **Max texture cache:** 15MB
- **Max loaded billboards:** 8
- **Load distance:** 400m
- **Unload distance:** 600m
- **Cull distance:** -50m (behind player)

### Debugging

```javascript
// In browser console

// View texture cache stats
window.textureCache.logStats();

// View billboard system stats
// (Add to DevMenu or console)
game.billboardSystem.logStats();
game.billboardSystem.getStats();

// View loaded billboards
game.billboardSystem.getLoadedBillboardsInfo();
```

## File Structure

```
Motosai/
├── client/src/
│   ├── game/
│   │   ├── Billboard.js              # Individual billboard
│   │   ├── BillboardSystem.js        # Billboard manager
│   │   └── MotosaiGame.js            # Integration
│   ├── services/
│   │   ├── TextureCache.js           # Shared texture cache
│   │   └── BillboardService.js       # (TODO: Supabase integration)
├── public/
│   └── textures/
│       └── billboards/
│           ├── default.png           # Default texture
│           └── generate_default.html # Texture generator
```

## Next Steps

### 1. Create Default Texture
```bash
# Open in browser and download
open public/textures/billboards/generate_default.html
# Save as: public/textures/billboards/default.png
```

### 2. Test the System
```bash
cd client
npm run dev
# Watch console for billboard loading logs
```

### 3. Supabase Integration (Phase 2)

Create tables:
```sql
-- Billboard locations
CREATE TABLE ms_billboards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  position_x FLOAT NOT NULL,
  position_y FLOAT NOT NULL,
  position_z FLOAT NOT NULL,
  rotation_y FLOAT DEFAULT 0,
  scale_x FLOAT DEFAULT 10,
  scale_y FLOAT DEFAULT 5,
  side TEXT CHECK (side IN ('left', 'right', 'both')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Ad campaigns
CREATE TABLE ms_ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  texture_url TEXT NOT NULL,
  advertiser TEXT,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  priority INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Billboard-Ad assignments
CREATE TABLE ms_billboard_ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billboard_id UUID REFERENCES ms_billboards(id) ON DELETE CASCADE,
  ad_id UUID REFERENCES ms_ads(id) ON DELETE CASCADE,
  weight INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(billboard_id, ad_id)
);
```

### 4. CMS Interface (Phase 3)
Build admin interface for:
- Billboard placement (visual map)
- Ad upload (Supabase Storage)
- Campaign scheduling
- Preview billboards in 3D

## Memory Budget Breakdown

**Target:** ~5MB total billboard memory

- 8 billboards × 400KB each = 3.2MB (textures only)
- Shared geometries: 2 × ~5KB = ~10KB (vs 8 × ~10KB = ~80KB individual)
- Materials: 8 × ~2KB = ~16KB
- Overhead & cache = ~1.8MB
- **Total:** ~5MB ✅

**Texture Optimization:**
- Resolution: 1024×512 (or 512×256)
- Format: WebP or compressed JPEG
- Target size: 300-500KB per texture

**Geometry Optimization:**
- Only 2 shared PlaneGeometry instances (large: 20×10, small: 12×6)
- All billboards reference the same geometry
- Saves ~70KB+ with 10 billboards (90% reduction in geometry memory)

## Performance Metrics

Monitor in production:
- Texture cache hit rate (target: >80%)
- Memory usage (target: <15MB)
- Load/unload frequency
- Billboard visibility count

## Known Limitations

1. **Texture loading disabled:** Textures commented out (TODO markers) - using solid white
2. **Supabase not integrated:** Currently using test billboards
3. **No CMS yet:** Manual billboard placement in code
4. **Static ads:** No dynamic ad rotation yet

## Future Enhancements

- [ ] Dynamic ad rotation based on time/priority
- [ ] A/B testing support
- [ ] Click tracking (ray casting)
- [ ] Animated billboards (video textures)
- [ ] LOD system (lower res at distance)
- [ ] Compression (WEBP, KTX2 textures)

---

**Status:** ✅ Core system implemented, integrated, and memory-optimized with shared geometry
**Next:** Enable texture loading, then integrate Supabase CMS
