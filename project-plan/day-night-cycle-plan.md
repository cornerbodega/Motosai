# Day/Night Cycle System Plan

## Current State
- Static daytime sky with blue gradient
- Fixed sun position and lighting
- No time progression
- Vehicle headlights exist but are always on

## Proposed Day/Night System

### Core Features

#### 1. Time System
```javascript
dayNightCycle: {
  currentTime: 12.0,  // 0-24 hours
  timeSpeed: 0.5,     // Game minutes per real second
  isPaused: false,
  
  // Key times
  sunrise: 6.0,
  sunset: 18.0,
  noon: 12.0,
  midnight: 0.0
}
```

#### 2. Dynamic Sky Colors
```javascript
// Time-based sky gradient
skyColors: {
  dawn: { top: 0xFF6B35, bottom: 0xFFC947 },    // Orange/yellow
  day: { top: 0x0077BE, bottom: 0x87CEEB },     // Blue sky
  dusk: { top: 0xFF4757, bottom: 0xFF6B35 },    // Red/orange  
  night: { top: 0x0A0E27, bottom: 0x1E3A5F }    // Dark blue
}
```

#### 3. Dynamic Lighting
- **Sun/Moon position**: Follows realistic arc across sky
- **Light intensity**: Bright at noon, dim at night
- **Ambient light**: Higher during day, minimal at night
- **Fog density**: Less during day, more at night

#### 4. Vehicle Behavior Changes
- **Headlights**: Automatically turn on at dusk/night
- **Traffic density**: Less traffic at night
- **Speed**: Vehicles drive slower at night

#### 5. Motorcycle Features
- **Headlight**: Player bike gets working headlight
- **Visibility**: Reduced vision range at night
- **Dashboard glow**: Instrument panel lights up

### Implementation Phases

#### Phase 1: Basic Time System
- Time counter that cycles 0-24
- Display current time in HUD
- Manual time control (keys to advance)

#### Phase 2: Sky Transitions
- Interpolate sky colors based on time
- Update fog color/density
- Smooth transitions between times

#### Phase 3: Lighting Changes
- Move sun/moon across sky
- Adjust directional light intensity
- Add moon light source for night

#### Phase 4: Vehicle Adaptations
- Auto headlights based on time
- Headlight cone of light effect
- Street lights along highway

#### Phase 5: Weather Effects (Future)
- Rain at certain times
- Fog in early morning
- Clear starry nights

### Visual Examples

**6:00 AM - Dawn**
- Sky: Orange/pink gradient
- Sun: Just rising on horizon
- Lights: Vehicles turning off headlights
- Fog: Morning mist

**12:00 PM - Noon**
- Sky: Bright blue
- Sun: Directly overhead
- Lights: No artificial lights needed
- Visibility: Maximum

**6:00 PM - Dusk**
- Sky: Red/orange sunset
- Sun: Setting on horizon
- Lights: Vehicles turning on headlights
- Atmosphere: Golden hour lighting

**12:00 AM - Midnight**
- Sky: Dark with stars
- Moon: Providing dim light
- Lights: All vehicles with headlights
- Visibility: Limited to light cones

### Technical Implementation

```javascript
updateDayNightCycle(deltaTime) {
  // Advance time
  this.dayNight.currentTime += this.dayNight.timeSpeed * deltaTime / 60;
  if (this.dayNight.currentTime >= 24) {
    this.dayNight.currentTime -= 24;
  }
  
  // Calculate sun position
  const timeRadians = (this.dayNight.currentTime / 24) * Math.PI * 2;
  this.sunLight.position.set(
    Math.sin(timeRadians) * 100,
    Math.cos(timeRadians) * 100,
    50
  );
  
  // Interpolate sky colors
  const colors = this.getSkyColorsForTime(this.dayNight.currentTime);
  this.updateSkyGradient(colors);
  
  // Adjust lighting
  const brightness = this.calculateBrightness(this.dayNight.currentTime);
  this.sunLight.intensity = brightness;
  this.ambientLight.intensity = brightness * 0.6;
}
```

### Player Experience

- **Immersion**: Feeling of real time passing
- **Challenge**: Night driving is harder
- **Beauty**: Sunset/sunrise moments
- **Strategy**: Time of day affects traffic patterns

### Performance Considerations
- Shader-based sky for smooth gradients
- LOD system for distant lights
- Efficient shadow updates
- Optional quality settings