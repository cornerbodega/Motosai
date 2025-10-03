import * as THREE from "three";

export class DeathAnimation {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.bones = [];
    this.bloodSplatters = [];
    this.explosionParticles = [];
    this.bikeDebris = [];
    this.isAnimating = false;
    this.animationTime = 0;
    this.totalAnimationDuration = 3.0; // 3 seconds total
    this.respawnDelay = 2.0; // 2 seconds before respawn starts

    // Materials
    this.bloodMaterial = new THREE.MeshBasicMaterial({
      color: 0xcc0000,
      transparent: true,
      opacity: 0.8,
    });

    this.boneMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, // Brighter white
      roughness: 0.7, // Slightly shinier
      metalness: 0.1, // Slight metalness for visibility
      emissive: 0x222222, // Slight self-illumination
    });

    // Blood particle material
    this.particleMaterial = new THREE.PointsMaterial({
      color: 0xaa0000,
      size: 0.3,
      transparent: true,
      opacity: 0.9,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
    });

    // Explosion particle materials
    this.explosionMaterial = new THREE.PointsMaterial({
      color: 0xff4400,
      size: 0.8,
      transparent: true,
      opacity: 1.0,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
    });

    // Bike debris materials
    this.metalDebrisMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.8,
      roughness: 0.3,
    });

    this.plasticDebrisMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.1,
      roughness: 0.7,
    });

    // PRE-CREATE SHARED GEOMETRIES to prevent memory leaks!
    // These are reused for every death instead of creating new ones
    this.sharedGeometries = {
      largeSplatter: new THREE.PlaneGeometry(1.5, 1.5), // Much smaller - 1.5x1.5m
      smallSplatter: new THREE.CircleGeometry(0.3, 8), // Smaller secondary splatters
      bloodPool: new THREE.CircleGeometry(1.0, 16), // Smaller blood pool visual
      skull: new THREE.SphereGeometry(0.35, 8, 6),
      ribcage: new THREE.BoxGeometry(0.6, 0.5, 0.3),
      femur: new THREE.CylinderGeometry(0.1, 0.1, 0.6, 6),
      arm: new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6),
      spine: new THREE.CylinderGeometry(0.15, 0.15, 0.7, 6),
      flash: new THREE.SphereGeometry(0.1, 8, 6),
      debrisBox: new THREE.BoxGeometry(0.1, 0.1, 0.1),
      debrisCylinder: new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8),
    };

    // Create material pools for different opacity levels to avoid cloning
    this.materialPools = this.createMaterialPools();

    // Pre-create shared materials for splatters/pools
    this.splatterMaterial = new THREE.MeshBasicMaterial({
      color: 0x880000,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });

    this.poolMaterial = new THREE.MeshBasicMaterial({
      color: 0x440000,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });

    this.flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0,
      emissive: 0xffaa00,
      emissiveIntensity: 2,
    });

    this.bloodTrailMaterial = new THREE.PointsMaterial({
      size: 0.08,
      color: 0x660000,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
    });
  }

  // Create material pools with different opacity levels to avoid cloning
  createMaterialPools() {
    const pools = {};

    // Create splatter material pool (10 opacity levels)
    pools.splatter = [];
    for (let i = 1; i <= 10; i++) {
      const opacity = i / 10;
      pools.splatter.push(
        new THREE.MeshBasicMaterial({
          color: 0x880000,
          transparent: true,
          opacity: opacity,
          side: THREE.DoubleSide,
        })
      );
    }

    // Create pool material pool
    pools.pool = [];
    for (let i = 1; i <= 10; i++) {
      const opacity = i / 10;
      pools.pool.push(
        new THREE.MeshBasicMaterial({
          color: 0x440000,
          transparent: true,
          opacity: opacity,
          side: THREE.DoubleSide,
        })
      );
    }

    // Create bone material pool
    pools.bone = [];
    for (let i = 1; i <= 10; i++) {
      const opacity = i / 10;
      pools.bone.push(
        new THREE.MeshStandardMaterial({
          color: 0xeeeecc,
          transparent: true,
          opacity: opacity,
          roughness: 0.8,
          metalness: 0.1,
        })
      );
    }

    // Create debris material pools
    pools.metal = [];
    pools.plastic = [];
    for (let i = 1; i <= 10; i++) {
      const opacity = i / 10;
      pools.metal.push(
        new THREE.MeshStandardMaterial({
          color: 0x666666,
          transparent: true,
          opacity: opacity,
          metalness: 0.8,
          roughness: 0.3,
        })
      );
      pools.plastic.push(
        new THREE.MeshStandardMaterial({
          color: 0x333333,
          transparent: true,
          opacity: opacity,
          metalness: 0.1,
          roughness: 0.7,
        })
      );
    }

    // Create flash material pool
    pools.flash = [];
    for (let i = 1; i <= 10; i++) {
      const opacity = i / 10;
      pools.flash.push(
        new THREE.MeshBasicMaterial({
          color: 0xffff00,
          transparent: true,
          opacity: opacity,
          emissive: 0xffff00,
          emissiveIntensity: 0.3,
        })
      );
    }

    return pools;
  }

  // Get material with closest opacity from pool
  getMaterialFromPool(poolName, targetOpacity) {
    const pool = this.materialPools[poolName];
    if (!pool) return this.splatterMaterial; // fallback

    const index = Math.max(0, Math.min(9, Math.round(targetOpacity * 10) - 1));
    return pool[index];
  }

  trigger(position, velocity, collisionNormal = null) {
    if (this.isAnimating) return;

    this.isAnimating = true;
    this.animationTime = 0;
    this.deathPosition = position.clone();
    this.impactVelocity = velocity.clone();

    // Calculate impact direction
    const impactDirection =
      collisionNormal ||
      new THREE.Vector3(
        -Math.sign(velocity.x) || Math.random() - 0.5,
        0.5,
        -Math.sign(velocity.z) || Math.random() - 0.5
      ).normalize();

    // Create blood splatter on impact surface
    this.createBloodSplatter(position, impactDirection);

    // Create blood particles
    this.createBloodParticles(position, impactDirection, velocity);

    // Create flying bones
    this.createFlyingBones(position, impactDirection, velocity);

    // Create bike explosion
    this.createBikeExplosion(position, velocity);

    // Create ground blood pool
    this.createBloodPool(position);
  }

  createBloodSplatter(position, direction) {
    // Additional smaller splatters - keep them closer together
    for (let i = 0; i < 3; i++) {
      const smallSplatter = new THREE.Mesh(
        this.sharedGeometries.smallSplatter,
        this.getMaterialFromPool("splatter", 0.6)
      );
      smallSplatter.scale.setScalar(Math.random() * 0.3 + 0.2); // Smaller scale

      smallSplatter.position.set(
        position.x + (Math.random() - 0.5) * 2, // Much tighter spread
        0.01,
        position.z + (Math.random() - 0.5) * 2
      );
      smallSplatter.rotation.x = -Math.PI / 2;

      this.scene.add(smallSplatter);
      this.bloodSplatters.push({
        mesh: smallSplatter,
        age: 0,
        maxAge: 5,
      });
    }
  }

  createBloodParticles(position, direction, velocity) {
    const particleCount = 200;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities = [];

    const speed = Math.min(velocity.length(), 50);

    for (let i = 0; i < particleCount; i++) {
      // Initial positions at impact point
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y + 0.5;
      positions[i * 3 + 2] = position.z;

      // Red to dark red colors
      const darkness = Math.random() * 0.3;
      colors[i * 3] = 0.8 - darkness;
      colors[i * 3 + 1] = darkness;
      colors[i * 3 + 2] = darkness;

      // Particle velocities - spray pattern
      const spreadAngle = Math.PI / 3; // 60 degree cone
      const theta = (Math.random() - 0.5) * spreadAngle;
      const phi = Math.random() * Math.PI * 2;

      const particleSpeed = speed * (0.5 + Math.random() * 1.5);

      velocities.push(
        new THREE.Vector3(
          direction.x * particleSpeed +
            Math.sin(theta) * Math.cos(phi) * particleSpeed * 0.5,
          Math.abs(direction.y) * particleSpeed + Math.random() * 10,
          direction.z * particleSpeed +
            Math.sin(theta) * Math.sin(phi) * particleSpeed * 0.5
        )
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particles = new THREE.Points(geometry, this.particleMaterial);
    this.scene.add(particles);

    this.particles.push({
      mesh: particles,
      velocities: velocities,
      geometry: geometry,
      positions: positions,
      age: 0,
      maxAge: 2,
    });
  }

  createFlyingBones(position, direction, velocity) {
    const boneTypes = ["skull", "ribcage", "femur", "arm", "spine"];

    const speed = Math.min(velocity.length(), 50);

    // Create 8-12 bones
    const boneCount = 8 + Math.floor(Math.random() * 5);

    for (let i = 0; i < boneCount; i++) {
      const boneType = boneTypes[Math.floor(Math.random() * boneTypes.length)];

      // Use shared geometry based on type
      const boneGeo = this.sharedGeometries[boneType];
      const bone = new THREE.Mesh(
        boneGeo,
        this.getMaterialFromPool("bone", 1.0)
      );
      bone.position.copy(position);
      bone.position.y += 0.5;

      // Random initial rotation
      bone.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      // Calculate ejection velocity with forward momentum from crash
      const angle = ((Math.random() - 0.5) * Math.PI) / 3; // Spread to sides but not as wide
      const elevation = (Math.random() * Math.PI) / 8 + Math.PI / 6; // Lower arc (30-52 degrees)

      // Forward momentum based on crash velocity, with some spread
      const forwardSpeed = velocity.length() * (0.8 + Math.random() * 0.4); // 80-120% of crash speed
      const boneVelocity = new THREE.Vector3(
        velocity.x * 0.6 + Math.sin(angle) * 8, // Forward momentum plus sideways spread
        Math.sin(elevation) * 15 + 8, // Upward trajectory
        velocity.z * 0.6 + Math.cos(angle) * 8 // Forward momentum plus depth spread
      );

      // Random angular velocity for tumbling
      const angularVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      );

      bone.castShadow = true;
      this.scene.add(bone);

      this.bones.push({
        mesh: bone,
        velocity: boneVelocity,
        angularVelocity: angularVelocity,
        age: 0,
        maxAge: 6, // Last longer (was 4)
        hasLanded: false,
        bloodParticles: this.createBoneBloodTrail(bone.position, boneVelocity),
      });
    }
  }

  createBloodPool(position) {
    // Growing blood pool on ground - USE SHARED GEOMETRY
    const pool = new THREE.Mesh(
      this.sharedGeometries.bloodPool,
      this.getMaterialFromPool("pool", 0.8)
    );
    pool.scale.set(0.1, 0.1, 1); // Start slightly bigger

    pool.position.copy(position);
    pool.position.y = 0.005; // Just above ground
    pool.rotation.x = -Math.PI / 2;

    this.scene.add(pool);
    this.bloodSplatters.push({
      mesh: pool,
      age: 0,
      maxAge: 5,
      isPool: true,
      targetScale: 1.5, // Smaller max size - only 1.5m radius
    });
  }

  createBoneBloodTrail(position, velocity) {
    // Create small blood particles that follow each bone
    const particleCount = 15;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      // Start near bone position
      positions[i * 3] = position.x + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.3;

      // Dark red blood colors
      colors[i * 3] = 0.6 + Math.random() * 0.2; // Red
      colors[i * 3 + 1] = 0.05 + Math.random() * 0.1; // Green
      colors[i * 3 + 2] = 0.05 + Math.random() * 0.1; // Blue

      // Velocities slightly slower than bone, with some spread
      const bloodVel = velocity.clone();
      bloodVel.multiplyScalar(0.8 + Math.random() * 0.3);
      bloodVel.add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 3
        )
      );

      velocities.push(bloodVel);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // Clone the blood trail material for individual opacity control
    const bloodTrailMaterial = this.bloodTrailMaterial;
    bloodTrailMaterial.size = 0.15;
    bloodTrailMaterial.opacity = 0.8;

    const particles = new THREE.Points(geometry, bloodTrailMaterial);
    this.scene.add(particles);

    return {
      mesh: particles,
      velocities: velocities,
      geometry: geometry,
      positions: positions,
      material: bloodTrailMaterial,
      age: 0,
      maxAge: 2.5,
    };
  }

  createBikeExplosion(position, velocity) {
    const speed = velocity.length();

    // Create explosion flash using shared geometry
    const flash = new THREE.Mesh(
      this.sharedGeometries.flash,
      this.getMaterialFromPool("flash", 1.0)
    );
    flash.position.copy(position);
    flash.position.y += 0.3;

    this.scene.add(flash);
    this.explosionParticles.push({
      mesh: flash,
      type: "flash",
      age: 0,
      maxAge: 0.3,
      targetScale: 8,
    });

    // Create fire/smoke explosion particles
    const particleCount = 150;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      // Initial positions at explosion center
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y + 0.3;
      positions[i * 3 + 2] = position.z;

      // Fire colors (orange to red to black)
      const fireStage = Math.random();
      if (fireStage < 0.4) {
        // Bright orange fire
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.4 + Math.random() * 0.3;
        colors[i * 3 + 2] = 0.0;
      } else if (fireStage < 0.7) {
        // Red fire
        colors[i * 3] = 0.8 + Math.random() * 0.2;
        colors[i * 3 + 1] = 0.1 + Math.random() * 0.2;
        colors[i * 3 + 2] = 0.0;
      } else {
        // Dark smoke
        colors[i * 3] = 0.1 + Math.random() * 0.2;
        colors[i * 3 + 1] = 0.1 + Math.random() * 0.2;
        colors[i * 3 + 2] = 0.1 + Math.random() * 0.2;
      }

      // Explosion velocities - spherical burst with upward bias
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.7 + Math.PI * 0.1; // Bias upward
      const explosionSpeed = 10 + Math.random() * 15 + speed * 0.3;

      velocities.push(
        new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * explosionSpeed,
          Math.cos(phi) * explosionSpeed + 5, // Extra upward push
          Math.sin(phi) * Math.sin(theta) * explosionSpeed
        )
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particles = new THREE.Points(geometry, this.explosionMaterial);
    this.scene.add(particles);

    this.explosionParticles.push({
      mesh: particles,
      type: "particles",
      velocities: velocities,
      geometry: geometry,
      positions: positions,
      age: 0,
      maxAge: 0.8,
    });

    // Create bike debris pieces
    this.createBikeDebris(position, velocity);
  }

  createBikeDebris(position, velocity) {
    const debrisTypes = [
      { type: "wheel", material: "metal", size: [0.3, 0.05, 0.3] },
      { type: "handlebar", material: "metal", size: [0.6, 0.05, 0.05] },
      { type: "engine", material: "metal", size: [0.4, 0.3, 0.2] },
      { type: "fender", material: "plastic", size: [0.4, 0.2, 0.1] },
      { type: "mirror", material: "metal", size: [0.1, 0.15, 0.05] },
      { type: "seat", material: "plastic", size: [0.5, 0.1, 0.3] },
    ];

    const speed = velocity.length();
    const debrisCount = 6 + Math.floor(Math.random() * 4);

    for (let i = 0; i < debrisCount; i++) {
      const debris =
        debrisTypes[Math.floor(Math.random() * debrisTypes.length)];
      const material =
        debris.material === "metal"
          ? this.metalDebrisMaterial
          : this.plasticDebrisMaterial;

      // Use shared geometry for debris
      const debrisGeo =
        debris.type === "wheel"
          ? this.sharedGeometries.debrisCylinder
          : this.sharedGeometries.debrisBox;

      const poolType = debris.type === "wheel" ? "plastic" : "metal";
      const debrisMesh = new THREE.Mesh(
        debrisGeo,
        this.getMaterialFromPool(poolType, 1.0)
      );
      // Scale the shared geometry to match the debris size
      if (debris.type === "wheel") {
        debrisMesh.scale.set(
          debris.size[0] * 6,
          debris.size[1] * 10,
          debris.size[0] * 6
        );
      } else {
        debrisMesh.scale.set(
          debris.size[0] * 10,
          debris.size[1] * 10,
          debris.size[2] * 10
        );
      }
      debrisMesh.position.copy(position);
      debrisMesh.position.y += 0.2;

      // Random initial rotation
      debrisMesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      // Debris flies in all directions with forward bias
      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() * Math.PI) / 3 + Math.PI / 6;

      const debrisVelocity = new THREE.Vector3(
        velocity.x * (0.3 + Math.random() * 0.4) + Math.cos(angle) * 10,
        Math.sin(elevation) * 12 + 5,
        velocity.z * (0.3 + Math.random() * 0.4) + Math.sin(angle) * 10
      );

      const angularVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15
      );

      debrisMesh.castShadow = true;
      this.scene.add(debrisMesh);

      this.bikeDebris.push({
        mesh: debrisMesh,
        velocity: debrisVelocity,
        angularVelocity: angularVelocity,
        age: 0,
        maxAge: 5,
        hasLanded: false,
      });
    }
  }

  update(deltaTime) {
    // Always update effects, even if main animation isn't running (for remote player crashes)
    const wasAnimating = this.isAnimating;

    if (wasAnimating) {
      this.animationTime += deltaTime;
    }

    // Update explosion effects
    for (let i = this.explosionParticles.length - 1; i >= 0; i--) {
      const explosion = this.explosionParticles[i];
      explosion.age += deltaTime;

      if (explosion.age > explosion.maxAge) {
        this.scene.remove(explosion.mesh);
        if (explosion.geometry) explosion.geometry.dispose();
        // Clean up Vector3 objects to prevent memory leak!
        if (explosion.velocities) {
          explosion.velocities.forEach((v) => {
            v.x = null;
            v.y = null;
            v.z = null;
          });
          explosion.velocities.length = 0;
          explosion.velocities = null;
        }
        explosion.positions = null;
        this.explosionParticles.splice(i, 1);
        continue;
      }

      if (explosion.type === "flash") {
        // Expanding flash sphere
        const scale =
          (explosion.age / explosion.maxAge) * explosion.targetScale;
        explosion.mesh.scale.setScalar(scale);

        // Fade out quickly
        const targetOpacity = 1 - explosion.age / explosion.maxAge;
        explosion.mesh.material = this.getMaterialFromPool(
          "flash",
          targetOpacity
        );
      } else if (explosion.type === "particles") {
        // Update explosion particle positions
        const positions = explosion.geometry.attributes.position.array;
        for (let j = 0; j < explosion.velocities.length; j++) {
          const vel = explosion.velocities[j];

          // Apply gravity and air resistance
          vel.y -= 15 * deltaTime;
          vel.multiplyScalar(0.98); // Air resistance

          // Update position
          positions[j * 3] += vel.x * deltaTime;
          positions[j * 3 + 1] += vel.y * deltaTime;
          positions[j * 3 + 2] += vel.z * deltaTime;

          // Stop at ground
          if (positions[j * 3 + 1] < 0) {
            positions[j * 3 + 1] = 0;
            vel.set(0, 0, 0);
          }
        }

        explosion.geometry.attributes.position.needsUpdate = true;

        // Fade out quickly after brief initial burn
        const fadeStart = explosion.maxAge * 0.3;
        if (explosion.age > fadeStart) {
          const fadeProgress =
            (explosion.age - fadeStart) / (explosion.maxAge - fadeStart);
          const targetOpacity = 1 - fadeProgress;
          explosion.mesh.material = this.getMaterialFromPool(
            "flash",
            targetOpacity
          );
        }
      }
    }

    // Update bike debris
    for (let i = this.bikeDebris.length - 1; i >= 0; i--) {
      const debris = this.bikeDebris[i];
      debris.age += deltaTime;

      if (debris.age > debris.maxAge) {
        this.scene.remove(debris.mesh);
        // DON'T dispose shared geometry!
        // Clean up Vector3 objects to prevent memory leak!
        if (debris.velocity) {
          debris.velocity.x = null;
          debris.velocity.y = null;
          debris.velocity.z = null;
          debris.velocity = null;
        }
        if (debris.angularVelocity) {
          debris.angularVelocity.x = null;
          debris.angularVelocity.y = null;
          debris.angularVelocity.z = null;
          debris.angularVelocity = null;
        }
        this.bikeDebris.splice(i, 1);
        continue;
      }

      if (!debris.hasLanded) {
        // Apply physics
        debris.velocity.y -= 25 * deltaTime; // Gravity

        // Update position
        debris.mesh.position.x += debris.velocity.x * deltaTime;
        debris.mesh.position.y += debris.velocity.y * deltaTime;
        debris.mesh.position.z += debris.velocity.z * deltaTime;

        // Update rotation (tumbling)
        debris.mesh.rotation.x += debris.angularVelocity.x * deltaTime;
        debris.mesh.rotation.y += debris.angularVelocity.y * deltaTime;
        debris.mesh.rotation.z += debris.angularVelocity.z * deltaTime;

        // Check ground collision
        if (debris.mesh.position.y <= 0.05) {
          debris.mesh.position.y = 0.05;
          debris.velocity.multiplyScalar(0.4); // Bounce with energy loss
          debris.velocity.y = Math.abs(debris.velocity.y) * 0.4;
          debris.angularVelocity.multiplyScalar(0.6);

          // Stop bouncing if velocity is low
          if (debris.velocity.length() < 2) {
            debris.hasLanded = true;
            debris.velocity.set(0, 0, 0);
            debris.angularVelocity.multiplyScalar(0.1);
          }
        }
      }

      // Fade out near end
      if (debris.age > debris.maxAge - 1.5) {
        const fadeProgress = (debris.age - (debris.maxAge - 1.5)) / 1.5;
        const targetOpacity = 1 - fadeProgress;
        const poolType = debris.type === "wheel" ? "plastic" : "metal";
        debris.mesh.material = this.getMaterialFromPool(
          poolType,
          targetOpacity
        );
      }
    }

    // Update blood particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.age += deltaTime;

      if (particle.age > particle.maxAge) {
        this.scene.remove(particle.mesh);
        particle.geometry.dispose();
        // Clean up Vector3 objects to prevent memory leak!
        if (particle.velocities) {
          particle.velocities.forEach((v) => {
            v.x = null;
            v.y = null;
            v.z = null;
          });
          particle.velocities.length = 0;
          particle.velocities = null;
        }
        particle.positions = null;
        this.particles.splice(i, 1);
        continue;
      }

      // Update particle positions
      const positions = particle.geometry.attributes.position.array;
      for (let j = 0; j < particle.velocities.length; j++) {
        const vel = particle.velocities[j];

        // Apply gravity
        vel.y -= 30 * deltaTime;

        // Update position
        positions[j * 3] += vel.x * deltaTime;
        positions[j * 3 + 1] += vel.y * deltaTime;
        positions[j * 3 + 2] += vel.z * deltaTime;

        // Stop at ground
        if (positions[j * 3 + 1] < 0) {
          positions[j * 3 + 1] = 0;
          vel.y = 0;
          vel.x *= 0.5;
          vel.z *= 0.5;
        }
      }

      particle.geometry.attributes.position.needsUpdate = true;

      // Fade out
      particle.mesh.material.opacity =
        0.9 * (1 - particle.age / particle.maxAge);
    }

    // Update flying bones
    for (let i = this.bones.length - 1; i >= 0; i--) {
      const bone = this.bones[i];
      bone.age += deltaTime;

      if (bone.age > bone.maxAge) {
        this.scene.remove(bone.mesh);
        // DON'T dispose shared geometry!
        // Clean up Vector3 objects to prevent memory leak!
        if (bone.velocity) {
          bone.velocity.x = null;
          bone.velocity.y = null;
          bone.velocity.z = null;
          bone.velocity = null;
        }
        if (bone.angularVelocity) {
          bone.angularVelocity.x = null;
          bone.angularVelocity.y = null;
          bone.angularVelocity.z = null;
          bone.angularVelocity = null;
        }
        // Clean up blood trail
        if (bone.bloodParticles) {
          this.scene.remove(bone.bloodParticles.mesh);
          bone.bloodParticles.geometry.dispose(); // This IS unique, should dispose
          // Clean up Vector3 objects in blood trail
          if (bone.bloodParticles.velocities) {
            bone.bloodParticles.velocities.forEach((v) => {
              v.x = null;
              v.y = null;
              v.z = null;
            });
            bone.bloodParticles.velocities.length = 0;
            bone.bloodParticles.velocities = null;
          }
        }
        this.bones.splice(i, 1);
        continue;
      }

      if (!bone.hasLanded) {
        // Apply physics
        bone.velocity.y -= 30 * deltaTime; // Stronger gravity to keep bones in view

        // Update position
        bone.mesh.position.x += bone.velocity.x * deltaTime;
        bone.mesh.position.y += bone.velocity.y * deltaTime;
        bone.mesh.position.z += bone.velocity.z * deltaTime;

        // Update rotation (tumbling)
        bone.mesh.rotation.x += bone.angularVelocity.x * deltaTime;
        bone.mesh.rotation.y += bone.angularVelocity.y * deltaTime;
        bone.mesh.rotation.z += bone.angularVelocity.z * deltaTime;

        // Check ground collision
        if (bone.mesh.position.y <= 0.1) {
          bone.mesh.position.y = 0.1;
          bone.velocity.multiplyScalar(0.3); // Bounce with energy loss
          bone.velocity.y = Math.abs(bone.velocity.y) * 0.3;
          bone.angularVelocity.multiplyScalar(0.5);

          // Stop bouncing if velocity is low
          if (bone.velocity.length() < 1) {
            bone.hasLanded = true;
            bone.velocity.set(0, 0, 0);
            bone.angularVelocity.multiplyScalar(0.1);
          }
        }
      }

      // Update blood trail particles
      if (bone.bloodParticles) {
        bone.bloodParticles.age += deltaTime;

        if (bone.bloodParticles.age > bone.bloodParticles.maxAge) {
          // Remove blood trail when expired
          this.scene.remove(bone.bloodParticles.mesh);
          bone.bloodParticles.geometry.dispose(); // This IS unique, should dispose
          // Clean up Vector3 objects to prevent memory leak!
          if (bone.bloodParticles.velocities) {
            bone.bloodParticles.velocities.forEach((v) => {
              v.x = null;
              v.y = null;
              v.z = null;
            });
            bone.bloodParticles.velocities.length = 0;
            bone.bloodParticles.velocities = null;
          }
          bone.bloodParticles = null;
        } else {
          // Update blood particle positions
          const positions =
            bone.bloodParticles.geometry.attributes.position.array;
          for (let j = 0; j < bone.bloodParticles.velocities.length; j++) {
            const vel = bone.bloodParticles.velocities[j];

            // Apply gravity
            vel.y -= 25 * deltaTime;

            // Update position
            positions[j * 3] += vel.x * deltaTime;
            positions[j * 3 + 1] += vel.y * deltaTime;
            positions[j * 3 + 2] += vel.z * deltaTime;

            // Stop at ground
            if (positions[j * 3 + 1] < 0) {
              positions[j * 3 + 1] = 0;
              vel.y = 0;
              vel.x *= 0.3;
              vel.z *= 0.3;
            }
          }

          bone.bloodParticles.geometry.attributes.position.needsUpdate = true;

          // Fade out blood trail
          const fadeProgress =
            bone.bloodParticles.age / bone.bloodParticles.maxAge;
          // Blood particles material opacity is managed by PointsMaterial - keep as is for now
        }
      }

      // Fade out near end (last 2 seconds)
      if (bone.age > bone.maxAge - 2) {
        const fadeProgress = (bone.age - (bone.maxAge - 2)) / 2;
        const targetOpacity = 1 - fadeProgress;
        bone.mesh.material = this.getMaterialFromPool("bone", targetOpacity);
      }
    }

    // Update blood splatters
    for (let i = this.bloodSplatters.length - 1; i >= 0; i--) {
      const splatter = this.bloodSplatters[i];
      splatter.age += deltaTime;

      if (splatter.age > splatter.maxAge) {
        this.scene.remove(splatter.mesh);
        // DON'T dispose shared geometry or material!
        this.bloodSplatters.splice(i, 1);
        continue;
      }

      // Grow blood pool
      if (splatter.isPool && splatter.mesh.scale.x < splatter.targetScale) {
        const growSpeed = 2;
        splatter.mesh.scale.x = Math.min(
          splatter.targetScale,
          splatter.mesh.scale.x + growSpeed * deltaTime
        );
        splatter.mesh.scale.y = splatter.mesh.scale.x;
      }

      // Fade out near end
      if (splatter.age > splatter.maxAge - 1) {
        const currentOpacity = splatter.mesh.material.opacity * 0.9;
        splatter.mesh.material = this.getMaterialFromPool(
          "splatter",
          currentOpacity
        );
      }
    }

    // Only handle respawn logic if main player is animating
    if (wasAnimating) {
      // Check if animation is complete and ready for respawn
      const readyForRespawn = this.animationTime >= this.respawnDelay;
      const animationComplete =
        this.animationTime >= this.totalAnimationDuration;

      if (animationComplete) {
        this.cleanup();
        this.isAnimating = false;
        return true; // Signal that respawn can happen
      }

      return readyForRespawn; // Return true when respawn delay is over
    }

    return false; // No respawn needed if not main animation
  }

  cleanup() {
    // Clean up all particles
    for (const particle of this.particles) {
      this.scene.remove(particle.mesh);
      if (particle.mesh.geometry) particle.mesh.geometry.dispose(); // Dispose unique BufferGeometry
      // DON'T dispose shared material - it's reused!
      // Clean up Vector3 objects properly
      if (particle.velocities) {
        particle.velocities.forEach((v) => {
          v.x = null;
          v.y = null;
          v.z = null;
        });
        particle.velocities.length = 0;
        particle.velocities = null;
      }
      particle.positions = null;
    }
    this.particles = [];

    // Clean up explosion effects
    for (const explosion of this.explosionParticles) {
      this.scene.remove(explosion.mesh);
      if (explosion.mesh.geometry) explosion.mesh.geometry.dispose(); // Dispose unique BufferGeometry
      // DON'T dispose shared materials - they're reused!
      // Clean up Vector3 objects properly
      if (explosion.velocities) {
        explosion.velocities.forEach((v) => {
          v.x = null;
          v.y = null;
          v.z = null;
        });
        explosion.velocities.length = 0;
        explosion.velocities = null;
      }
      explosion.positions = null;
    }
    this.explosionParticles = [];

    // Clean up bike debris
    for (const debris of this.bikeDebris) {
      this.scene.remove(debris.mesh);
      // Dispose cloned material
      // Material disposal is handled by pool cleanup - no individual disposal needed
      // Clean up Vector3 objects properly
      if (debris.velocity) {
        debris.velocity.x = null;
        debris.velocity.y = null;
        debris.velocity.z = null;
        debris.velocity = null;
      }
      if (debris.angularVelocity) {
        debris.angularVelocity.x = null;
        debris.angularVelocity.y = null;
        debris.angularVelocity.z = null;
        debris.angularVelocity = null;
      }
    }
    this.bikeDebris = [];

    // Clean up bones
    for (const bone of this.bones) {
      this.scene.remove(bone.mesh);
      // Dispose cloned material
      // Material disposal is handled by pool cleanup - no individual disposal needed
      // Clean up Vector3 objects properly
      if (bone.velocity) {
        bone.velocity.x = null;
        bone.velocity.y = null;
        bone.velocity.z = null;
        bone.velocity = null;
      }
      if (bone.angularVelocity) {
        bone.angularVelocity.x = null;
        bone.angularVelocity.y = null;
        bone.angularVelocity.z = null;
        bone.angularVelocity = null;
      }
      // Clean up blood trail
      if (bone.bloodParticles) {
        this.scene.remove(bone.bloodParticles.mesh);
        if (bone.bloodParticles.mesh.geometry)
          bone.bloodParticles.mesh.geometry.dispose(); // Unique geometry
        // DON'T dispose shared material
        if (bone.bloodParticles.velocities) {
          bone.bloodParticles.velocities.forEach((v) => {
            v.x = null;
            v.y = null;
            v.z = null;
          });
          bone.bloodParticles.velocities.length = 0;
          bone.bloodParticles.velocities = null;
        }
      }
    }
    this.bones = [];

    // Clean up blood splatters
    for (const splatter of this.bloodSplatters) {
      this.scene.remove(splatter.mesh);
      // Dispose cloned materials
      // Material disposal is handled by pool cleanup - no individual disposal needed
    }
    this.bloodSplatters = [];
  }

  // Remote crash methods for multiplayer
  triggerRemoteCrash(position, velocity, playerName) {
    console.log(`🚨 Triggering remote crash effect for ${playerName}`);

    // Calculate impact direction
    const impactDirection = new THREE.Vector3(
      -Math.sign(velocity.x) || Math.random() - 0.5,
      0.3,
      -Math.sign(velocity.z) || Math.random() - 0.5
    ).normalize();

    // Use the SAME methods as the main death animation - they already work perfectly!
    this.createBloodSplatter(position, impactDirection);
    this.createBloodParticles(position, impactDirection, velocity);
    this.createBikeExplosion(position, velocity);
  }

  triggerRemoteDeath(position, velocity, playerName) {
    console.log(`💀 Triggering remote death effect for ${playerName}`);

    // Calculate impact direction
    const impactDirection = new THREE.Vector3(
      -Math.sign(velocity.x) || Math.random() - 0.5,
      0.5,
      -Math.sign(velocity.z) || Math.random() - 0.5
    ).normalize();

    // Use the SAME methods as the main death animation!
    this.createBloodSplatter(position, impactDirection);
    this.createBloodParticles(position, impactDirection, velocity);
    this.createFlyingBones(position, impactDirection, velocity);
    this.createBikeExplosion(position, velocity);
    this.createBloodPool(position);
  }

  dispose() {
    this.cleanup();
    // Dispose all materials
    this.bloodMaterial.dispose();
    this.boneMaterial.dispose();
    this.particleMaterial.dispose();
    this.explosionMaterial.dispose();
    this.metalDebrisMaterial.dispose();
    this.plasticDebrisMaterial.dispose();
    this.splatterMaterial.dispose();
    this.poolMaterial.dispose();
    this.flashMaterial.dispose();
    this.bloodTrailMaterial.dispose();

    // Dispose all material pools
    Object.values(this.materialPools).forEach((pool) => {
      pool.forEach((material) => material.dispose());
    });

    // Dispose all shared geometries
    Object.values(this.sharedGeometries).forEach((geo) => geo.dispose());
  }
}
