import * as THREE from 'three';

export class TrafficSystem {
  constructor(scene, highway, camera) {
    this.scene = scene;
    this.highway = highway;
    this.camera = camera;
    this.vehicles = [];
    this.maxVehicles = 30; // Reduced back to prevent memory issues
    this.spawnDistance = 400; // Reduced to limit vehicles
    
    // Frustum culling
    this.frustum = new THREE.Frustum();
    this.cameraMatrix = new THREE.Matrix4();
    
    // Vehicle types (realistic highway speeds in MPH)
    this.vehicleTypes = [
      { type: 'car', probability: 0.5, length: 4.5, width: 1.8, height: 1.4, speed: 70 }, // 70 mph
      { type: 'suv', probability: 0.2, length: 5, width: 2, height: 1.8, speed: 65 }, // 65 mph
      { type: 'truck', probability: 0.15, length: 6, width: 2.2, height: 2.5, speed: 60 }, // 60 mph (trucks slower)
      { type: 'van', probability: 0.1, length: 5.5, width: 2, height: 2, speed: 65 }, // 65 mph
      { type: 'sports', probability: 0.05, length: 4.2, width: 1.8, height: 1.2, speed: 80 } // 80 mph (sports cars faster)
    ];
    
    this.createMaterials();
  }
  
  createMaterials() {
    this.vehicleMaterials = {
      car: [
        new THREE.MeshPhongMaterial({ color: 0xff0000 }), // Red
        new THREE.MeshPhongMaterial({ color: 0x0000ff }), // Blue
        new THREE.MeshPhongMaterial({ color: 0xffffff }), // White
        new THREE.MeshPhongMaterial({ color: 0xffff00 }), // Yellow
        new THREE.MeshPhongMaterial({ color: 0x00ff00 }), // Green
        new THREE.MeshPhongMaterial({ color: 0xff8800 }), // Orange
        new THREE.MeshPhongMaterial({ color: 0x8888ff }), // Light blue
        new THREE.MeshPhongMaterial({ color: 0xcccccc })  // Silver
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
  
  spawnVehicle(playerZ = 0) {
    if (this.vehicles.length >= this.maxVehicles) return;
    
    // Choose vehicle type
    const type = this.selectVehicleType();
    
    // Choose lane (0-2, all same direction)
    const lane = Math.floor(Math.random() * 3);
    const isOncoming = false; // No oncoming traffic
    
    // Create vehicle object
    const vehicle = {
      id: Date.now() + Math.random(),
      type: type.type,
      mesh: this.createVehicleMesh(type),
      lane: lane,
      targetLane: lane,
      laneChangeProgress: 0,
      laneChangeSpeed: 1.5, // seconds to complete lane change
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
    
    // Set initial position relative to player
    const laneX = this.highway.getLanePosition(lane);
    // Spawn vehicles ahead and behind
    const spawnAhead = Math.random() > 0.3; // 70% spawn ahead
    let spawnOffset;
    if (spawnAhead) {
      spawnOffset = this.spawnDistance - Math.random() * 100;
    } else {
      // Some spawn behind for variety
      spawnOffset = -this.spawnDistance/2 + Math.random() * 100;
    }
    const spawnZ = playerZ + spawnOffset;
    
    vehicle.position.set(laneX, 0.5, spawnZ);
    vehicle.mesh.position.copy(vehicle.position);
    
    // Set direction (all vehicles go same direction)
    vehicle.velocity.z = vehicle.speed / 2.237; // Convert MPH to m/s
    
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
      laneChangeFrequency: Math.random() * 0.002, // Much lower frequency (was 0.01)
      followDistance: 2 + Math.random() * 3, // seconds
      reactionTime: 0.5 + Math.random() * 0.5, // seconds
      lastLaneChange: 0, // Track time since last lane change
      minLaneChangeInterval: 5 + Math.random() * 5 // 5-10 seconds between lane changes
    };
  }
  
  createVehicleMesh(type) {
    const vehicle = new THREE.Group();
    
    // Random color
    const bodyMat = this.vehicleMaterials.car[
      Math.floor(Math.random() * this.vehicleMaterials.car.length)
    ];
    
    // Main body (low poly) - simplified geometry
    const bodyGeo = new THREE.BoxGeometry(type.width, type.height * 0.6, type.length * 0.7, 1, 1, 1);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = type.height * 0.3;
    body.castShadow = false; // Disable shadows for performance
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
    
    // Wheels - simplified to boxes for performance
    const wheelGeo = new THREE.BoxGeometry(0.2, 0.4, 0.4);
    const wheelPositions = [
      { x: type.width * 0.4, z: type.length * 0.3 },
      { x: -type.width * 0.4, z: type.length * 0.3 },
      { x: type.width * 0.4, z: -type.length * 0.3 },
      { x: -type.width * 0.4, z: -type.length * 0.3 }
    ];
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeo, this.vehicleMaterials.wheel);
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
    // Update frustum for culling
    this.updateFrustum();
    
    // Update each vehicle with frustum culling
    this.vehicles.forEach(vehicle => {
      // Check if vehicle is in frustum or close to player
      const distance = Math.abs(vehicle.position.z - playerPosition.z);
      
      if (distance < 50) {
        // Always show vehicles very close to player
        vehicle.mesh.visible = true;
        this.updateVehicle(vehicle, deltaTime, playerPosition);
      } else {
        // Use frustum culling for distant vehicles
        // For Groups, we need to check children
        let inFrustum = true;
        if (vehicle.mesh.children && vehicle.mesh.children.length > 0) {
          // Check if any child is in frustum
          inFrustum = vehicle.mesh.children.some(child => {
            if (child.geometry) {
              if (!child.geometry.boundingSphere) {
                child.geometry.computeBoundingSphere();
              }
              return this.frustum.intersectsObject(child);
            }
            return true;
          });
        }
        vehicle.mesh.visible = inFrustum;
        
        // Only update visible vehicles
        if (inFrustum) {
          this.updateVehicle(vehicle, deltaTime, playerPosition);
        } else {
          // Still update position for invisible vehicles (simplified)
          vehicle.position.z += vehicle.velocity.z * deltaTime;
          vehicle.mesh.position.copy(vehicle.position);
        }
      }
    });
    
    // Check for vehicles to remove (too far away)
    this.vehicles = this.vehicles.filter(vehicle => {
      const distance = Math.abs(vehicle.position.z - playerPosition.z);
      if (distance > this.spawnDistance * 1.5) { // Reduced from 2x to 1.5x for better memory usage
        this.scene.remove(vehicle.mesh);
        vehicle.mesh.geometry?.dispose(); // Clean up geometry
        return false;
      }
      return true;
    });
    
    // Spawn new vehicles if needed (relative to player position)
    if (this.vehicles.length < this.maxVehicles) {
      if (Math.random() < 0.015) { // Reduced from 2% to 1.5% for better performance
        this.spawnVehicle(playerPosition.z);
      }
    }
    
    // Update vehicle interactions
    this.updateInteractions();
  }
  
  updateVehicle(vehicle, deltaTime, playerPosition) {
    // AI behavior
    this.updateAI(vehicle, playerPosition, deltaTime);
    
    // Lane changing with proper time-based animation
    if (vehicle.targetLane !== vehicle.lane) {
      // Progress based on time (laneChangeSpeed is duration in seconds)
      vehicle.laneChangeProgress += deltaTime / vehicle.laneChangeSpeed;
      
      if (vehicle.laneChangeProgress >= 1) {
        vehicle.laneChangeProgress = 1; // Clamp to exactly 1
        const targetLaneX = this.highway.getLanePosition(vehicle.targetLane);
        vehicle.position.x = targetLaneX; // Ensure exact final position
        vehicle.lane = vehicle.targetLane;
        vehicle.laneChangeProgress = 0;
      } else {
        // Smooth lane change interpolation
        const currentLaneX = this.highway.getLanePosition(vehicle.lane);
        const targetLaneX = this.highway.getLanePosition(vehicle.targetLane);
        const t = this.smoothStep(vehicle.laneChangeProgress);
        vehicle.position.x = currentLaneX + (targetLaneX - currentLaneX) * t;
      }
    } else {
      // Not changing lanes - ensure vehicle stays in lane center
      const laneX = this.highway.getLanePosition(vehicle.lane);
      // Gradually correct position if drifted
      vehicle.position.x += (laneX - vehicle.position.x) * deltaTime * 2;
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
  
  updateAI(vehicle, playerPosition, deltaTime = 0.016) {
    // Update time since last lane change
    vehicle.behavior.lastLaneChange += deltaTime;
    
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
    
    // Random lane changes - only if enough time has passed and not currently changing lanes
    if (vehicle.targetLane === vehicle.lane && // Not already changing lanes
        vehicle.behavior.lastLaneChange > vehicle.behavior.minLaneChangeInterval && // Enough time passed
        Math.random() < vehicle.behavior.laneChangeFrequency) {
      if (this.attemptLaneChange(vehicle)) {
        vehicle.behavior.lastLaneChange = 0; // Reset timer only if lane change started
      }
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
    
    // Update velocity based on speed (all same direction)
    const speedMS = vehicle.speed / 2.237;
    vehicle.velocity.z = speedMS;
  }
  
  attemptLaneChange(vehicle) {
    // Determine possible lanes (0-2)
    const possibleLanes = [];
    
    if (vehicle.lane === 0) possibleLanes.push(1); // Can move right
    if (vehicle.lane === 1) {
      possibleLanes.push(0); // Can move left
      possibleLanes.push(2); // Can move right
    }
    if (vehicle.lane === 2) possibleLanes.push(1); // Can move left
    
    // Check if lane change is safe
    if (possibleLanes.length > 0) {
      const targetLane = possibleLanes[Math.floor(Math.random() * possibleLanes.length)];
      
      if (this.isLaneChangeSafe(vehicle, targetLane)) {
        vehicle.targetLane = targetLane;
        return true; // Lane change started
      }
    }
    return false; // No lane change
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
        
        // Check if other is in front (all vehicles go same direction)
        const distance = other.position.z - vehicle.position.z;
        // For same direction, "front" is positive z
        if (distance > 0 && distance < minDistance) {
          minDistance = distance;
          vehicle.frontVehicle = other;
        }
      });
    });
  }
  
  checkCollision(position, radius) {
    // Check if position collides with any vehicle using tight bounding boxes
    for (const vehicle of this.vehicles) {
      // Get vehicle's bounding box - make it slightly smaller for lane splitting
      const vehicleHalfLength = vehicle.length / 2 * 0.9; // 90% of actual size
      const vehicleHalfWidth = vehicle.width / 2 * 0.85; // 85% of actual width for easier lane splitting
      
      // Check if bike position is within vehicle's rectangular bounds
      const xDist = Math.abs(position.x - vehicle.position.x);
      const zDist = Math.abs(position.z - vehicle.position.z);
      
      // Use rectangular collision detection for more accuracy
      const xCollision = xDist < (radius + vehicleHalfWidth);
      const zCollision = zDist < (radius + vehicleHalfLength);
      
      if (xCollision && zCollision) {
        // More precise corner check for lane splitting
        // Check if we're actually hitting the corner or side
        if (xDist > vehicleHalfWidth * 0.8 && zDist > vehicleHalfLength * 0.8) {
          // We're near a corner, use circle collision for smoother lane splitting
          const actualDistance = Math.sqrt(xDist * xDist + zDist * zDist);
          const cornerRadius = Math.sqrt(vehicleHalfWidth * vehicleHalfWidth + vehicleHalfLength * vehicleHalfLength) * 0.6;
          
          if (actualDistance < radius + cornerRadius) {
            return vehicle;
          }
        } else {
          // Direct side or front/back collision
          return vehicle;
        }
      }
    }
    
    return null;
  }
  
  smoothStep(t) {
    // Smooth interpolation function
    return t * t * (3 - 2 * t);
  }
  
  updateFrustum() {
    if (this.camera) {
      this.cameraMatrix.multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse
      );
      this.frustum.setFromProjectionMatrix(this.cameraMatrix);
    }
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