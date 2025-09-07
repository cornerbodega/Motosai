import * as THREE from 'three';

export class Highway101 {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.segmentLength = 200; // Doubled from 100 to 200 meters per segment
    this.numSegments = 20; // Reduced to prevent memory issues
    this.currentZ = 0;
    
    // Highway parameters
    this.laneWidth = 4.5; // meters - wider lanes for easier driving
    this.numLanes = 3; // 3 lanes all same direction
    this.shoulderWidth = 2.5; // Slightly wider shoulders too
    this.totalWidth = this.laneWidth * this.numLanes + this.shoulderWidth * 2;
    
    // Materials
    this.createMaterials();
    
    // Instanced meshes for trees
    this.initInstancedTrees();
  }
  
  createMaterials() {
    // Asphalt
    this.asphaltMat = new THREE.MeshLambertMaterial({ 
      color: 0x333333
    });
    
    // Lane markings
    this.whiteMat = new THREE.MeshBasicMaterial({ 
      color: 0xffffff 
    });
    
    this.yellowMat = new THREE.MeshBasicMaterial({ 
      color: 0xffcc00 
    });
    
    // Shoulder
    this.shoulderMat = new THREE.MeshLambertMaterial({ 
      color: 0x555555 
    });
    
    // Grass
    this.grassMat = new THREE.MeshLambertMaterial({ 
      color: 0x7cae3f 
    });
    
    // Concrete barrier
    this.barrierMat = new THREE.MeshLambertMaterial({ 
      color: 0x999999 
    });
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
    
    // Main road surface - slightly overlap to prevent gaps
    const roadGeo = new THREE.PlaneGeometry(this.totalWidth, this.segmentLength + 0.1);
    const road = new THREE.Mesh(roadGeo, this.asphaltMat);
    road.rotation.x = -Math.PI / 2;
    road.position.z = 0; // Local to group
    road.receiveShadow = true;
    segment.add(road);
    
    // Store LOD level
    segment.userData.lodLevel = 0;
    
    // Shoulders - slightly overlap
    const shoulderGeo = new THREE.PlaneGeometry(this.shoulderWidth, this.segmentLength + 0.1);
    
    const leftShoulder = new THREE.Mesh(shoulderGeo, this.shoulderMat);
    leftShoulder.rotation.x = -Math.PI / 2;
    leftShoulder.position.set(-this.totalWidth / 2 - this.shoulderWidth / 2, 0.01, 0);
    segment.add(leftShoulder);
    
    const rightShoulder = new THREE.Mesh(shoulderGeo, this.shoulderMat);
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
        const dashGeo = new THREE.PlaneGeometry(lineWidth, dashLength);
        const dash = new THREE.Mesh(dashGeo, this.whiteMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(xPos, markingHeight, -this.segmentLength / 2 + i + dashLength/2);
        dash.userData.isMarking = true;
        segment.add(dash);
        if (segmentData) segmentData.detailGroups.markings.push(dash);
      }
    }
    
    // Edge lines
    const edgeLineGeo = new THREE.PlaneGeometry(lineWidth * 2, this.segmentLength);
    
    const leftEdge = new THREE.Mesh(edgeLineGeo, this.whiteMat);
    leftEdge.rotation.x = -Math.PI / 2;
    leftEdge.position.set(-this.totalWidth / 2, markingHeight, 0);
    leftEdge.userData.isMarking = true;
    segment.add(leftEdge);
    if (segmentData) segmentData.detailGroups.markings.push(leftEdge);
    
    const rightEdge = new THREE.Mesh(edgeLineGeo, this.whiteMat);
    rightEdge.rotation.x = -Math.PI / 2;
    rightEdge.position.set(this.totalWidth / 2, markingHeight, 0);
    rightEdge.userData.isMarking = true;
    segment.add(rightEdge);
    if (segmentData) segmentData.detailGroups.markings.push(rightEdge);
  }
  
  createRoadside(segment, zPosition) {
    const segmentData = this.segments.find(s => s.group === segment);
    
    // Grass areas - overlap to prevent gaps
    const grassWidth = 50;
    const grassGeo = new THREE.PlaneGeometry(grassWidth, this.segmentLength + 0.2);
    
    const leftGrass = new THREE.Mesh(grassGeo, this.grassMat);
    leftGrass.rotation.x = -Math.PI / 2;
    leftGrass.position.set(-this.totalWidth / 2 - this.shoulderWidth - grassWidth / 2, -0.1, 0);
    leftGrass.receiveShadow = true;
    leftGrass.userData.isRoadside = true;
    segment.add(leftGrass);
    if (segmentData) segmentData.detailGroups.roadside.push(leftGrass);
    
    const rightGrass = new THREE.Mesh(grassGeo, this.grassMat);
    rightGrass.rotation.x = -Math.PI / 2;
    rightGrass.position.set(this.totalWidth / 2 + this.shoulderWidth + grassWidth / 2, -0.1, 0);
    rightGrass.receiveShadow = true;
    rightGrass.userData.isRoadside = true;
    segment.add(rightGrass);
    if (segmentData) segmentData.detailGroups.roadside.push(rightGrass);
    
    // Concrete barriers (occasionally)
    if (Math.random() > 0.85) { // Reduced frequency from 0.7 to 0.85
      const barrierGeo = new THREE.BoxGeometry(0.5, 1, this.segmentLength);
      
      const leftBarrier = new THREE.Mesh(barrierGeo, this.barrierMat);
      leftBarrier.position.set(-this.totalWidth / 2 - this.shoulderWidth - 0.25, 0.5, 0);
      leftBarrier.castShadow = true;
      leftBarrier.userData.isRoadside = true;
      segment.add(leftBarrier);
      if (segmentData) segmentData.detailGroups.roadside.push(leftBarrier);
    }
    
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
    
    // Simple trunk
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2, 4);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1;
    tree.add(trunk);
    
    // Simple foliage
    const foliageGeo = new THREE.ConeGeometry(1.5, 3, 4);
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
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
    
    // Pole
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2, 4); // Reduced from 3 to 2
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1; // Lowered from 1.5 to 1
    signGroup.add(pole);
    
    // Sign board
    const signGeo = new THREE.BoxGeometry(2, 1, 0.1);
    const signMat = new THREE.MeshLambertMaterial({ color: 0x006600 });
    const signBoard = new THREE.Mesh(signGeo, signMat);
    signBoard.position.y = 2; // Lowered from 3 to 2
    signGroup.add(signBoard);
    
    return signGroup;
  }
  
  createExitSign() {
    const signGroup = new THREE.Group();
    
    // Support structure
    const supportGeo = new THREE.BoxGeometry(0.2, 3, 0.2); // Reduced from 4 to 3
    const supportMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    
    const support1 = new THREE.Mesh(supportGeo, supportMat);
    support1.position.set(-2, 1.5, 0); // Lowered from 2 to 1.5
    signGroup.add(support1);
    
    const support2 = new THREE.Mesh(supportGeo, supportMat);
    support2.position.set(2, 1.5, 0); // Lowered from 2 to 1.5
    signGroup.add(support2);
    
    // Sign
    const signGeo = new THREE.BoxGeometry(5, 2, 0.2);
    const signMat = new THREE.MeshLambertMaterial({ color: 0x006633 });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.y = 2.5; // Lowered from 4 to 2.5
    signGroup.add(sign);
    
    return signGroup;
  }
  
  update(playerZ, playerSpeed) {
    // Infinite scrolling - move segments as player progresses
    // Keep visibility limited to prevent performance issues
    const speedFactor = Math.max(1, Math.min(2, (playerSpeed || 0) / 50)); // Cap speed factor
    const aheadDistance = this.segmentLength * Math.min(8, 5 + speedFactor * 2); // Max 8 segments ahead
    const behindDistance = this.segmentLength * 2; // Keep minimal behind
    
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
          // This shouldn't happen, but create emergency segment if needed
          console.warn('Creating emergency segment at', requiredZ);
          this.createSegment(requiredZ);
        }
      }
    });
  }
  
  regenerateRoadside(segment) {
    // Remove old trees and signs - properly dispose of geometries
    const toRemove = [];
    segment.group.traverse(child => {
      if (child.userData.roadside || child.userData.isSign || child.userData.isTree) {
        toRemove.push(child);
      }
    });
    toRemove.forEach(child => {
      // Dispose of geometry for non-shared objects
      if (child.geometry) {
        child.geometry.dispose();
      }
      // Don't dispose materials as they're shared
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
    const laneOffset = (lane - 1) * this.laneWidth; // Lane 0 is left, 1 is center, 2 is right
    return laneOffset;
  }
  
  getNearestLane(xPosition) {
    // Returns nearest lane number for given x position
    const lane = Math.round((xPosition / this.laneWidth) + 1);
    return Math.max(0, Math.min(2, lane)); // Clamp to 0-2 for 3 lanes
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
        segment.group.traverse((object) => {
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
        this.scene.remove(segment.group);
      }
    });
    
    // Clear segments array
    this.segments = [];
    
    // Dispose of materials
    if (this.asphaltMat) this.asphaltMat.dispose();
    if (this.whiteMat) this.whiteMat.dispose();
    if (this.yellowMat) this.yellowMat.dispose();
    if (this.shoulderMat) this.shoulderMat.dispose();
    if (this.grassMat) this.grassMat.dispose();
    if (this.barrierMat) this.barrierMat.dispose();
    if (this.rockMat) this.rockMat.dispose();
    if (this.guardrailMat) this.guardrailMat.dispose();
    
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
}