# PCH Background & Location Implementation Plan
**Document ID:** 004  
**Date:** 2025-01-07  
**Purpose:** Implement real-world PCH backgrounds using Flickr photos and accurate location tracking for multiplayer support

## Overview
Linear racing game from Seattle to San Diego along Pacific Coast Highway with:
- Real photographic backgrounds from CC-licensed Flickr photos
- Procedural foreground elements (trees, signs, guardrails)
- Absolute position tracking for multiplayer synchronization
- No turns - purely linear progression

## Phase 1: Data Collection & Structure
**Timeline: Week 1**

### 1.1 Route Database Creation
- Define 240 waypoints (every 10 miles from Seattle to San Diego)
- Store GPS coordinates, elevation, mile markers
- Add metadata: city names, landmarks, terrain type
- Total route distance: ~2,400 miles (3,862 km)

### 1.2 Flickr API Integration
```javascript
class FlickrPhotoService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.flickr.com/services/rest/';
  }
  
  async fetchPhotosForLocation(lat, lng, radius = 5000) {
    // Query parameters:
    // - geo: lat, lng, radius
    // - license: 1,2,3,4,5,6 (CC licenses)
    // - tags: coast,ocean,highway,panorama
    // - sort: interestingness-desc
    // - extras: url_l, views, geo, tags
    // Return: top 3 panoramic photos per location
  }
  
  validatePhoto(photo) {
    // Check aspect ratio (prefer 3:1 or wider)
    // Verify resolution (min 1920px wide)
    // Filter daytime photos (EXIF or brightness analysis)
    // Confirm ocean-side orientation
  }
}
```

### 1.3 Photo Validation Pipeline
- **Aspect Ratio:** Prefer 3:1 or wider for panoramic effect
- **Resolution:** Minimum 1920px width
- **Time of Day:** Daytime photos only (check EXIF or analyze brightness)
- **Orientation:** Verify ocean is visible on correct side
- **Quality Score:** Rate by views, favorites, aspect ratio match

## Phase 2: Background Rendering System
**Timeline: Week 2**

### 2.1 Multi-Layer Background Architecture
```javascript
class BackgroundSystem {
  constructor(scene) {
    this.layers = {
      skybox: null,      // Gradient or photo sky (no parallax)
      distant: null,     // Flickr panorama (parallax factor: 0.1)
      midground: null,   // Procedural hills (parallax factor: 0.3)
      nearground: null   // Procedural trees (parallax factor: 0.7)
    };
    this.currentSegment = null;
    this.photoCache = new Map();
  }
  
  updatePosition(absolutePosition) {
    // Calculate current segment
    // Load appropriate backgrounds
    // Apply parallax scrolling
    // Trigger transitions if needed
  }
}
```

### 2.2 Dynamic Loading Strategy
- **Preload Zone:** Current segment + next 2 segments
- **Active Zone:** Current segment only (full resolution)
- **Cache Zone:** Previous 2 segments + next 5 segments (low resolution)
- **Purge Zone:** Everything beyond 10 segments distance
- **Memory Budget:** Maximum 100MB for cached photos

### 2.3 Seamless Transition System
- Fade between photos over 200m distance
- Morph procedural elements gradually
- Adjust fog color/density per segment
- Smooth lighting transitions
- Crossfade duration: 2-3 seconds

## Phase 3: Procedural Element Generation
**Timeline: Week 3**

### 3.1 Vegetation Database
```javascript
const vegetationDB = {
  "seattle": { 
    trees: "douglas_fir", 
    density: 0.8, 
    height: [20, 40],
    color: 0x2F5233
  },
  "cannon_beach": { 
    trees: "coastal_pine", 
    density: 0.6,
    height: [15, 25],
    color: 0x3A5F3A
  },
  "big_sur": { 
    trees: "coastal_redwood", 
    density: 0.6,
    height: [40, 80],
    color: 0x4A6741
  },
  "malibu": { 
    trees: "palm", 
    density: 0.3,
    height: [10, 20],
    color: 0x5A7A5A
  },
  "san_diego": {
    trees: "fan_palm",
    density: 0.4,
    height: [8, 15],
    color: 0x6B8E6B
  }
};
```

### 3.2 Dynamic Sign Generator
- **Mile Markers:** Every mile (green signs)
- **City Limits:** City entry/exit signs
- **Speed Limits:** Change based on location
- **Landmarks:** Notable location announcements
- **Distance Signs:** "Los Angeles 125 miles"
- **Exit Signs:** Major junction indicators

### 3.3 Terrain Features
- **Guardrails:** Automatically placed on cliff sections
- **Rock Formations:** Procedural rocks for Big Sur area
- **Beach Access:** Signs and paths to beaches
- **Parking Overlooks:** Scenic viewpoint pullouts
- **Bridges:** Simplified versions of Bixby Creek, Golden Gate hints

## Phase 4: Location System for Multiplayer
**Timeline: Week 4**

### 4.1 Absolute Position Tracking
```javascript
class LocationManager {
  constructor() {
    this.absolutePosition = 0;      // meters from Seattle start
    this.currentSegmentId = "";     // for quick lookups
    this.segmentProgress = 0;       // 0-1 within segment
    this.gpsCoordinates = {lat: 0, lng: 0}; // interpolated
    this.elevation = 0;              // meters above sea level
    this.nearbyPlayers = [];        // multiplayer tracking
  }
  
  updatePosition(deltaDistance) {
    this.absolutePosition += deltaDistance;
    this.updateSegment();
    this.interpolateGPS();
    this.broadcastPosition();
  }
  
  getRelativePosition(otherPlayer) {
    // Return distance and direction to other player
    return otherPlayer.absolutePosition - this.absolutePosition;
  }
}
```

### 4.2 Multiplayer Synchronization
- **Broadcast Rate:** Position every 100ms
- **Data Packet:** {id, position, speed, lane}
- **Interpolation:** Smooth movement between updates
- **Visibility Range:** Show players within 5km
- **Instance System:** Ghost mode for different race instances
- **Catchup Mechanics:** Rubber-band AI for close racing

### 4.3 Progress Persistence
- **Checkpoint System:** Save at every major city
- **LocalStorage:** Save current position
- **Resume Logic:** Start from last checkpoint
- **Leaderboards:** Track best times per segment
- **Statistics:** Distance traveled, time played

## Phase 5: Optimization & Polish
**Timeline: Week 5**

### 5.1 Performance Targets
- **Frame Rate:** Maintain 60 FPS with all layers active
- **Memory Usage:** < 100MB for photo cache
- **Load Time:** < 2 seconds for segment transitions
- **Network:** < 5KB/s for multiplayer data
- **Mobile:** 30 FPS minimum on mid-range devices

### 5.2 Fallback Systems
```javascript
const fallbackStrategy = {
  noPhoto: "Generate procedural gradient background",
  slowConnection: "Use lower resolution (960px width)",
  mobileDevice: "Reduce to 3 layers instead of 5",
  lowMemory: "Aggressive cache purging",
  offlineMode: "Use cached/procedural only"
};
```

### 5.3 Testing Checkpoints
1. **Seattle Start:** Urban environment, overcast sky
2. **Cannon Beach:** First dramatic ocean view, Haystack Rock
3. **Redwood Forest:** Dense tree coverage, filtered light
4. **Golden Gate:** Iconic bridge visible in distance
5. **Big Sur:** Dramatic cliffs, winding elevation
6. **Santa Barbara:** Mediterranean feel, palm trees
7. **Malibu:** Beaches, luxury atmosphere
8. **Los Angeles:** Urban density, smog effects
9. **San Diego:** Finish line, perfect weather

## Implementation Priority Order

### Must Have (MVP)
1. Basic waypoint system with absolute positions
2. Flickr photo fetching for 10 key locations
3. Background plane rendering with photos
4. Simple procedural trees
5. Location tracking system

### Should Have
6. Full 240 waypoint coverage
7. Procedural signs and guardrails
8. Smooth photo transitions
9. Multiplayer position broadcasting
10. Parallax scrolling effects

### Nice to Have
11. Weather variations
12. Time of day changes
13. Seasonal differences
14. Traffic density variations
15. Photo voting system

## Technical Architecture

### File Structure
```
/src/game/
  /backgrounds/
    BackgroundSystem.js       // Main background manager
    FlickrService.js          // Photo fetching and caching
    PhotoCache.js             // IndexedDB photo storage
    ProceduralElements.js     // Trees, signs, guardrails
    ParallaxLayer.js          // Individual layer handling
  /location/
    LocationManager.js        // Absolute position tracking
    RouteDatabase.js          // Waypoint and GPS data
    SegmentLoader.js          // Dynamic segment loading
    MultiplayerSync.js        // Network position updates
  /data/
    pch-waypoints.json        // Static waypoint database
    vegetation-zones.json     // Tree/plant definitions
    sign-database.json        // Sign content and positions
```

### Data Flow
1. **Game Loop** → Updates player position
2. **LocationManager** → Calculates absolute position and segment
3. **BackgroundSystem** → Loads appropriate photos for segment
4. **FlickrService** → Fetches/caches photos as needed
5. **ProceduralElements** → Generates trees/signs for current area
6. **ParallaxLayer** → Applies scrolling based on speed
7. **MultiplayerSync** → Broadcasts position to server

## Memory Management

### Photo Cache Strategy
```javascript
class PhotoCache {
  constructor(maxSizeMB = 100) {
    this.maxSize = maxSizeMB * 1024 * 1024;
    this.cache = new Map();
    this.lru = []; // Least recently used tracking
  }
  
  add(segmentId, photo, resolution) {
    // Check size limit
    // Compress if needed
    // Update LRU
    // Store in IndexedDB for persistence
  }
  
  evict() {
    // Remove least recently used
    // Keep current + adjacent segments
  }
}
```

## API Integration Details

### Flickr API Requirements
- **API Key:** Required (free tier available)
- **Rate Limits:** 3600 requests per hour
- **Caching Strategy:** Store photos for 7 days minimum
- **Attribution:** Display photographer name and CC license

### Backup Image Sources
1. **Unsplash API:** Higher quality but fewer panoramas
2. **Pexels API:** Good variety, free tier available
3. **Generated Gradients:** Ultimate fallback

## Performance Benchmarks

### Target Metrics
- **Initial Load:** < 5 seconds to playable
- **Segment Switch:** < 500ms transition
- **Photo Load:** < 2 seconds per photo
- **Memory Usage:** < 200MB total
- **Network Usage:** < 10MB per play session

### Optimization Techniques
1. **Texture Atlasing:** Combine small textures
2. **LOD System:** Reduce detail at distance
3. **Frustum Culling:** Don't render off-screen elements
4. **Object Pooling:** Reuse procedural elements
5. **Lazy Loading:** Load photos just before needed

## Success Criteria

### User Experience Goals
- Recognizable landmarks at correct locations
- Smooth progression without loading hitches
- Accurate representation of PCH journey
- Multiplayer races feel synchronized
- Photos enhance rather than distract from gameplay

### Technical Goals
- All 240 waypoints have appropriate backgrounds
- 90% of segments have real photos
- Multiplayer sync within 100ms accuracy
- Runs on 2018+ mobile devices
- Total download size < 50MB (excluding cached photos)

## Risk Mitigation

### Potential Issues & Solutions
1. **No suitable photos found**
   - Solution: Procedural gradient fallback
   
2. **Flickr API down/limited**
   - Solution: Pre-cache popular segments, use procedural
   
3. **Performance issues on mobile**
   - Solution: Reduce layers, lower resolution
   
4. **Multiplayer desync**
   - Solution: Authoritative server, interpolation
   
5. **Large download size**
   - Solution: Progressive loading, compress textures

## Future Enhancements

### Version 2.0 Features
- Weather system synchronized with real weather API
- Day/night cycle based on real time
- Seasonal variations (summer/winter textures)
- User-submitted photos for segments
- Virtual tourism mode (slow scenic drive)
- Historic route mode (1960s PCH)

### Community Features
- Photo contests for best segment backgrounds
- Custom liveries visible in multiplayer
- Route creator for alternate paths
- Time trial ghosts from top players

## Conclusion

This implementation plan provides a structured approach to creating an authentic PCH racing experience using real-world imagery and accurate location data. The phased approach allows for iterative development while maintaining focus on core features that support both single-player immersion and multiplayer functionality.

The combination of Flickr's CC-licensed photos for backgrounds and procedural generation for foreground elements creates a visually rich environment without licensing concerns. The linear nature of the route simplifies many technical challenges while still providing an engaging and authentic racing experience.