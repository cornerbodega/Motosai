import * as THREE from 'three';

export class TrafficSystem {
  constructor(scene, highway) {
    this.scene = scene;
    this.highway = highway;
    this.vehicles = [];
    this.maxVehicles = 30;
    this.spawnDistance = 200; // meters
    
    // Vehicle types
    this.vehicleTypes = [
      { type: 'car', probability: 0.5, length: 4.5, width: 1.8, height: 1.4, speed: 60 },
      { type: 'suv', probability: 0.2, length: 5, width: 2, height: 1.8, speed: 55 },
      { type: 'truck', probability: 0.15, length: 6, width: 2.2, height: 2.5, speed: 50 },
      { type: 'van', probability: 0.1, length: 5.5, width: 2, height: 2, speed: 55 },
      { type: 'sports', probability: 0.05, length: 4.2, width: 1.8, height: 1.2, speed: 70 }
    ];
    
    this.createMaterials();
  }
  
  createMaterials() {
    this.vehicleMaterials = {
      car: [
        new THREE.MeshPhongMaterial({ color: 0xff0000 }),
        new THREE.MeshPhongMaterial({ color: 0x0000ff }),
        new THREE.MeshPhongMaterial({ color: 0xffffff }),
        new THREE.MeshPhongMaterial({ color: 0x333333 }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc })
      ],
      glass: new THREE.MeshPhongMaterial({ 
        color: 0x222244,
        transparent: true,
        opacity: 0.6
      }),
      wheel: new THREE.MeshPhongMaterial({ color: 0x222222 }),
      lights: new THREE.MeshBasicMaterial({ color: 0xffff00 }),
      brake: new THREE.MeshBasicMaterial({ color: 0xff0000 })
    };
  }
  
  spawn(count) {
    for (let i = 0; i < count; i++) {
      this.spawnVehicle();
    }
  }
  
  spawnVehicle() {
    if (this.vehicles.length >= this.maxVehicles) return;
    
    // Choose vehicle type
    const type = this.selectVehicleType();
    
    // Choose lane
    const lane = Math.floor(Math.random() * 4);
    const isOncoming = lane < 2; // Lanes 0-1 are oncoming
    
    // Create vehicle object
    const vehicle = {
      id: Date.now() + Math.random(),
      type: type.type,
      mesh: this.createVehicleMesh(type),
      lane: lane,
      targetLane: lane,
      laneChangeProgress: 0,
      laneChangeSpeed: 0.02,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      speed: type.speed + (Math.random() - 0.5) * 10, // MPH with variation
      baseSpeed: type.speed,
      length: type.length,
      width: type.width,
      isOncoming: isOncoming,
      isBraking: false,
      frontVehicle: null,
      behavior: this.generateBehavior()
    };
    
    // Set initial position
    const laneX = this.highway.getLanePosition(lane);
    const spawnZ = (Math.random() - 0.5) * this.spawnDistance * 2;
    
    vehicle.position.set(laneX, 0.5, spawnZ);
    vehicle.mesh.position.copy(vehicle.position);
    
    // Set direction
    if (isOncoming) {
      vehicle.mesh.rotation.y = Math.PI;
      vehicle.velocity.z = -vehicle.speed / 2.237; // Convert MPH to m/s
    } else {
      vehicle.velocity.z = vehicle.speed / 2.237;
    }
    
    this.vehicles.push(vehicle);
    this.scene.add(vehicle.mesh);
  }
  
  selectVehicleType() {
    const random = Math.random();
    let cumulative = 0;
    
    for (const type of this.vehicleTypes) {
      cumulative += type.probability;
      if (random <= cumulative) {
        return type;
      }
    }
    
    return this.vehicleTypes[0];
  }
  
  generateBehavior() {
    return {
      aggressiveness: Math.random(), // 0 = cautious, 1 = aggressive
      laneChangeFrequency: Math.random() * 0.01,
      followDistance: 2 + Math.random() * 3, // seconds
      reactionTime: 0.5 + Math.random() * 0.5 // seconds
    };
  }
  
  createVehicleMesh(type) {
    const vehicle = new THREE.Group();
    
    // Random color
    const bodyMat = this.vehicleMaterials.car[
      Math.floor(Math.random() * this.vehicleMaterials.car.length)
    ];
    
    // Main body (low poly)
    const bodyGeo = new THREE.BoxGeometry(type.width, type.height * 0.6, type.length * 0.7);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = type.height * 0.3;
    body.castShadow = true;
    vehicle.add(body);
    
    // Cabin
    const cabinGeo = new THREE.BoxGeometry(
      type.width * 0.9,
      type.height * 0.4,
      type.length * 0.4
    );
    const cabin = new THREE.Mesh(cabinGeo, bodyMat);
    cabin.position.set(0, type.height * 0.7, type.length * 0.1);
    vehicle.add(cabin);
    
    // Windows
    const windowGeo = new THREE.BoxGeometry(
      type.width * 0.85,
      type.height * 0.3,
      type.length * 0.35
    );
    const windows = new THREE.Mesh(windowGeo, this.vehicleMaterials.glass);
    windows.position.set(0, type.height * 0.75, type.length * 0.1);
    vehicle.add(windows);
    
    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 6);
    const wheelPositions = [
      { x: type.width * 0.4, z: type.length * 0.3 },
      { x: -type.width * 0.4, z: type.length * 0.3 },
      { x: type.width * 0.4, z: -type.length * 0.3 },
      { x: -type.width * 0.4, z: -type.length * 0.3 }
    ];
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeo, this.vehicleMaterials.wheel);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos.x, 0.2, pos.z);
      vehicle.add(wheel);
    });
    
    // Headlights
    const lightGeo = new THREE.BoxGeometry(0.2, 0.2, 0.1);
    const headlight1 = new THREE.Mesh(lightGeo, this.vehicleMaterials.lights);
    headlight1.position.set(type.width * 0.3, type.height * 0.3, type.length * 0.5);
    vehicle.add(headlight1);
    
    const headlight2 = new THREE.Mesh(lightGeo, this.vehicleMaterials.lights);
    headlight2.position.set(-type.width * 0.3, type.height * 0.3, type.length * 0.5);
    vehicle.add(headlight2);
    
    // Brake lights
    const brakeLight1 = new THREE.Mesh(lightGeo, this.vehicleMaterials.brake);
    brakeLight1.position.set(type.width * 0.3, type.height * 0.3, -type.length * 0.5);
    vehicle.add(brakeLight1);
    
    const brakeLight2 = new THREE.Mesh(lightGeo, this.vehicleMaterials.brake);
    brakeLight2.position.set(-type.width * 0.3, type.height * 0.3, -type.length * 0.5);
    vehicle.add(brakeLight2);
    
    vehicle.userData = { type: type.type, brake1: brakeLight1, brake2: brakeLight2 };
    
    return vehicle;
  }
  
  update(deltaTime, playerPosition) {
    // Update each vehicle
    this.vehicles.forEach(vehicle => {
      this.updateVehicle(vehicle, deltaTime, playerPosition);
    });
    
    // Check for vehicles to remove (too far away)
    this.vehicles = this.vehicles.filter(vehicle => {
      const distance = Math.abs(vehicle.position.z - playerPosition.z);
      if (distance > this.spawnDistance * 2) {
        this.scene.remove(vehicle.mesh);
        return false;
      }
      return true;
    });
    
    // Spawn new vehicles if needed
    if (this.vehicles.length < this.maxVehicles) {
      if (Math.random() < 0.02) { // 2% chance per frame
        this.spawnVehicle();
      }
    }
    
    // Update vehicle interactions
    this.updateInteractions();
  }
  
  updateVehicle(vehicle, deltaTime, playerPosition) {
    // AI behavior
    this.updateAI(vehicle, playerPosition);
    
    // Lane changing
    if (vehicle.targetLane !== vehicle.lane) {
      vehicle.laneChangeProgress += vehicle.laneChangeSpeed;
      
      if (vehicle.laneChangeProgress >= 1) {
        vehicle.lane = vehicle.targetLane;
        vehicle.laneChangeProgress = 0;
      }
      
      // Smooth lane change interpolation
      const currentLaneX = this.highway.getLanePosition(vehicle.lane);
      const targetLaneX = this.highway.getLanePosition(vehicle.targetLane);
      const t = this.smoothStep(vehicle.laneChangeProgress);
      vehicle.position.x = currentLaneX + (targetLaneX - currentLaneX) * t;
    }
    
    // Update position
    vehicle.position.z += vehicle.velocity.z * deltaTime;
    
    // Update mesh position
    vehicle.mesh.position.copy(vehicle.position);
    
    // Update brake lights
    if (vehicle.isBraking && vehicle.mesh.userData.brake1) {
      vehicle.mesh.userData.brake1.material.emissive = new THREE.Color(0xff0000);
      vehicle.mesh.userData.brake2.material.emissive = new THREE.Color(0xff0000);
      vehicle.mesh.userData.brake1.material.emissiveIntensity = 1;
      vehicle.mesh.userData.brake2.material.emissiveIntensity = 1;
    } else if (vehicle.mesh.userData.brake1) {
      vehicle.mesh.userData.brake1.material.emissive = new THREE.Color(0x000000);
      vehicle.mesh.userData.brake2.material.emissive = new THREE.Color(0x000000);
    }
  }
  
  updateAI(vehicle, playerPosition) {
    // Check distance to player (for lane splitting awareness)
    const playerDistance = Math.abs(vehicle.position.z - playerPosition.z);
    const playerLateralDistance = Math.abs(vehicle.position.x - playerPosition.x);
    
    // If player is nearby and lane splitting
    if (playerDistance < 20 && playerLateralDistance < 3) {
      // Some vehicles move aside slightly (good drivers)
      if (vehicle.behavior.aggressiveness < 0.3) {
        // Move away from player slightly within lane
        const avoidanceDirection = Math.sign(vehicle.position.x - playerPosition.x);
        vehicle.position.x += avoidanceDirection * 0.01;
      }
    }
    
    // Random lane changes
    if (Math.random() < vehicle.behavior.laneChangeFrequency) {
      this.attemptLaneChange(vehicle);
    }
    
    // Speed adjustment based on front vehicle
    if (vehicle.frontVehicle) {
      const distance = vehicle.frontVehicle.position.z - vehicle.position.z;
      const safeDistance = vehicle.behavior.followDistance * vehicle.speed / 2.237;
      
      if (distance < safeDistance) {
        // Slow down
        vehicle.speed = Math.max(
          vehicle.frontVehicle.speed * 0.9,
          vehicle.speed - 20 * vehicle.behavior.reactionTime
        );
        vehicle.isBraking = true;
      } else {
        // Resume normal speed
        vehicle.speed = Math.min(
          vehicle.baseSpeed,
          vehicle.speed + 10 * vehicle.behavior.reactionTime
        );
        vehicle.isBraking = false;
      }
    } else {
      // No vehicle ahead, maintain speed
      vehicle.speed = vehicle.baseSpeed;
      vehicle.isBraking = false;
    }
    
    // Update velocity based on speed
    const speedMS = vehicle.speed / 2.237;
    if (vehicle.isOncoming) {
      vehicle.velocity.z = -speedMS;
    } else {
      vehicle.velocity.z = speedMS;
    }
  }
  
  attemptLaneChange(vehicle) {
    // Determine possible lanes
    const possibleLanes = [];
    
    if (vehicle.isOncoming) {
      // Oncoming traffic uses lanes 0-1
      if (vehicle.lane === 0) possibleLanes.push(1);
      if (vehicle.lane === 1) possibleLanes.push(0);
    } else {
      // Same direction uses lanes 2-3
      if (vehicle.lane === 2) possibleLanes.push(3);
      if (vehicle.lane === 3) possibleLanes.push(2);
    }
    
    // Check if lane change is safe
    if (possibleLanes.length > 0) {
      const targetLane = possibleLanes[Math.floor(Math.random() * possibleLanes.length)];
      
      if (this.isLaneChangeSafe(vehicle, targetLane)) {
        vehicle.targetLane = targetLane;
      }
    }
  }
  
  isLaneChangeSafe(vehicle, targetLane) {
    const safeDistance = 10; // meters
    
    for (const other of this.vehicles) {
      if (other === vehicle) continue;
      if (other.lane !== targetLane && other.targetLane !== targetLane) continue;
      
      const distance = Math.abs(other.position.z - vehicle.position.z);
      if (distance < safeDistance) {
        return false;
      }
    }
    
    return true;
  }
  
  updateInteractions() {
    // Find front vehicle for each vehicle
    this.vehicles.forEach(vehicle => {
      vehicle.frontVehicle = null;
      let minDistance = Infinity;
      
      this.vehicles.forEach(other => {
        if (other === vehicle) return;
        if (other.lane !== vehicle.lane) return;
        
        // Check if other is in front
        const distance = other.position.z - vehicle.position.z;
        if (vehicle.isOncoming) {
          // For oncoming traffic, "front" is negative z
          if (distance < 0 && Math.abs(distance) < minDistance) {
            minDistance = Math.abs(distance);
            vehicle.frontVehicle = other;
          }
        } else {
          // For same direction, "front" is positive z
          if (distance > 0 && distance < minDistance) {
            minDistance = distance;
            vehicle.frontVehicle = other;
          }
        }
      });
    });
  }
  
  checkCollision(position, radius) {
    // Check if position collides with any vehicle
    for (const vehicle of this.vehicles) {
      const dx = position.x - vehicle.position.x;
      const dz = position.z - vehicle.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance < radius + vehicle.width / 2) {
        return vehicle;
      }
    }
    
    return null;
  }
  
  smoothStep(t) {
    // Smooth interpolation function
    return t * t * (3 - 2 * t);
  }
  
  reset() {
    // Remove all vehicles
    this.vehicles.forEach(vehicle => {
      this.scene.remove(vehicle.mesh);
    });
    this.vehicles = [];
    
    // Spawn initial traffic
    this.spawn(20);
  }
}