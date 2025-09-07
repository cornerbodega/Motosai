// Motosai Custom Motorcycle Physics Engine V2
// Improved turning system with proper gyroscopic effects and counter-steering

export class MotorcyclePhysicsV2 {
  constructor() {
    // Bike properties
    this.mass = 200; // kg (bike + rider)
    this.wheelbase = 1.4; // meters
    this.cogHeight = 0.6; // center of gravity height
    this.maxLeanAngle = 48 * Math.PI / 180; // radians (48 degrees for sport riding)
    this.rake = 24 * Math.PI / 180; // Fork rake angle (24 degrees typical for sport bike)
    this.trail = 0.09; // meters (90mm trail)
    
    // State variables
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
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
      maxRPM: 12000,
      idleRPM: 1000,
      gearRatios: [2.8, 2.0, 1.5, 1.2, 1.0, 0.85],
      finalDrive: 3.0,
      engineBraking: 0.3 // Engine braking coefficient
    };
    
    // Aerodynamics
    this.aero = {
      dragCoefficient: 0.6,
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
      gearDown: false
    };
    
    // Physics constants
    this.gravity = 9.81;
    this.dt = 1/60; // 60 FPS physics
    
    // Turning system parameters
    this.turning = {
      counterSteerThreshold: 5, // m/s (about 11 mph)
      steerRate: 2.0, // rad/s maximum steer rate
      maxSteerAngle: 35 * Math.PI / 180, // 35 degrees max
      leanRate: 1.5, // Maximum lean rate (rad/s)
      gyroscopicCoefficient: 0.015, // Gyroscopic effect strength
      camberCoefficient: 350, // N per degree of camber
      trailEffect: 0.8 // Trail stabilization factor
    };
  }
  
  update(deltaTime) {
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
    
    // Drag force
    const dragForce = 0.5 * this.aero.airDensity * 
                      this.aero.dragCoefficient * 
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
    
    // Drive force from rear wheel
    if (this.rearWheel.load > 0) {
      const driveForce = (this.rearWheel.torque / this.rearWheel.radius);
      const maxForce = this.rearWheel.load * this.rearWheel.grip * 1.2; // Peak grip
      const actualForce = Math.min(Math.abs(driveForce), maxForce) * Math.sign(driveForce);
      
      // Apply force in bike direction
      forces.x += actualForce * Math.sin(this.rotation.yaw);
      forces.z += actualForce * Math.cos(this.rotation.yaw);
    }
    
    // Braking forces
    const frontBrakeForce = this.controls.frontBrake * this.frontWheel.load * 1.5;
    const rearBrakeForce = this.controls.rearBrake * this.rearWheel.load * 0.8;
    
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
      // Physics-based turn radius from lean angle
      // R = v² / (g * tan(lean))
      const turnRadius = (speed * speed) / (this.gravity * Math.tan(Math.abs(leanAngle)));
      
      // Required centripetal acceleration
      const centripetalAccel = speed * speed / turnRadius;
      
      // Centripetal force needed
      const centripetalForce = this.mass * centripetalAccel;
      
      // Apply force perpendicular to velocity (creates the turn)
      // Direction depends on lean direction (negative for correct turning)
      const forceDirection = -Math.sign(leanAngle);
      
      // Transform to world coordinates
      const perpAngle = this.rotation.yaw + (Math.PI / 2) * forceDirection;
      forces.x = centripetalForce * Math.sin(perpAngle);
      forces.z = centripetalForce * Math.cos(perpAngle);
      
      // Add slip angle effects for more realistic tire behavior
      const slipAngle = Math.atan2(this.velocity.x, this.velocity.z) - this.rotation.yaw;
      const slipForce = Math.sin(slipAngle) * speed * this.mass * 0.5;
      
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
    
    return torques;
  }
  
  calculateSteeringTorques(speed) {
    const torques = { yaw: 0, roll: 0 };
    
    // Counter-steering implementation
    if (speed > this.turning.counterSteerThreshold) {
      // Above threshold: counter-steering
      // Steering input creates lean, lean creates turn
      
      // Steering input affects lean rate
      const steerTorque = this.controls.steerInput * 8000 * (speed / 30);
      torques.roll -= steerTorque; // Negative because counter-steering
      
      // Lean angle creates yaw (turning)
      const leanAngle = this.rotation.roll;
      const turnRate = Math.sin(leanAngle) * Math.sqrt(this.gravity / (speed + 1));
      torques.yaw = turnRate * 5000;
      
      // Trail effect (self-centering)
      const trailTorque = -this.frontWheel.steerAngle * speed * this.turning.trailEffect * 100;
      torques.roll += trailTorque;
      
    } else {
      // Below threshold: direct steering
      torques.yaw = this.controls.steerInput * 1000;
      
      // Minimal lean at low speed
      torques.roll = this.controls.lean * 500;
    }
    
    // Target lean from control input
    const targetLean = this.controls.lean * this.maxLeanAngle;
    const leanError = targetLean - this.rotation.roll;
    
    // Speed-dependent lean response
    const speedFactor = Math.min(1, speed / 20);
    const leanCorrection = leanError * 3000 * speedFactor;
    
    torques.roll += leanCorrection;
    
    // Damping to prevent oscillation
    torques.roll -= this.angularVelocity.roll * 1500;
    torques.yaw -= this.angularVelocity.yaw * 500;
    
    return torques;
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
      // Engine braking
      const engineBrake = this.engine.engineBraking * this.engine.clutch;
      this.engine.rpm = Math.max(
        this.engine.idleRPM,
        this.engine.rpm - 2000 * this.dt * (1 + engineBrake)
      );
    }
    
    // Calculate torque
    const torque = this.calculateEngineTorque(this.engine.rpm) * throttle;
    this.rearWheel.torque = torque * gearRatio * this.engine.finalDrive * this.engine.clutch;
  }
  
  calculateEngineTorque(rpm) {
    // More realistic torque curve
    const normalized = rpm / this.engine.maxRPM;
    const baseTorque = 100;
    
    // Peak torque around 70% of max RPM
    if (normalized < 0.2) {
      return baseTorque * 0.6; // Low end torque
    } else if (normalized < 0.7) {
      return baseTorque * (0.6 + 0.4 * (normalized - 0.2) / 0.5); // Rising
    } else if (normalized < 0.9) {
      return baseTorque; // Peak torque
    } else {
      return baseTorque * (1 - (normalized - 0.9) * 2); // Falling
    }
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
      steerAngle: this.frontWheel.steerAngle * 180 / Math.PI,
      wheelie: this.rotation.pitch > 0.1,
      frontSuspension: this.suspension.front.compression,
      rearSuspension: this.suspension.rear.compression,
      frontWheelSlip: this.frontWheel.slip,
      rearWheelSlip: this.rearWheel.slip,
      frontGrip: this.frontWheel.grip,
      rearGrip: this.rearWheel.grip,
      isCounterSteering: speed > this.turning.counterSteerThreshold
    };
  }
  
  reset() {
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.acceleration = { x: 0, y: 0, z: 0 };
    this.rotation = { pitch: 0, yaw: 0, roll: 0 };
    this.angularVelocity = { pitch: 0, yaw: 0, roll: 0 };
    this.engine.rpm = this.engine.idleRPM;
    this.engine.gear = 1;
    this.frontWheel.steerAngle = 0;
  }
}