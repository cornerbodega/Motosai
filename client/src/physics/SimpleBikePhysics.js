// Simple Arcade-Style Motorcycle Physics
// Built from scratch with step-by-step working demos

export class SimpleBikePhysics {
  constructor() {
    // Position and movement
    this.position = { x: 0, y: 0.3, z: 0 }; // Start at wheel height to prevent clipping
    this.velocity = { x: 0, y: 0, z: 0 };
    this.rotation = { pitch: 0, yaw: 0, roll: 0 };
    
    // Speed parameters
    this.speed = 0; // Current speed in m/s
    this.maxSpeed = 400 / 2.237; // 400mph actual (shows as ~267mph max on speedometer)
    this.baseAcceleration = 20; // Higher actual acceleration for fun gameplay
    this.acceleration = 20; // Current acceleration (increases over time)
    this.deceleration = 30; // m/s² (coasting)
    this.brakeDeceleration = 60; // m/s² (braking)
    this.throttleHoldTime = 0; // How long throttle has been held
    
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
      brake: 0,       // 0 to 1
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
    };
    
    // Collision response parameters - balanced for lane splitting
    this.collisionResponse = {
      glancing: { speedLoss: 0.3, deflection: 5, wobbleDuration: 0.5, wobbleAmp: 0.1, crash: false }, // Glancing is survivable
      sideSwipe: { speedLoss: 0.5, deflection: 10, wobbleDuration: 1.0, wobbleAmp: 0.2, crash: true }, // Side hit = death
      tBone: { speedLoss: 0.8, deflection: 15, wobbleDuration: 1.5, wobbleAmp: 0.3, crash: true }, // T-bone = death
      headOn: { speedLoss: 0.95, deflection: 0, wobbleDuration: 2.0, wobbleAmp: 0.4, crash: true } // Head-on = death
    };
  }
  
  setControls(controls) {
    // Update controls
    if (controls.throttle !== undefined) this.controls.throttle = Math.max(0, Math.min(1, controls.throttle));
    if (controls.brake !== undefined) this.controls.brake = Math.max(0, Math.min(1, controls.brake));
    if (controls.steer !== undefined) this.controls.steer = Math.max(-1, Math.min(1, controls.steer));
    if (controls.frontBrake !== undefined) this.controls.brake = Math.max(this.controls.brake, controls.frontBrake);
    if (controls.rearBrake !== undefined) this.controls.brake = Math.max(this.controls.brake, controls.rearBrake * 0.7);
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
    
    // Update visual elements
    this.updateVisuals(deltaTime);
    
    return this.getState();
  }
  
  updateSpeed(deltaTime) {
    // Apply throttle
    if (this.controls.throttle > 0) {
      // Track how long throttle is held
      this.throttleHoldTime += deltaTime;
      
      // Very gradual acceleration increase over time
      // Takes about 15 seconds to reach max acceleration multiplier
      const accelerationMultiplier = Math.min(3, 1 + this.throttleHoldTime / 10);
      this.acceleration = this.baseAcceleration * accelerationMultiplier;
      
      // Speed-based reduction - motorcycles accelerate fast at low speeds
      const displaySpeedMPH = this.speed * 2.237 / 1.5; // Use display speed for scaling
      let speedPenalty;
      
      if (displaySpeedMPH < 60) {
        // 0-60mph: Full acceleration - motorcycles are quick here
        speedPenalty = 1.0;
      } else if (displaySpeedMPH < 80) {
        // 60-80mph: Slight reduction
        speedPenalty = 0.85;
      } else if (displaySpeedMPH < 100) {
        // 80-100mph: Moderate reduction
        speedPenalty = 0.65;
      } else if (displaySpeedMPH < 130) {
        // 100-130mph: Heavy reduction
        speedPenalty = 0.45;
      } else if (displaySpeedMPH < 160) {
        // 130-160mph: Very heavy reduction
        speedPenalty = 0.3;
      } else if (displaySpeedMPH < 200) {
        // 160-200mph: Extreme reduction
        speedPenalty = 0.2;
      } else if (displaySpeedMPH < 240) {
        // 200-240mph: Very extreme reduction
        speedPenalty = 0.12;
      } else {
        // 240-267mph: Nearly impossible to accelerate
        speedPenalty = 0.06;
      }
      
      const accelPower = this.controls.throttle * this.acceleration * speedPenalty;
      this.speed += accelPower * deltaTime;
      
      // Tiny speed boosts at major milestones to help reach them
      // (displaySpeedMPH already declared above)
      if (displaySpeedMPH > 100 && displaySpeedMPH < 101) this.speed *= 1.01; // Tiny 100mph boost
      if (displaySpeedMPH > 200 && displaySpeedMPH < 201) this.speed *= 1.01; // Tiny 200mph boost
      if (displaySpeedMPH > 250 && displaySpeedMPH < 251) this.speed *= 1.005; // Tiny 250mph boost
    }
    // Apply brakes
    else if (this.controls.brake > 0) {
      // Reset throttle time
      this.throttleHoldTime = 0;
      this.acceleration = this.baseAcceleration;
      
      // Brake (scales with speed for more control at high speeds)
      const brakePower = this.controls.brake * this.brakeDeceleration * (1 + this.speed / 100);
      this.speed -= brakePower * deltaTime;
      
      // Don't go backwards from braking
      if (this.speed < 0) this.speed = 0;
    }
    // Coasting - maintain speed
    else {
      // Reset throttle time
      this.throttleHoldTime = 0;
      this.acceleration = this.baseAcceleration;
      
      // Coast with very slight deceleration (air resistance)
      // More realistic coasting
      if (this.speed > 50 / 2.237) { // Above 50mph
        this.speed *= 0.998; // Tiny speed loss from air resistance
      }
      // Otherwise maintain speed at low speeds
    }
    
    // Clamp to max speed (300mph but takes much longer to reach)
    this.speed = Math.min(this.speed, this.maxSpeed);
    
    // Update RPM (scales with speed, redlines at high speed)
    this.rpm = Math.min(1000 + this.speed * 100, 15000);
    
    // Simple automatic gear shifting
    const gearThresholds = [0, 10, 20, 30, 40, 50];
    for (let i = this.maxGear - 1; i >= 0; i--) {
      if (this.speed >= gearThresholds[i]) {
        this.gear = i + 1;
        break;
      }
    }
  }
  
  updateTurning(deltaTime) {
    // Only turn if we're moving
    if (this.speed < 0.5) {
      this.turnSpeed = 0;
      return;
    }
    
    // Calculate turn rate based on display speed (realistic scaling)
    const displaySpeedMPH = this.speed * 2.237 / 1.5; // Use display speed
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
    
    const targetTurnSpeed = -steerInput * this.maxTurnSpeed * speedFactor * this.trailBrakeMultiplier;
    
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
      // Wheelie effect (subtle)
      const targetPitch = this.controls.throttle * 0.05 * (this.speed / this.maxSpeed);
      this.rotation.pitch += (targetPitch - this.rotation.pitch) * 5 * deltaTime;
    } else if (this.controls.brake > 0) {
      // Nose dive effect
      const targetPitch = -this.controls.brake * 0.08;
      this.rotation.pitch += (targetPitch - this.rotation.pitch) * 5 * deltaTime;
    } else {
      // Return to neutral
      this.rotation.pitch += (0 - this.rotation.pitch) * 3 * deltaTime;
    }
    
    // Add wobble effect from collision
    if (this.collision.isWobbling) {
      const wobbleFreq = 15; // Hz
      const wobble = Math.sin(Date.now() * 0.001 * wobbleFreq) * this.collision.wobbleAmplitude;
      this.rotation.roll = this.leanAngle + wobble;
    }
  }
  
  getState() {
    return {
      position: { ...this.position },
      velocity: { ...this.velocity },
      rotation: { ...this.rotation },
      speed: this.speed * 2.237 / 1.5, // Display speed scaled down 1.5x for better feel
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
      // ANY collision = instant death, no complex calculations needed
      this.collision.isCrashed = true;
      this.collision.recoveryTime = 2.0;
      
      // Add some physics effects for visual feedback
      const dx = collision.position.x - this.position.x;
      const deflectionDir = Math.sign(dx) * -1;
      this.collision.lateralVelocity = deflectionDir * 10;
      this.speed *= 0.5; // Slow down but don't stop (death animation will handle it)
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
    const displaySpeedMPH = this.speed * 2.237 / 1.5;
    if (response.crash && displaySpeedMPH > 30) { // Crash at 30mph+ for better gameplay
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
    this.position = { x: 0, y: 0, z: 0 };
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
    };
  }
}