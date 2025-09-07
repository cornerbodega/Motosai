# Collision System Plan - Realistic Motorcycle Physics

## Current State Analysis
- TrafficSystem has basic `checkCollision()` that only detects collision
- No collision response (bike just passes through)
- No physics reaction or consequences

## Goal: Realistic Collision Behavior
Make collisions feel impactful and consequential while keeping it fun and playable.

## Implementation Plan

### Phase 1: Basic Collision Response (Working Demo)
**Goal**: Bike bounces/slides when hitting vehicles

1. **Collision Detection Enhancement**
   - Add collision checking in SimpleBikePhysics.update()
   - Calculate collision normal and impact force
   - Detect collision type: side-swipe, rear-end, head-on

2. **Simple Physics Response**
   ```javascript
   // On collision:
   - Reduce speed by impact factor
   - Add lateral velocity (push sideways)
   - Induce wobble (temporary loss of control)
   - Possible fall if impact too strong
   ```

### Phase 2: Advanced Collision Physics (Working Demo)
**Goal**: Different collision types have different outcomes

1. **Collision Types**
   - **Glancing blow** (< 20° angle): Slight deflection, speed reduction
   - **Side-swipe** (20-60°): Major deflection, possible lane change
   - **T-bone** (60-90°): Spin out, major speed loss
   - **Head-on** (> 120°): Full crash, bike stops

2. **Physics Response Matrix**
   ```javascript
   collisionResponse = {
     glancing: { speedLoss: 0.2, deflection: 0.3, wobbleDuration: 0.5 },
     sideSwipe: { speedLoss: 0.4, deflection: 0.6, wobbleDuration: 1.0 },
     tBone: { speedLoss: 0.7, deflection: 1.0, wobbleDuration: 2.0 },
     headOn: { speedLoss: 1.0, deflection: 0, crash: true }
   }
   ```

### Phase 3: Visual & Audio Feedback (Working Demo)
**Goal**: Make collisions feel impactful

1. **Visual Effects**
   - Screen shake on impact
   - Sparks particle system at collision point
   - Bike damage model (scratches, dents)
   - Rider ragdoll on major crashes

2. **Audio** 
   - Impact sounds (metal scraping, crash)
   - Engine stutter after collision
   - Tire screech during slides

### Phase 4: Recovery Mechanics (Working Demo)
**Goal**: Give player ways to recover from collisions

1. **Control Recovery**
   - Wobble dampening through counter-steering
   - Speed-based recovery time
   - "Brace" action to reduce impact

2. **Crash Recovery**
   - Get back on bike animation
   - Respawn system if too damaged
   - Health/damage system

## Technical Implementation Details

### Collision Detection
```javascript
// In SimpleBikePhysics.js
checkCollisions(trafficSystem) {
  const collision = trafficSystem.checkCollision(this.position, 1.0);
  if (collision) {
    const impactAngle = this.calculateImpactAngle(collision);
    const relativeSpeed = this.calculateRelativeSpeed(collision);
    this.applyCollisionResponse(impactAngle, relativeSpeed);
  }
}
```

### Collision Response
```javascript
applyCollisionResponse(angle, speed) {
  // Determine collision type
  const type = this.getCollisionType(angle);
  
  // Apply physics changes
  this.speed *= (1 - collisionResponse[type].speedLoss);
  this.velocity.x += collisionResponse[type].deflection * Math.sin(angle);
  
  // Start wobble effect
  this.wobbleTime = collisionResponse[type].wobbleDuration;
  this.isWobbling = true;
}
```

### Wobble Effect
```javascript
// During update, if wobbling:
if (this.isWobbling) {
  this.rotation.roll += Math.sin(time * 10) * this.wobbleAmplitude;
  this.wobbleTime -= deltaTime;
  if (this.wobbleTime <= 0) {
    this.isWobbling = false;
  }
}
```

## Success Metrics
- Collisions feel impactful but not frustrating
- Player can recover from minor collisions
- Different collision angles produce expected results
- System is predictable and learnable

## Development Order
1. ✅ Start with simple bounce-back physics
2. ✅ Add angle-based response
3. ✅ Implement wobble/recovery mechanics
4. ✅ Add visual feedback
5. ✅ Fine-tune values for fun gameplay