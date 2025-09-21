// Motosai Custom Motorcycle Physics Engine V2
// Improved turning system with proper gyroscopic effects and counter-steering

export class MotorcyclePhysicsV2 {
  constructor() {
    // Bike properties
    this.mass = 150; // kg (lighter for better acceleration)
    this.wheelbase = 1.4; // meters
    this.cogHeight = 0.6; // center of gravity height
    this.maxLeanAngle = 48 * Math.PI / 180; // radians (48 degrees for sport riding)
    this.rake = 24 * Math.PI / 180; // Fork rake angle (24 degrees typical for sport bike)
    this.trail = 0.09; // meters (90mm trail)
    
    // State variables - start on right shoulder at traffic speed
    this.position = { x: 5.5, y: 0, z: 0 }; // Right shoulder position
    this.velocity = { x: 0, y: 0, z: 29 }; // ~65 mph forward (29 m/s)
    this.acceleration = { x: 0, y: 0, z: 0 };
    this.rotation = { pitch: 0, yaw: 0, roll: 0 }; // lean is roll
    this.angularVelocity = { pitch: 0, yaw: 0, roll: 0 };
    
    // Wheels with improved properties
    this.frontWheel = {
      radius: 0.3,
      mass: 10, // kg
      momentOfInertia: 0.45, // kg*m^2
      angularVelocity: 0,
      rotationAngle: 0,
      slip: 0,
      slipAngle: 0, // lateral slip angle
      load: 0,
      grip: 1.0,
      steerAngle: 0,
      brakeForce: 0,
      camberThrust: 0 // Force from tire camber
    };
    
    this.rearWheel = {
      radius: 0.32,
      mass: 12, // kg
      momentOfInertia: 0.55, // kg*m^2
      angularVelocity: 0,
      rotationAngle: 0,
      slip: 0,
      slipAngle: 0,
      load: 0,
      grip: 1.0,
      torque: 0,
      brakeForce: 0,
      camberThrust: 0
    };
    
    // Improved suspension
    this.suspension = {
      front: {
        compression: 0,
        velocity: 0,
        travel: 0.12,
        springRate: 35000, // N/m
        damping: 3000,
        antiDive: 0.3 // 30% anti-dive geometry
      },
      rear: {
        compression: 0,
        velocity: 0,
        travel: 0.14,
        springRate: 40000,
        damping: 3500,
        antiSquat: 0.2 // 20% anti-squat
      }
    };
    
    // Engine
    this.engine = {
      rpm: 1000,
      gear: 1,
      clutch: 1.0,
      throttle: 0,
      maxRPM: 14000, // Higher redline
      idleRPM: 1000,
      gearRatios: [3.5, 2.5, 1.8, 1.4, 1.15, 0.95], // More aggressive ratios
      finalDrive: 3.5, // Higher final drive for more acceleration
      engineBraking: 0.1, // Engine braking coefficient (reduced for better coasting)
      isBurnouting: false, // Track burnout state
      burnoutSmoke: 0 // Amount of smoke (0-1)
    };
    
    // Aerodynamics
    this.aero = {
      dragCoefficient: 0.35, // Reduced for better coasting (was 0.6)
      frontalArea: 0.6, // m²
      airDensity: 1.225, // kg/m³
      liftCoefficient: -0.05 // Slight downforce
    };
    
    // Controls with improved steering
    this.controls = {
      throttle: 0,
      frontBrake: 0,
      rearBrake: 0,
      lean: 0, // -1 to 1
      steerInput: 0, // Direct handlebar input
      clutch: false,
      gearUp: false,
      gearDown: false,
      lastThrottle: 0, // Track previous throttle for boost detection
      throttleBoostTimer: 0 // Timer for initial acceleration boost
    };
    
    // Physics constants
    this.gravity = 9.81;
    this.dt = 1/60; // 60 FPS physics

    // Collision state (compatibility with game)
    this.collision = {
      isWobbling: false,
      isCrashed: false,
      type: null
    };
    
    // Turning system parameters
    this.turning = {
      counterSteerThreshold: 5, // m/s (about 11 mph)
      steerRate: 3.0, // rad/s maximum steer rate (increased)
      maxSteerAngle: 45 * Math.PI / 180, // 45 degrees max (increased)
      leanRate: 2.5, // Maximum lean rate (rad/s) (increased)
      gyroscopicCoefficient: 0.015, // Gyroscopic effect strength
      camberCoefficient: 500, // N per degree of camber (increased for sharper turns)
      trailEffect: 0.6, // Trail stabilization factor (reduced for quicker response)
      turnHoldTime: 0, // How long turn has been held (seconds)
      lastTurnDirection: 0, // Track last turn direction for continuity
      progressiveLeanFactor: 0, // 0 to 1, increases with hold time
      maxHoldTime: 1.5, // Max time for full lean progression (seconds) (reduced for quicker max)
      holdTimeDecay: 4.0, // How fast hold time decays when not turning (per second)
      sharpTurnMultiplier: 2.5, // Additional multiplier for very sharp turns

      // Tap-then-hold sharp turning
      tapTime: 0, // When the last tap occurred
      tapDirection: 0, // Direction of last tap
      tapWindow: 800, // ms - window after tap to start holding for sharp turn (more forgiving)
      sharpTurnActive: false, // Is sharp turn mode active
      sharpTurnBoost: 6.0, // Multiplier for sharp turns when tap-then-hold (MUCH stronger)

      // Brake-based sharp turning
      brakeHoldTime: 0, // How long brake has been held
      brakeTurnBoost: 0, // Current boost from braking (0 to 1)
      maxBrakeHoldTime: 2.0, // Seconds to reach max brake turn boost
      brakeTurnMultiplier: 4.0 // Max multiplier from brake turning
    };
  }
  
  update(deltaTime, trafficSystem = null) {
    this.dt = deltaTime || 1/60;
    
    // Update engine
    this.updateEngine();
    
    // Update wheel rotation (for gyroscopic calculations)
    this.updateWheelRotation();
    
    // Calculate all forces and torques
    const forces = this.calculateForces();
    
    // Update dynamics with improved integration
    this.updateDynamics(forces);
    
    // Update suspension
    this.updateSuspension();
    
    // Update tire slip and grip
    this.updateTirePhysics();
    
    // Apply constraints
    this.applyConstraints();
    
    return this.getState();
  }
  
  updateWheelRotation() {
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    
    // Update wheel angular velocities
    this.frontWheel.angularVelocity = speed / this.frontWheel.radius;
    this.rearWheel.angularVelocity = speed / this.rearWheel.radius;
    
    // Update rotation angles (for visual and gyroscopic effects)
    this.frontWheel.rotationAngle += this.frontWheel.angularVelocity * this.dt;
    this.rearWheel.rotationAngle += this.rearWheel.angularVelocity * this.dt;
  }
  
  calculateForces() {
    const forces = {
      x: 0,
      y: 0,
      z: 0,
      pitch: 0,
      yaw: 0,
      roll: 0
    };
    
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    
    // Aerodynamic forces
    const aeroForces = this.calculateAerodynamics(speed);
    forces.x += aeroForces.x;
    forces.y += aeroForces.y;
    forces.z += aeroForces.z;
    
    // Tire forces (improved)
    const tireForces = this.calculateTireForcesV2(speed);
    forces.x += tireForces.x;
    forces.y += tireForces.y;
    forces.z += tireForces.z;
    
    // Gravity
    forces.y -= this.mass * this.gravity;
    
    // Gyroscopic effects
    const gyroTorques = this.calculateGyroscopicEffects(speed);
    forces.pitch += gyroTorques.pitch;
    forces.roll += gyroTorques.roll;
    forces.yaw += gyroTorques.yaw;
    
    // Steering torques (improved)
    const steerTorques = this.calculateSteeringTorques(speed);
    forces.yaw += steerTorques.yaw;
    forces.roll += steerTorques.roll;
    
    return forces;
  }
  
  calculateAerodynamics(speed) {
    const forces = { x: 0, y: 0, z: 0 };

    // Enhanced drag model - increases exponentially at high speeds
    // This creates the "wall" effect at very high speeds
    const speedMPH = speed * 2.237;

    // Dynamic drag coefficient that increases with speed (simulates compressibility effects)
    let dynamicDragCoeff = this.aero.dragCoefficient;
    if (speedMPH > 100) {
      // Drag increases dramatically above 100mph
      dynamicDragCoeff *= 1.0 + ((speedMPH - 100) / 100) * 0.5;
    }
    if (speedMPH > 150) {
      // Even more drag above 150mph (approaching sound barrier effects)
      dynamicDragCoeff *= 1.0 + ((speedMPH - 150) / 50) * 0.3;
    }

    // Drag force with enhanced coefficient
    const dragForce = 0.5 * this.aero.airDensity *
                      dynamicDragCoeff *
                      this.aero.frontalArea *
                      speed ** 2;

    // Downforce/lift
    const liftForce = 0.5 * this.aero.airDensity *
                     this.aero.liftCoefficient *
                     this.aero.frontalArea *
                     speed ** 2;

    if (speed > 0.1) {
      // Apply drag opposite to velocity
      forces.x -= (this.velocity.x / speed) * dragForce;
      forces.z -= (this.velocity.z / speed) * dragForce;

      // Apply lift/downforce
      forces.y += liftForce;
    }

    return forces;
  }
  
  calculateTireForcesV2(speed) {
    const forces = { x: 0, y: 0, z: 0 };

    // Check for burnout conditions (keyboard gives 0 or 1, not percentages)
    const isBurnoutCondition = (
      this.controls.throttle > 0 &&  // Any throttle
      this.controls.rearBrake > 0 &&  // Any rear brake
      speed < 10 // Can only burnout at low speeds
    );

    // Weight distribution with dynamic transfer
    const longAccel = this.acceleration.z;
    const latAccel = this.acceleration.x;

    // Longitudinal weight transfer
    const longTransfer = longAccel * this.mass * this.cogHeight / this.wheelbase;

    // Lateral weight transfer (affects grip during lean)
    const latTransfer = latAccel * this.mass * this.cogHeight / this.wheelbase * 0.3;

    // Calculate wheel loads
    this.frontWheel.load = (this.mass * this.gravity * 0.45) - longTransfer - latTransfer;
    this.rearWheel.load = (this.mass * this.gravity * 0.55) + longTransfer + latTransfer;

    // Ensure positive loads
    this.frontWheel.load = Math.max(10, this.frontWheel.load);
    this.rearWheel.load = Math.max(10, this.rearWheel.load);

    // Handle burnout
    if (isBurnoutCondition) {
      this.engine.isBurnouting = true;
      this.engine.burnoutSmoke = Math.min(1, this.engine.burnoutSmoke + this.dt * 2); // Ramp up smoke

      // During burnout, rear wheel spins but provides minimal forward force
      const driveForce = (this.rearWheel.torque / this.rearWheel.radius);
      const burnoutForce = driveForce * 0.1; // Only 10% of force translates to motion

      // Apply minimal forward force
      forces.x += burnoutForce * Math.sin(this.rotation.yaw);
      forces.z += burnoutForce * Math.cos(this.rotation.yaw);

      // Spin up the rear wheel fast
      this.rearWheel.angularVelocity = this.engine.rpm * 0.2; // Wheel spins with engine
      this.rearWheel.slip = 0.9; // High slip ratio

      // Rev the engine high
      this.engine.rpm = Math.min(this.engine.maxRPM - 500, this.engine.rpm + this.dt * 8000);

    } else {
      // Normal driving
      this.engine.isBurnouting = false;
      this.engine.burnoutSmoke = Math.max(0, this.engine.burnoutSmoke - this.dt * 4); // Fade smoke quickly

      // Drive force from rear wheel
      if (this.rearWheel.load > 0) {
        const driveForce = (this.rearWheel.torque / this.rearWheel.radius);
        const maxForce = this.rearWheel.load * this.rearWheel.grip * 1.8; // Much higher peak grip for acceleration
        const actualForce = Math.min(Math.abs(driveForce), maxForce) * Math.sign(driveForce);

        // Apply force in bike direction
        forces.x += actualForce * Math.sin(this.rotation.yaw);
        forces.z += actualForce * Math.cos(this.rotation.yaw);

        // Rear wheel torque creates a straightening moment when leaned
        // This simulates the real effect where acceleration helps stand the bike up
        if (Math.abs(this.rotation.roll) > 0.05 && this.controls.throttle > 0) {
          // The rear wheel pushing forward while leaned creates a torque that reduces lean
          const straighteningMoment = actualForce * Math.abs(this.rotation.roll) * 0.15;
          forces.roll -= straighteningMoment * Math.sign(this.rotation.roll);
        }
      }
    }

    // Braking forces - MUCH more powerful for collision avoidance with ABS-like behavior
    let frontBrakeForce = this.controls.frontBrake * this.frontWheel.load * 4.5; // Tripled from 1.5
    let rearBrakeForce = this.controls.rearBrake * this.rearWheel.load * 2.4; // Tripled from 0.8

    // Debug log if brakes are stuck
    if ((this.controls.frontBrake > 0 || this.controls.rearBrake > 0) && Math.random() < 0.05) {
      console.log('Brake values:', this.controls.frontBrake, this.controls.rearBrake);
    }

    // ABS-like behavior - prevent wheel lockup at high brake pressure
    // Maximum deceleration is about 1.2g for sport bike with good tires
    const maxDeceleration = 1.2 * this.gravity * this.mass;
    const totalBrakeForce = frontBrakeForce + rearBrakeForce;

    if (totalBrakeForce > maxDeceleration) {
      // Scale down to prevent lockup but maintain ratio
      const scale = maxDeceleration / totalBrakeForce;
      frontBrakeForce *= scale;
      rearBrakeForce *= scale;
    }

    // Apply braking in opposite direction of motion
    if (speed > 0.1) {
      const brakingX = -(this.velocity.x / speed) * (frontBrakeForce + rearBrakeForce);
      const brakingZ = -(this.velocity.z / speed) * (frontBrakeForce + rearBrakeForce);
      forces.x += brakingX;
      forces.z += brakingZ;
    }
    
    // Cornering forces (completely redesigned)
    const corneringForces = this.calculateCorneringForces(speed);
    forces.x += corneringForces.x;
    forces.z += corneringForces.z;
    
    // Camber thrust from lean angle
    const camberForce = this.calculateCamberThrust();
    forces.x += camberForce.x;
    forces.z += camberForce.z;
    
    return forces;
  }
  
  calculateCorneringForces(speed) {
    const forces = { x: 0, z: 0 };

    if (speed < 0.1) return forces;

    // Get lean angle
    const leanAngle = this.rotation.roll;

    // Calculate required centripetal force for the turn
    if (Math.abs(leanAngle) > 0.01) {
      // Check if we're accelerating or coasting/braking
      const isAccelerating = this.controls.throttle > 0;
      const isBraking = this.controls.frontBrake > 0 || this.controls.rearBrake > 0;

      // MUCH tighter turns when not accelerating
      let throttleRadiusMultiplier = 1.0;
      if (!isAccelerating) {
        throttleRadiusMultiplier = 4.0; // 4x tighter turning when off throttle
        if (isBraking) {
          throttleRadiusMultiplier = 5.0; // 5x tighter when braking
        }
      } else {
        // Still allow sharp turning when accelerating
        throttleRadiusMultiplier = 1.8 - (this.controls.throttle * 0.4); // 1.8x at zero throttle, 1.4x at full
      }

      // Physics-based turn radius from lean angle
      // R = v² / (g * tan(lean))
      // Modified by progressive factor for MUCH tighter turns
      const progressiveTurnFactor = 1 + this.turning.progressiveLeanFactor * 1.0; // Double the effect
      const effectiveLeanAngle = leanAngle * progressiveTurnFactor * throttleRadiusMultiplier;
      // Reduce turn radius calculation for tighter turns
      const turnRadius = (speed * speed * 0.6) / (this.gravity * Math.tan(Math.abs(effectiveLeanAngle)));

      // Required centripetal acceleration - enhanced by hold time
      const centripetalAccel = speed * speed / turnRadius;

      // Centripetal force needed - with progressive grip simulation
      let gripEnhancement = 1 + this.turning.progressiveLeanFactor * 0.3; // Increased

      // Better grip when not accelerating (more weight on front wheel)
      if (!isAccelerating) {
        gripEnhancement *= 1.2;
      }

      const centripetalForce = this.mass * centripetalAccel * gripEnhancement;

      // Apply force perpendicular to velocity (creates the turn)
      // Direction depends on lean direction (negative for correct turning)
      const forceDirection = -Math.sign(leanAngle);

      // Transform to world coordinates
      const perpAngle = this.rotation.yaw + (Math.PI / 2) * forceDirection;
      forces.x = centripetalForce * Math.sin(perpAngle);
      forces.z = centripetalForce * Math.cos(perpAngle);

      // Add slip angle effects for more realistic tire behavior
      // Reduced slip with longer hold (committed turn has better line)
      let slipReduction = 1 - this.turning.progressiveLeanFactor * 0.4;

      // Less slip when not accelerating
      if (!isAccelerating) {
        slipReduction *= 0.7;
      }

      const slipAngle = Math.atan2(this.velocity.x, this.velocity.z) - this.rotation.yaw;
      const slipForce = Math.sin(slipAngle) * speed * this.mass * 0.5 * slipReduction;

      forces.x -= slipForce * Math.cos(this.rotation.yaw);
      forces.z += slipForce * Math.sin(this.rotation.yaw);
    }

    return forces;
  }
  
  calculateCamberThrust() {
    const forces = { x: 0, z: 0 };
    
    // Camber thrust increases with lean angle
    const leanDegrees = this.rotation.roll * 180 / Math.PI;
    const camberForce = leanDegrees * this.turning.camberCoefficient;
    
    // Apply perpendicular to travel direction (negative sign for correct direction)
    const perpAngle = this.rotation.yaw - Math.PI / 2;
    forces.x = camberForce * Math.sin(perpAngle) * Math.sign(this.rotation.roll);
    forces.z = camberForce * Math.cos(perpAngle) * Math.sign(this.rotation.roll);
    
    return forces;
  }
  
  calculateGyroscopicEffects(speed) {
    const torques = { pitch: 0, roll: 0, yaw: 0 };

    // Gyroscopic precession from front wheel
    const frontWheelGyro = this.frontWheel.momentOfInertia * this.frontWheel.angularVelocity;
    const rearWheelGyro = this.rearWheel.momentOfInertia * this.rearWheel.angularVelocity;

    // When leaning, gyroscopic effect wants to turn the bike
    torques.yaw += (frontWheelGyro + rearWheelGyro) *
                   this.angularVelocity.roll *
                   this.turning.gyroscopicCoefficient;

    // When turning, gyroscopic effect affects lean
    torques.roll -= (frontWheelGyro + rearWheelGyro) *
                    this.angularVelocity.yaw *
                    this.turning.gyroscopicCoefficient * 0.5;

    // Gyroscopic stability (resists lean changes)
    torques.roll -= this.angularVelocity.roll * frontWheelGyro * 0.1;

    // Acceleration-based gyroscopic straightening
    // When accelerating, increased wheel speed creates more gyroscopic stability
    if (this.controls.throttle > 0) {
      const accelerationStability = this.controls.throttle * (frontWheelGyro + rearWheelGyro) * 0.2;
      // This force opposes any lean angle, helping to straighten the bike
      torques.roll -= this.rotation.roll * accelerationStability;
    }

    return torques;
  }
  
  calculateSteeringTorques(speed) {
    const torques = { yaw: 0, roll: 0 };

    // Update turn hold time tracking
    this.updateTurnHoldTime();

    // Update brake hold time for brake-turning
    this.updateBrakeHoldTime();

    // Check throttle state for turning modifiers
    const isAccelerating = this.controls.throttle > 0;
    const throttleModifier = isAccelerating ? (1.0 - this.controls.throttle * 0.2) : 1.5; // Better turning off throttle

    // Apply sharp turn boost from tap-then-hold OR brake-turning
    // Brake turn boost: 1.0 + (boost * multiplier)
    const brakeTurnBoost = 1.0 + (this.turning.brakeTurnBoost * this.turning.brakeTurnMultiplier);
    const tapTurnBoost = this.turning.sharpTurnActive ? this.turning.sharpTurnBoost : 1.0;

    // Use the higher of the two boosts
    const sharpTurnMultiplier = Math.max(tapTurnBoost, brakeTurnBoost);

    // Throttle straightening effect - acceleration wants to stand the bike up
    if (isAccelerating && Math.abs(this.rotation.roll) > 0.05) {
      // Apply a torque to reduce lean when accelerating
      const straighteningTorque = -this.rotation.roll * this.controls.throttle * 8000 * (speed / 30);
      torques.roll += straighteningTorque;
    }

    // Counter-steering implementation with progressive lean
    if (speed > this.turning.counterSteerThreshold) {
      // Above threshold: counter-steering
      // Steering input creates lean, lean creates turn

      // Progressive steering torque with sharp initial response
      // Start at 85% strength immediately for VERY sharp turn-in
      const progressiveMultiplier = (0.85 + 0.15 * this.turning.progressiveLeanFactor) * throttleModifier * sharpTurnMultiplier;
      const steerTorque = this.controls.steerInput * 25000 * (speed / 25) * progressiveMultiplier; // MUCH higher torque
      torques.roll -= steerTorque; // Negative because counter-steering

      // Lean angle creates yaw (turning) - enhanced by hold time and throttle state
      const leanAngle = this.rotation.roll;
      const turnRate = Math.sin(leanAngle) * Math.sqrt(this.gravity / (speed + 0.5)); // Less speed denominator
      const turnEnhancement = (1.5 + this.turning.progressiveLeanFactor * 1.0) * throttleModifier * sharpTurnMultiplier; // Start at 1.5x
      torques.yaw = turnRate * 15000 * turnEnhancement; // MUCH higher base yaw torque

      // Trail effect (self-centering) - reduced with longer hold for committed turns
      const trailReduction = (1 - this.turning.progressiveLeanFactor * 0.4) * (isAccelerating ? 1.0 : 0.7);
      const trailTorque = -this.frontWheel.steerAngle * speed * this.turning.trailEffect * 100 * trailReduction;
      torques.roll += trailTorque;

    } else {
      // Below threshold: direct steering with progressive effect
      const progressiveMultiplier = (0.7 + 0.3 * this.turning.progressiveLeanFactor) * throttleModifier;
      torques.yaw = this.controls.steerInput * 1500 * progressiveMultiplier; // Increased

      // Minimal lean at low speed
      torques.roll = this.controls.lean * 700 * progressiveMultiplier; // Increased
    }

    // Target lean from control input - enhanced by hold time and throttle state
    // Reduce target lean when accelerating hard (throttle wants to stand bike up)
    const throttleLeanReduction = isAccelerating ? (1.0 - this.controls.throttle * 0.2) : 1.0; // Less reduction
    const progressiveLeanMultiplier = (1.5 + this.turning.progressiveLeanFactor * 1.2) * throttleModifier * throttleLeanReduction * sharpTurnMultiplier;
    const targetLean = this.controls.lean * this.maxLeanAngle * progressiveLeanMultiplier;
    const leanError = targetLean - this.rotation.roll;

    // Speed-dependent lean response with progressive factor
    const speedFactor = Math.min(1, speed / 10); // Reaches max at even lower speed
    const progressiveResponse = (2.0 + this.turning.progressiveLeanFactor * 1.5) * throttleModifier * sharpTurnMultiplier; // MUCH more aggressive
    const leanCorrection = leanError * 10000 * speedFactor * progressiveResponse; // MUCH higher response

    torques.roll += leanCorrection;

    // Damping to prevent oscillation - much less to allow sharp transitions
    // Almost no damping when sharp turn is active
    const sharpTurnDampingMultiplier = this.turning.sharpTurnActive ? 0.1 : 1.0;
    const dampingReduction = (1 - this.turning.progressiveLeanFactor * 0.5) * (isAccelerating ? 0.7 : 0.5) * sharpTurnDampingMultiplier;
    torques.roll -= this.angularVelocity.roll * 800 * dampingReduction; // Reduced damping
    torques.yaw -= this.angularVelocity.yaw * 300 * dampingReduction; // Reduced damping

    return torques;
  }

  updateBrakeHoldTime() {
    // Check if any brake is being applied
    const isBraking = (this.controls.frontBrake > 0 || this.controls.rearBrake > 0);

    if (isBraking) {
      // Increase brake hold time
      this.turning.brakeHoldTime = Math.min(
        this.turning.maxBrakeHoldTime,
        this.turning.brakeHoldTime + this.dt
      );
    } else {
      // Decay brake hold time quickly
      this.turning.brakeHoldTime = Math.max(
        0,
        this.turning.brakeHoldTime - this.dt * 3 // Fast decay
      );
    }

    // Calculate brake turn boost (0 to 1, with exponential curve)
    const normalized = this.turning.brakeHoldTime / this.turning.maxBrakeHoldTime;
    this.turning.brakeTurnBoost = Math.pow(normalized, 0.7); // Exponential curve for progressive feel
  }

  updateTurnHoldTime() {
    const currentTurnDirection = Math.sign(this.controls.lean);

    if (Math.abs(this.controls.lean) > 0) {
      // Currently turning
      if (currentTurnDirection === this.turning.lastTurnDirection || this.turning.lastTurnDirection === 0) {
        // Same direction or starting new turn - increase hold time
        this.turning.turnHoldTime = Math.min(
          this.turning.maxHoldTime,
          this.turning.turnHoldTime + this.dt
        );
      } else {
        // Direction changed - reset hold time
        this.turning.turnHoldTime = 0;
      }
      this.turning.lastTurnDirection = currentTurnDirection;
    } else {
      // Not turning - decay hold time
      this.turning.turnHoldTime = Math.max(
        0,
        this.turning.turnHoldTime - this.turning.holdTimeDecay * this.dt
      );
      if (this.turning.turnHoldTime === 0) {
        this.turning.lastTurnDirection = 0;
      }
    }

    // Update progressive lean factor with aggressive initial response
    const normalized = this.turning.turnHoldTime / this.turning.maxHoldTime;

    // Start with immediate 40% response, then progress to 100%
    // This gives sharp initial turn-in with progressive tightening
    if (normalized < 0.1) {
      // First 0.15 seconds - jump to 40% immediately
      this.turning.progressiveLeanFactor = 0.4;
    } else {
      // Continue from 40% to 100% over remaining time
      const adjustedNorm = (normalized - 0.1) / 0.9;
      this.turning.progressiveLeanFactor = 0.4 + 0.6 * Math.sin(adjustedNorm * Math.PI / 2);
    }
  }
  
  updateDynamics(forces) {
    // Linear dynamics
    this.acceleration.x = forces.x / this.mass;
    this.acceleration.y = forces.y / this.mass;
    this.acceleration.z = forces.z / this.mass;
    
    // Update velocity
    this.velocity.x += this.acceleration.x * this.dt;
    this.velocity.y += this.acceleration.y * this.dt;
    this.velocity.z += this.acceleration.z * this.dt;
    
    // Update position
    this.position.x += this.velocity.x * this.dt;
    this.position.y += this.velocity.y * this.dt;
    this.position.z += this.velocity.z * this.dt;
    
    // Angular dynamics with proper moments of inertia
    const inertia = {
      pitch: this.mass * 0.4, // Slightly higher for pitch stability
      yaw: this.mass * 0.6,   // Highest for yaw (turning)
      roll: this.mass * 0.25  // Lowest for roll (lean) - easier to lean
    };
    
    // Update angular acceleration
    const angularAccel = {
      pitch: forces.pitch / inertia.pitch,
      yaw: forces.yaw / inertia.yaw,
      roll: forces.roll / inertia.roll
    };
    
    // Update angular velocity
    this.angularVelocity.pitch += angularAccel.pitch * this.dt;
    this.angularVelocity.yaw += angularAccel.yaw * this.dt;
    this.angularVelocity.roll += angularAccel.roll * this.dt;
    
    // Update rotation
    this.rotation.pitch += this.angularVelocity.pitch * this.dt;
    this.rotation.yaw += this.angularVelocity.yaw * this.dt;
    this.rotation.roll += this.angularVelocity.roll * this.dt;
    
    // Update handlebar steering angle based on input and speed
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    const maxSteer = this.turning.maxSteerAngle * Math.max(0.2, 1 - speed / 30);
    this.frontWheel.steerAngle = this.controls.steerInput * maxSteer;
  }
  
  updateSuspension() {
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    const accelG = this.acceleration.z / this.gravity;
    const brakeG = -this.acceleration.z / this.gravity;
    
    // Front suspension compression
    const frontBrakeInput = this.controls.frontBrake;
    const antiDiveReduction = frontBrakeInput * this.suspension.front.antiDive;
    this.suspension.front.compression = Math.max(0, Math.min(1, 
      0.5 + brakeG * 0.4 * (1 - antiDiveReduction)
    ));
    
    // Rear suspension compression
    const throttleInput = this.controls.throttle;
    const antiSquatReduction = throttleInput * this.suspension.rear.antiSquat;
    this.suspension.rear.compression = Math.max(0, Math.min(1, 
      0.5 + accelG * 0.4 * (1 - antiSquatReduction)
    ));
    
    // Pitch from suspension
    const pitchFromSuspension = (this.suspension.rear.compression - this.suspension.front.compression) * 0.15;
    this.rotation.pitch = pitchFromSuspension;
    
    // Wheelie detection
    if (accelG > 0.5 && speed > 5 && this.engine.gear <= 2) {
      const wheelieTendency = accelG * throttleInput * (1 - speed / 50);
      this.rotation.pitch = Math.max(this.rotation.pitch, wheelieTendency * 0.3);
    }
  }
  
  updateTirePhysics() {
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    
    // Calculate slip ratios
    const frontSlip = this.calculateWheelSlip(this.frontWheel, speed);
    const rearSlip = this.calculateWheelSlip(this.rearWheel, speed);
    
    this.frontWheel.slip = frontSlip;
    this.rearWheel.slip = rearSlip;
    
    // Update grip based on slip
    this.frontWheel.grip = this.calculateGripFromSlip(frontSlip);
    this.rearWheel.grip = this.calculateGripFromSlip(rearSlip);
    
    // Reduce grip during extreme lean
    const leanFactor = 1 - (Math.abs(this.rotation.roll) / this.maxLeanAngle) * 0.2;
    this.frontWheel.grip *= leanFactor;
    this.rearWheel.grip *= leanFactor;
  }
  
  calculateWheelSlip(wheel, speed) {
    if (speed < 0.1) return 0;
    
    const wheelSpeed = wheel.angularVelocity * wheel.radius;
    const slip = (wheelSpeed - speed) / Math.max(1, speed);
    
    return Math.max(-1, Math.min(1, slip));
  }
  
  calculateGripFromSlip(slip) {
    // Pacejka-like grip curve
    const absSlip = Math.abs(slip);
    if (absSlip < 0.1) {
      return 1.0; // Full grip at low slip
    } else if (absSlip < 0.3) {
      return 1.0 - (absSlip - 0.1) * 1.5; // Gradual reduction
    } else {
      return 0.7 - (absSlip - 0.3) * 0.5; // Further reduction
    }
  }
  
  updateEngine() {
    const { throttle, clutch, gearUp, gearDown } = this.controls;
    
    // Gear shifting
    if (gearUp && this.engine.gear < 6) {
      this.engine.gear++;
      this.engine.clutch = 0;
    } else if (gearDown && this.engine.gear > 1) {
      this.engine.gear--;
      this.engine.clutch = 0;
    }
    
    // Clutch engagement
    if (clutch) {
      this.engine.clutch = Math.max(0, this.engine.clutch - 2 * this.dt);
    } else {
      this.engine.clutch = Math.min(1, this.engine.clutch + 4 * this.dt);
    }
    
    // Engine RPM calculation
    const gearRatio = this.engine.gearRatios[this.engine.gear - 1];
    const wheelRPM = (this.rearWheel.angularVelocity * 60) / (2 * Math.PI);
    const targetRPM = wheelRPM * gearRatio * this.engine.finalDrive;
    
    // Engine response
    const rpmDiff = (targetRPM - this.engine.rpm) * this.engine.clutch;
    this.engine.rpm += rpmDiff * this.dt * 5;
    
    // Throttle application
    if (throttle > 0) {
      this.engine.rpm = Math.min(
        this.engine.maxRPM,
        this.engine.rpm + throttle * 5000 * this.dt
      );
    } else {
      // Coasting - RPM matches wheel speed (like automatic transmission)
      // This prevents engine braking and maintains momentum
      this.engine.rpm = Math.max(
        this.engine.idleRPM,
        Math.min(this.engine.maxRPM, targetRPM)
      );
    }
    
    // Detect fresh throttle application for boost
    if (throttle > 0.05 && this.controls.lastThrottle < 0.05) {
      // Fresh throttle application - start boost timer
      this.controls.throttleBoostTimer = 0.8; // 0.8 second boost (longer)
    } else if (throttle > 0.05) {
      // Continue counting down boost
      this.controls.throttleBoostTimer = Math.max(0, this.controls.throttleBoostTimer - this.dt);
    } else {
      // No throttle - no boost
      this.controls.throttleBoostTimer = 0;
    }

    // Calculate torque with VERY aggressive throttle response curve
    // Extreme sensitivity at low throttle
    let throttleResponse;
    if (throttle > 0) {
      // SUPER aggressive initial response
      // Using power of 0.3 instead of 0.5 (sqrt) for even more sensitivity
      throttleResponse = Math.pow(throttle, 0.3) * 1.4; // Much more aggressive curve

      // Add massive boost for initial throttle application
      if (this.controls.throttleBoostTimer > 0) {
        const boostFactor = 1.0 + (this.controls.throttleBoostTimer / 0.8) * 0.5; // Up to 50% boost
        throttleResponse *= boostFactor;
      }

      // Even small throttle inputs give significant response
      throttleResponse = Math.max(throttle * 2, throttleResponse); // At least 2x throttle
      throttleResponse = Math.min(1.5, throttleResponse); // Cap at 1.5 with boost
    } else {
      throttleResponse = 0;
    }

    // Store current throttle for next frame
    this.controls.lastThrottle = throttle;

    const torque = this.calculateEngineTorque(this.engine.rpm) * throttleResponse;

    // No engine braking - coasts freely like automatic or with clutch in
    this.rearWheel.torque = torque * gearRatio * this.engine.finalDrive * this.engine.clutch;
  }
  
  calculateEngineTorque(rpm) {
    // More realistic torque curve with speed-dependent delivery
    const normalized = rpm / this.engine.maxRPM;
    const baseTorque = 250; // Much higher base torque for brutal acceleration

    // Get current speed for acceleration curve
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    const speedMPH = speed * 2.237;

    // AGGRESSIVE acceleration curve: VERY strong at low speed, dramatic taper
    // More extreme sqrt-like curve for brutal initial acceleration
    let speedFactor;
    if (speedMPH < 20) {
      speedFactor = 1.3; // 130% power - overdrive at very low speeds
    } else if (speedMPH < 40) {
      // Rapid taper from 130% to 90%
      speedFactor = 1.3 - ((speedMPH - 20) / 20) * 0.4;
    } else if (speedMPH < 70) {
      // Continue aggressive taper: 90% to 60%
      speedFactor = 0.9 - ((speedMPH - 40) / 30) * 0.3;
    } else if (speedMPH < 100) {
      // Steep drop: 60% to 40%
      speedFactor = 0.6 - ((speedMPH - 70) / 30) * 0.2;
    } else if (speedMPH < 140) {
      // Major struggle: 40% to 25%
      speedFactor = 0.4 - ((speedMPH - 100) / 40) * 0.15;
    } else {
      // Hit the wall - minimal power
      speedFactor = Math.max(0.15, 0.25 - ((speedMPH - 140) / 60) * 0.1);
    }

    // RPM-based torque curve (engine characteristics)
    let rpmTorque;
    if (normalized < 0.2) {
      rpmTorque = 0.6; // Low end torque
    } else if (normalized < 0.7) {
      rpmTorque = 0.6 + 0.4 * (normalized - 0.2) / 0.5; // Rising
    } else if (normalized < 0.9) {
      rpmTorque = 1.0; // Peak torque
    } else {
      rpmTorque = 1.0 - (normalized - 0.9) * 2; // Falling
    }

    // Combine both factors for final torque
    return baseTorque * rpmTorque * speedFactor;
  }
  
  applyConstraints() {
    // Ground constraint
    if (this.position.y < 0) {
      this.position.y = 0;
      this.velocity.y = Math.max(0, this.velocity.y);
    }
    
    // Lean angle limits
    this.rotation.roll = Math.max(-this.maxLeanAngle, 
                        Math.min(this.maxLeanAngle, this.rotation.roll));
    
    // Prevent excessive lean at low speed
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (speed < 2) {
      const maxLowSpeedLean = 10 * Math.PI / 180; // 10 degrees max at very low speed
      this.rotation.roll *= Math.min(1, speed / 2);
    }
    
    // Speed limiter
    if (speed > 85) { // ~190 mph
      const scale = 85 / speed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }
    
    // Prevent wheelie from going too far
    this.rotation.pitch = Math.min(this.rotation.pitch, 45 * Math.PI / 180);
  }
  
  setControls(controls) {
    // Detect tap-then-hold for sharp turning
    if (controls.lean !== undefined) {
      const currentTime = Date.now();
      const leanDirection = Math.sign(controls.lean);
      const previousDirection = Math.sign(this.controls.lean);

      // Detect tap (going from neutral to turning)
      if (leanDirection !== 0 && previousDirection === 0) {
        this.turning.tapTime = currentTime;
        this.turning.tapDirection = leanDirection;
        this.turning.sharpTurnActive = false;
      }
      // Check if holding after a recent tap in same direction
      else if (leanDirection !== 0 &&
               leanDirection === this.turning.tapDirection &&
               currentTime - this.turning.tapTime < this.turning.tapWindow) {
        this.turning.sharpTurnActive = true;
      }
      // Deactivate sharp turn if direction changes or released
      else if (leanDirection !== this.turning.tapDirection) {
        this.turning.sharpTurnActive = false;
      }
    }

    this.controls = { ...this.controls, ...controls };

    // Map lean control to steering input for counter-steering
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (speed > this.turning.counterSteerThreshold) {
      // At speed, lean input becomes counter-steer input
      this.controls.steerInput = -controls.lean * 0.5 || this.controls.steerInput;
    } else {
      // At low speed, direct steering
      this.controls.steerInput = controls.lean || this.controls.steerInput;
    }
  }
  
  getState() {
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    const speedMPH = speed * 2.237; // m/s to mph

    return {
      position: this.position, // Direct reference, no clone
      rotation: this.rotation, // Direct reference, no clone
      velocity: this.velocity, // Direct reference, no clone
      speed: speedMPH,
      rpm: Math.round(this.engine.rpm),
      gear: this.engine.gear,
      leanAngle: this.rotation.roll * 180 / Math.PI,
      sharpTurnActive: this.turning.sharpTurnActive, // Add sharp turn status
      steerAngle: this.frontWheel.steerAngle * 180 / Math.PI,
      wheelie: this.rotation.pitch > 0.1,
      isBurnouting: this.engine.isBurnouting,
      burnoutSmoke: this.engine.burnoutSmoke,
      brakeLight: this.controls.frontBrake > 0 || this.controls.rearBrake > 0, // Brake light state
      frontBrakeAmount: this.controls.frontBrake, // Debug: actual brake value
      rearBrakeAmount: this.controls.rearBrake, // Debug: actual brake value
      frontSuspension: this.suspension.front.compression,
      rearSuspension: this.suspension.rear.compression,
      frontWheelSlip: this.frontWheel.slip,
      rearWheelSlip: this.rearWheel.slip,
      frontGrip: this.frontWheel.grip,
      rearGrip: this.rearWheel.grip,
      isCounterSteering: speed > this.turning.counterSteerThreshold,
      turnHoldTime: this.turning.turnHoldTime,
      progressiveLeanFactor: this.turning.progressiveLeanFactor,
      collision: this.collision // For game compatibility
    };
  }
  
  reset() {
    this.position = { x: 5.5, y: 0, z: 0 }; // Right shoulder position
    this.velocity = { x: 0, y: 0, z: 29 }; // ~65 mph forward
    this.acceleration = { x: 0, y: 0, z: 0 };
    this.rotation = { pitch: 0, yaw: 0, roll: 0 };
    this.angularVelocity = { pitch: 0, yaw: 0, roll: 0 };
    this.engine.rpm = 6000; // Cruising RPM at 65mph
    this.engine.gear = 4; // 4th gear for highway cruising
    this.frontWheel.steerAngle = 0;
  }
}