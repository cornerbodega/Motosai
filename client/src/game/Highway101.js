import * as THREE from 'three';

export class Highway101 {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.segmentLength = 100; // meters per segment
    this.numSegments = 10;
    this.currentZ = 0;
    
    // Highway parameters
    this.laneWidth = 3.5; // meters
    this.numLanes = 4; // 2 each direction
    this.shoulderWidth = 2;
    this.totalWidth = this.laneWidth * this.numLanes + this.shoulderWidth * 2;
    
    // Materials
    this.createMaterials();
  }
  
  createMaterials() {
    // Asphalt
    this.asphaltMat = new THREE.MeshLambertMaterial({ 
      color: 0x333333,
      roughness: 0.8
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
  
  generate() {
    for (let i = 0; i < this.numSegments; i++) {
      this.createSegment(i * this.segmentLength);
    }
  }
  
  createSegment(zPosition) {
    const segment = new THREE.Group();
    
    // Main road surface
    const roadGeo = new THREE.PlaneGeometry(this.totalWidth, this.segmentLength);
    const road = new THREE.Mesh(roadGeo, this.asphaltMat);
    road.rotation.x = -Math.PI / 2;
    road.position.z = zPosition;
    road.receiveShadow = true;
    segment.add(road);
    
    // Shoulders
    const shoulderGeo = new THREE.PlaneGeometry(this.shoulderWidth, this.segmentLength);
    
    const leftShoulder = new THREE.Mesh(shoulderGeo, this.shoulderMat);
    leftShoulder.rotation.x = -Math.PI / 2;
    leftShoulder.position.set(-this.totalWidth / 2 - this.shoulderWidth / 2, 0.01, zPosition);
    segment.add(leftShoulder);
    
    const rightShoulder = new THREE.Mesh(shoulderGeo, this.shoulderMat);
    rightShoulder.rotation.x = -Math.PI / 2;
    rightShoulder.position.set(this.totalWidth / 2 + this.shoulderWidth / 2, 0.01, zPosition);
    segment.add(rightShoulder);
    
    // Lane markings
    this.createLaneMarkings(segment, zPosition);
    
    // Side environment
    this.createRoadside(segment, zPosition);
    
    // Store segment
    this.segments.push({
      group: segment,
      z: zPosition
    });
    
    this.scene.add(segment);
  }
  
  createLaneMarkings(segment, zPosition) {
    const markingHeight = 0.02;
    const dashLength = 3;
    const dashGap = 9;
    const lineWidth = 0.15;
    
    // Center divider (double yellow)
    for (let i = 0; i < this.segmentLength; i += 1) {
      const yellowLine1Geo = new THREE.PlaneGeometry(lineWidth, 1);
      const yellowLine1 = new THREE.Mesh(yellowLine1Geo, this.yellowMat);
      yellowLine1.rotation.x = -Math.PI / 2;
      yellowLine1.position.set(-lineWidth, markingHeight, zPosition - this.segmentLength / 2 + i);
      segment.add(yellowLine1);
      
      const yellowLine2 = new THREE.Mesh(yellowLine1Geo, this.yellowMat);
      yellowLine2.rotation.x = -Math.PI / 2;
      yellowLine2.position.set(lineWidth, markingHeight, zPosition - this.segmentLength / 2 + i);
      segment.add(yellowLine2);
    }
    
    // White dashed lanes
    for (let lane = -1; lane <= 1; lane++) {
      if (lane === 0) continue; // Skip center
      
      const xPos = lane * this.laneWidth * 1.5;
      
      for (let i = 0; i < this.segmentLength; i += dashLength + dashGap) {
        const dashGeo = new THREE.PlaneGeometry(lineWidth, dashLength);
        const dash = new THREE.Mesh(dashGeo, this.whiteMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(xPos, markingHeight, zPosition - this.segmentLength / 2 + i);
        segment.add(dash);
      }
    }
    
    // Edge lines
    const edgeLineGeo = new THREE.PlaneGeometry(lineWidth * 2, this.segmentLength);
    
    const leftEdge = new THREE.Mesh(edgeLineGeo, this.whiteMat);
    leftEdge.rotation.x = -Math.PI / 2;
    leftEdge.position.set(-this.totalWidth / 2, markingHeight, zPosition);
    segment.add(leftEdge);
    
    const rightEdge = new THREE.Mesh(edgeLineGeo, this.whiteMat);
    rightEdge.rotation.x = -Math.PI / 2;
    rightEdge.position.set(this.totalWidth / 2, markingHeight, zPosition);
    segment.add(rightEdge);
  }
  
  createRoadside(segment, zPosition) {
    // Grass areas
    const grassWidth = 50;
    const grassGeo = new THREE.PlaneGeometry(grassWidth, this.segmentLength);
    
    const leftGrass = new THREE.Mesh(grassGeo, this.grassMat);
    leftGrass.rotation.x = -Math.PI / 2;
    leftGrass.position.set(-this.totalWidth / 2 - this.shoulderWidth - grassWidth / 2, -0.1, zPosition);
    leftGrass.receiveShadow = true;
    segment.add(leftGrass);
    
    const rightGrass = new THREE.Mesh(grassGeo, this.grassMat);
    rightGrass.rotation.x = -Math.PI / 2;
    rightGrass.position.set(this.totalWidth / 2 + this.shoulderWidth + grassWidth / 2, -0.1, zPosition);
    rightGrass.receiveShadow = true;
    segment.add(rightGrass);
    
    // Concrete barriers (occasionally)
    if (Math.random() > 0.7) {
      const barrierGeo = new THREE.BoxGeometry(0.5, 1, this.segmentLength);
      
      const leftBarrier = new THREE.Mesh(barrierGeo, this.barrierMat);
      leftBarrier.position.set(-this.totalWidth / 2 - this.shoulderWidth - 0.25, 0.5, zPosition);
      leftBarrier.castShadow = true;
      segment.add(leftBarrier);
    }
    
    // Trees (low poly)
    this.addTrees(segment, zPosition);
    
    // Signs and landmarks
    this.addSignage(segment, zPosition);
  }
  
  addTrees(segment, zPosition) {
    const numTrees = Math.floor(Math.random() * 5) + 2;
    
    for (let i = 0; i < numTrees; i++) {
      const tree = this.createLowPolyTree();
      
      // Random position alongside road
      const side = Math.random() > 0.5 ? 1 : -1;
      const xOffset = (this.totalWidth / 2 + this.shoulderWidth + 5 + Math.random() * 20) * side;
      const zOffset = (Math.random() - 0.5) * this.segmentLength;
      
      tree.position.set(xOffset, 0, zPosition + zOffset);
      tree.scale.setScalar(0.8 + Math.random() * 0.4);
      
      segment.add(tree);
    }
  }
  
  createLowPolyTree() {
    const tree = new THREE.Group();
    
    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 3, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.5;
    trunk.castShadow = true;
    tree.add(trunk);
    
    // Foliage (simple cone)
    const foliageGeo = new THREE.ConeGeometry(2, 4, 6);
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.y = 4;
    foliage.castShadow = true;
    tree.add(foliage);
    
    return tree;
  }
  
  addSignage(segment, zPosition) {
    // Randomly add distance markers
    if (Math.random() > 0.8) {
      const sign = this.createDistanceSign(Math.floor(zPosition / 1609)); // meters to miles
      sign.position.set(this.totalWidth / 2 + this.shoulderWidth + 2, 2, zPosition);
      segment.add(sign);
    }
    
    // Exit signs
    if (Math.random() > 0.9) {
      const exitSign = this.createExitSign();
      exitSign.position.set(-this.totalWidth / 2 - this.shoulderWidth - 3, 4, zPosition);
      segment.add(exitSign);
    }
  }
  
  createDistanceSign(miles) {
    const signGroup = new THREE.Group();
    
    // Pole
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 3, 4);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.5;
    signGroup.add(pole);
    
    // Sign board
    const signGeo = new THREE.BoxGeometry(2, 1, 0.1);
    const signMat = new THREE.MeshLambertMaterial({ color: 0x006600 });
    const signBoard = new THREE.Mesh(signGeo, signMat);
    signBoard.position.y = 3;
    signGroup.add(signBoard);
    
    return signGroup;
  }
  
  createExitSign() {
    const signGroup = new THREE.Group();
    
    // Support structure
    const supportGeo = new THREE.BoxGeometry(0.2, 4, 0.2);
    const supportMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    
    const support1 = new THREE.Mesh(supportGeo, supportMat);
    support1.position.set(-2, 2, 0);
    signGroup.add(support1);
    
    const support2 = new THREE.Mesh(supportGeo, supportMat);
    support2.position.set(2, 2, 0);
    signGroup.add(support2);
    
    // Sign
    const signGeo = new THREE.BoxGeometry(5, 2, 0.2);
    const signMat = new THREE.MeshLambertMaterial({ color: 0x006633 });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.y = 4;
    signGroup.add(sign);
    
    return signGroup;
  }
  
  update(playerZ) {
    // Infinite scrolling - move segments as player progresses
    const forwardLimit = playerZ + this.segmentLength * this.numSegments / 2;
    const backwardLimit = playerZ - this.segmentLength * this.numSegments / 2;
    
    this.segments.forEach(segment => {
      // Move segments that are too far behind to the front
      if (segment.z < backwardLimit) {
        segment.z += this.segmentLength * this.numSegments;
        segment.group.position.z = segment.z;
        
        // Regenerate roadside elements for variety
        // Remove old trees and signs
        const toRemove = [];
        segment.group.traverse(child => {
          if (child.userData.roadside) {
            toRemove.push(child);
          }
        });
        toRemove.forEach(child => segment.group.remove(child));
        
        // Add new ones
        this.addTrees(segment.group, segment.z);
        this.addSignage(segment.group, segment.z);
      }
    });
  }
  
  getLanePosition(lane) {
    // Returns x position for given lane (0-3)
    const laneOffset = (lane - 1.5) * this.laneWidth;
    return laneOffset;
  }
  
  getNearestLane(xPosition) {
    // Returns nearest lane number for given x position
    const lane = Math.round((xPosition / this.laneWidth) + 1.5);
    return Math.max(0, Math.min(3, lane));
  }
}