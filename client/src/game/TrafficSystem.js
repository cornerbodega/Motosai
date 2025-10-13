import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ROAD_CONSTANTS } from './RoadConstants.js';
import { TrafficIDM } from './TrafficSystemIDM.js';
import { getMaterialManager } from '../utils/MaterialManager.js';

export class TrafficSystem {
  constructor(scene, highway, camera, bloodTrackSystem = null, multiplayerManager = null) {
    this.scene = scene;
    this.highway = highway;
    this.camera = camera;
    this.bloodTrackSystem = bloodTrackSystem;
    this.multiplayerManager = multiplayerManager;
    this.vehicles = [];
    this.maxVehicles = 20; // Reduced to 20 to prevent memory issues
    this.spawnDistance = 150; // Reduced spawn distance for better performance and lower memory

    // Reusable vectors to prevent memory allocation in update loops
    this._tempVector = new THREE.Vector3();
    this._tempVector2 = new THREE.Vector3()

    // Use centralized material manager
    this.materialManager = getMaterialManager();

    // Debug options
    this.debugBoundingBoxes = false; // Toggle for bounding box visualization
    this.debugBoxMeshes = new Map(); // Store debug box meshes per vehicle

    // Vehicle model loading with dimension detection
    this.sedanModel = null;
    this.sedanModelLoaded = false;
    this.sedanModelDimensions = { width: 1.8, height: 1.4, length: 4.5 }; // Default fallback
    this.sedanYOffset = 0; // Y offset from origin to bottom of model - will be calculated on load
    this.loadSedanModel();

    this.semiModel = null;
    this.semiModelLoaded = false;
    this.semiModelDimensions = { width: 2.5, height: 4.0, length: 16.0 }; // Default fallback
    this.semiYOffset = 0; // Y offset from origin to bottom of model - will be calculated on load
    this.loadSemiModel();

    // Color palette for cars (will be applied to the sedan body material)
    this.carColors = [
      0xff0000, // Red
      0x0000ff, // Blue
      0xffffff, // White
      0xffff00, // Yellow
      0x00ff00, // Green
      0xff8800, // Orange
      0x8888ff, // Light blue
      0xcccccc, // Silver
      0x000000, // Black
      0x660000, // Dark red
      0x006600, // Dark green
      0x000066  // Dark blue
    ];

    // Shared materials cache for sedan vehicles - one set per color
    this.sedanMaterialCache = new Map();

    // Shared materials cache for semi vehicles - one set per color
    this.semiMaterialCache = new Map();

    // Create shared geometry ONCE for all vehicles to prevent memory leaks (fallback)
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
    
    // Vehicle types (realistic highway speeds in m/s)
    this.vehicleTypes = [
      { type: 'car', probability: 0.5, length: 4.5, width: 1.8, height: 1.4, speed: 31, preferredLane: null }, // ~70 mph
      { type: 'suv', probability: 0.2, length: 5, width: 2, height: 1.8, speed: 29, preferredLane: null }, // ~65 mph
      { type: 'semi', probability: 0.15, length: 16, width: 2.5, height: 4, speed: 27, preferredLane: 0 }, // ~60 mph, 18-wheeler, prefers right lane
      { type: 'van', probability: 0.1, length: 5.5, width: 2, height: 2, speed: 29, preferredLane: null }, // ~65 mph
      { type: 'sports', probability: 0.05, length: 4.2, width: 1.8, height: 1.2, speed: 36, preferredLane: null } // ~80 mph (sports cars faster)
    ];
    
    // Materials are now managed by MaterialManager - no need to create them here
    this.initMaterials();
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

    // For new cached sedan vehicles - materials are shared per color, don't dispose them!
    // They'll be disposed when the entire TrafficSystem is disposed

    // For old sedan vehicles with materialsToDispose (shouldn't exist anymore but handle legacy)
    if (mesh.userData.materialsToDispose) {
      mesh.userData.materialsToDispose.forEach(material => {
        if (material && material.dispose) {
          material.dispose();
        }
      });
      mesh.userData.materialsToDispose = [];
    }

    // For fallback geometry vehicles, dispose of any cloned materials
    mesh.traverse(child => {
      if (child.isMesh && child.material) {
        // Check if this material is not from the shared pool
        const isSharedMaterial = this.vehicleMaterials && Object.values(this.vehicleMaterials).some(matArray => {
          if (Array.isArray(matArray)) {
            return matArray.includes(child.material);
          }
          return matArray === child.material;
        });

        // Only dispose if it's not a shared material
        if (!isSharedMaterial && child.material.dispose) {
          child.material.dispose();
        }
      }
    });

    // Remove all children
    while (mesh.children.length > 0) {
      mesh.remove(mesh.children[0]);
    }
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
  
  loadSedanModel() {
    const loader = new GLTFLoader();
    loader.load(
      '/models/sedan.glb',
      (gltf) => {
        this.sedanModel = gltf.scene;
        this.sedanModelLoaded = true;

        // Automatically detect model dimensions and origin offset
        const bbox = new THREE.Box3().setFromObject(this.sedanModel);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        bbox.getSize(size);
        bbox.getCenter(center);

        this.sedanModelDimensions = {
          width: size.x,
          height: size.y,
          length: size.z
        };

        // Calculate Y offset from model origin to bottom (for ground placement)
        this.sedanYOffset = center.y - size.y / 2;

        console.log('Sedan model loaded successfully');
        console.log('Detected sedan dimensions:', this.sedanModelDimensions);
        console.log('Sedan bbox center:', center);
        console.log('Sedan Y offset (origin to bottom):', this.sedanYOffset);

        // Log the model structure for debugging
        const meshes = [];
        this.sedanModel.traverse((child) => {
          if (child.isMesh) {
            meshes.push({
              name: child.name,
              material: child.material ? child.material.name || 'unnamed' : 'none',
              materialColor: child.material && child.material.color ? child.material.color.getHexString() : 'none'
            });
          }
        });
        // Uncomment for debugging:
        // console.log('Sedan meshes:', meshes);
        // console.log('Mesh names:', meshes.map(m => m.name).join(', '));
      },
      undefined,
      (error) => {
        console.error('Failed to load sedan model, using fallback geometry:', error);
        this.sedanModelLoaded = false;
      }
    );
  }

  loadSemiModel() {
    const loader = new GLTFLoader();
    loader.load(
      '/models/semi.glb',
      (gltf) => {
        this.semiModel = gltf.scene;
        this.semiModelLoaded = true;

        // Automatically detect model dimensions and origin offset
        const bbox = new THREE.Box3().setFromObject(this.semiModel);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        bbox.getSize(size);
        bbox.getCenter(center);

        this.semiModelDimensions = {
          width: size.x,
          height: size.y,
          length: size.z
        };

        // Calculate Y offset from model origin to bottom (for ground placement)
        this.semiYOffset = center.y - size.y / 2;

        console.log('Semi model loaded successfully');
        console.log('Detected semi dimensions:', this.semiModelDimensions);
        console.log('Semi bbox center:', center);
        console.log('Semi Y offset (origin to bottom):', this.semiYOffset);
      },
      undefined,
      (error) => {
        console.error('Failed to load semi model, using fallback geometry:', error);
        this.semiModelLoaded = false;
      }
    );
  }

  initMaterials() {
    // Use materials from the MaterialManager pool (fallback only)
    const vehicleColors = [
      0xff0000, // Red
      0x0000ff, // Blue
      0xffffff, // White
      0xffff00, // Yellow
      0x00ff00, // Green
      0xff8800, // Orange
      0x8888ff, // Light blue
      0xcccccc  // Silver
    ];

    // Reference to material manager's pooled materials
    this.vehicleMaterials = {
      car: vehicleColors.map(color =>
        this.materialManager.getVehicleMaterial(color, 'body')
      ),
      glass: this.materialManager.getVehicleMaterial(0x222244, 'window'),
      wheel: this.materialManager.getVehicleMaterial(0x1a1a1a, 'wheel'),
      lights: this.materialManager.getMaterial('standard', {
        color: 0xffffee,
        emissive: 0xffffee,
        emissiveIntensity: 1.5
      }),
      brake: this.materialManager.getMaterial('standard', {
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.8
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
        subLane: vehicleData.subLane !== undefined ? vehicleData.subLane : Math.floor(Math.random() * 3), // Random default if not specified
        targetLane: vehicleData.targetLane,
        targetSubLane: vehicleData.targetSubLane !== undefined ? vehicleData.targetSubLane : (vehicleData.subLane !== undefined ? vehicleData.subLane : Math.floor(Math.random() * 3)),
        laneChangeProgress: vehicleData.laneChangeProgress || 0,
        laneChangeSpeed: 2.0 + Math.random() * 1.0, // Smoother lane changes (2-3 seconds)
        position: new THREE.Vector3(vehicleData.position.x, vehicleData.position.y, vehicleData.position.z),
        velocity: new THREE.Vector3(vehicleData.velocity.x, vehicleData.velocity.y, vehicleData.velocity.z),
        speed: vehicleData.speed,
        baseSpeed: vehicleData.baseSpeed,
        length: type.length,
        width: type.width,
        height: type.height,
        isOncoming: false,
        isBraking: vehicleData.isBraking || false,
        frontVehicle: null,
        behavior: vehicleData.behavior || TrafficIDM.generateBehavior(vehicleData.lane)
      };
    } else {
      // Generate new vehicle (master client only, or no multiplayer)
      if (this.multiplayerManager && !this.isMaster) return;

      const type = this.selectVehicleType();
      // Use preferred lane if specified, otherwise random
      const lane = type.preferredLane !== null ? type.preferredLane : Math.floor(Math.random() * 3);
      
      // Randomly select sublane for more variety
      let subLane;
      if (lane === 0) {
        // Left lane: prefer left and center sublanes
        subLane = Math.random() < 0.66 ? Math.floor(Math.random() * 2) : 2; // 0 or 1 mostly, sometimes 2
      } else if (lane === 2) {
        // Right lane: prefer center and right sublanes
        subLane = Math.random() < 0.66 ? Math.floor(Math.random() * 2) + 1 : 0; // 1 or 2 mostly, sometimes 0
      } else {
        // Middle lane: equal distribution across all sublanes
        subLane = Math.floor(Math.random() * 3); // 0, 1, or 2 equally
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
        laneChangeSpeed: 2.0 + Math.random() * 1.0, // Smoother lane changes (2-3 seconds)
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        speed: type.speed + (Math.random() - 0.5) * 4, // ±~10 mph variation
        baseSpeed: type.speed,
        length: type.length,
        width: type.width,
        height: type.height,
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

      // Define a safe zone around the player where cars shouldn't spawn
      const MIN_SAFE_DISTANCE = 50; // Minimum 50 meters away from player

      const spawnAhead = Math.random() > 0.3;
      let spawnOffset;
      if (spawnAhead) {
        // Spawn ahead but not too close - ensure minimum safe distance
        const minAheadDistance = Math.max(MIN_SAFE_DISTANCE, effectiveSpawnDistance - 100);
        spawnOffset = minAheadDistance + Math.random() * 100;
      } else {
        // Spawn behind player but also maintain safe distance
        const maxBehindDistance = Math.min(-effectiveSpawnDistance/3, -MIN_SAFE_DISTANCE - 50);
        spawnOffset = maxBehindDistance - Math.random() * 50;
      }
      const spawnZ = playerZ + spawnOffset;

      vehicle.position.set(laneX, ROAD_CONSTANTS.ROAD_Y, spawnZ);
      vehicle.velocity.z = vehicle.speed; // Already in m/s
    }

    // Calculate bounding box in LOCAL space (before positioning in world)
    // This gives us the actual dimensions of the scaled mesh
    vehicle.mesh.position.set(0, 0, 0); // Temp at origin
    vehicle.mesh.updateMatrixWorld(true);

    const localBBox = new THREE.Box3().setFromObject(vehicle.mesh);
    const meshSize = new THREE.Vector3();
    localBBox.getSize(meshSize);

    // The bottom of the mesh in local space
    const meshBottom = localBBox.min.y;

    // Update vehicle dimensions to ACTUAL mesh size
    vehicle.width = meshSize.x;
    vehicle.height = meshSize.y;
    vehicle.length = meshSize.z;

    // Y offset to place bottom at ground (ROAD_Y)
    vehicle.meshYOffset = -meshBottom;

    // NOW position the mesh in world space with the offset
    vehicle.mesh.position.set(
      vehicle.position.x,
      ROAD_CONSTANTS.ROAD_Y + vehicle.meshYOffset,
      vehicle.position.z
    );

    // Debug logging for first vehicle of each type
    if (vehicle.type === 'semi' && !this._loggedSemi) {
      console.log('🚛 SEMI DEBUG:');
      console.log('  meshSize:', `${meshSize.x.toFixed(2)} x ${meshSize.y.toFixed(2)} x ${meshSize.z.toFixed(2)}`);
      console.log('  vehicle dimensions:', `${vehicle.width.toFixed(2)} x ${vehicle.height.toFixed(2)} x ${vehicle.length.toFixed(2)}`);
      console.log('  meshBottom:', meshBottom);
      console.log('  meshYOffset:', vehicle.meshYOffset);
      console.log('  finalY:', vehicle.mesh.position.y);
      this._loggedSemi = true;
    }
    if (!this._loggedCar) {
      console.log('🚗 CAR DEBUG:');
      console.log('  meshSize:', `${meshSize.x.toFixed(2)} x ${meshSize.y.toFixed(2)} x ${meshSize.z.toFixed(2)}`);
      console.log('  vehicle dimensions:', `${vehicle.width.toFixed(2)} x ${vehicle.height.toFixed(2)} x ${vehicle.length.toFixed(2)}`);
      console.log('  meshBottom:', meshBottom);
      console.log('  meshYOffset:', vehicle.meshYOffset);
      console.log('  finalY:', vehicle.mesh.position.y);
      this._loggedCar = true;
    }

    this.vehicles.push(vehicle);
    this.scene.add(vehicle.mesh);
    
    // Broadcast new vehicle spawn if master
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
    // Use appropriate model based on vehicle type
    if (type.type === 'semi' && this.semiModelLoaded && this.semiModel) {
      return this.createSemiVehicle(type);
    } else if (this.sedanModelLoaded && this.sedanModel) {
      return this.createSedanVehicle(type);
    } else {
      // Fallback to original geometry-based vehicles
      return this.createGeometryVehicle(type);
    }
  }

  createSedanVehicle(type) {
    // Clone the sedan model with deep clone
    const vehicle = this.sedanModel.clone(true);

    // Pick random color for this vehicle
    const colorIndex = Math.floor(Math.random() * this.carColors.length);
    const colorValue = this.carColors[colorIndex];

    // Check if we have cached materials for this color
    let colorMaterials = this.sedanMaterialCache.get(colorValue);
    if (!colorMaterials) {
      // First vehicle with this color - create and cache materials
      colorMaterials = new Map();
      const randomColor = new THREE.Color(colorValue);

      // Clone all unique materials from the model once for this color
      this.sedanModel.traverse((child) => {
        if (child.isMesh && child.material && !colorMaterials.has(child.material)) {
          const clonedMat = child.material.clone();

          // Apply color only to body color materials (not black trim, windows, lights, wheels)
          const materialName = child.material.name ? child.material.name.toLowerCase() : '';
          if (materialName.includes('body grey') || materialName.includes('body white')) {
            clonedMat.color.copy(randomColor);
          }
          // Keep other materials (windows, headlights, rear lights, body black, wheels, tires) as original

          colorMaterials.set(child.material, clonedMat);
        }
      });

      this.sedanMaterialCache.set(colorValue, colorMaterials);
    }

    // Track brake lights, headlights and wheels for animation
    let brakeLight1 = null;
    let brakeLight2 = null;
    const wheels = [];

    // Apply cached materials to the cloned vehicle
    vehicle.traverse((child) => {
      const childName = child.name.toLowerCase();

      // Track wheel groups/objects (not just meshes)
      if (childName.includes('wheel')) {
        wheels.push(child);
      }

      if (child.isMesh && child.material) {
        // Find the original material this came from
        const originalMaterial = child.material;

        // Replace with cached colored material
        if (colorMaterials.has(originalMaterial)) {
          child.material = colorMaterials.get(originalMaterial);
        }

        const meshName = child.name.toLowerCase();
        const matName = child.material && child.material.name ? child.material.name.toLowerCase() : '';

        // Track brake lights (check both mesh name and material name)
        if (meshName.includes('brake') || meshName.includes('tail') ||
            (meshName.includes('light') && meshName.includes('rear')) ||
            matName.includes('rear lights') || matName.includes('brake') || matName.includes('tail')) {
          // Replace with shared brake light material
          child.material = this.vehicleMaterials.brake;
          if (!brakeLight1) {
            brakeLight1 = child;
          } else if (!brakeLight2) {
            brakeLight2 = child;
          }
        }

        // Make headlights emissive
        if (meshName.includes('headlight') || meshName.includes('front light') ||
            (meshName.includes('light') && meshName.includes('front')) ||
            matName.includes('headlights') || matName.includes('front lights')) {
          // Replace with shared headlight material
          child.material = this.vehicleMaterials.lights;
        }

        child.castShadow = false; // Disable shadows for performance
      }
    });

    // Scale to match vehicle type dimensions using detected model size
    const scaleX = type.width / this.sedanModelDimensions.width;
    const scaleY = type.height / this.sedanModelDimensions.height;
    const scaleZ = type.length / this.sedanModelDimensions.length;
    vehicle.scale.set(scaleX, scaleY, scaleZ);

    // Store brake light and wheel references for animation (no materials to dispose - they're shared!)
    vehicle.userData = {
      type: type.type,
      colorValue: colorValue, // Store color for reference
      brake1: brakeLight1,
      brake2: brakeLight2,
      wheels: wheels
    };


    return vehicle;
  }

  createSemiVehicle(type) {
    // Clone the semi model with deep clone
    const vehicle = this.semiModel.clone(true);

    // Pick random color for this vehicle
    const colorIndex = Math.floor(Math.random() * this.carColors.length);
    const colorValue = this.carColors[colorIndex];

    // Check if we have cached materials for this color
    let colorMaterials = this.semiMaterialCache.get(colorValue);
    if (!colorMaterials) {
      // First vehicle with this color - create and cache materials
      colorMaterials = new Map();
      const randomColor = new THREE.Color(colorValue);

      // Clone all unique materials from the model once for this color
      this.semiModel.traverse((child) => {
        if (child.isMesh && child.material && !colorMaterials.has(child.material)) {
          const clonedMat = child.material.clone();

          // Apply color to semi body materials
          const materialName = child.material.name ? child.material.name.toLowerCase() : '';
          if (materialName.includes('body dark blue') ||
              materialName.includes('body white') ||
              materialName.includes('body dark yellow')) {
            clonedMat.color.copy(randomColor);
          }
          // Keep other materials (windows, headlights, rear lights, body black, wheels, tires) as original

          colorMaterials.set(child.material, clonedMat);
        }
      });

      this.semiMaterialCache.set(colorValue, colorMaterials);
    }

    // Track brake lights, headlights and wheels for animation
    let brakeLight1 = null;
    let brakeLight2 = null;
    const wheels = [];

    // Apply cached materials to the cloned vehicle
    vehicle.traverse((child) => {
      const childName = child.name.toLowerCase();

      // Track wheel groups/objects (not just meshes)
      if (childName.includes('wheel')) {
        wheels.push(child);
      }

      if (child.isMesh && child.material) {
        // Find the original material this came from
        const originalMaterial = child.material;

        // Replace with cached colored material
        if (colorMaterials.has(originalMaterial)) {
          child.material = colorMaterials.get(originalMaterial);
        }

        const meshName = child.name.toLowerCase();
        const matName = child.material && child.material.name ? child.material.name.toLowerCase() : '';

        // Track brake lights (check both mesh name and material name)
        if (meshName.includes('brake') || meshName.includes('tail') ||
            (meshName.includes('light') && meshName.includes('rear')) ||
            matName.includes('rear lights') || matName.includes('brake') || matName.includes('tail')) {
          // Replace with shared brake light material
          child.material = this.vehicleMaterials.brake;
          if (!brakeLight1) {
            brakeLight1 = child;
          } else if (!brakeLight2) {
            brakeLight2 = child;
          }
        }

        // Make headlights emissive
        if (meshName.includes('headlight') || meshName.includes('front light') ||
            (meshName.includes('light') && meshName.includes('front')) ||
            matName.includes('headlights') || matName.includes('front lights')) {
          // Replace with shared headlight material
          child.material = this.vehicleMaterials.lights;
        }

        child.castShadow = false; // Disable shadows for performance
      }
    });

    // Scale to match vehicle type dimensions using detected model size
    const scaleX = type.width / this.semiModelDimensions.width;
    const scaleY = type.height / this.semiModelDimensions.height;
    const scaleZ = type.length / this.semiModelDimensions.length;
    vehicle.scale.set(scaleX, scaleY, scaleZ);

    // Store brake light and wheel references for animation (no materials to dispose - they're shared!)
    vehicle.userData = {
      type: type.type,
      colorValue: colorValue,
      brake1: brakeLight1,
      brake2: brakeLight2,
      wheels: wheels
    };

    return vehicle;
  }

  createGeometryVehicle(type) {
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
    
    // Auto-become master if no traffic and multiplayer is enabled
    if (this.multiplayerManager && !this.isMaster && this.vehicles.length === 0) {
      // Wait a bit to see if we receive traffic from master
      this.noTrafficTimer = (this.noTrafficTimer || 0) + deltaTime;
      if (this.noTrafficTimer > 3) { // After 3 seconds with no traffic
        console.log('No traffic received, becoming master');
        this.setMaster(true);
        this.noTrafficTimer = 0;
      }
    } else {
      this.noTrafficTimer = 0;
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

        // ALWAYS run full updateVehicle to prevent teleporting
        // This ensures smooth lane changes and lateral drift even when not visible
        this.updateVehicle(vehicle, deltaTime, playerPosition);
      }

      // Update debug bounding box if enabled
      if (this.debugBoundingBoxes) {
        this.updateDebugBox(vehicle);
      }
    });
    
    // Check for vehicles to remove (too far away) - use dynamic distance
    const removalDistance = Math.max(300, dynamicSpawnDistance + 100); // At least 300m, or spawn distance + 100m
    this.vehicles = this.vehicles.filter(vehicle => {
      const distance = Math.abs(vehicle.position.z - playerPosition.z);
      if (distance > removalDistance) {
        this.scene.remove(vehicle.mesh);
        // Clear blood trail status before removal
        if (vehicle.isCreatingBloodTrail && this.bloodTrackSystem) {
          this.bloodTrackSystem.clearVehicleBloodTrail(vehicle.id);
          vehicle.isCreatingBloodTrail = false;
        }
        // Remove debug box if it exists
        if (this.debugBoundingBoxes) {
          this.removeDebugBox(vehicle.id);
        }
        // PROPERLY dispose using the disposal function
        this.disposeVehicleMesh(vehicle.mesh);
        return false;
      }
      return true;
    });
    
    // Calculate distance-based traffic density
    const distanceTraveled = Math.abs(playerPosition.z);
    const distanceFactor = Math.min(3.0, 1.0 + distanceTraveled / 1000); // Up to 3x at 2km
    
    // Dynamic max vehicles based on distance
    const currentMaxVehicles = Math.min(60, Math.floor(this.maxVehicles * distanceFactor));
    
    // Spawn new vehicles if needed (master only, or no multiplayer)
    if (this.vehicles.length < currentMaxVehicles && (!this.multiplayerManager || this.isMaster)) {
      // Increase spawn rate at high speeds and distances
      const baseSpawnChance = playerSpeed > 50 ? 0.15 : 0.08;
      const spawnChance = Math.min(0.3, baseSpawnChance * Math.sqrt(distanceFactor));
      
      if (Math.random() < spawnChance) {
        this.spawnVehicle(playerPosition.z, dynamicSpawnDistance);
      }
    }
    
    // Also ensure minimum traffic near player
    const minNearbyVehicles = Math.min(20, Math.floor(10 * distanceFactor)); // More cars nearby at distance
    const nearbyVehicles = this.vehicles.filter(v => 
      Math.abs(v.position.z - playerPosition.z) < 150 // Increased range
    ).length;
    
    if (nearbyVehicles < minNearbyVehicles && this.vehicles.length < currentMaxVehicles && (!this.multiplayerManager || this.isMaster)) {
      // Force spawn if too few vehicles nearby
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
      // Not changing lanes - add subtle drift within sublane

      // Initialize drift parameters if not present
      if (!vehicle.lateralDrift) {
        vehicle.lateralDrift = {
          primaryPhase: Math.random() * Math.PI * 2, // Primary wave phase
          secondaryPhase: Math.random() * Math.PI * 2, // Secondary wave phase
          amplitude: 0.15 + Math.random() * 0.15, // 0.15-0.3m amplitude
          frequency: 0.15 + Math.random() * 0.1 // Vary frequency per vehicle
        };
      }

      // Update phases for smooth, natural movement
      vehicle.lateralDrift.primaryPhase += deltaTime * vehicle.lateralDrift.frequency;
      vehicle.lateralDrift.secondaryPhase += deltaTime * vehicle.lateralDrift.frequency * 1.7; // Different frequency

      // Combine two sine waves for more natural movement
      const primaryWave = Math.sin(vehicle.lateralDrift.primaryPhase) * vehicle.lateralDrift.amplitude;
      const secondaryWave = Math.sin(vehicle.lateralDrift.secondaryPhase) * vehicle.lateralDrift.amplitude * 0.3;

      // Smooth natural drift
      const totalDrift = primaryWave + secondaryWave;
      const clampedDrift = Math.max(-0.4, Math.min(0.4, totalDrift)); // Stay within sublane

      // Apply position with drift
      const baseX = ROAD_CONSTANTS.getExactPosition(vehicle.lane, vehicle.subLane);
      vehicle.position.x = baseX + clampedDrift;

      // Add subtle rotation based on drift direction for realism
      const driftVelocity = Math.cos(vehicle.lateralDrift.primaryPhase) * vehicle.lateralDrift.amplitude * vehicle.lateralDrift.frequency;
      vehicle.mesh.rotation.y = driftVelocity * 0.08; // Very subtle rotation

      vehicle.position.y = ROAD_CONSTANTS.ROAD_Y; // Force correct height
    }
    
    // Update position
    vehicle.position.z += vehicle.velocity.z * deltaTime;

    // Rotate wheels based on speed (for sedan models)
    if (vehicle.mesh.userData.wheels && vehicle.mesh.userData.wheels.length > 0) {
      // Calculate wheel rotation based on distance traveled
      // Assuming average wheel diameter of 0.65m (circumference = 2.04m)
      const wheelCircumference = 2.04;
      const distanceTraveled = vehicle.velocity.z * deltaTime;
      const rotationAngle = (distanceTraveled / wheelCircumference) * Math.PI * 2;

      vehicle.mesh.userData.wheels.forEach(wheel => {
        // Rotate around X axis for forward rolling motion
        wheel.rotation.x += rotationAngle;
      });
    }

    // Check for blood contact and create continuous tire tracks
    if (this.bloodTrackSystem) {
      const bloodContact = this.bloodTrackSystem.checkVehicleBloodContact(vehicle.position, vehicle.width);

      if (bloodContact) {
        // Start or continue blood trail
        if (!vehicle.isCreatingBloodTrail) {
          // Vehicle just entered blood - start new trail
          this.bloodTrackSystem.startVehicleBloodTrail(vehicle.id, bloodContact);
          vehicle.isCreatingBloodTrail = true;
        }
      }

      // Update blood trail if vehicle is creating one
      if (vehicle.isCreatingBloodTrail) {
        const stillTrailing = this.bloodTrackSystem.updateVehicleBloodTrail(vehicle);
        if (!stillTrailing) {
          vehicle.isCreatingBloodTrail = false;
        }
      }
    }
    
    // Update mesh position using pre-calculated Y offset
    vehicle.mesh.position.copy(vehicle.position);
    vehicle.mesh.position.y = ROAD_CONSTANTS.ROAD_Y + (vehicle.meshYOffset || 0);
    
    // Update brake lights with emissive glow
    if (vehicle.mesh.userData.brake1 && vehicle.mesh.userData.brake1.material) {
      const mat1 = vehicle.mesh.userData.brake1.material;
      const mat2 = vehicle.mesh.userData.brake2?.material;

      if (vehicle.isBraking) {
        // Extra bright red emissive when braking
        mat1.emissiveIntensity = 2.0;
        if (mat2) {
          mat2.emissiveIntensity = 2.0;
        }
      } else {
        // Normal red glow when not braking
        mat1.emissiveIntensity = 0.8;
        if (mat2) {
          mat2.emissiveIntensity = 0.8;
        }
      }
    }
  }
  
  updateAI(vehicle, playerPosition, deltaTime = 0.016) {
    vehicle.behavior.lastLaneChange += deltaTime;

    // Calculate distance-based aggression (more lane changes as you go farther)
    const distanceTraveled = Math.abs(playerPosition.z);
    // 1 mile = 1609 meters, scale aggression up to 5x at 5 miles
    const aggressionFactor = Math.min(5.0, 1.0 + (distanceTraveled / 1609) * 0.8); // +0.8x per mile, max 5x

    // Check if vehicle should pass slower traffic
    if (vehicle.frontVehicle) {
      const distance = vehicle.frontVehicle.position.z - vehicle.position.z;
      const speedDiff = vehicle.baseSpeed - vehicle.frontVehicle.speed;

      // Natural passing behavior - gets more aggressive with distance
      const passingThreshold = 40; // Consider passing at reasonable distance
      const minPassingGap = 12; // Safe following distance

      // Pass if vehicle is moderately slower - threshold decreases with distance
      const speedThreshold = Math.max(1.5, 3 - (aggressionFactor - 1) * 0.5); // 3 m/s down to 1.5 m/s
      if (speedDiff > speedThreshold && distance < passingThreshold && distance > minPassingGap) {
        // Try to pass if haven't changed lanes recently - gets faster with aggression
        const laneChangeDelay = Math.max(1.5, 3.5 / aggressionFactor); // 3.5s down to 0.7s
        if (vehicle.behavior.lastLaneChange > laneChangeDelay && vehicle.targetLane === vehicle.lane) {
          // Prefer passing on the left (lane 0 is leftmost)
          let passingLane = vehicle.lane - 1;
          // Required gap decreases with aggression - more risky passes at distance
          const requiredGap = Math.max(8, 15 / aggressionFactor); // 15m down to 3m

          if (passingLane < 0 || !this.isLaneChangeSafe(vehicle, passingLane, 1, requiredGap)) {
            // Can't pass on left, try right
            passingLane = vehicle.lane + 1;
          }

          if (passingLane >= 0 && passingLane <= 2) {
            if (this.attemptLaneChange(vehicle, passingLane, requiredGap)) {
              vehicle.behavior.lastLaneChange = 0;
              vehicle.behavior.isPassing = true;
              vehicle.behavior.originalLane = vehicle.lane;
            }
          }
        }
      }
    }
    
    // Return to original lane after passing
    if (vehicle.behavior.isPassing && !vehicle.frontVehicle) {
      const returnDelay = 2.0; // Wait 2 seconds after passing
      if (vehicle.behavior.lastLaneChange > returnDelay) {
        const returnGap = 10; // Smaller gap for returning
        if (this.isLaneChangeSafe(vehicle, vehicle.behavior.originalLane, 1, returnGap)) {
          if (this.attemptLaneChange(vehicle, vehicle.behavior.originalLane, returnGap)) {
            vehicle.behavior.isPassing = false;
            vehicle.behavior.lastLaneChange = 0;
          }
        }
      }
    }
    
    // Natural random lane changes - gets more aggressive with distance
    const baseLaneChangeWait = 12.0 + Math.random() * 8.0; // Base: 12-20 seconds
    const laneChangeWait = baseLaneChangeWait / aggressionFactor; // Decreases with distance
    const laneChangeProbability = 0.004 * aggressionFactor; // Increases with distance

    if (!vehicle.behavior.isPassing &&
        vehicle.targetLane === vehicle.lane &&
        vehicle.behavior.lastLaneChange > laneChangeWait &&
        Math.random() < laneChangeProbability) {
      this.attemptLaneChange(vehicle);
      vehicle.behavior.lastLaneChange = 0;
    }

    // Smooth sublane changes for natural weaving - gets more aggressive with distance
    const subLaneChangeProbability = 0.008 * aggressionFactor; // Increases with distance
    const baseSubLaneWait = 4.0 + Math.random() * 4.0; // Base: 4-8 seconds
    const subLaneChangeWait = baseSubLaneWait / aggressionFactor; // Decreases with distance

    // Track sublane change timing separately
    if (!vehicle.behavior.lastSubLaneChange) {
      vehicle.behavior.lastSubLaneChange = Math.random() * 2; // Randomize initial timing
    }
    vehicle.behavior.lastSubLaneChange += deltaTime;

    if (vehicle.targetSubLane === vehicle.subLane && // Not already changing
        vehicle.behavior.lastSubLaneChange > subLaneChangeWait &&
        Math.random() < subLaneChangeProbability) {
      this.attemptSubLaneChange(vehicle);
      vehicle.behavior.lastSubLaneChange = 0;
    }
    
    // Speed adjustment based on front vehicle
    if (vehicle.frontVehicle) {
      const distance = vehicle.frontVehicle.position.z - vehicle.position.z;
      const minSafeDistance = (vehicle.length + vehicle.frontVehicle.length) * 0.5 + 2; // Absolute minimum
      const preferredDistance = vehicle.behavior.followDistance * vehicle.speed / 2.237;
      const safeDistance = Math.max(minSafeDistance, preferredDistance);
      
      if (distance < minSafeDistance) {
        // Emergency brake - too close!
        vehicle.speed = Math.min(vehicle.frontVehicle.speed * 0.8, vehicle.speed * 0.5);
        vehicle.isBraking = true;
      } else if (distance < safeDistance) {
        // Slow down smoothly
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
    vehicle.velocity.z = vehicle.speed; // Already in m/s
  }
  
  attemptLaneChange(vehicle, targetLane = null, requiredGap = null) {
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
      
      // Pick a random sublane when changing lanes for more variety
      let targetSubLane = Math.floor(Math.random() * 3); // Random sublane 0, 1, or 2

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
        vehicle.laneChangeSpeed = 0.8 + Math.random() * 0.6; // Smoother sublane changes (0.8-1.4 seconds)
        return true;
      }
    }
    return false;
  }
  
  isLaneChangeSafe(vehicle, targetLane, targetSubLane, customGap = null) {
    // Prevent invalid lanes (stay within 0-2)
    if (targetLane < 0 || targetLane > 2) return false;
    
    const safeDistance = customGap || 8; // meters - slightly more aggressive
    
    for (const other of this.vehicles) {
      if (other === vehicle) continue;
      
      // Check if other vehicle is in or moving to the target position
      const otherInTargetLane = (other.lane === targetLane) || (other.targetLane === targetLane);
      if (!otherInTargetLane) continue;
      
      // Consider sub-lane proximity
      const otherSubLane = other.targetLane === targetLane ? other.targetSubLane : other.subLane;
      const subLaneDiff = Math.abs(otherSubLane - targetSubLane);
      
      // If vehicles would be in exact same sub-lane, need more space
      if (subLaneDiff === 0) {
        const distance = Math.abs(other.position.z - vehicle.position.z);
        // Need at least combined vehicle lengths plus buffer
        const minSafeDistance = Math.max(safeDistance, (vehicle.length + other.length) * 0.5 + 3);
        if (distance < minSafeDistance) {
          return false; // Would collide or be too close
        }
      } else if (subLaneDiff === 1) {
        // Adjacent sub-lanes - allow closer spacing but still safe
        const adjustedSafeDistance = safeDistance * 0.7;
        const distance = Math.abs(other.position.z - vehicle.position.z);
        if (distance < adjustedSafeDistance) {
          return false;
        }
      }
      // Sub-lanes 2 apart are generally safe
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

  // Debug visualization methods
  setDebugBoundingBoxes(enabled) {
    this.debugBoundingBoxes = enabled;

    if (!enabled) {
      // Remove all debug boxes
      this.debugBoxMeshes.forEach((debugMesh, vehicleId) => {
        this.scene.remove(debugMesh);
        if (debugMesh.geometry) debugMesh.geometry.dispose();
        if (debugMesh.material) debugMesh.material.dispose();
      });
      this.debugBoxMeshes.clear();
    }
  }

  updateDebugBox(vehicle) {
    let debugMesh = this.debugBoxMeshes.get(vehicle.id);

    if (!debugMesh) {
      // Create new debug box with correct dimensions (width, height, length)
      const geometry = new THREE.BoxGeometry(vehicle.width, vehicle.height, vehicle.length);
      const material = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
        transparent: true,
        opacity: 0.5
      });
      debugMesh = new THREE.Mesh(geometry, material);
      this.debugBoxMeshes.set(vehicle.id, debugMesh);
      this.scene.add(debugMesh);
    }

    // Update debug box position to match vehicle collision box
    debugMesh.position.copy(vehicle.position);
    debugMesh.position.y = vehicle.height / 2 + ROAD_CONSTANTS.ROAD_Y; // Center vertically at correct height
    debugMesh.visible = vehicle.mesh.visible;
  }

  removeDebugBox(vehicleId) {
    const debugMesh = this.debugBoxMeshes.get(vehicleId);
    if (debugMesh) {
      this.scene.remove(debugMesh);
      if (debugMesh.geometry) debugMesh.geometry.dispose();
      if (debugMesh.material) debugMesh.material.dispose();
      this.debugBoxMeshes.delete(vehicleId);
    }
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
    // Remove all vehicles and clear their blood trail status
    this.vehicles.forEach(vehicle => {
      this.scene.remove(vehicle.mesh);
      // Clear blood trail status
      if (vehicle.isCreatingBloodTrail && this.bloodTrackSystem) {
        this.bloodTrackSystem.clearVehicleBloodTrail(vehicle.id);
        vehicle.isCreatingBloodTrail = false;
      }
      // Remove debug box if it exists
      if (this.debugBoundingBoxes) {
        this.removeDebugBox(vehicle.id);
      }
      // MEMORY LEAK FIX: Properly dispose vehicle mesh
      this.disposeVehicleMesh(vehicle.mesh);
    });
    this.vehicles = [];

    // Note: Don't clear all blood data here - that's handled by the main game on respawn
    // This reset is for traffic system resets, not player death/respawn

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
    
    // Spawn the synced vehicle
    this.spawnVehicle(vehicleData.position?.z || 0, null, vehicleData);
  }

  onTrafficUpdate(trafficData) {
    // Only non-master clients should update from network
    if (this.isMaster) return;

    // Create temp vector ONCE and reuse it
    const tempPos = new THREE.Vector3();

    trafficData.forEach(update => {
      const vehicle = this.vehicles.find(v => v.id === update.id);
      if (vehicle) {
        // Interpolate position - REUSE temp vector instead of creating new one
        tempPos.set(update.position.x, update.position.y, update.position.z);
        vehicle.position.lerp(tempPos, 0.3);

        // Update velocity
        vehicle.velocity.set(update.velocity.x, update.velocity.y, update.velocity.z);
        
        // Update lane info
        vehicle.lane = update.lane;
        vehicle.targetLane = update.targetLane;
        vehicle.laneChangeProgress = update.laneChangeProgress;
        vehicle.speed = update.speed;
        vehicle.isBraking = update.isBraking;

        // Update mesh position using pre-calculated Y offset
        vehicle.mesh.position.copy(vehicle.position);
        vehicle.mesh.position.y = ROAD_CONSTANTS.ROAD_Y + (vehicle.meshYOffset || 0);
      }
    });
  }

  onVehicleRemove(vehicleId) {
    // Remove vehicle from all clients
    const vehicleIndex = this.vehicles.findIndex(v => v.id === vehicleId);
    if (vehicleIndex >= 0) {
      const vehicle = this.vehicles[vehicleIndex];
      this.scene.remove(vehicle.mesh);
      // Clear blood trail status
      if (vehicle.isCreatingBloodTrail && this.bloodTrackSystem) {
        this.bloodTrackSystem.clearVehicleBloodTrail(vehicle.id);
        vehicle.isCreatingBloodTrail = false;
      }
      // DON'T dispose geometry - it's shared by all vehicles!
      // Just remove the mesh from scene
      this.vehicles.splice(vehicleIndex, 1);
    }
  }

  dispose() {
    // Remove all vehicles from scene and properly dispose
    this.vehicles.forEach(vehicle => {
      if (vehicle.mesh) {
        this.scene.remove(vehicle.mesh);
        this.disposeVehicleMesh(vehicle.mesh);
      }
      // Remove debug boxes
      if (this.debugBoundingBoxes) {
        this.removeDebugBox(vehicle.id);
      }
    });

    // Clear vehicles array
    this.vehicles = [];

    // Clear all debug boxes
    this.debugBoxMeshes.forEach((debugMesh) => {
      this.scene.remove(debugMesh);
      if (debugMesh.geometry) debugMesh.geometry.dispose();
      if (debugMesh.material) debugMesh.material.dispose();
    });
    this.debugBoxMeshes.clear();

    // Dispose sedan material cache
    if (this.sedanMaterialCache) {
      this.sedanMaterialCache.forEach(colorMaterials => {
        colorMaterials.forEach(material => {
          if (material && material.dispose) {
            material.dispose();
          }
        });
      });
      this.sedanMaterialCache.clear();
    }

    // Dispose semi material cache
    if (this.semiMaterialCache) {
      this.semiMaterialCache.forEach(colorMaterials => {
        colorMaterials.forEach(material => {
          if (material && material.dispose) {
            material.dispose();
          }
        });
      });
      this.semiMaterialCache.clear();
    }

    // Dispose sedan model and its materials
    if (this.sedanModel) {
      this.sedanModel.traverse(child => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
      this.sedanModel = null;
    }

    // Dispose semi model and its materials
    if (this.semiModel) {
      this.semiModel.traverse(child => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
      this.semiModel = null;
    }

    // Dispose shared geometries (they were created in constructor)
    if (this.sharedGeometry) {
      Object.values(this.sharedGeometry).forEach(geometry => {
        if (geometry && geometry.dispose) {
          geometry.dispose();
        }
      });
      this.sharedGeometry = null;
    }

    // Materials are managed by MaterialManager - don't dispose them here
    // They will be disposed when MaterialManager.dispose() is called

    // Clear references
    this.scene = null;
    this.highway = null;
    this.camera = null;
    this.vehicleMaterials = null;
    this.multiplayerManager = null;
    this.bloodTrackSystem = null;
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