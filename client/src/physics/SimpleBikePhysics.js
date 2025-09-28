// Simple Arcade-Style Motorcycle Physics
// Built from scratch with step-by-step working demos

import { ROAD_CONSTANTS } from '../game/RoadConstants.js';

export class SimpleBikePhysics {
  constructor() {
    // Position and movement - start on left shoulder
    this.position = { x: -8.5, y: 0.3, z: 0 }; // Left shoulder position (road half-width is 6.75, shoulder is 2.5 more)
    this.velocity = { x: 0, y: 0, z: 0 };
    this.rotation = { pitch: 0, yaw: 0, roll: 0 };

    // Speed parameters - More realistic motorcycle physics
    this.speed = 0; // Current speed in m/s
    this.maxSpeed = Infinity; // No speed limit!
    this.baseAcceleration = 60; // Back to original - it was tuned correctly
    this.acceleration = 60; // Current acceleration
    this.deceleration = 30; // m/s² (coasting) - original values
    this.brakeDeceleration = 90; // m/s² (sport bike brakes are powerful!)
    this.throttleHoldTime = 0; // How long throttle has been held

    // Bike stats modifiers (from selected bike)
    this.bikeStats = {
      speedMultiplier: 1.0,
      accelerationMultiplier: 1.0,
      handlingMultiplier: 1.0
    };
    
    // Aggressive torque curve - instant power!
    this.powerBand = {
      lowRPM: 0.95,  // Strong torque even at low RPM - instant response
      midRPM: 1.0,  // Peak torque in mid-range
      highRPM: 0.98 // Maintains power at redline
    }
    
    // Turning parameters
    this.turnSpeed = 0; // Current turn rate (rad/s)
    this.maxTurnSpeed = 1.2; // Reduced max turn rate for more control
    this.turnAcceleration = 2.5; // Slower turn response
    this.leanAngle = 0; // Visual lean angle
    this.maxLeanAngle = 45 * Math.PI / 180; // 45 degrees max lean
    this.turnDamping = 0.92; // Auto-centering when no input
    this.offThrottleTime = 0; // Track how long off throttle in a turn
    this.trailBrakeMultiplier = 1.0; // Current trail brake effect
    
    // Controls
    this.controls = {
      throttle: 0,    // 0 to 1
      brake: 0,       // 0 to 1 (combined brake force)
      frontBrake: 0,  // 0 to 1 (for pitch effect)
      rearBrake: 0,   // 0 to 1 (for pitch effect)
      steer: 0,       // -1 (left) to 1 (right)
    };
    
    // Engine simulation (simple)
    this.rpm = 1000;
    this.gear = 1;
    this.maxGear = 6;
    
    // Collision system
    this.collision = {
      isWobbling: false,
      wobbleTime: 0,
      wobbleAmplitude: 0,
      lateralVelocity: 0, // Side-to-side velocity from impact
      isCrashed: false,
      recoveryTime: 0,
      invulnerableTime: 0, // Brief invulnerability after collision
      isSlidingOnWall: false,
      wallSide: null,
      slideTime: 0
    };
    
    // Collision response parameters - balanced for lane splitting
    this.collisionResponse = {
      glancing: { speedLoss: 0.3, deflection: 5, wobbleDuration: 0.5, wobbleAmp: 0.1, crash: false }, // Glancing is survivable
      sideSwipe: { speedLoss: 0.5, deflection: 10, wobbleDuration: 1.0, wobbleAmp: 0.2, crash: true }, // Side hit = death
      tBone: { speedLoss: 0.8, deflection: 15, wobbleDuration: 1.5, wobbleAmp: 0.3, crash: true }, // T-bone = death
      headOn: { speedLoss: 0.95, deflection: 0, wobbleDuration: 2.0, wobbleAmp: 0.4, crash: true } // Head-on = death
    };
  }
  
  setBikeStats(stats) {
    if (stats.speed !== undefined) {
      // Convert speed value (100-150) to multiplier (1.0-1.5)
      this.bikeStats.speedMultiplier = stats.speed / 100;
    }
    if (stats.acceleration !== undefined) {
      this.bikeStats.accelerationMultiplier = stats.acceleration;
    }
    if (stats.handling !== undefined) {
      this.bikeStats.handlingMultiplier = stats.handling;
    }

    // Apply stats to physics parameters
    this.acceleration = this.baseAcceleration * this.bikeStats.accelerationMultiplier;
  }

  setControls(controls) {
    // Update controls
    if (controls.throttle !== undefined) this.controls.throttle = Math.max(0, Math.min(1, controls.throttle));
    if (controls.steer !== undefined) this.controls.steer = Math.max(-1, Math.min(1, controls.steer));

    // Fix: Properly handle brake inputs - don't use Math.max which keeps brakes stuck on
    // Instead, set brake to the maximum of the current frame's front and rear brake values
    let currentBrake = 0;
    let frontBrake = 0;
    let rearBrake = 0;

    if (controls.frontBrake !== undefined) {
      frontBrake = controls.frontBrake;
      currentBrake = Math.max(currentBrake, frontBrake);
    }
    if (controls.rearBrake !== undefined) {
      rearBrake = controls.rearBrake;
      currentBrake = Math.max(currentBrake, rearBrake * 0.7);
    }
    if (controls.brake !== undefined) {
      // Generic brake applies both front and rear
      frontBrake = controls.brake * 0.7;  // 70% front
      rearBrake = controls.brake * 0.3;   // 30% rear
      currentBrake = Math.max(currentBrake, controls.brake);
    }

    this.controls.brake = Math.max(0, Math.min(1, currentBrake));
    this.controls.frontBrake = Math.max(0, Math.min(1, frontBrake));
    this.controls.rearBrake = Math.max(0, Math.min(1, rearBrake));

    if (controls.lean !== undefined) this.controls.steer = controls.lean; // Map lean to steer
  }
  
  update(deltaTime, trafficSystem = null) {
    // Clamp deltaTime to prevent physics explosion
    deltaTime = Math.min(deltaTime, 0.05);
    
    // Update collision recovery
    this.updateCollisionEffects(deltaTime);
    
    // Check for new collisions (moved check here)
    if (trafficSystem) {
      this.checkCollisions(trafficSystem);
    }
    
    // STEP 1: Forward/Backward Movement
    this.updateSpeed(deltaTime);
    
    // STEP 2: Turning
    this.updateTurning(deltaTime);
    
    // STEP 3: Update position based on speed and direction
    this.updatePosition(deltaTime);
    
    // STEP 4: Check barrier collisions - returns collision info for game to handle
    const collisionInfo = this.checkBarrierCollisions();
    
    // Update visual elements
    this.updateVisuals(deltaTime);
    
    const state = this.getState();
    // Merge barrier collision info with existing collision state
    if (collisionInfo) {
      state.collision = { ...state.collision, ...collisionInfo };
    }
    return state;
  }
  
  updateSpeed(deltaTime) {
    // Apply throttle
    if (this.controls.throttle > 0) {
      // Track how long throttle is held
      this.throttleHoldTime += deltaTime;
      
      // Calculate RPM-based torque multiplier for realistic power delivery
      const rpmPercent = this.rpm / 15000; // 0 to 1 based on max RPM
      let torqueMultiplier;
      
      if (rpmPercent < 0.3) {
        // Low RPM - already strong torque
        torqueMultiplier = this.powerBand.lowRPM;
      } else if (rpmPercent < 0.7) {
        // Mid RPM - peak torque zone (4500-10500 RPM)
        torqueMultiplier = this.powerBand.midRPM;
      } else {
        // High RPM - maintains power
        torqueMultiplier = this.powerBand.highRPM;
      }
      
      // Realistic speed-based air resistance and power curve
      const displaySpeedMPH = this.speed * 2.237; // Display speed in MPH
      let dragCoefficient;
      
      if (displaySpeedMPH < 60) {
        // 0-60mph: Minimal drag, full power
        dragCoefficient = 1.0;
      } else if (displaySpeedMPH < 100) {
        // 60-100mph: Light drag
        dragCoefficient = 0.9 - ((displaySpeedMPH - 60) / 40) * 0.15;
      } else if (displaySpeedMPH < 150) {
        // 100-150mph: Moderate drag (sport bike territory)
        dragCoefficient = 0.75 - ((displaySpeedMPH - 100) / 50) * 0.2;
      } else if (displaySpeedMPH < 200) {
        // 150-200mph: Heavy drag (track speeds)
        dragCoefficient = 0.55 - ((displaySpeedMPH - 150) / 50) * 0.2;
      } else if (displaySpeedMPH < 300) {
        // 200-300mph: Extreme drag (land speed record territory)
        dragCoefficient = 0.35 - ((displaySpeedMPH - 200) / 100) * 0.15;
      } else {
        // 300+mph: Still good acceleration for infinite speed fun
        // Keep reasonable acceleration at extreme speeds
        dragCoefficient = Math.max(0.3, 0.5 * Math.exp(-displaySpeedMPH / 1000));
      }
      
      // Add boost over time for achieving extreme speeds (game mechanic)
      const timeBoost = 1 + Math.min(this.throttleHoldTime / 10, 2); // Max 3x after 20 seconds
      
      // Calculate final acceleration
      const gearRatio = this.gear <= 3 ? 1.2 : (this.gear <= 5 ? 1.0 : 0.85); // Lower gears = more torque
      const finalAcceleration = this.baseAcceleration * torqueMultiplier * dragCoefficient * gearRatio * timeBoost;
      
      // Apply acceleration with throttle control (apply speed multiplier)
      const accelPower = this.controls.throttle * finalAcceleration;
      this.speed += accelPower * deltaTime * this.bikeStats.speedMultiplier;
      
      // Small boosts at milestones for game feel
      if (displaySpeedMPH > 100 && displaySpeedMPH < 101) this.speed *= 1.005;
      if (displaySpeedMPH > 200 && displaySpeedMPH < 201) this.speed *= 1.005;
      if (displaySpeedMPH > 300 && displaySpeedMPH < 301) this.speed *= 1.003;
    }
    // Apply brakes
    else if (this.controls.brake > 0) {
      // Reset throttle time
      this.throttleHoldTime = 0;
      this.acceleration = this.baseAcceleration;
      
      // Realistic brake physics with weight transfer
      const speedFactor = Math.min(1.5, 1 + this.speed / 50); // More effective at higher speeds
      const brakePower = this.controls.brake * this.brakeDeceleration * speedFactor;
      
      // Apply braking with ABS simulation (prevents lockup)
      const maxBraking = this.speed / deltaTime; // Can't brake more than current speed
      const actualBraking = Math.min(brakePower * deltaTime, maxBraking * 0.95); // 95% to prevent instant stop
      
      this.speed -= actualBraking;
      
      // No engine braking - coast freely
      // Don't go backwards
      if (this.speed < 0) this.speed = 0;
    }
    // Coasting - minimal deceleration for fun gameplay
    else {
      // Reset throttle time
      this.throttleHoldTime = 0;
      this.acceleration = this.baseAcceleration;
      
      // Minimal coasting deceleration - bike should maintain speed
      let coastDecel = 0.1; // Almost no deceleration

      // Only add noticeable drag at very high speeds
      if (this.speed > 100) { // Above ~220 mph
        coastDecel += (this.speed - 100) * 0.001; // Minimal drag increase
      }

      // Apply minimal deceleration
      this.speed = Math.max(0, this.speed - coastDecel * deltaTime);
    }
    
    // No speed limit - infinite acceleration!
    // this.speed = Math.min(this.speed, this.maxSpeed);
    
    // Realistic RPM and gear calculation
    const displaySpeed = this.speed * 2.237; // Display speed in MPH
    const actualSpeed = this.speed * 2.237; // Actual speed in MPH
    
    // Sport bike gear ratios and shift points
    const gearRatios = [0, 2.6, 1.9, 1.5, 1.25, 1.08, 0.96];
    const idleRPM = 1200;
    const redlineRPM = 14000;
    
    // Automatic transmission - shifts at optimal power band
    if (displaySpeed < 20) {
      this.gear = 1;
    } else if (displaySpeed < 40) {
      this.gear = 2;
    } else if (displaySpeed < 65) {
      this.gear = 3;  
    } else if (displaySpeed < 95) {
      this.gear = 4;
    } else if (displaySpeed < 135) {
      this.gear = 5;
    } else {
      this.gear = 6; // Top gear
    }
    
    // Calculate realistic RPM based on gear and speed
    const wheelCircumference = 2.0; // meters (realistic sport bike wheel)
    const primaryRatio = 1.7; // Primary drive ratio
    const finalDrive = 2.5; // Final drive ratio
    
    // RPM = (speed * gear_ratio * final_drive * 60) / wheel_circumference
    const calculatedRPM = (this.speed * gearRatios[this.gear] * finalDrive * primaryRatio * 60) / wheelCircumference;
    
    // Smooth RPM changes and keep within realistic range
    const targetRPM = Math.max(idleRPM, Math.min(calculatedRPM, redlineRPM));
    
    // Smooth RPM transitions during gear changes
    const rpmDiff = targetRPM - this.rpm;
    this.rpm += rpmDiff * 0.3; // Smooth transition
    
    // Add throttle response to RPM
    if (this.controls.throttle > 0) {
      this.rpm = Math.min(this.rpm + this.controls.throttle * 500, redlineRPM);
    }
  }
  
  updateTurning(deltaTime) {
    // Only turn if we're moving
    if (this.speed < 0.5) {
      this.turnSpeed = 0;
      return;
    }
    
    // Calculate turn rate based on display speed (realistic scaling)
    const displaySpeedMPH = this.speed * 2.237; // Display speed in MPH
    let speedFactor = 1.0;
    if (displaySpeedMPH < 20) {
      speedFactor = 0.8; // Reduced turning at low speeds too
    } else if (displaySpeedMPH < 50) {
      speedFactor = Math.max(0.3, 0.8 - (displaySpeedMPH / 50) * 0.4);
    } else if (displaySpeedMPH < 80) {
      speedFactor = 0.4 * (1.0 - (displaySpeedMPH - 50) / 30 * 0.5);
    } else {
      // Very high speed - minimal turning
      speedFactor = 0.2 * Math.max(0.1, 80 / displaySpeedMPH);
    }
    
    // Apply deadzone to steering input for easier straight riding
    let steerInput = this.controls.steer;
    const deadzone = 0.05;
    if (Math.abs(steerInput) < deadzone) {
      steerInput = 0;
    } else {
      // Scale input to remove deadzone gap
      steerInput = Math.sign(steerInput) * (Math.abs(steerInput) - deadzone) / (1 - deadzone);
    }
    
    // Trail braking effect - off throttle progressively tightens turn radius
    if (Math.abs(steerInput) > 0.1 && this.speed > 5) { // Only when turning and moving
      if (this.controls.throttle < 0.3) {
        // Track time off throttle
        this.offThrottleTime += deltaTime;
        
        // Progressive tightening - builds up over 0.5 seconds to max effect (faster response)
        const timeEffect = Math.min(this.offThrottleTime / 0.5, 1.0);
        
        // Base effect from throttle position (immediate and stronger)
        const throttleEffect = (0.3 - this.controls.throttle) / 0.3; // 0 to 1
        
        // Combined effect: much stronger trail brake multiplier
        // Immediate: up to 1.8x from throttle position alone
        // Time-based: additional 1.2x after 0.5 seconds
        // Total: up to 3.0x tighter turning when fully off throttle
        const targetMultiplier = 1.0 + (throttleEffect * 0.8) + (timeEffect * 1.2); // Up to 3.0x tighter
        
        // Faster transition to target for more responsive feel
        this.trailBrakeMultiplier += (targetMultiplier - this.trailBrakeMultiplier) * deltaTime * 8;
      } else {
        // On throttle - gradually release trail brake effect
        this.offThrottleTime = Math.max(0, this.offThrottleTime - deltaTime * 3); // Faster release
        this.trailBrakeMultiplier += (1.0 - this.trailBrakeMultiplier) * deltaTime * 4;
      }
    } else {
      // Not turning - reset
      this.offThrottleTime = 0;
      this.trailBrakeMultiplier = 1.0;
    }
    
    const targetTurnSpeed = -steerInput * this.maxTurnSpeed * speedFactor * this.trailBrakeMultiplier * this.bikeStats.handlingMultiplier;
    
    // If no input, apply auto-centering
    if (Math.abs(steerInput) < 0.01) {
      this.turnSpeed *= this.turnDamping; // Gradually return to center
    } else {
      // Smoothly accelerate to target turn speed
      const turnDiff = targetTurnSpeed - this.turnSpeed;
      const turnChange = Math.sign(turnDiff) * Math.min(Math.abs(turnDiff), this.turnAcceleration * deltaTime);
      this.turnSpeed += turnChange;
    }
    
    // Apply turning to yaw
    this.rotation.yaw += this.turnSpeed * deltaTime;
    
    // Calculate lean angle based on turn speed and forward speed
    // More lean at higher speeds for the same turn rate (realistic)
    const leanFactor = Math.min(1.0, this.speed / 20); // Full lean effect above 20 m/s
    // Extra lean when trail braking (visual feedback of tighter turn)
    const trailBrakeLean = this.trailBrakeMultiplier > 1.0 ? (this.trailBrakeMultiplier - 1.0) * 0.3 : 0;
    const targetLean = -this.turnSpeed * leanFactor * (0.5 + trailBrakeLean); // Negative because we lean into turns
    
    // Smooth lean transition
    const leanDiff = targetLean - this.leanAngle;
    const leanChange = Math.sign(leanDiff) * Math.min(Math.abs(leanDiff), 3.0 * deltaTime);
    this.leanAngle += leanChange;
    
    // Clamp lean angle
    this.leanAngle = Math.max(-this.maxLeanAngle, Math.min(this.maxLeanAngle, this.leanAngle));
    
    // Update roll for visual effect
    this.rotation.roll = this.leanAngle;
  }
  
  updatePosition(deltaTime) {
    // Calculate forward direction based on yaw
    const forwardX = Math.sin(this.rotation.yaw);
    const forwardZ = Math.cos(this.rotation.yaw);
    
    // Update velocity based on speed and direction
    this.velocity.x = forwardX * this.speed;
    this.velocity.z = forwardZ * this.speed;
    this.velocity.y = 0; // Keep on ground for now
    
    // Update position
    this.position.x += this.velocity.x * deltaTime;
    this.position.z += this.velocity.z * deltaTime;
    
    // Keep bike on ground (simple)
    this.position.y = 0;
  }
  
  updateVisuals(deltaTime) {
    // Add subtle pitch based on acceleration/braking
    if (this.controls.throttle > 0) {
      // Wheelie effect (subtle) - based on acceleration intensity
      const speedFactor = Math.min(1.0, this.speed / 100); // Normalize around 100 m/s
      const targetPitch = this.controls.throttle * 0.05 * speedFactor;
      this.rotation.pitch += (targetPitch - this.rotation.pitch) * 5 * deltaTime;
    } else if (this.controls.brake > 0) {
      // Nose dive effect - different for front vs rear brake
      let targetPitch = 0;

      // Front brake causes forward pitch (nose dive)
      if (this.controls.frontBrake > 0) {
        targetPitch -= this.controls.frontBrake * 0.12; // Strong nose dive
      }

      // Rear brake causes slight backward pitch (squat) or stays level
      if (this.controls.rearBrake > 0) {
        targetPitch += this.controls.rearBrake * 0.02; // Slight rear squat
      }

      this.rotation.pitch += (targetPitch - this.rotation.pitch) * 5 * deltaTime;
    } else {
      // Return to neutral
      this.rotation.pitch += (0 - this.rotation.pitch) * 3 * deltaTime;
    }
    
    // Add wobble effect from collision
    if (this.collision.isWobbling && this.collision.wobbleAmplitude > 0.01) {
      const wobbleFreq = 3; // Reduced from 15 Hz to 3 Hz for smoother wobble
      const wobble = Math.sin(Date.now() * 0.001 * wobbleFreq) * this.collision.wobbleAmplitude * 0.3; // Also reduced amplitude
      this.rotation.roll = this.leanAngle + wobble;
    } else {
      // Ensure clean lean angle when not wobbling
      this.rotation.roll = this.leanAngle;
    }
  }
  
  checkBarrierCollisions() {
    // Use shared road constants
    const halfRoadWidth = ROAD_CONSTANTS.ROAD_HALF_WIDTH; 
    const railingPosition = Math.abs(ROAD_CONSTANTS.LEFT_BARRIER_X); // Barrier position (both sides are symmetric)
    
    let collisionInfo = null;
    
    // Check if crossing white line (edge of road) - NO SHAKE, just slight speed loss
    if (Math.abs(this.position.x) > halfRoadWidth) {
      // Slight speed loss on shoulder (riding on rough surface)
      this.speed *= 0.995; // Very minimal speed loss
    }
    
    // Check if hitting the actual railings (much further out)
    // Even touching the barrier slightly is fatal
    if (Math.abs(this.position.x) >= railingPosition - 0.2) { // Small buffer for instant death
      // Calculate impact speed for collision effects
      const impactSpeed = Math.abs(this.velocity.x) + Math.abs(this.velocity.z * 0.1); // Total impact velocity
      const speedMph = (this.speed * 2.237); // Convert m/s to mph

      // ALWAYS FATAL - concrete barrier at any speed kills you
      let collisionSeverity = 'explode'; // Default to explosion
      if (speedMph > 150) {
        collisionSeverity = 'smear'; // Very high speed - blood smear on barrier
      } else {
        collisionSeverity = 'explode'; // Any other speed - instant death explosion
      }
      
      // Create collision info for the game to handle effects
      collisionInfo = {
        type: 'barrier',
        impactSpeed: impactSpeed,
        speedMph: speedMph,
        position: { x: this.position.x, y: this.position.y, z: this.position.z },
        severity: collisionSeverity,
        isHighSpeed: speedMph > 100 // Legacy flag for compatibility
      };
      
      // Handle physics response - always splat along wall
      if (this.position.x > railingPosition) {
        // Right barrier collision - always slide and die
        this.position.x = railingPosition;
        this.velocity.x = 0; // Stop lateral movement - stuck to wall
        this.rotation.yaw = 0; // Align with wall
        
        // Sliding speed based on impact speed
        if (speedMph < 50) {
          this.speed *= 0.3; // Slow speed - quick stop
        } else {
          this.speed *= 0.5; // Higher speed - slide further
        }
        
        // Add sliding effect
        this.collision.isSlidingOnWall = true;
        this.collision.wallSide = 'right';
        this.collision.slideTime = collisionSeverity === 'smear' ? 2.0 : 0.5;
        
      } else if (this.position.x < -railingPosition) {
        // Left barrier collision - always slide and die
        this.position.x = -railingPosition;
        this.velocity.x = 0; // Stop lateral movement - stuck to wall
        this.rotation.yaw = 0; // Align with wall
        
        // Sliding speed based on impact speed
        if (speedMph < 50) {
          this.speed *= 0.3; // Slow speed - quick stop
        } else {
          this.speed *= 0.5; // Higher speed - slide further
        }
        
        // Add sliding effect
        this.collision.isSlidingOnWall = true;
        this.collision.wallSide = 'left';
        this.collision.slideTime = collisionSeverity === 'smear' ? 2.0 : 0.5;
      }
      
      // Always crash on wall collision - it's a solid barrier!
      this.collision.isWobbling = true;
      this.collision.wobbleTime = 0.5;
      this.collision.wobbleAmplitude = 0.2;
      this.collision.isCrashed = true;
      collisionInfo.isCrashed = true; // Always fatal
      
    }
    
    return collisionInfo; // Return collision info for game to handle effects
  }
  
  getState() {
    // Return references directly - no object cloning!
    // The consumer should not modify these values
    return {
      position: this.position, // Direct reference, no clone
      velocity: this.velocity, // Direct reference, no clone
      rotation: this.rotation, // Direct reference, no clone
      speed: this.speed * 2.237, // Convert m/s to MPH for display only
      actualSpeed: this.speed, // Keep actual speed for physics
      rpm: Math.round(this.rpm),
      gear: this.gear,
      leanAngle: this.leanAngle * 180 / Math.PI, // Convert to degrees for display
      turnRate: this.turnSpeed * 180 / Math.PI, // deg/s for display
      collision: {
        isWobbling: this.collision.isWobbling,
        isCrashed: this.collision.isCrashed,
        invulnerable: this.collision.invulnerableTime > 0,
      }
    };
  }
  
  checkCollisions(trafficSystem) {
    // Skip if we're invulnerable
    if (this.collision.invulnerableTime > 0) return;
    
    // Use small radius for lane splitting but not too small to miss collisions
    const collision = trafficSystem.checkCollision(this.position, 0.35); // Balanced for lane splitting
    if (collision) {
      // Car collision - always lethal!
      this.collision.isCrashed = true;
      this.collision.recoveryTime = 2.0;
      
      // Add wobble effect before death
      this.collision.isWobbling = true;
      this.collision.wobbleTime = 0.3;
      this.collision.wobbleAmplitude = 0.3;
      
      // Physics response - collision is the vehicle object
      const dx = this.position.x - collision.position.x;
      this.velocity.x += dx * 10; // Strong lateral push away from vehicle
      this.speed *= 0.3; // Major speed loss
    }
  }
  
  calculateImpactAngle(vehicle) {
    // Calculate angle between bike direction and collision point
    const dx = vehicle.position.x - this.position.x;
    const dz = vehicle.position.z - this.position.z;
    const collisionAngle = Math.atan2(dx, dz);
    const bikeFacing = this.rotation.yaw;
    
    // Get relative angle (0 = head-on, PI/2 = side impact)
    let relativeAngle = Math.abs(collisionAngle - bikeFacing);
    if (relativeAngle > Math.PI) relativeAngle = 2 * Math.PI - relativeAngle;
    
    return relativeAngle;
  }
  
  calculateRelativeSpeed(vehicle) {
    // Calculate relative speed between bike and vehicle
    const vehicleSpeed = Math.sqrt(vehicle.velocity.x ** 2 + vehicle.velocity.z ** 2);
    const relativeSpeed = Math.abs(this.speed - vehicleSpeed);
    return relativeSpeed;
  }
  
  getCollisionType(angle) {
    const angleDeg = angle * 180 / Math.PI;
    if (angleDeg < 20) return 'glancing';  // Only very shallow angles are glancing
    if (angleDeg < 45) return 'sideSwipe'; // Side swipes are now deadly
    if (angleDeg < 90) return 'tBone';     // T-bones are deadly
    return 'headOn';                       // Everything else is head-on
  }
  
  applyCollisionResponse(angle, speed, vehicle) {
    const type = this.getCollisionType(angle);
    const response = this.collisionResponse[type];
    
    // Only apply collision effects if we're actually going fast enough to matter
    if (this.speed < 5) {
      // Just a gentle bump at low speeds
      const dx = vehicle.position.x - this.position.x;
      const deflectionDir = Math.sign(dx) * -1;
      this.collision.lateralVelocity = deflectionDir * 2;
      return;
    }
    
    // Reduce speed
    this.speed *= (1 - response.speedLoss);
    
    // Add lateral deflection
    const dx = vehicle.position.x - this.position.x;
    const deflectionDir = Math.sign(dx) * -1; // Push away from vehicle
    this.collision.lateralVelocity = deflectionDir * response.deflection;
    
    // Start wobble effect
    this.collision.isWobbling = true;
    this.collision.wobbleTime = response.wobbleDuration;
    this.collision.wobbleAmplitude = response.wobbleAmp;
    
    // Set brief invulnerability
    this.collision.invulnerableTime = 1.0; // 1 second of invulnerability
    
    // Check for crash - reasonable speed threshold
    const displaySpeedMPH = this.speed * 2.237;
    if (response.crash && displaySpeedMPH > 20) { // Crash at 20mph+ for better gameplay
      this.collision.isCrashed = true;
      this.collision.recoveryTime = 2.0;
      // Don't set speed to 0 here - let the death animation handle it
    }
  }
  
  updateCollisionEffects(deltaTime) {
    // Update invulnerability
    if (this.collision.invulnerableTime > 0) {
      this.collision.invulnerableTime -= deltaTime;
    }
    
    // Update wobble
    if (this.collision.isWobbling) {
      this.collision.wobbleTime -= deltaTime;
      if (this.collision.wobbleTime <= 0) {
        this.collision.isWobbling = false;
        this.collision.wobbleAmplitude = 0;
      }
    }
    
    // Update wall sliding
    if (this.collision.isSlidingOnWall) {
      this.collision.slideTime -= deltaTime;
      
      // Keep stuck to wall while sliding
      const railingPosition = Math.abs(ROAD_CONSTANTS.LEFT_BARRIER_X);
      if (this.collision.wallSide === 'right') {
        this.position.x = railingPosition; // Stay glued to right wall
        this.velocity.x = 0; // No lateral movement
      } else if (this.collision.wallSide === 'left') {
        this.position.x = -railingPosition; // Stay glued to left wall
        this.velocity.x = 0; // No lateral movement
      }
      
      // Gradually slow down while sliding
      this.speed *= 0.98;
      
      // End sliding
      if (this.collision.slideTime <= 0 || this.speed < 5) {
        this.collision.isSlidingOnWall = false;
        // Likely crashed after sliding
        if (this.speed < 5) {
          this.collision.isCrashed = true;
        }
      }
    }
    
    // Apply and decay lateral velocity
    if (Math.abs(this.collision.lateralVelocity) > 0.01) {
      this.position.x += this.collision.lateralVelocity * deltaTime;
      this.collision.lateralVelocity *= 0.9; // Decay
    }
    
    // Update crash recovery
    if (this.collision.isCrashed) {
      this.collision.recoveryTime -= deltaTime;
      if (this.collision.recoveryTime <= 0) {
        this.collision.isCrashed = false;
      }
    }
  }
  
  reset() {
    this.position = { x: -8.5, y: 0.3, z: 0 }; // Left shoulder position
    this.velocity = { x: 0, y: 0, z: 0 };
    this.rotation = { pitch: 0, yaw: 0, roll: 0 };
    this.speed = 0;
    this.turnSpeed = 0;
    this.leanAngle = 0;
    this.rpm = 1000;
    this.gear = 1;
    this.controls = { throttle: 0, brake: 0, steer: 0 };
    
    // Reset collision state
    this.collision = {
      isWobbling: false,
      wobbleTime: 0,
      wobbleAmplitude: 0,
      lateralVelocity: 0,
      isCrashed: false,
      recoveryTime: 0,
      invulnerableTime: 0,
      isSlidingOnWall: false,
      wallSide: null,
      slideTime: 0
    };
  }
}