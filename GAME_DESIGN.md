# Motosai - Interstate 5 Motorcycle Simulator

## Game Concept
A realistic motorcycle riding simulator featuring the entire Interstate 5 corridor from Seattle to San Diego (~1,380 miles). Players experience authentic motorcycle physics while navigating through West Coast traffic across three states.

## Core Features

### New Features

#### Emoji-Based Progression System
- **Intro Animation**: Game starts with a motorcycle emoji (🏍️) that morphs into 3D
- **Bike Selection**: Choose from 8 unique bikes with different stats
- **Powerup Collection**: Emoji-themed powerups spawn on the road
  - 🐉 Dragon: Speed boost
  - 🚀 Rocket: Super speed
  - ⭐ Star: Invincibility
  - 🔥 Fire: Burn trail
  - ⚡ Lightning: Teleport
  - 💀 Skull: Ghost mode
  - 🌈 Rainbow: Multi-boost
  - ❤️ Heart: Health
  - 💎 Gem: Bonus points
  - 🪙 Coin: Currency

#### Bike Unlock System
- Start with default Street Rider bike
- Collect specific powerups to unlock new bikes:
  - Dragon Fury: 5 dragon powerups
  - Rocket Blast: 10 rocket powerups
  - Star Cruiser: 7 star powerups
  - Inferno: 8 fire powerups
  - Thunder Strike: 12 lightning powerups
  - Death Rider: 15 skull powerups
  - Rainbow Dash: 20 rainbow powerups
- Each bike has unique stats (speed, acceleration, handling)
- Progress saved locally

## Core Features

### 1. Custom Physics Engine
- **Motorcycle Dynamics**:
  - Realistic lean angles (up to 45° in corners)
  - Counter-steering physics
  - Wheelie/stoppie mechanics
  - Gyroscopic effects
  - Weight transfer during acceleration/braking
  - Tire grip model with slip angles
  - Wind resistance and drafting

### 2. Realistic Riding Mechanics
- **Controls**:
  - Throttle control (progressive acceleration)
  - Front/rear brake independent control
  - Lean input (weight shifting)
  - Clutch and gear shifting
  - Lane splitting between cars
  
### 3. Highway 101 Route
- **Key Sections**:
  - San Francisco: Golden Gate approach
  - Silicon Valley: Heavy traffic zones
  - Salinas Valley: Agricultural stretches
  - San Luis Obispo: Coastal curves
  - Santa Barbara: Ocean views
  - Ventura: Beach riding
  - Los Angeles: Dense urban traffic
  - San Diego: Final destination

### 4. Traffic System
- **AI Vehicles**:
  - Cars, trucks, SUVs with realistic behavior
  - Lane changing patterns
  - Speed variations (55-75 mph)
  - Traffic density based on time/location
  - Emergency vehicles

### 5. Environmental Factors
- **Weather Effects**:
  - Fog in SF Bay Area
  - Wind on coastal sections
  - Heat shimmer in valleys
  - Time of day lighting

## Technical Architecture

### Physics Engine Components

1. **Rigid Body Dynamics**
   - 6DOF motorcycle model
   - Contact points: front wheel, rear wheel, pegs
   - Center of mass calculations

2. **Tire Model**
   - Pacejka "Magic Formula" for grip
   - Contact patch deformation
   - Temperature effects

3. **Suspension**
   - Front fork compression/rebound
   - Rear shock dynamics
   - Anti-dive/anti-squat geometry

4. **Engine Model**
   - Torque curves
   - Rev limiting
   - Engine braking
   - Gear ratios

### Graphics
- **Low-Poly Style**:
  - ~500 triangles per vehicle
  - Simple geometry for buildings
  - Stylized environment
  - Performance: 60+ FPS target

### Multiplayer
- Real-time position sync
- Ghost riders
- Time trials leaderboard

## Physics Parameters

```javascript
const BIKE_PHYSICS = {
  mass: 200, // kg
  wheelbase: 1.4, // meters
  cog_height: 0.6, // center of gravity
  max_lean: 45, // degrees
  max_speed: 180, // mph
  
  tire: {
    front_radius: 0.3,
    rear_radius: 0.32,
    grip_coefficient: 1.2,
    slip_angle_peak: 8 // degrees
  },
  
  suspension: {
    front_travel: 0.12, // meters
    rear_travel: 0.14,
    damping_ratio: 0.3,
    spring_rate: 35000 // N/m
  },
  
  aerodynamics: {
    drag_coefficient: 0.6,
    frontal_area: 0.6, // m²
    downforce_coefficient: 0.1
  }
};
```

## Gameplay Loop

1. **Intro**: Motorcycle emoji animation morphs to 3D
2. **Selection**: Choose from unlocked bikes with unique stats
3. **Ride**: Navigate traffic, maintain speed, collect powerups
4. **Powerups**: Collect emoji-themed powerups (🐉 🚀 ⭐ 🔥 ⚡ 💀 🌈)
5. **Progress**: Unlock new bikes by collecting specific powerup counts
6. **Challenge**: Lane split safely, avoid accidents
7. **Score**: Based on time, safety, style points, powerups collected

## Development Phases

### Phase 1: Core Physics (Current)
- Basic motorcycle physics
- Simple test track
- Control system

### Phase 2: Highway Environment
- 101 route geometry
- Basic traffic AI
- Collision detection

### Phase 3: Graphics & Polish
- Low-poly models
- Lighting system
- UI/HUD

### Phase 4: Multiplayer
- WebSocket integration
- Leaderboards
- Ghost mode

## Performance Targets
- 60 FPS on modern browsers
- Mobile support (30 FPS)
- < 50ms input latency
- < 100MB total assets