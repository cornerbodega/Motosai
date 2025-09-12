import * as THREE from 'three';
import { ROAD_CONSTANTS } from './RoadConstants.js';
import { TrafficIDM } from './TrafficSystemIDM.js';

export class TrafficSystem {
  constructor(scene, highway, camera, bloodTrackSystem = null, multiplayerManager = null) {
    this.scene = scene;
    this.highway = highway;
    this.camera = camera;
    this.bloodTrackSystem = bloodTrackSystem;
    this.multiplayerManager = multiplayerManager;
    this.vehicles = [];
    this.maxVehicles = 30; // Optimized for lower-end machines
    this.spawnDistance = 200; // Reduced spawn distance for performance
    
    // Create shared geometry ONCE for all vehicles to prevent memory leaks
    // Using unit cubes to scale per vehicle type
    this.sharedGeometry = {
      body: new THREE.BoxGeometry(1, 1, 1),
      cabin: new THREE.BoxGeometry(1, 1, 1),
      window: new THREE.BoxGeometry(1, 1, 1),
      wheel: new THREE.BoxGeometry(1, 1, 1),
      light: new THREE.BoxGeometry(1, 1, 1)
    };
    
    // Synchronized traffic state
    this.isMaster = false; // Whether this client controls traffic
    this.syncedVehicles = new Map(); // vehicleId -> vehicle data
    this.lastTrafficUpdate = 0;
    
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
  
  setMaxVehicles(count) {
    this.maxVehicles = count;
    // Remove excess vehicles if needed
    while (this.vehicles.length > this.maxVehicles) {
      const vehicle = this.vehicles.pop();
      this.scene.remove(vehicle.mesh);
      this.disposeVehicleMesh(vehicle.mesh);
    }
  }
  
  // Helper methods for advanced AI
  isLaneClearAhead(vehicle, lane, distance) {
    for (const other of this.vehicles) {
      if (other === vehicle) continue;
      if (other.lane !== lane) continue;
      
      const gap = other.position.z - vehicle.position.z;
      if (gap > 0 && gap < distance) {
        return false; // Lane blocked ahead
      }
    }
    return true;
  }
  
  isLaneClearBehind(vehicle, lane, distance) {
    for (const other of this.vehicles) {
      if (other === vehicle) continue;
      if (other.lane !== lane) continue;
      
      const gap = vehicle.position.z - other.position.z;
      if (gap > 0 && gap < distance) {
        return false; // Lane blocked behind
      }
    }
    return true;
  }
  
  getAdjacentCar(vehicle, targetLane) {
    let closestCar = null;
    let minDistance = Infinity;
    
    for (const other of this.vehicles) {
      if (other === vehicle) continue;
      if (other.lane !== targetLane) continue;
      
      const distance = Math.abs(other.position.z - vehicle.position.z);
      if (distance < minDistance) {
        minDistance = distance;
        closestCar = other;
      }
    }
    
    return closestCar;
  }
  
  disposeVehicleMesh(mesh) {
    if (!mesh) return;
    
    mesh.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(mat => mat.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }
  
  setSpawnDistance(distance) {
    this.spawnDistance = distance;
  }
  
  // Calculate dynamic spawn distance based on player speed
  getDynamicSpawnDistance(playerSpeed) {
    // More reasonable spawn distance that doesn't scale too aggressively
    // At low speeds (30 mph / 13.4 m/s): ~200m
    // At high speeds (500 mph / 223.5 m/s): ~400m
    const baseDistance = 200;
    const speedBonus = Math.min(200, playerSpeed * 0.9); // Max 200m extra at high speeds
    const dynamicDistance = baseDistance + speedBonus;
    
    // Cap at reasonable distance to keep cars visible
    return Math.min(dynamicDistance, 400);
  }
  
  createMaterials() {
    this.vehicleMaterials = {
      car: [
        new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.8, roughness: 0.2 }), // Red - shiny
        new THREE.MeshStandardMaterial({ color: 0x0000ff, metalness: 0.8, roughness: 0.2 }), // Blue - shiny
        new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.1 }), // White - very shiny
        new THREE.MeshStandardMaterial({ color: 0xffff00, metalness: 0.7, roughness: 0.25 }), // Yellow - shiny
        new THREE.MeshStandardMaterial({ color: 0x00ff00, metalness: 0.8, roughness: 0.2 }), // Green - shiny
        new THREE.MeshStandardMaterial({ color: 0xff8800, metalness: 0.8, roughness: 0.2 }), // Orange - shiny
        new THREE.MeshStandardMaterial({ color: 0x8888ff, metalness: 0.8, roughness: 0.2 }), // Light blue - shiny
        new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.95, roughness: 0.05 })  // Silver - extremely shiny
      ],
      glass: new THREE.MeshStandardMaterial({ 
        color: 0x222244,
        metalness: 0.1,
        roughness: 0,
        transparent: true,
        opacity: 0.5
      }),
      wheel: new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a,
        roughness: 0.9,
        metalness: 0
      }),
      lights: new THREE.MeshStandardMaterial({ 
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 0.5
      }),
      brake: new THREE.MeshStandardMaterial({ 
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.3
      })
    };
  }
  
  spawn(count) {
    // Don't exceed max vehicles
    const actualCount = Math.min(count, this.maxVehicles - this.vehicles.length);
    for (let i = 0; i < actualCount; i++) {
      this.spawnVehicle();
    }
  }
  
  spawnVehicle(playerZ = 0, dynamicSpawnDistance = null, vehicleData = null) {
    if (this.vehicles.length >= this.maxVehicles) return;
    
    let vehicle;
    
    if (vehicleData) {
      // Spawning from synchronized data
      const type = this.vehicleTypes.find(t => t.type === vehicleData.type) || this.vehicleTypes[0];
      vehicle = {
        id: vehicleData.id,
        type: vehicleData.type,
        mesh: this.createVehicleMesh(type),
        lane: vehicleData.lane,
        subLane: vehicleData.subLane || 1, // Default to center sub-lane
        targetLane: vehicleData.targetLane,
        targetSubLane: vehicleData.targetSubLane || vehicleData.subLane || 1,
        laneChangeProgress: vehicleData.laneChangeProgress || 0,
        laneChangeSpeed: 1.5 + Math.random() * 0.5, // Variable smooth lane changes (1.5-2.0 seconds)
        position: new THREE.Vector3(vehicleData.position.x, vehicleData.position.y, vehicleData.position.z),
        velocity: new THREE.Vector3(vehicleData.velocity.x, vehicleData.velocity.y, vehicleData.velocity.z),
        speed: vehicleData.speed,
        baseSpeed: vehicleData.baseSpeed,
        length: type.length,
        width: type.width,
        isOncoming: false,
        isBraking: vehicleData.isBraking || false,
        frontVehicle: null,
        behavior: vehicleData.behavior || TrafficIDM.generateBehavior(vehicleData.lane)
      };
    } else {
      // Generate new vehicle (master client only)
      if (!this.isMaster && this.multiplayerManager) return;
      
      const type = this.selectVehicleType();
      const lane = Math.floor(Math.random() * 3);
      
      // Choose strategic sub-lane based on lane
      let subLane = 1; // Default center
      if (lane === 0) {
        // Left lane: prefer left or center sub-lane for passing
        subLane = Math.random() < 0.7 ? 0 : 1;
      } else if (lane === 2) {
        // Right lane: prefer right or center sub-lane for merging
        subLane = Math.random() < 0.7 ? 2 : 1;
      } else {
        // Middle lane: use all sub-lanes
        subLane = Math.floor(Math.random() * 3);
      }
      
      vehicle = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: type.type,
        mesh: this.createVehicleMesh(type),
        lane: lane,
        subLane: subLane,
        targetLane: lane,
        targetSubLane: subLane,
        laneChangeProgress: 0,
        laneChangeSpeed: 1.5 + Math.random() * 0.5, // Variable smooth lane changes (1.5-2.0 seconds)
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        speed: type.speed + (Math.random() - 0.5) * 10,
        baseSpeed: type.speed,
        length: type.length,
        width: type.width,
        isOncoming: false,
        isBraking: false,
        frontVehicle: null,
        behavior: TrafficIDM.generateBehavior(lane)
      };
    }
    
    // Set initial position
    if (!vehicleData) {
      // New vehicle - calculate spawn position with sub-lane
      const laneX = ROAD_CONSTANTS.getExactPosition(vehicle.lane, vehicle.subLane);
      // Use dynamic spawn distance if provided, otherwise fall back to base distance
      const effectiveSpawnDistance = dynamicSpawnDistance || this.spawnDistance;
      
      const spawnAhead = Math.random() > 0.3;
      let spawnOffset;
      if (spawnAhead) {
        // Spawn further ahead at higher speeds
        spawnOffset = effectiveSpawnDistance - Math.random() * 100;
      } else {
        // Spawn behind player (less important, keep smaller range)
        spawnOffset = -effectiveSpawnDistance/3 + Math.random() * 100;
      }
      const spawnZ = playerZ + spawnOffset;
      
      vehicle.position.set(laneX, 0.5, spawnZ);
      vehicle.velocity.z = vehicle.speed / 2.237;
    }
    
    vehicle.mesh.position.copy(vehicle.position);
    
    this.vehicles.push(vehicle);
    this.scene.add(vehicle.mesh);
    
    // If master client, broadcast new vehicle
    if (this.isMaster && this.multiplayerManager && !vehicleData) {
      this.broadcastVehicleSpawn(vehicle);
    }
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
  
  // Deprecated - moved to TrafficIDM.generateBehavior
  // Kept for backwards compatibility if needed
  
  createVehicleMesh(type) {
    const vehicle = new THREE.Group();
    
    // Random color - reuse existing materials instead of creating new ones
    const bodyMat = this.vehicleMaterials.car[
      Math.floor(Math.random() * this.vehicleMaterials.car.length)
    ];
    
    // Main body - REUSE shared geometry and scale to vehicle type
    const body = new THREE.Mesh(this.sharedGeometry.body, bodyMat);
    body.scale.set(type.width, type.height * 0.6, type.length * 0.7);
    body.position.y = type.height * 0.3;
    body.castShadow = false; // Disable shadows for performance
    vehicle.add(body);
    
    // Cabin - REUSE shared geometry and scale to vehicle type
    const cabin = new THREE.Mesh(this.sharedGeometry.cabin, bodyMat);
    cabin.scale.set(type.width * 0.9, type.height * 0.35, type.length * 0.4);
    cabin.position.set(0, type.height * 0.68, type.length * 0.1);
    vehicle.add(cabin);
    
    // Windows - REUSE shared geometry and scale to vehicle type
    const windows = new THREE.Mesh(this.sharedGeometry.window, this.vehicleMaterials.glass);
    windows.scale.set(type.width * 0.85, type.height * 0.35, type.length * 0.38);
    windows.position.set(0, type.height * 0.72, type.length * 0.1);
    vehicle.add(windows);
    
    // Wheels - REUSE shared geometry with scaling
    const wheelPositions = [
      { x: type.width * 0.4, z: type.length * 0.3 },
      { x: -type.width * 0.4, z: type.length * 0.3 },
      { x: type.width * 0.4, z: -type.length * 0.3 },
      { x: -type.width * 0.4, z: -type.length * 0.3 }
    ];
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(this.sharedGeometry.wheel, this.vehicleMaterials.wheel);
      wheel.scale.set(0.2, 0.4, 0.4);
      wheel.position.set(pos.x, 0.2, pos.z);
      vehicle.add(wheel);
    });
    
    // Headlights - REUSE shared geometry with scaling
    const headlight1 = new THREE.Mesh(this.sharedGeometry.light, this.vehicleMaterials.lights);
    headlight1.scale.set(0.2, 0.2, 0.1);
    headlight1.position.set(type.width * 0.3, type.height * 0.3, type.length * 0.5);
    vehicle.add(headlight1);
    
    const headlight2 = new THREE.Mesh(this.sharedGeometry.light, this.vehicleMaterials.lights);
    headlight2.scale.set(0.2, 0.2, 0.1);
    headlight2.position.set(-type.width * 0.3, type.height * 0.3, type.length * 0.5);
    vehicle.add(headlight2);
    
    // Brake lights - REUSE shared geometry with scaling, positioned closer to body
    const brakeLight1 = new THREE.Mesh(this.sharedGeometry.light, this.vehicleMaterials.brake);
    brakeLight1.scale.set(0.2, 0.2, 0.1);
    brakeLight1.position.set(type.width * 0.3, type.height * 0.3, -type.length * 0.35); // Moved from 0.5 to 0.35
    vehicle.add(brakeLight1);
    
    const brakeLight2 = new THREE.Mesh(this.sharedGeometry.light, this.vehicleMaterials.brake);
    brakeLight2.scale.set(0.2, 0.2, 0.1);
    brakeLight2.position.set(-type.width * 0.3, type.height * 0.3, -type.length * 0.35); // Moved from 0.5 to 0.35
    vehicle.add(brakeLight2);
    
    vehicle.userData = { type: type.type, brake1: brakeLight1, brake2: brakeLight2 };
    
    return vehicle;
  }
  
  update(deltaTime, playerPosition, playerVelocity = { z: 0 }) {
    // Calculate dynamic spawn distance first (needed for removal distance)
    const playerSpeed = Math.abs(playerVelocity.z);
    const dynamicSpawnDistance = this.getDynamicSpawnDistance(playerSpeed);
    
    // Update frustum for culling
    this.updateFrustum();
    
    // Broadcast traffic updates if master
    if (this.isMaster && this.multiplayerManager) {
      this.lastTrafficUpdate += deltaTime * 1000;
      if (this.lastTrafficUpdate >= 100) { // 10Hz traffic updates
        this.broadcastTrafficUpdate();
        this.lastTrafficUpdate = 0;
      }
    }
    
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
    
    // Check for vehicles to remove (too far away) - use dynamic distance
    const removalDistance = Math.max(300, dynamicSpawnDistance + 100); // At least 300m, or spawn distance + 100m
    this.vehicles = this.vehicles.filter(vehicle => {
      const distance = Math.abs(vehicle.position.z - playerPosition.z);
      if (distance > removalDistance) {
        this.scene.remove(vehicle.mesh);
        // Properly dispose of all geometries and materials in the group
        vehicle.mesh.traverse((object) => {
          if (object.geometry) {
            object.geometry.dispose();
          }
          // Don't dispose shared materials - they're reused
        });
        return false;
      }
      return true;
    });
    
    // Spawn new vehicles if needed (only for master client)
    if (this.vehicles.length < this.maxVehicles && (!this.multiplayerManager || this.isMaster)) {
      // Increase spawn rate at high speeds
      const spawnChance = playerSpeed > 50 ? 0.15 : 0.08; // Higher chance at high speed
      if (Math.random() < spawnChance) {
        this.spawnVehicle(playerPosition.z, dynamicSpawnDistance);
      }
    }
    
    // Also ensure minimum traffic near player
    const nearbyVehicles = this.vehicles.filter(v => 
      Math.abs(v.position.z - playerPosition.z) < 150 // Increased range
    ).length;
    
    if (nearbyVehicles < 10 && this.vehicles.length < this.maxVehicles && (!this.multiplayerManager || this.isMaster)) {
      // Force spawn if too few vehicles nearby (increased minimum from 5 to 10)
      this.spawnVehicle(playerPosition.z, dynamicSpawnDistance);
    }
    
    // Update vehicle interactions
    this.updateInteractions();
  }
  
  updateVehicle(vehicle, deltaTime, playerPosition) {
    // AI behavior
    this.updateAI(vehicle, playerPosition, deltaTime);
    
    // Lane and sub-lane changing with proper time-based animation
    const isChangingPosition = (vehicle.targetLane !== vehicle.lane) || (vehicle.targetSubLane !== vehicle.subLane);
    
    if (isChangingPosition) {
      // Progress based on time (laneChangeSpeed is duration in seconds)
      vehicle.laneChangeProgress += deltaTime / vehicle.laneChangeSpeed;
      
      if (vehicle.laneChangeProgress >= 1) {
        // Complete the change
        vehicle.laneChangeProgress = 0;
        vehicle.lane = vehicle.targetLane;
        vehicle.subLane = vehicle.targetSubLane;
        const finalX = ROAD_CONSTANTS.getExactPosition(vehicle.lane, vehicle.subLane);
        vehicle.position.x = finalX;
        vehicle.hasStablePosition = true;
      } else {
        // Smooth interpolation for both lane and sub-lane changes
        const currentX = ROAD_CONSTANTS.getExactPosition(vehicle.lane, vehicle.subLane);
        const targetX = ROAD_CONSTANTS.getExactPosition(vehicle.targetLane, vehicle.targetSubLane);
        const t = this.smoothStep(vehicle.laneChangeProgress);
        vehicle.position.x = currentX + (targetX - currentX) * t;
        
        // Add rotation during change for realism
        const changeDirection = targetX > currentX ? 1 : -1;
        const rotationAmount = Math.sin(vehicle.laneChangeProgress * Math.PI) * 0.05 * changeDirection;
        vehicle.mesh.rotation.y = rotationAmount;
      }
    } else {
      // Not changing position - keep stable
      vehicle.mesh.rotation.y = 0;
      
      // Ensure position is set correctly
      if (!vehicle.hasStablePosition) {
        const exactX = ROAD_CONSTANTS.getExactPosition(vehicle.lane, vehicle.subLane);
        vehicle.position.x = exactX;
        vehicle.hasStablePosition = true;
      }
      
      vehicle.position.y = ROAD_CONSTANTS.ROAD_Y; // Force correct height
    }
    
    // Update position
    vehicle.position.z += vehicle.velocity.z * deltaTime;
    
    // Check for blood contact and create tire tracks
    if (this.bloodTrackSystem) {
      const bloodContact = this.bloodTrackSystem.checkVehicleBloodContact(vehicle.position, vehicle.width);
      if (bloodContact) {
        // Create tire tracks when driving through blood
        this.bloodTrackSystem.createTireTracks(vehicle.position, vehicle.velocity, vehicle.width);
        
        // Add some blood staining to the vehicle (optional visual effect)
        if (!vehicle.hasBloodStains) {
          vehicle.hasBloodStains = true;
          vehicle.bloodStainTimer = 0;
        }
      }
    }
    
    // Update mesh position and ensure proper Y coordinate
    vehicle.mesh.position.copy(vehicle.position);
    vehicle.mesh.position.y = Math.max(vehicle.mesh.position.y, ROAD_CONSTANTS.ROAD_Y); // Prevent underground cars
    
    // Update brake lights - check if emissive exists first
    if (vehicle.mesh.userData.brake1 && vehicle.mesh.userData.brake1.material) {
      if (vehicle.isBraking) {
        // MeshBasicMaterial doesn't have emissive, use color instead
        vehicle.mesh.userData.brake1.material.color.setHex(0xff0000);
        vehicle.mesh.userData.brake2.material.color.setHex(0xff0000);
      } else {
        vehicle.mesh.userData.brake1.material.color.setHex(0x660000);
        vehicle.mesh.userData.brake2.material.color.setHex(0x660000);
      }
    }
  }
  
  updateAI(vehicle, playerPosition, deltaTime = 0.016) {
    // Use IDM-based AI
    TrafficIDM.updateAI(this, vehicle, playerPosition, deltaTime);
    return;
    
    // OLD CODE (kept for reference, will be removed):
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
  
  attemptLaneChange(vehicle, targetLane = null, requiredGap = null) {
    // First, consider sub-lane changes within current lane (more frequent)
    if (Math.random() < 0.3) { // 30% chance to change sub-lane instead of full lane
      return this.attemptSubLaneChange(vehicle);
    }
    
    // If target lane specified, use it; otherwise pick randomly
    if (targetLane === null) {
      // Determine possible lanes (0-2)
      const possibleLanes = [];
      
      if (vehicle.lane === 0) possibleLanes.push(1); // Can move right
      if (vehicle.lane === 1) {
        possibleLanes.push(0); // Can move left
        possibleLanes.push(2); // Can move right
      }
      if (vehicle.lane === 2) possibleLanes.push(1); // Can move left
      
      if (possibleLanes.length === 0) return false;
      targetLane = possibleLanes[Math.floor(Math.random() * possibleLanes.length)];
    }
    
    // Check if lane change is safe
    if (targetLane >= 0 && targetLane <= 2 && targetLane !== vehicle.lane) {
      
      // Choose sub-lane strategically for new lane
      let targetSubLane = 1; // Default center
      if (targetLane === 0) {
        // Moving to left lane - prefer left sub-lane for passing
        targetSubLane = Math.random() < 0.6 ? 0 : 1;
      } else if (targetLane === 2) {
        // Moving to right lane - prefer right sub-lane
        targetSubLane = Math.random() < 0.6 ? 2 : 1;
      } else {
        // Middle lane - any sub-lane
        targetSubLane = Math.floor(Math.random() * 3);
      }
      
      if (this.isLaneChangeSafe(vehicle, targetLane, targetSubLane, requiredGap)) {
        vehicle.targetLane = targetLane;
        vehicle.targetSubLane = targetSubLane;
        return true; // Lane change started
      }
    }
    return false; // No lane change
  }
  
  attemptSubLaneChange(vehicle) {
    // Change sub-lane within current lane
    const currentSubLane = vehicle.subLane;
    const possibleSubLanes = [0, 1, 2].filter(sl => sl !== currentSubLane);
    
    if (possibleSubLanes.length > 0) {
      const targetSubLane = possibleSubLanes[Math.floor(Math.random() * possibleSubLanes.length)];
      
      // Check if sub-lane change is safe (smaller safety margin)
      if (this.isSubLaneChangeSafe(vehicle, vehicle.lane, targetSubLane)) {
        vehicle.targetSubLane = targetSubLane;
        vehicle.laneChangeSpeed = 0.8 + Math.random() * 0.4; // Faster for sub-lane changes
        return true;
      }
    }
    return false;
  }
  
  isLaneChangeSafe(vehicle, targetLane, targetSubLane, customGap = null) {
    const safeDistance = customGap || 8; // meters - slightly more aggressive
    
    for (const other of this.vehicles) {
      if (other === vehicle) continue;
      
      // Check if other vehicle is in or moving to the target position
      const otherInTargetLane = (other.lane === targetLane) || (other.targetLane === targetLane);
      if (!otherInTargetLane) continue;
      
      // Consider sub-lane proximity
      const otherSubLane = other.targetLane === targetLane ? other.targetSubLane : other.subLane;
      const subLaneDiff = Math.abs(otherSubLane - targetSubLane);
      
      // Adjust safe distance based on sub-lane difference
      const adjustedSafeDistance = subLaneDiff === 0 ? safeDistance : safeDistance * 0.7;
      
      const distance = Math.abs(other.position.z - vehicle.position.z);
      if (distance < adjustedSafeDistance) {
        return false;
      }
    }
    
    return true;
  }
  
  isSubLaneChangeSafe(vehicle, lane, targetSubLane) {
    const safeDistance = 5; // Smaller safe distance for sub-lane changes
    
    for (const other of this.vehicles) {
      if (other === vehicle) continue;
      if (other.lane !== lane) continue;
      
      // Check sub-lane proximity
      const otherSubLane = other.targetSubLane || other.subLane;
      if (Math.abs(otherSubLane - targetSubLane) > 1) continue; // Not adjacent sub-lanes
      
      const distance = Math.abs(other.position.z - vehicle.position.z);
      if (distance < safeDistance) {
        return false;
      }
    }
    
    return true;
  }
  
  updateInteractions() {
    // Find front vehicle for each vehicle (considering sub-lanes)
    this.vehicles.forEach(vehicle => {
      vehicle.frontVehicle = null;
      let minDistance = Infinity;
      
      this.vehicles.forEach(other => {
        if (other === vehicle) return;
        if (other.lane !== vehicle.lane) return;
        
        // Consider sub-lane - only care about vehicles in same or adjacent sub-lanes
        const subLaneDiff = Math.abs(other.subLane - vehicle.subLane);
        if (subLaneDiff > 1) return; // Ignore vehicles 2 sub-lanes away
        
        // Check if other is in front (all vehicles go same direction)
        const distance = other.position.z - vehicle.position.z;
        
        // Adjust perceived distance based on sub-lane difference
        const effectiveDistance = subLaneDiff === 0 ? distance : distance * 1.5;
        
        // For same direction, "front" is positive z
        if (distance > 0 && effectiveDistance < minDistance) {
          minDistance = effectiveDistance;
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
    // Smoother S-curve interpolation for more natural lane changes
    // This is smootherstep - even smoother than smoothstep
    return t * t * t * (t * (t * 6 - 15) + 10);
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
  
  // Traffic synchronization methods
  setMaster(isMaster) {
    this.isMaster = isMaster;
    console.log(`Traffic system ${isMaster ? 'is now master' : 'is now slave'}`);
  }

  broadcastVehicleSpawn(vehicle) {
    if (!this.multiplayerManager || !this.multiplayerManager.socket) return;
    
    const vehicleData = {
      id: vehicle.id,
      type: vehicle.type,
      lane: vehicle.lane,
      targetLane: vehicle.targetLane,
      position: { x: vehicle.position.x, y: vehicle.position.y, z: vehicle.position.z },
      velocity: { x: vehicle.velocity.x, y: vehicle.velocity.y, z: vehicle.velocity.z },
      speed: vehicle.speed,
      baseSpeed: vehicle.baseSpeed,
      behavior: vehicle.behavior,
      isBraking: vehicle.isBraking
    };
    
    this.multiplayerManager.socket.emit('traffic-vehicle-spawn', vehicleData);
  }

  broadcastTrafficUpdate() {
    if (!this.multiplayerManager || !this.multiplayerManager.socket) return;
    
    const trafficData = this.vehicles.map(vehicle => ({
      id: vehicle.id,
      position: { x: vehicle.position.x, y: vehicle.position.y, z: vehicle.position.z },
      velocity: { x: vehicle.velocity.x, y: vehicle.velocity.y, z: vehicle.velocity.z },
      lane: vehicle.lane,
      targetLane: vehicle.targetLane,
      laneChangeProgress: vehicle.laneChangeProgress,
      speed: vehicle.speed,
      isBraking: vehicle.isBraking
    }));
    
    this.multiplayerManager.socket.emit('traffic-update', trafficData);
  }

  onVehicleSpawn(vehicleData) {
    // Only non-master clients should spawn vehicles from network
    if (this.isMaster) return;
    
    // Check if vehicle already exists
    if (this.vehicles.find(v => v.id === vehicleData.id)) return;
    
    this.spawnVehicle(0, vehicleData);
  }

  onTrafficUpdate(trafficData) {
    // Only non-master clients should update from network
    if (this.isMaster) return;
    
    trafficData.forEach(update => {
      const vehicle = this.vehicles.find(v => v.id === update.id);
      if (vehicle) {
        // Interpolate position
        vehicle.position.lerp(
          new THREE.Vector3(update.position.x, update.position.y, update.position.z),
          0.3
        );
        
        // Update velocity
        vehicle.velocity.set(update.velocity.x, update.velocity.y, update.velocity.z);
        
        // Update lane info
        vehicle.lane = update.lane;
        vehicle.targetLane = update.targetLane;
        vehicle.laneChangeProgress = update.laneChangeProgress;
        vehicle.speed = update.speed;
        vehicle.isBraking = update.isBraking;
        
        // Update mesh position
        vehicle.mesh.position.copy(vehicle.position);
      }
    });
  }

  onVehicleRemove(vehicleId) {
    // Remove vehicle from all clients
    const vehicleIndex = this.vehicles.findIndex(v => v.id === vehicleId);
    if (vehicleIndex >= 0) {
      const vehicle = this.vehicles[vehicleIndex];
      this.scene.remove(vehicle.mesh);
      vehicle.mesh.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
      });
      this.vehicles.splice(vehicleIndex, 1);
    }
  }

  dispose() {
    // Remove all vehicles from scene
    this.vehicles.forEach(vehicle => {
      if (vehicle.mesh) {
        // Dispose of geometries in the group
        vehicle.mesh.traverse((object) => {
          if (object.geometry) {
            object.geometry.dispose();
          }
          // Don't dispose shared materials here - they're disposed below
        });
        // Remove from scene
        this.scene.remove(vehicle.mesh);
      }
    });
    
    // Clear vehicles array
    this.vehicles = [];
    
    // Dispose of shared materials
    if (this.vehicleMaterials) {
      // Dispose car materials array
      if (this.vehicleMaterials.car) {
        this.vehicleMaterials.car.forEach(mat => {
          if (mat && typeof mat.dispose === 'function') {
            mat.dispose();
          }
        });
      }
      // Dispose other shared materials
      ['glass', 'wheel', 'lights', 'brake'].forEach(key => {
        if (this.vehicleMaterials[key] && typeof this.vehicleMaterials[key].dispose === 'function') {
          this.vehicleMaterials[key].dispose();
        }
      });
    }
    
    // Clear references
    this.scene = null;
    this.highway = null;
    this.camera = null;
    this.vehicleMaterials = null;
    this.multiplayerManager = null;
  }
  
  // MEMORY LEAK FIX: Clean up any debris or crash-related objects
  cleanupDebris() {
    // Remove any crashed vehicle parts that might be lingering
    this.vehicles.forEach(vehicle => {
      if (vehicle.isCrashed || vehicle.isDead) {
        // Remove from scene
        if (vehicle.group && vehicle.group.parent) {
          vehicle.group.parent.remove(vehicle.group);
        }
      }
    });
    
    // Filter out crashed vehicles
    this.vehicles = this.vehicles.filter(vehicle => {
      if (vehicle.isCrashed || vehicle.isDead) {
        // Dispose of vehicle resources
        if (vehicle.group) {
          vehicle.group.traverse(child => {
            // Don't dispose shared geometry
            // Only remove from scene
            if (child.parent) {
              child.parent.remove(child);
            }
          });
        }
        return false; // Remove from array
      }
      return true; // Keep active vehicles
    });
    
    console.log(`Cleaned up debris, ${this.vehicles.length} vehicles remaining`);
  }
}