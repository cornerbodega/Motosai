import * as THREE from 'three';
import { getMaterialManager } from '../utils/MaterialManager.js';

export class BloodTrackSystem {
  constructor(scene, debugMode = false) {
    this.scene = scene;
    this.bloodStains = []; // Active bloodstains on the ground
    this.bloodTracks = []; // Active tire tracks
    this.vehicleBloodStatus = new Map(); // Track which vehicles are creating blood trails
    this.debugMode = debugMode;
    this.debugMarkers = []; // Visual markers for blood pools in debug mode

    // Use MaterialManager for materials
    this.materialManager = getMaterialManager();
    this.trackMaterial = this.materialManager.getParticleMaterial('blood');

    // Reusable geometry for all tracks - bigger and more visible
    this.trackGeometry = new THREE.PlaneGeometry(0.8, 2.0);

    // Pool of reusable track meshes
    this.trackPool = [];
    this.maxTracks = 500; // More tracks for longer trails
    this.trackSpacing = 0.3; // Smaller spacing for continuous trails
  }

  // Register a bloodstain from crash site
  addBloodStain(position, radius = 3) {
    const bloodStain = {
      position: position.clone(),
      radius: radius,
      age: 0,
      maxAge: 60 // Bloodstains last 60 seconds for more chances to drive through them
    };
    this.bloodStains.push(bloodStain);

    // Add debug visualization if enabled
    if (this.debugMode) {
      const debugGeometry = new THREE.RingGeometry(radius * 0.9, radius, 32);
      const debugMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
      });
      const debugMesh = new THREE.Mesh(debugGeometry, debugMaterial);
      debugMesh.position.copy(position);
      debugMesh.position.y = 0.1;
      debugMesh.rotation.x = -Math.PI / 2;
      this.scene.add(debugMesh);
      this.debugMarkers.push({ mesh: debugMesh, stain: bloodStain });
    }
  }

  // Check if vehicle is driving through blood
  checkVehicleBloodContact(vehiclePosition, vehicleWidth = 2) {
    // Only check Y-aligned positions (ignore height differences)
    const vehiclePos2D = new THREE.Vector2(vehiclePosition.x, vehiclePosition.z);

    for (const bloodStain of this.bloodStains) {
      const stainPos2D = new THREE.Vector2(bloodStain.position.x, bloodStain.position.z);
      const distance = vehiclePos2D.distanceTo(stainPos2D);

      // More precise check - vehicle must actually overlap with blood
      // Make detection even more precise to avoid cross-lane contamination
      const effectiveRadius = bloodStain.radius * 0.6; // Much smaller for precise detection
      if (distance < effectiveRadius + vehicleWidth / 2) {
        console.log(`🩸 Vehicle at ${vehiclePosition.x.toFixed(1)}, ${vehiclePosition.z.toFixed(1)} hit blood at ${bloodStain.position.x.toFixed(1)}, ${bloodStain.position.z.toFixed(1)} (distance: ${distance.toFixed(2)})`);
        return bloodStain;
      }
    }
    return null;
  }

  // Register vehicle as creating blood trails
  startVehicleBloodTrail(vehicleId, bloodStain) {
    if (!this.vehicleBloodStatus.has(vehicleId)) {
      console.log(`🚗🩸 Vehicle ${vehicleId} started blood trail from stain at:`, bloodStain.position);
      this.vehicleBloodStatus.set(vehicleId, {
        lastTrackPosition: null,
        bloodIntensity: 1.0, // Starts strong, fades over distance
        totalDistance: 0,
        maxTrailDistance: 100, // Blood trails last for 100 meters
        sourceStain: bloodStain
      });
    }
  }

  // Update blood trail for vehicle
  updateVehicleBloodTrail(vehicle) {
    const status = this.vehicleBloodStatus.get(vehicle.id);
    if (!status) return false;

    // Check if the source blood stain still exists
    if (!this.bloodStains.includes(status.sourceStain)) {
      console.log(`Vehicle ${vehicle.id} blood trail ended - source stain removed`);
      this.vehicleBloodStatus.delete(vehicle.id);
      return false;
    }

    // Check if vehicle moved enough to create new track segment
    if (status.lastTrackPosition) {
      const distance = vehicle.position.distanceTo(status.lastTrackPosition);

      // Only create tracks if moved enough
      if (distance < this.trackSpacing) {
        return true; // Still trailing but no new track needed
      }

      // Create intermediate tracks if moved a lot at once
      const numIntermediateTracks = Math.floor(distance / this.trackSpacing);
      if (numIntermediateTracks > 1) {
        const direction = new THREE.Vector3().subVectors(vehicle.position, status.lastTrackPosition).normalize();
        for (let i = 1; i < numIntermediateTracks; i++) {
          const intermediatePos = status.lastTrackPosition.clone().add(
            direction.clone().multiplyScalar(i * this.trackSpacing)
          );
          this.createTireTracks(intermediatePos, vehicle.velocity, vehicle.width, status.bloodIntensity);
        }
      }

      status.totalDistance += distance;
    }

    // Check if blood trail should end
    if (status.totalDistance > status.maxTrailDistance) {
      console.log(`Vehicle ${vehicle.id} blood trail ended - max distance reached`);
      this.vehicleBloodStatus.delete(vehicle.id);
      return false;
    }

    // Calculate fade based on distance from source
    status.bloodIntensity = Math.max(0, 1.0 - (status.totalDistance / status.maxTrailDistance));

    // Create new track segment
    if (status.bloodIntensity > 0.1) {
      this.createTireTracks(vehicle.position, vehicle.velocity, vehicle.width, status.bloodIntensity);
      status.lastTrackPosition = vehicle.position.clone();
    }

    return true;
  }

  // Create tire tracks when vehicle drives through blood
  createTireTracks(vehiclePosition, vehicleVelocity, vehicleWidth = 2, intensity = 1.0) {
    // Create tracks for left and right tires
    const trackWidth = 0.3; // Width of each tire track
    const tireSpacing = vehicleWidth * 0.8; // Distance between left and right tires

    const leftTirePos = vehiclePosition.clone();
    leftTirePos.x -= tireSpacing / 2;

    const rightTirePos = vehiclePosition.clone();
    rightTirePos.x += tireSpacing / 2;

    // Create track segments with intensity
    this.createSingleTrack(leftTirePos, vehicleVelocity, trackWidth, intensity);
    this.createSingleTrack(rightTirePos, vehicleVelocity, trackWidth, intensity);
  }

  createSingleTrack(position, velocity, width, intensity = 1.0) {
    // Create a small track segment
    const trackLength = 1.0; // Length of each track segment

    // Reuse track from pool or create new if needed
    let track;
    if (this.trackPool.length > 0) {
      // Reuse from pool
      track = this.trackPool.pop();
      track.visible = true;
    } else if (this.bloodTracks.length < this.maxTracks) {
      // Create new track with SHARED geometry and material (clone for individual opacity)
      track = new THREE.Mesh(this.trackGeometry, this.trackMaterial.clone());
      track.material.transparent = true;
    } else {
      // At max capacity - reuse oldest track
      const oldestTrack = this.bloodTracks.shift();
      if (oldestTrack) {
        track = oldestTrack.mesh;
        // Reset material properties
        track.material.opacity = 0.7 * intensity;
      } else {
        return; // Can't create track
      }
    }

    // Set initial opacity based on intensity - make it more visible
    track.material.opacity = Math.max(0.4, 0.9 * intensity);

    // Position track on ground
    track.position.copy(position);
    track.position.y = 0.05; // Higher above ground for better visibility
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
      maxAge: 30, // Tracks last much longer
      fadeStartAge: 20, // Start fading much later
      initialIntensity: intensity
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
        console.log('Blood stain expired at position:', bloodStain.position);
        this.bloodStains.splice(i, 1);

        // Remove debug marker if exists
        if (this.debugMode) {
          const markerIndex = this.debugMarkers.findIndex(m => m.stain === bloodStain);
          if (markerIndex >= 0) {
            const marker = this.debugMarkers[markerIndex];
            this.scene.remove(marker.mesh);
            marker.mesh.geometry.dispose();
            marker.mesh.material.dispose();
            this.debugMarkers.splice(markerIndex, 1);
          }
        }
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
        // Modify individual material opacity (each track has its own material clone)
        const baseOpacity = 0.7 * (track.initialIntensity || 1.0);
        track.mesh.material.opacity = baseOpacity * (1 - fadeProgress);
      }
    }
  }

  // Called when death animation creates bloodstains
  registerCrashSite(deathPosition) {
    console.log('🩸 Registering crash site blood at:', deathPosition);

    // Add main bloodstain at crash site - size it to fit within one lane
    // Lane width is 4.5m, so radius of 2.0m keeps blood in single lane
    this.addBloodStain(deathPosition, 2.0);

    // Add smaller bloodstains around crash site - keep them tight and in same lane
    for (let i = 0; i < 2; i++) {
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 2.0, // Much tighter spread (2m max)
        0,
        (Math.random() - 0.5) * 3.0  // Forward/back spread
      );
      const secondaryPos = deathPosition.clone().add(offset);
      this.addBloodStain(secondaryPos, 1.0); // Smaller secondary stains
    }

    console.log(`Blood stains registered: ${this.bloodStains.length} active stains`);
  }

  // Clear all blood-related data - called on respawn
  clearAllBloodData() {
    console.log('🧹 Clearing all blood data for respawn');

    // Remove all blood stains
    for (const bloodStain of this.bloodStains) {
      // Remove debug marker if exists
      if (this.debugMode) {
        const markerIndex = this.debugMarkers.findIndex(m => m.stain === bloodStain);
        if (markerIndex >= 0) {
          const marker = this.debugMarkers[markerIndex];
          this.scene.remove(marker.mesh);
          marker.mesh.geometry.dispose();
          marker.mesh.material.dispose();
          this.debugMarkers.splice(markerIndex, 1);
        }
      }
    }
    this.bloodStains = [];

    // Clear all active vehicle blood trails
    console.log(`Clearing ${this.vehicleBloodStatus.size} active vehicle blood trails`);
    this.vehicleBloodStatus.clear();

    // Remove all blood tracks from scene
    for (const track of this.bloodTracks) {
      this.scene.remove(track.mesh);
      if (track.mesh.material && track.mesh.material !== this.trackMaterial) {
        track.mesh.material.dispose();
      }
    }
    this.bloodTracks = [];

    // Reset track pool
    for (const track of this.trackPool) {
      this.scene.remove(track);
      if (track.material && track.material !== this.trackMaterial) {
        track.material.dispose();
      }
    }
    this.trackPool = [];

    console.log('Blood data cleared');
  }

  // Clear blood trail for specific vehicle (called when vehicle is removed)
  clearVehicleBloodTrail(vehicleId) {
    if (this.vehicleBloodStatus.has(vehicleId)) {
      console.log(`Clearing blood trail for vehicle ${vehicleId}`);
      this.vehicleBloodStatus.delete(vehicleId);
    }
  }

  // Clean up all resources
  dispose() {
    // Remove all tracks from scene and dispose individual material clones
    for (const track of this.bloodTracks) {
      this.scene.remove(track.mesh);
      // Dispose the cloned material
      if (track.mesh.material && track.mesh.material !== this.trackMaterial) {
        track.mesh.material.dispose();
      }
    }

    // Remove pooled tracks from scene and dispose their materials
    for (const track of this.trackPool) {
      this.scene.remove(track);
      if (track.material && track.material !== this.trackMaterial) {
        track.material.dispose();
      }
    }

    // Dispose shared geometry
    if (this.trackGeometry) {
      this.trackGeometry.dispose();
    }

    // Remove debug markers
    for (const marker of this.debugMarkers) {
      this.scene.remove(marker.mesh);
      marker.mesh.geometry.dispose();
      marker.mesh.material.dispose();
    }

    // Clear maps and arrays
    this.vehicleBloodStatus.clear();
    this.bloodTracks = [];
    this.bloodStains = [];
    this.trackPool = [];
    this.debugMarkers = [];

    // Material is managed by MaterialManager - don't dispose the original
  }
}