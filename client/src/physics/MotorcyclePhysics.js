// Motosai Custom Motorcycle Physics Engine
// Realistic motorcycle dynamics simulation

export class MotorcyclePhysics {
  constructor() {
    // Bike properties
    this.mass = 200; // kg (bike + rider)
    this.wheelbase = 1.4; // meters
    this.cogHeight = 0.6; // center of gravity height
    this.maxLeanAngle = 45 * Math.PI / 180; // radians
    
    // State variables
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.acceleration = { x: 0, y: 0, z: 0 };
    this.rotation = { pitch: 0, yaw: 0, roll: 0 }; // lean is roll
    this.angularVelocity = { pitch: 0, yaw: 0, roll: 0 };
    
    // Wheels
    this.frontWheel = {
      radius: 0.3,
      angularVelocity: 0,
      slip: 0,
      load: 0,
      grip: 1.0,
      steerAngle: 0,
      brakeForce: 0
    };
    
    this.rearWheel = {
      radius: 0.32,
      angularVelocity: 0,
      slip: 0,
      load: 0,
      grip: 1.0,
      torque: 0,
      brakeForce: 0
    };
    
    // Suspension
    this.suspension = {
      front: {
        compression: 0,
        velocity: 0,
        travel: 0.12,
        springRate: 35000, // N/m
        damping: 3000
      },
      rear: {
        compression: 0,
        velocity: 0,
        travel: 0.14,
        springRate: 40000,
        damping: 3500
      }
    };
    
    // Engine
    this.engine = {
      rpm: 1000,
      gear: 1,
      clutch: 1.0, // 0 = disengaged, 1 = engaged
      throttle: 0,
      maxRPM: 12000,
      idleRPM: 1000,
      gearRatios: [2.8, 2.0, 1.5, 1.2, 1.0, 0.85],
      finalDrive: 3.0
    };
    
    // Aerodynamics
    this.aero = {
      dragCoefficient: 0.6,
      frontalArea: 0.6, // m²
      airDensity: 1.225 // kg/m³
    };
    
    // Controls
    this.controls = {
      throttle: 0,
      frontBrake: 0,
      rearBrake: 0,
      lean: 0, // -1 to 1
      steer: 0,
      clutch: false,
      gearUp: false,
      gearDown: false
    };
    
    // Physics constants
    this.gravity = 9.81;
    this.dt = 1/60; // 60 FPS physics
  }
  
  update(deltaTime) {
    this.dt = deltaTime || 1/60;
    
    // Update engine
    this.updateEngine();
    
    // Calculate forces
    const forces = this.calculateForces();
    
    // Update dynamics
    this.updateDynamics(forces);
    
    // Update suspension
    this.updateSuspension();
    
    // Update wheels
    this.updateWheels();
    
    // Apply constraints
    this.applyConstraints();
    
    return this.getState();
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
    
    // Engine RPM based on rear wheel speed and gear
    const gearRatio = this.engine.gearRatios[this.engine.gear - 1];
    const wheelRPM = (this.rearWheel.angularVelocity * 60) / (2 * Math.PI);
    const targetRPM = wheelRPM * gearRatio * this.engine.finalDrive;
    
    // Engine response with clutch
    const rpmDiff = (targetRPM - this.engine.rpm) * this.engine.clutch;
    this.engine.rpm += rpmDiff * this.dt * 5;
    
    // Apply throttle
    if (throttle > 0) {
      this.engine.rpm = Math.min(
        this.engine.maxRPM,
        this.engine.rpm + throttle * 5000 * this.dt
      );
    } else {
      // Engine braking
      this.engine.rpm = Math.max(
        this.engine.idleRPM,
        this.engine.rpm - 2000 * this.dt
      );
    }
    
    // Calculate engine torque
    const torque = this.calculateEngineTorque(this.engine.rpm) * throttle;
    this.rearWheel.torque = torque * gearRatio * this.engine.finalDrive * this.engine.clutch;
  }
  
  calculateEngineTorque(rpm) {
    // Simplified torque curve (peak around 8000 RPM)
    const normalized = rpm / this.engine.maxRPM;
    return 100 * (1.5 * normalized - 0.5 * normalized * normalized);
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
    
    // Speed
    const speed = Math.sqrt(
      this.velocity.x ** 2 + 
      this.velocity.z ** 2
    );
    
    // Aerodynamic drag
    const dragForce = 0.5 * this.aero.airDensity * 
                      this.aero.dragCoefficient * 
                      this.aero.frontalArea * 
                      speed ** 2;
    
    if (speed > 0.1) {
      forces.x -= (this.velocity.x / speed) * dragForce;
      forces.z -= (this.velocity.z / speed) * dragForce;
    }
    
    // Tire forces
    const tireForces = this.calculateTireForces();
    forces.x += tireForces.x;
    forces.z += tireForces.z;
    
    // Gravity
    forces.y -= this.mass * this.gravity;
    
    // Lean torque (roll)
    const leanTorque = this.calculateLeanTorque(speed);
    forces.roll = leanTorque;
    
    // Steering torque (yaw)
    const steerTorque = this.calculateSteerTorque(speed);
    forces.yaw = steerTorque;
    
    return forces;
  }
  
  calculateTireForces() {
    const forces = { x: 0, z: 0 };
    
    // Weight distribution
    const weightTransfer = this.acceleration.z * this.mass * this.cogHeight / this.wheelbase;
    this.frontWheel.load = (this.mass * this.gravity * 0.45) - weightTransfer;
    this.rearWheel.load = (this.mass * this.gravity * 0.55) + weightTransfer;
    
    // Rear wheel drive force
    if (this.rearWheel.load > 0) {
      const driveForce = (this.rearWheel.torque / this.rearWheel.radius);
      const maxForce = this.rearWheel.load * this.rearWheel.grip;
      const actualForce = Math.min(Math.abs(driveForce), maxForce) * Math.sign(driveForce);
      
      // Apply force in direction of bike
      forces.x += actualForce * Math.sin(this.rotation.yaw);
      forces.z += actualForce * Math.cos(this.rotation.yaw);
    }
    
    // Braking forces
    const frontBrakeForce = this.controls.frontBrake * this.frontWheel.load * 1.2;
    const rearBrakeForce = this.controls.rearBrake * this.rearWheel.load * 0.8;
    
    const totalBrakeForce = frontBrakeForce + rearBrakeForce;
    if (this.velocity.z > 0.1) {
      forces.z -= totalBrakeForce;
    }
    
    // Cornering forces (simplified)
    const lateralForce = this.calculateLateralForce();
    forces.x += lateralForce * Math.cos(this.rotation.yaw);
    forces.z -= lateralForce * Math.sin(this.rotation.yaw);
    
    return forces;
  }
  
  calculateLateralForce() {
    // Lateral force from lean angle and speed
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    const leanAngle = this.rotation.roll;
    
    // Centripetal force needed for turn
    if (Math.abs(leanAngle) > 0.01 && speed > 1) {
      const turnRadius = speed ** 2 / (this.gravity * Math.tan(Math.abs(leanAngle)));
      const centripetalForce = this.mass * speed ** 2 / turnRadius;
      return -centripetalForce * Math.sign(leanAngle);  // Negative for correct direction
    }
    
    return 0;
  }
  
  calculateLeanTorque(speed) {
    // Counter-steering effect
    const targetLean = this.controls.lean * this.maxLeanAngle;
    const leanError = targetLean - this.rotation.roll;
    
    // More responsive at higher speeds
    const speedFactor = Math.min(1, speed / 20);
    const leanTorque = leanError * 5000 * speedFactor;
    
    // Damping
    const damping = -this.angularVelocity.roll * 1000;
    
    return leanTorque + damping;
  }
  
  calculateSteerTorque(speed) {
    // Steering based on lean angle (motorcycle turns where it leans)
    const leanAngle = this.rotation.roll;
    
    if (speed > 0.5) {
      // Turn rate proportional to lean and inversely to speed
      const turnRate = (Math.sin(leanAngle) * this.gravity) / speed;
      return turnRate * 1000;
    }
    
    // Low speed direct steering
    return this.controls.steer * 500;
  }
  
  updateDynamics(forces) {
    // Linear dynamics
    this.acceleration.x = forces.x / this.mass;
    this.acceleration.y = forces.y / this.mass;
    this.acceleration.z = forces.z / this.mass;
    
    this.velocity.x += this.acceleration.x * this.dt;
    this.velocity.y += this.acceleration.y * this.dt;
    this.velocity.z += this.acceleration.z * this.dt;
    
    this.position.x += this.velocity.x * this.dt;
    this.position.y += this.velocity.y * this.dt;
    this.position.z += this.velocity.z * this.dt;
    
    // Angular dynamics (simplified moments of inertia)
    const inertia = {
      pitch: this.mass * 0.3,
      yaw: this.mass * 0.5,
      roll: this.mass * 0.2
    };
    
    this.angularVelocity.pitch += (forces.pitch / inertia.pitch) * this.dt;
    this.angularVelocity.yaw += (forces.yaw / inertia.yaw) * this.dt;
    this.angularVelocity.roll += (forces.roll / inertia.roll) * this.dt;
    
    this.rotation.pitch += this.angularVelocity.pitch * this.dt;
    this.rotation.yaw += this.angularVelocity.yaw * this.dt;
    this.rotation.roll += this.angularVelocity.roll * this.dt;
  }
  
  updateSuspension() {
    // Simplified suspension (just for wheelie/stoppie effects)
    const accelG = this.acceleration.z / this.gravity;
    
    // Compression from acceleration (0 to 1)
    this.suspension.front.compression = Math.max(0, Math.min(1, 0.5 - accelG * 0.3));
    this.suspension.rear.compression = Math.max(0, Math.min(1, 0.5 + accelG * 0.3));
    
    // Pitch from suspension
    const pitchFromSuspension = (this.suspension.rear.compression - this.suspension.front.compression) * 0.1;
    this.rotation.pitch = pitchFromSuspension;
  }
  
  updateWheels() {
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    
    // Wheel rotation speeds
    this.frontWheel.angularVelocity = speed / this.frontWheel.radius;
    this.rearWheel.angularVelocity = speed / this.rearWheel.radius;
    
    // Slip calculation (simplified)
    const driveSpeed = this.rearWheel.angularVelocity * this.rearWheel.radius;
    this.rearWheel.slip = Math.max(0, (driveSpeed - speed) / Math.max(1, speed));
    
    // Reduce grip with slip
    this.rearWheel.grip = 1.0 - Math.min(0.5, this.rearWheel.slip * 2);
    this.frontWheel.grip = 1.0; // Front wheel doesn't slip in this model
  }
  
  applyConstraints() {
    // Ground constraint
    if (this.position.y < 0) {
      this.position.y = 0;
      this.velocity.y = 0;
    }
    
    // Lean angle limits
    this.rotation.roll = Math.max(-this.maxLeanAngle, 
                        Math.min(this.maxLeanAngle, this.rotation.roll));
    
    // Speed limiter (terminal velocity ~180 mph = 80 m/s)
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (speed > 80) {
      const scale = 80 / speed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }
  }
  
  setControls(controls) {
    this.controls = { ...this.controls, ...controls };
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
      wheelie: this.rotation.pitch > 0.1,
      frontSuspension: this.suspension.front.compression,
      rearSuspension: this.suspension.rear.compression,
      rearWheelSlip: this.rearWheel.slip
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
  }
}