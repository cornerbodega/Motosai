import * as THREE from 'three';
import { ROAD_CONSTANTS } from './RoadConstants.js';
import { getMaterialManager } from '../utils/MaterialManager.js';

export class Highway101 {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.segmentLength = 200; // Doubled from 100 to 200 meters per segment
    this.numSegments = 15; // Further reduced for lower-end machines
    this.currentZ = 0;

    // MEMORY LEAK FIX: Dynamic segment limits based on speed
    this.BASE_SEGMENTS = 15;
    this.MAX_SEGMENTS = 50; // Hard limit to prevent crashes
    this.MIN_COVERAGE_DISTANCE = 1000; // Always cover at least 1km ahead
    this.segmentCleanupCounter = 0;
    this.lastPlayerSpeed = 0;

    // Highway parameters - using shared constants
    this.laneWidth = ROAD_CONSTANTS.LANE_WIDTH;
    this.numLanes = ROAD_CONSTANTS.NUM_LANES;
    this.shoulderWidth = ROAD_CONSTANTS.SHOULDER_WIDTH;
    this.totalWidth = ROAD_CONSTANTS.TOTAL_WIDTH;

    // Use centralized material manager
    this.materialManager = getMaterialManager();

    // Materials
    this.initMaterials();
    
    // Instanced meshes for trees
    this.initInstancedTrees();

    // Initialize shared geometries to prevent memory leaks
    this.initSharedGeometries();
  }

  initSharedGeometries() {
    // Create shared geometries that will be reused for all segments
    this.sharedRoadGeometries = {
      // Road surfaces
      road: new THREE.PlaneGeometry(this.totalWidth, this.segmentLength + 0.1),
      shoulder: new THREE.PlaneGeometry(this.shoulderWidth, this.segmentLength + 0.1),
      grass: new THREE.PlaneGeometry(50, this.segmentLength + 0.2),

      // Lane markings
      dash: new THREE.PlaneGeometry(0.15, 3), // lineWidth x dashLength
      edgeLine: new THREE.PlaneGeometry(0.3, this.segmentLength), // lineWidth * 2

      // Barriers
      barrier: new THREE.BoxGeometry(0.5, 1.2, this.segmentLength),
      strip: new THREE.BoxGeometry(0.1, 0.1, this.segmentLength),

      // Trees
      trunk: new THREE.CylinderGeometry(0.2, 0.3, 2, 4),
      foliage: new THREE.ConeGeometry(1.5, 3, 4),

      // Signs
      pole: new THREE.CylinderGeometry(0.05, 0.05, 2, 4),
      signSmall: new THREE.BoxGeometry(2, 1, 0.1),
      signSupport: new THREE.BoxGeometry(0.2, 3, 0.2),
      signLarge: new THREE.BoxGeometry(5, 2, 0.2)
    };
  }

  initMaterials() {
    // Use shared materials from MaterialManager
    this.asphaltMat = this.materialManager.getRoadMaterial('asphalt');
    this.whiteMat = this.materialManager.getRoadMaterial('whiteLine');
    this.yellowMat = this.materialManager.getMaterial('standard', { 
      color: 0xffcc00,
      roughness: 0.6,
      metalness: 0.1,
      emissive: 0xffcc00,
      emissiveIntensity: 0.05
    });

    // Shoulder - use MaterialManager
    this.shoulderMat = this.materialManager.getRoadMaterial('shoulder');

    // Grass - use MaterialManager
    this.grassMat = this.materialManager.getMaterial('standard', {
      color: 0x7cae3f,
      roughness: 1,
      metalness: 0
    });

    // Concrete barrier - use MaterialManager
    this.barrierMat = this.materialManager.getMaterial('standard', {
      color: 0x8a8a8a,
      roughness: 0.85,
      metalness: 0
    });

    // Create reusable materials for props (trees, signs, etc.)
    this.propMaterials = {
      trunk: this.materialManager.getMaterial('lambert', { color: 0x8B4513 }),
      foliage: this.materialManager.getMaterial('lambert', { color: 0x228B22 }),
      pole: this.materialManager.getMaterial('lambert', { color: 0x666666 }),
      sign: this.materialManager.getMaterial('lambert', { color: 0x006600 }),
      signLarge: this.materialManager.getMaterial('lambert', { color: 0x006633 }),
      support: this.materialManager.getMaterial('lambert', { color: 0x444444 }),
      stripReflective: this.materialManager.getMaterial('standard', {
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.2,
        metalness: 0.9,
        roughness: 0.1
      })
    };
  }
  
  initInstancedTrees() {
    // Simplified - we'll just use regular meshes for now
    // Instancing can be added back later for optimization
  }
  
  generate() {
    // Generate segments both ahead and behind starting position
    // Ensure we have enough segments for high-speed travel
    const halfSegments = Math.floor(this.numSegments / 2);
    for (let i = -halfSegments; i <= halfSegments; i++) {
      this.createSegment(i * this.segmentLength);
    }
    
    // Add a few extra segments ahead for safety
    for (let i = halfSegments + 1; i <= halfSegments + 5; i++) {
      this.createSegment(i * this.segmentLength);
    }
  }
  
  createSegment(zPosition) {
    const segment = new THREE.Group();
    segment.position.z = zPosition; // Position the whole group

    // Main road surface - use shared geometry
    const road = new THREE.Mesh(this.sharedRoadGeometries.road, this.asphaltMat);
    road.rotation.x = -Math.PI / 2;
    road.position.z = 0; // Local to group
    road.receiveShadow = true;
    segment.add(road);
    
    // Store LOD level
    segment.userData.lodLevel = 0;
    
    // Shoulders - use shared geometry
    const leftShoulder = new THREE.Mesh(this.sharedRoadGeometries.shoulder, this.shoulderMat);
    leftShoulder.rotation.x = -Math.PI / 2;
    leftShoulder.position.set(-this.totalWidth / 2 - this.shoulderWidth / 2, 0.01, 0);
    segment.add(leftShoulder);
    
    const rightShoulder = new THREE.Mesh(this.sharedRoadGeometries.shoulder, this.shoulderMat);
    rightShoulder.rotation.x = -Math.PI / 2;
    rightShoulder.position.set(this.totalWidth / 2 + this.shoulderWidth / 2, 0.01, 0);
    segment.add(rightShoulder);
    
    // Lane markings
    this.createLaneMarkings(segment, 0); // Now relative to group
    
    // Side environment
    this.createRoadside(segment, 0); // Now relative to group
    
    // Store segment with detail groups
    this.segments.push({
      group: segment,
      z: zPosition,
      detailGroups: {
        markings: [],
        roadside: [],
        trees: [],
        signs: []
      }
    });
    
    this.scene.add(segment);
  }
  
  createLaneMarkings(segment, zPosition) {
    const markingHeight = 0.02;
    const dashLength = 3;
    const dashGap = 9;
    const lineWidth = 0.15;
    
    // Get segment data
    const segmentData = this.segments.find(s => s.group === segment);
    
    // White dashed lanes for 3 lanes (2 dividers between lanes)
    // Lane 0 at x=-3.5, Lane 1 at x=0, Lane 2 at x=3.5
    // Dividers at x=-1.75 and x=1.75
    const lane0X = -this.laneWidth;
    const lane1X = 0;
    const lane2X = this.laneWidth;
    
    // Create individual dashed lines (not merged for simplicity and visibility)
    for (let divider = 0; divider < 2; divider++) {
      const xPos = divider === 0 ? (lane0X + lane1X) / 2 : (lane1X + lane2X) / 2;
      
      for (let i = 0; i < this.segmentLength; i += dashLength + dashGap) {
        const dash = new THREE.Mesh(this.sharedRoadGeometries.dash, this.whiteMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(xPos, markingHeight, -this.segmentLength / 2 + i + dashLength/2);
        dash.userData.isMarking = true;
        segment.add(dash);
        if (segmentData) segmentData.detailGroups.markings.push(dash);
      }
    }
    
    // Edge lines - use shared geometry
    const leftEdge = new THREE.Mesh(this.sharedRoadGeometries.edgeLine, this.whiteMat);
    leftEdge.rotation.x = -Math.PI / 2;
    leftEdge.position.set(-this.totalWidth / 2, markingHeight, 0);
    leftEdge.userData.isMarking = true;
    segment.add(leftEdge);
    if (segmentData) segmentData.detailGroups.markings.push(leftEdge);
    
    const rightEdge = new THREE.Mesh(this.sharedRoadGeometries.edgeLine, this.whiteMat);
    rightEdge.rotation.x = -Math.PI / 2;
    rightEdge.position.set(this.totalWidth / 2, markingHeight, 0);
    rightEdge.userData.isMarking = true;
    segment.add(rightEdge);
    if (segmentData) segmentData.detailGroups.markings.push(rightEdge);
  }
  
  createRoadside(segment, zPosition) {
    const segmentData = this.segments.find(s => s.group === segment);
    
    // Grass areas - use shared geometry
    const grassWidth = 50;
    const leftGrass = new THREE.Mesh(this.sharedRoadGeometries.grass, this.grassMat);
    leftGrass.rotation.x = -Math.PI / 2;
    leftGrass.position.set(-this.totalWidth / 2 - this.shoulderWidth - grassWidth / 2, -0.1, 0);
    leftGrass.receiveShadow = true;
    leftGrass.userData.isRoadside = true;
    segment.add(leftGrass);
    if (segmentData) segmentData.detailGroups.roadside.push(leftGrass);
    
    const rightGrass = new THREE.Mesh(this.sharedRoadGeometries.grass, this.grassMat);
    rightGrass.rotation.x = -Math.PI / 2;
    rightGrass.position.set(this.totalWidth / 2 + this.shoulderWidth + grassWidth / 2, -0.1, 0);
    rightGrass.receiveShadow = true;
    rightGrass.userData.isRoadside = true;
    segment.add(rightGrass);
    if (segmentData) segmentData.detailGroups.roadside.push(rightGrass);
    
    // GUARDRAILS - Much further out (beyond shoulder)
    const railingOffset = ROAD_CONSTANTS.TOTAL_WIDTH / 2 + ROAD_CONSTANTS.BARRIER_OFFSET; // Further out beyond shoulder

    // Left guardrail - use shared geometry
    const leftBarrier = new THREE.Mesh(this.sharedRoadGeometries.barrier, this.barrierMat);
    leftBarrier.position.set(-railingOffset, 0.6, 0);
    leftBarrier.castShadow = false; // No shadows for performance
    leftBarrier.userData.isBarrier = true;
    segment.add(leftBarrier);
    if (segmentData) segmentData.detailGroups.roadside.push(leftBarrier);
    
    // Right guardrail - use shared geometry
    const rightBarrier = new THREE.Mesh(this.sharedRoadGeometries.barrier, this.barrierMat);
    rightBarrier.position.set(railingOffset, 0.6, 0);
    rightBarrier.castShadow = false; // No shadows for performance
    rightBarrier.userData.isBarrier = true;
    segment.add(rightBarrier);
    if (segmentData) segmentData.detailGroups.roadside.push(rightBarrier);
    
    // Add reflective strips for visibility - WHITE like guardrails - use shared geometry
    const leftStrip = new THREE.Mesh(this.sharedRoadGeometries.strip, this.propMaterials.stripReflective);
    leftStrip.position.set(-railingOffset + 0.25, 0.9, 0);
    segment.add(leftStrip);

    const rightStrip = new THREE.Mesh(this.sharedRoadGeometries.strip, this.propMaterials.stripReflective);
    rightStrip.position.set(railingOffset - 0.25, 0.9, 0);
    segment.add(rightStrip);
    
    // Trees (low poly)
    this.addTrees(segment, 0);
    
    // Signs and landmarks
    this.addSignage(segment, 0);
  }
  
  addTrees(segment, zPosition) {
    const segmentData = this.segments.find(s => s.group === segment);
    const numTrees = Math.floor(Math.random() * 2) + 1; // Reduced for performance
    
    for (let i = 0; i < numTrees; i++) {
      const tree = this.createSimpleTree();
      
      // Random position alongside road
      const side = Math.random() > 0.5 ? 1 : -1;
      const xOffset = (this.totalWidth / 2 + this.shoulderWidth + 5 + Math.random() * 20) * side;
      const zOffset = (Math.random() - 0.5) * this.segmentLength;
      
      tree.position.set(xOffset, 0, zOffset);
      tree.scale.setScalar(0.8 + Math.random() * 0.4);
      tree.userData.isTree = true;
      
      segment.add(tree);
      if (segmentData) {
        if (!segmentData.detailGroups.trees) segmentData.detailGroups.trees = [];
        segmentData.detailGroups.trees.push(tree);
      }
    }
  }
  
  createSimpleTree() {
    const tree = new THREE.Group();

    // Simple trunk - use shared geometry and material
    const trunk = new THREE.Mesh(this.sharedRoadGeometries.trunk, this.propMaterials.trunk);
    trunk.position.y = 1;
    tree.add(trunk);

    // Simple foliage - use shared geometry and material
    const foliage = new THREE.Mesh(this.sharedRoadGeometries.foliage, this.propMaterials.foliage);
    foliage.position.y = 3;
    tree.add(foliage);
    
    return tree;
  }
  
  // Removed createLowPolyTree - now using instanced rendering
  
  addSignage(segment, zPosition) {
    const segmentData = this.segments.find(s => s.group === segment);
    
    // Randomly add distance markers
    if (Math.random() > 0.9) { // Reduced frequency from 0.8 to 0.9
      const sign = this.createDistanceSign(Math.floor(zPosition / 1609)); // meters to miles
      sign.position.set(this.totalWidth / 2 + this.shoulderWidth + 2, 0, 0);
      sign.userData.isSign = true;
      segment.add(sign);
      if (segmentData) segmentData.detailGroups.signs.push(sign);
    }
    
    // Exit signs
    if (Math.random() > 0.95) { // Reduced frequency from 0.9 to 0.95
      const exitSign = this.createExitSign();
      exitSign.position.set(-this.totalWidth / 2 - this.shoulderWidth - 3, 0, 0);
      exitSign.userData.isSign = true;
      segment.add(exitSign);
      if (segmentData) segmentData.detailGroups.signs.push(exitSign);
    }
  }
  
  createDistanceSign(miles) {
    const signGroup = new THREE.Group();

    // Pole - use shared geometry and material
    const pole = new THREE.Mesh(this.sharedRoadGeometries.pole, this.propMaterials.pole);
    pole.position.y = 1; // Lowered from 1.5 to 1
    signGroup.add(pole);

    // Sign board - use shared geometry and material
    const signBoard = new THREE.Mesh(this.sharedRoadGeometries.signSmall, this.propMaterials.sign);
    signBoard.position.y = 2; // Lowered from 3 to 2
    signGroup.add(signBoard);
    
    return signGroup;
  }
  
  createExitSign() {
    const signGroup = new THREE.Group();

    // Support structure - use shared geometry and material
    const support1 = new THREE.Mesh(this.sharedRoadGeometries.signSupport, this.propMaterials.support);
    support1.position.set(-2, 1.5, 0); // Lowered from 2 to 1.5
    signGroup.add(support1);

    const support2 = new THREE.Mesh(this.sharedRoadGeometries.signSupport, this.propMaterials.support);
    support2.position.set(2, 1.5, 0); // Lowered from 2 to 1.5
    signGroup.add(support2);

    // Sign - use shared geometry and material
    const sign = new THREE.Mesh(this.sharedRoadGeometries.signLarge, this.propMaterials.signLarge);
    sign.position.y = 2.5; // Lowered from 4 to 2.5
    signGroup.add(sign);
    
    return signGroup;
  }
  
  update(playerZ, playerSpeed) {
    // DYNAMIC SEGMENT MANAGEMENT FOR INFINITE SPEED
    this.lastPlayerSpeed = playerSpeed || 0;
    
    // Calculate needed coverage based on speed
    // At high speeds, we need more segments ahead
    const speedFactor = Math.max(1, this.lastPlayerSpeed / 50);
    const segmentsAhead = Math.min(Math.ceil(5 + speedFactor * 3), 20); // More segments at high speed
    const segmentsBehind = 3; // Keep minimal behind
    
    const aheadDistance = this.segmentLength * segmentsAhead;
    const behindDistance = this.segmentLength * segmentsBehind;
    
    // Dynamically adjust segment pool size based on speed
    const neededSegments = segmentsAhead + segmentsBehind;
    
    // Update the target number of segments based on need
    this.numSegments = Math.min(neededSegments, this.MAX_SEGMENTS);
    
    // Create segments if we need more
    if (this.segments.length < this.numSegments) {
      const segmentsToCreate = Math.min(this.numSegments - this.segments.length, 3);
      console.log(`Need ${segmentsToCreate} more segments for coverage at speed ${playerSpeed}`);
      
      // Create segments at needed positions
      for (let i = 0; i < segmentsToCreate; i++) {
        const newZ = playerZ + (aheadDistance - i * this.segmentLength);
        this.createSegment(newZ);
      }
    }
    
    // Update LOD for all segments based on distance and speed
    this.updateLOD(playerZ, playerSpeed);
    
    // First pass: identify segments that need repositioning
    const segmentsToMove = [];
    this.segments.forEach(segment => {
      const distanceFromPlayer = segment.z - playerZ;
      
      if (distanceFromPlayer < -behindDistance || distanceFromPlayer > aheadDistance) {
        segmentsToMove.push(segment);
      }
    });
    
    // Second pass: reposition segments to maintain coverage
    segmentsToMove.forEach(segment => {
      const distanceFromPlayer = segment.z - playerZ;
      
      if (distanceFromPlayer < -behindDistance) {
        // Move far behind segments to the front
        let maxZ = playerZ + aheadDistance - this.segmentLength;
        this.segments.forEach(s => {
          if (s.z > maxZ && !segmentsToMove.includes(s)) maxZ = s.z;
        });
        
        segment.z = maxZ + this.segmentLength;
        segment.group.position.z = segment.z;
        this.regenerateRoadside(segment);
      }
      else if (distanceFromPlayer > aheadDistance) {
        // Move far ahead segments to the back
        let minZ = playerZ - behindDistance + this.segmentLength;
        this.segments.forEach(s => {
          if (s.z < minZ && !segmentsToMove.includes(s)) minZ = s.z;
        });
        
        segment.z = minZ - this.segmentLength;
        segment.group.position.z = segment.z;
        this.regenerateRoadside(segment);
      }
    });
    
    // Ensure continuous coverage
    this.ensureContinuousCoverage(playerZ, aheadDistance, behindDistance);
  }
  
  updateLOD(playerZ, playerSpeed) {
    // Determine LOD distances based on speed
    const speedFactor = Math.min(playerSpeed / 100, 2); // Scale LOD with speed
    const lodDistances = {
      full: 100 + speedFactor * 50,    // Full detail up to 100-200m
      medium: 300 + speedFactor * 100, // Medium detail up to 300-500m
      low: 600 + speedFactor * 200     // Low detail up to 600-1000m
    };
    
    this.segments.forEach(segment => {
      const distance = Math.abs(segment.z - playerZ);
      let targetLOD = 0;
      
      if (distance > lodDistances.low) {
        targetLOD = 3; // Minimal detail
      } else if (distance > lodDistances.medium) {
        targetLOD = 2; // Low detail
      } else if (distance > lodDistances.full) {
        targetLOD = 1; // Medium detail
      } else {
        targetLOD = 0; // Full detail
      }
      
      // Only update if LOD changed
      if (segment.group.userData.lodLevel !== targetLOD) {
        segment.group.userData.lodLevel = targetLOD;
        this.applyLOD(segment, targetLOD);
      }
    });
  }
  
  applyLOD(segment, lodLevel) {
    // Hide/show detail groups based on LOD
    if (segment.detailGroups) {
      // Lane markings - hide at far distances
      segment.detailGroups.markings.forEach(obj => {
        obj.visible = lodLevel < 2;
      });
      
      // Trees are now handled via instanced mesh visibility
      // We could potentially update instance visibility here
      
      // Signs - hide at far distances
      segment.detailGroups.signs.forEach(obj => {
        obj.visible = lodLevel < 3;
      });
      
      // Roadside elements
      segment.detailGroups.roadside.forEach(obj => {
        obj.visible = lodLevel < 2;
      });
    }
  }
  
  ensureContinuousCoverage(playerZ, aheadDistance, behindDistance) {
    // MEMORY LEAK FIX: Clean up distant segments periodically
    this.segmentCleanupCounter++;
    if (this.segmentCleanupCounter % 60 === 0) { // Every 60 frames (once per second)
      this.cleanupDistantSegments(playerZ);
    }
    
    // MEMORY LEAK FIX: Emergency cleanup if too many segments
    if (this.segments.length > this.MAX_SEGMENTS) {
      console.warn(`Too many segments (${this.segments.length}), performing emergency cleanup`);
      this.emergencyCleanup(playerZ);
      // Don't return - still try to maintain coverage
    }
    
    // Calculate the range we need to cover
    const minZ = playerZ - behindDistance;
    const maxZ = playerZ + aheadDistance;
    
    // Find the starting segment position (aligned to segment grid)
    const startSegment = Math.floor(minZ / this.segmentLength) * this.segmentLength;
    const endSegment = Math.ceil(maxZ / this.segmentLength) * this.segmentLength;
    
    // Build list of all positions we need
    const requiredPositions = [];
    for (let z = startSegment; z <= endSegment; z += this.segmentLength) {
      requiredPositions.push(z);
    }
    
    // Check current segment positions
    const segmentsByZ = new Map();
    this.segments.forEach(s => {
      const alignedZ = Math.round(s.z / this.segmentLength) * this.segmentLength;
      segmentsByZ.set(alignedZ, s);
    });
    
    // Find and fill gaps
    requiredPositions.forEach(requiredZ => {
      if (!segmentsByZ.has(requiredZ)) {
        // Find a segment that's outside our view range
        const availableSegment = this.segments.find(s => {
          const alignedZ = Math.round(s.z / this.segmentLength) * this.segmentLength;
          return !requiredPositions.includes(alignedZ);
        });
        
        if (availableSegment) {
          // Move this segment to fill the gap
          availableSegment.z = requiredZ;
          availableSegment.group.position.z = requiredZ;
          this.regenerateRoadside(availableSegment);
        } else {
          // MEMORY LEAK FIX: Create new segment if we have room
          if (this.segments.length < this.numSegments) {
            // We have room, create a new segment
            console.log('Creating needed segment at', requiredZ);
            this.createSegment(requiredZ);
          } else {
            // Try to recycle the furthest segment
            let furthestDist = 0;
            let furthestSegment = null;
            
            this.segments.forEach(s => {
              if (!requiredPositions.includes(s.z)) {
                const dist = Math.abs(s.z - playerZ);
                if (dist > furthestDist) {
                  furthestDist = dist;
                  furthestSegment = s;
                }
              }
            });
            
            if (furthestSegment) {
              // Recycle the furthest segment
              furthestSegment.z = requiredZ;
              furthestSegment.group.position.z = requiredZ;
              this.regenerateRoadside(furthestSegment);
              // Successfully recycled segment
            } else {
              // Silently handle - no segments available to recycle
            }
          }
        }
      }
    });
  }
  
  regenerateRoadside(segment) {
    // Remove old trees and signs - DON'T dispose shared geometries
    const toRemove = [];
    segment.group.traverse(child => {
      if (child.userData.roadside || child.userData.isSign || child.userData.isTree) {
        toRemove.push(child);
      }
    });
    toRemove.forEach(child => {
      // DON'T dispose geometry - it's shared!
      // DON'T dispose materials - they're shared!
      segment.group.remove(child);
    });
    
    // Clear detail groups
    if (segment.detailGroups) {
      segment.detailGroups.trees = [];
      segment.detailGroups.signs = [];
    }
    
    // Add new ones
    this.addTrees(segment.group, 0);
    this.addSignage(segment.group, segment.z);
  }
  
  getLanePosition(lane) {
    // Returns x position for given lane (0-2 for 3 lanes)
    return ROAD_CONSTANTS.getLanePosition(lane);
  }
  
  getNearestLane(xPosition) {
    // Returns nearest lane number for given x position
    const lane = Math.round((xPosition / ROAD_CONSTANTS.LANE_WIDTH) + 1);
    return Math.max(0, Math.min(ROAD_CONSTANTS.NUM_LANES - 1, lane)); // Clamp to valid lane range
  }
  
  getLocationAtPosition(absoluteZ) {
    // Map absolute position to PCH locations
    // PCH is about 650 miles total, convert to meters
    const totalDistance = 650 * 1609.34; // miles to meters
    const progress = (absoluteZ % totalDistance) / totalDistance;
    
    // Start at Big Sur and go south along the coast
    // PCH runs from about lat 36.27 (Big Sur) to 32.7 (San Diego)
    const lat = 36.27 - progress * 3.5; // Go south as we progress
    const lng = -121.8 - progress * 1.5; // Slightly west as we go south
    
    // Location names based on progress
    let name = "Big Sur";
    if (progress < 0.1) {
      name = "Big Sur California Coast";
    } else if (progress < 0.2) {
      name = "Monterey Bay";
    } else if (progress < 0.3) {
      name = "Santa Cruz Coast";
    } else if (progress < 0.4) {
      name = "Half Moon Bay";
    } else if (progress < 0.5) {
      name = "San Francisco Bay";
    } else if (progress < 0.6) {
      name = "Marin Headlands";
    } else if (progress < 0.7) {
      name = "Point Reyes";
    } else if (progress < 0.8) {
      name = "Mendocino Coast";
    } else {
      name = "Redwood Coast";
    }
    
    return { lat, lng, name };
  }
  
  dispose() {
    // Remove all segments from scene
    this.segments.forEach(segment => {
      if (segment.group) {
        // Just remove from scene - don't dispose shared geometries
        this.scene.remove(segment.group);
      }
    });

    // Clear segments array
    this.segments = [];

    // Dispose all shared geometries
    if (this.sharedRoadGeometries) {
      Object.values(this.sharedRoadGeometries).forEach(geo => {
        if (geo && geo.dispose) {
          geo.dispose();
        }
      });
      this.sharedRoadGeometries = null;
    }

    // Clear prop materials reference (materials themselves managed by MaterialManager)
    this.propMaterials = null;

    // Materials are managed by MaterialManager - don't dispose them here
    // They will be disposed when MaterialManager.dispose() is called

    // Dispose of instanced tree meshes
    if (this.treeMesh) {
      this.treeMesh.geometry.dispose();
      this.treeMesh.material.dispose();
      this.scene.remove(this.treeMesh);
    }
    if (this.trunkMesh) {
      this.trunkMesh.geometry.dispose();
      this.trunkMesh.material.dispose();
      this.scene.remove(this.trunkMesh);
    }
  }
  
  // MEMORY LEAK FIX: Add cleanup methods
  cleanupDistantSegments(playerZ) {
    if (!this.segments || this.segments.length === 0) return;
    
    // Only cleanup if we have too many segments
    if (this.segments.length <= this.numSegments) {
      return; // Don't cleanup if we're at or below target
    }
    
    // Dynamic cleanup distance based on speed
    const speedFactor = Math.max(1, this.lastPlayerSpeed / 50);
    const maxDistance = Math.max(3000, 1500 * speedFactor); // More generous distance
    
    const removed = [];
    this.segments = this.segments.filter(segment => {
      const distance = Math.abs(segment.z - playerZ);
      if (distance > maxDistance && this.segments.length > this.numSegments) {
        removed.push(segment);
        return false;
      }
      return true;
    });
    
    // Properly dispose removed segments
    removed.forEach(segment => {
      this.disposeSegment(segment);
    });
    
    if (removed.length > 0) {
      console.log(`Cleaned up ${removed.length} distant segments`);
    }
  }
  
  reset() {
    // Clear all existing segments
    while (this.segments.length > 0) {
      const segment = this.segments.pop();
      this.disposeSegment(segment);
    }
    
    // Reset to initial state
    this.segments = [];
    this.currentZ = 0;
    this.numSegments = this.BASE_SEGMENTS;
    this.segmentCleanupCounter = 0;
    this.lastPlayerSpeed = 0;
    
    // Create initial segments around starting position
    const startZ = -this.segmentLength * 2; // Start a bit behind
    for (let i = 0; i < 5; i++) { // Create first 5 segments
      const z = startZ + i * this.segmentLength;
      this.createSegment(z);
    }
  }
  
  emergencyCleanup(playerZ) {
    if (!this.segments || this.segments.length === 0) return;
    
    // Sort by distance from player
    this.segments.sort((a, b) => {
      const distA = Math.abs(a.z - playerZ);
      const distB = Math.abs(b.z - playerZ);
      return distA - distB;
    });
    
    // Keep only closest segments
    const toKeep = this.segments.slice(0, this.numSegments);
    const toRemove = this.segments.slice(this.numSegments);
    
    // Dispose excess segments
    toRemove.forEach(segment => {
      this.disposeSegment(segment);
    });
    
    this.segments = toKeep;
    console.log(`Emergency cleanup: removed ${toRemove.length} segments`);
  }
  
  disposeSegment(segment) {
    if (!segment) return;

    // Remove from scene and dispose group
    if (segment.group) {
      // Traverse and remove all children
      const toDispose = [];
      segment.group.traverse(child => {
        if (child !== segment.group) {
          toDispose.push(child);
        }
      });

      toDispose.forEach(child => {
        // DON'T dispose geometry - it's all shared now!
        // DON'T dispose materials - they're shared!

        // Remove from parent
        if (child.parent) {
          child.parent.remove(child);
        }
      });

      // Remove group from scene
      if (segment.group.parent) {
        segment.group.parent.remove(segment.group);
      }
    }

    // Clear references
    segment.group = null;
    segment.detailGroups = null;
  }
}