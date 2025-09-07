# What Worked: Infinite Highway Scrolling

## The Problem
The highway had gaps appearing when driving far distances due to incorrect segment recycling and positioning.

## What Actually Worked

### 1. Group-Based Positioning
```javascript
// Position the entire group, not individual children
const segment = new THREE.Group();
segment.position.z = zPosition;
```
- Each segment is a THREE.Group positioned at its world Z coordinate
- All children use local coordinates (z=0) relative to their group
- This separation makes repositioning clean and simple

### 2. Find-Max Recycling Algorithm
```javascript
// Find the furthest forward segment
let maxZ = -Infinity;
this.segments.forEach(s => {
  if (s.z > maxZ) maxZ = s.z;
});

// Place this segment after the furthest one
segment.z = maxZ + this.segmentLength;
segment.group.position.z = segment.z;
```
- Instead of calculating where a segment "should" be, find where the last one actually is
- Place the recycled segment exactly one segment-length after that
- This prevents accumulating floating-point errors

### 3. Local Coordinate System for Children
- Road surface: `position.z = 0` (not zPosition)
- Lane markings: Relative to segment center
- Trees/signs: Local offsets only
- This means when the group moves, everything moves correctly together

### 4. Clean State Tracking
```javascript
this.segments.push({
  group: segment,  // The THREE.Group
  z: zPosition     // Current world position
});
```
- Track both the group and its world position
- Update both when recycling

## Key Principles

1. **One source of truth**: Group position is THE position
2. **Local coordinates**: Children never know their world position
3. **Find don't calculate**: Look for actual positions rather than computing theoretical ones
4. **Simple recycling**: Move whole groups, not individual meshes

## The Magic Numbers

```javascript
segmentLength: 100 meters
numSegments: 10
// This gives 1km of road, recycling happens every 500m
```

## Sign Heights That Look Right
- Distance markers: 2m tall (rider eye level ~1.2m)
- Exit signs: 2.5m high (slightly overhead)
- Base position: y=0 (ground level)

## What to Avoid
- Mixing world and local coordinates
- Calculating positions based on distance traveled
- Moving individual meshes instead of groups
- Complex position math that accumulates errors