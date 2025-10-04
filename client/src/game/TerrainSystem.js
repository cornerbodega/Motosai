import * as THREE from 'three';
import { ROAD_CONSTANTS } from './RoadConstants.js';
import { getMaterialManager } from '../utils/MaterialManager.js';

export class TerrainSystem {
  constructor(scene) {
    this.scene = scene;
    this.materialManager = getMaterialManager();

    // Dual terrain meshes for seamless transition
    this.terrainMeshes = [null, null];
    this.activeTerrainIndex = 0;
    this.terrainWidth = 3000; // Very wide terrain on each side
    this.terrainDepth = 4000; // Deep terrain coverage
    this.resolution = 80; // Vertices per dimension (reduced for performance)
    this.lastPlayerZ = 0;
    this.lastUpdateZ = 0;

    // LOD and update parameters
    this.updateDistance = 1500; // Update when player moves 1.5km
    this.lodDistance = 1000; // Start preparing new terrain at this distance

    // Terrain generation parameters
    this.heightScale = 80; // Maximum mountain height
    this.noiseScale = 0.005; // Terrain noise frequency
    this.roadClearance = 100; // How far from road center to keep flat

    this.initMaterials();
  }

  initMaterials() {
    // Death Valley desert terrain material
    this.terrainMaterial = this.materialManager.getMaterial('lambert', {
      color: 0xD2B48C, // Sandy tan base color
      flatShading: true // Low-poly look
    });

    // Mountain material with slight color variation
    this.mountainMaterial = this.materialManager.getMaterial('lambert', {
      color: 0x8B7355, // Darker brown for mountains
      flatShading: true
    });
  }

  // Simple noise function for terrain generation
  noise2D(x, z, seed = 0) {
    const n = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453;
    return n - Math.floor(n);
  }

  // Fractal noise for more natural terrain
  fbm(x, z, octaves = 4) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.noise2D(x * frequency, z * frequency, i) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  }

  // Generate height at a given position
  getTerrainHeight(x, z) {
    // Distance from road center
    const distFromRoad = Math.abs(x);

    // Keep area near road flat
    if (distFromRoad < this.roadClearance) {
      return -0.5; // Slightly below road level
    }

    // Smooth transition from flat to mountainous
    const transitionZone = 100;
    const transitionFactor = Math.min(1, (distFromRoad - this.roadClearance) / transitionZone);

    // Generate terrain using fractal noise
    const baseHeight = this.fbm(x * this.noiseScale, z * this.noiseScale);

    // Add some ridges parallel to the road
    const ridgeNoise = Math.sin(x * 0.003) * 0.3;

    // Combine noises
    const height = (baseHeight + ridgeNoise) * this.heightScale * transitionFactor;

    return height;
  }

  generate() {
    // Create two terrain meshes for seamless transitions
    // Position them to cover behind and ahead of starting position
    const startPositions = [-this.terrainDepth, 0];

    for (let i = 0; i < 2; i++) {
      const geometry = new THREE.PlaneGeometry(
        this.terrainWidth,
        this.terrainDepth,
        this.resolution,
        this.resolution
      );

      const posZ = startPositions[i];

      // Initial terrain generation
      this.updateTerrainVertices(geometry, posZ);

      // Create mesh
      const mesh = new THREE.Mesh(geometry, this.terrainMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -0.6; // Slightly below road
      mesh.position.z = posZ;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // Don't cull terrain

      this.terrainMeshes[i] = mesh;
      this.scene.add(mesh);
    }

    this.lastUpdateZ = 0;
  }

  updateTerrainVertices(geometry, centerZ) {
    const vertices = geometry.attributes.position.array;
    const halfDepth = this.terrainDepth / 2;

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const localZ = vertices[i + 1]; // In plane geometry, this is the z offset
      const worldZ = centerZ + localZ;

      // Calculate height for this vertex
      const height = this.getTerrainHeight(x, worldZ);
      vertices[i + 2] = height; // Set y height
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  update(playerZ) {
    if (!this.terrainMeshes[0] || !this.terrainMeshes[1]) return;

    // Always keep terrain meshes visible and positioned correctly
    const mesh0Z = this.terrainMeshes[0].position.z;
    const mesh1Z = this.terrainMeshes[1].position.z;

    // Calculate distances from player
    const dist0 = mesh0Z - playerZ;
    const dist1 = mesh1Z - playerZ;

    const halfDepth = this.terrainDepth / 2;

    // If mesh 0 is too far behind (player passed it), move it ahead
    if (dist0 < -this.terrainDepth) {
      const newZ = mesh1Z + this.terrainDepth;
      this.terrainMeshes[0].position.z = newZ;
      this.updateTerrainVertices(this.terrainMeshes[0].geometry, newZ);
      console.log(`Moved terrain 0 from ${mesh0Z} to ${newZ} (player at ${playerZ})`);
    }

    // If mesh 1 is too far behind (player passed it), move it ahead
    if (dist1 < -this.terrainDepth) {
      const newZ = mesh0Z + this.terrainDepth;
      this.terrainMeshes[1].position.z = newZ;
      this.updateTerrainVertices(this.terrainMeshes[1].geometry, newZ);
      console.log(`Moved terrain 1 from ${mesh1Z} to ${newZ} (player at ${playerZ})`);
    }

    // Handle backward movement
    if (dist0 > this.terrainDepth * 2) {
      const newZ = mesh1Z - this.terrainDepth;
      this.terrainMeshes[0].position.z = newZ;
      this.updateTerrainVertices(this.terrainMeshes[0].geometry, newZ);
    }

    if (dist1 > this.terrainDepth * 2) {
      const newZ = mesh0Z - this.terrainDepth;
      this.terrainMeshes[1].position.z = newZ;
      this.updateTerrainVertices(this.terrainMeshes[1].geometry, newZ);
    }
  }

  reset() {
    // Reset terrain positions for respawn
    const startPositions = [-this.terrainDepth, 0];

    this.terrainMeshes.forEach((mesh, i) => {
      if (mesh) {
        const posZ = startPositions[i];
        mesh.position.z = posZ;
        this.updateTerrainVertices(mesh.geometry, posZ);
      }
    });

    this.lastUpdateZ = 0;
    console.log('Terrain system reset for respawn');
  }

  dispose() {
    // Properly dispose both terrain meshes
    this.terrainMeshes.forEach(mesh => {
      if (mesh) {
        // Dispose geometry
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        // Material is shared from MaterialManager, don't dispose it here
        // Remove from scene
        if (mesh.parent) {
          this.scene.remove(mesh);
        }
      }
    });

    // Clear references to prevent memory leaks
    this.terrainMeshes = [null, null];
    this.terrainMaterial = null;
  }
}
