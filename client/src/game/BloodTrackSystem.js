import * as THREE from 'three';
import { getMaterialManager } from '../utils/MaterialManager.js';

export class BloodTrackSystem {
  constructor(scene) {
    this.scene = scene;
    this.bloodStains = []; // Active bloodstains on the ground
    this.bloodTracks = []; // Active tire tracks

    // Use MaterialManager for materials
    this.materialManager = getMaterialManager();
    this.trackMaterial = this.materialManager.getParticleMaterial('blood');

    // Reusable geometry for all tracks
    this.trackGeometry = new THREE.PlaneGeometry(0.3, 1.0);

    // Pool of reusable track meshes
    this.trackPool = [];
    this.maxTracks = 100; // Limit total tracks to prevent memory issues
  }

  // Register a bloodstain from crash site
  addBloodStain(position, radius = 3) {
    const bloodStain = {
      position: position.clone(),
      radius: radius,
      age: 0,
      maxAge: 30 // Bloodstains last 30 seconds
    };
    this.bloodStains.push(bloodStain);
  }

  // Check if vehicle is driving through blood
  checkVehicleBloodContact(vehiclePosition, vehicleWidth = 2) {
    for (const bloodStain of this.bloodStains) {
      const distance = vehiclePosition.distanceTo(bloodStain.position);
      // Check if any part of vehicle width touches the bloodstain
      if (distance < bloodStain.radius + vehicleWidth / 2) {
        return bloodStain;
      }
    }
    return null;
  }

  // Create tire tracks when vehicle drives through blood
  createTireTracks(vehiclePosition, vehicleVelocity, vehicleWidth = 2) {
    // Create tracks for left and right tires
    const trackWidth = 0.3; // Width of each tire track
    const tireSpacing = vehicleWidth * 0.8; // Distance between left and right tires
    
    const leftTirePos = vehiclePosition.clone();
    leftTirePos.x -= tireSpacing / 2;
    
    const rightTirePos = vehiclePosition.clone();
    rightTirePos.x += tireSpacing / 2;

    // Create track segments
    this.createSingleTrack(leftTirePos, vehicleVelocity, trackWidth);
    this.createSingleTrack(rightTirePos, vehicleVelocity, trackWidth);
  }

  createSingleTrack(position, velocity, width) {
    // Create a small track segment
    const trackLength = 1.0; // Length of each track segment

    // Reuse track from pool or create new if needed
    let track;
    if (this.trackPool.length > 0) {
      // Reuse from pool
      track = this.trackPool.pop();
      track.visible = true;
    } else if (this.bloodTracks.length < this.maxTracks) {
      // Create new track with SHARED geometry and material
      track = new THREE.Mesh(this.trackGeometry, this.trackMaterial);
    } else {
      // At max capacity - reuse oldest track
      const oldestTrack = this.bloodTracks.shift();
      if (oldestTrack) {
        track = oldestTrack.mesh;
        // Don't dispose geometry - it's shared!
      } else {
        return; // Can't create track
      }
    }
    
    // Position track on ground
    track.position.copy(position);
    track.position.y = 0.02; // Slightly above ground to avoid z-fighting
    track.rotation.x = -Math.PI / 2; // Flat on ground
    
    // Align track with vehicle direction
    const direction = velocity.clone().normalize();
    const angle = Math.atan2(direction.x, direction.z);
    track.rotation.z = -angle;

    this.scene.add(track);

    const trackData = {
      mesh: track,
      // No individual geometry - using shared
      position: position.clone(),
      age: 0,
      maxAge: 15, // Tracks fade after 15 seconds
      fadeStartAge: 10 // Start fading at 10 seconds
    };

    this.bloodTracks.push(trackData);
  }

  // Update system - called every frame
  update(deltaTime) {
    // Update bloodstains
    for (let i = this.bloodStains.length - 1; i >= 0; i--) {
      const bloodStain = this.bloodStains[i];
      bloodStain.age += deltaTime;
      
      if (bloodStain.age > bloodStain.maxAge) {
        this.bloodStains.splice(i, 1);
      }
    }

    // Update tire tracks
    for (let i = this.bloodTracks.length - 1; i >= 0; i--) {
      const track = this.bloodTracks[i];
      track.age += deltaTime;
      
      if (track.age > track.maxAge) {
        // Remove expired track and return to pool
        this.scene.remove(track.mesh);
        track.mesh.visible = false;
        // Don't dispose geometry - it's shared!
        // Return mesh to pool for reuse
        this.trackPool.push(track.mesh);
        this.bloodTracks.splice(i, 1);
      } else if (track.age > track.fadeStartAge) {
        // Fade out track
        const fadeProgress = (track.age - track.fadeStartAge) / (track.maxAge - track.fadeStartAge);
        // Can't modify shared material opacity - use mesh opacity instead
        track.mesh.material.transparent = true;
        track.mesh.material.opacity = 0.7 * (1 - fadeProgress);
      }
    }
  }

  // Called when death animation creates bloodstains
  registerCrashSite(deathPosition) {
    // Add main bloodstain at crash site
    this.addBloodStain(deathPosition, 3.0);
    
    // Add smaller bloodstains around crash site for more coverage
    for (let i = 0; i < 3; i++) {
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        0,
        (Math.random() - 0.5) * 6
      );
      const secondaryPos = deathPosition.clone().add(offset);
      this.addBloodStain(secondaryPos, 1.5);
    }
  }

  // Clean up all resources
  dispose() {
    // Remove all tracks from scene
    for (const track of this.bloodTracks) {
      this.scene.remove(track.mesh);
      // Don't dispose geometry - it's shared!
    }

    // Remove pooled tracks from scene
    for (const track of this.trackPool) {
      this.scene.remove(track);
    }

    // Dispose shared geometry
    if (this.trackGeometry) {
      this.trackGeometry.dispose();
    }

    // Clear arrays
    this.bloodTracks = [];
    this.bloodStains = [];
    this.trackPool = [];

    // Material is managed by MaterialManager - don't dispose it here
  }
}