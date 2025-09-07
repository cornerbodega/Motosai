import * as THREE from 'three';

export class DeathAnimation {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.bones = [];
    this.bloodSplatters = [];
    this.isAnimating = false;
    this.animationTime = 0;
    this.totalAnimationDuration = 3.0; // 3 seconds total
    this.respawnDelay = 2.0; // 2 seconds before respawn starts
    
    // Materials
    this.bloodMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xcc0000, 
      transparent: true,
      opacity: 0.8
    });
    
    this.boneMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffffff,  // Brighter white
      roughness: 0.7,   // Slightly shinier
      metalness: 0.1,   // Slight metalness for visibility
      emissive: 0x222222  // Slight self-illumination
    });
    
    // Blood particle material
    this.particleMaterial = new THREE.PointsMaterial({
      color: 0xaa0000,
      size: 0.3,
      transparent: true,
      opacity: 0.9,
      vertexColors: true,
      blending: THREE.AdditiveBlending
    });
  }
  
  trigger(position, velocity, collisionNormal = null) {
    if (this.isAnimating) return;
    
    this.isAnimating = true;
    this.animationTime = 0;
    this.deathPosition = position.clone();
    this.impactVelocity = velocity.clone();
    
    // Calculate impact direction
    const impactDirection = collisionNormal || new THREE.Vector3(
      -Math.sign(velocity.x) || (Math.random() - 0.5),
      0.5,
      -Math.sign(velocity.z) || (Math.random() - 0.5)
    ).normalize();
    
    // Create blood splatter on impact surface
    this.createBloodSplatter(position, impactDirection);
    
    // Create blood particles
    this.createBloodParticles(position, impactDirection, velocity);
    
    // Create flying bones
    this.createFlyingBones(position, impactDirection, velocity);
    
    // Create ground blood pool
    this.createBloodPool(position);
  }
  
  createBloodSplatter(position, direction) {
    // Main splatter on impact surface
    const splatterGeo = new THREE.PlaneGeometry(3, 3);
    const splatterMat = new THREE.MeshBasicMaterial({
      color: 0x880000,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
    const splatter = new THREE.Mesh(splatterGeo, splatterMat);
    
    // Position splatter on impact surface
    splatter.position.copy(position);
    splatter.position.y = 0.01; // Just above ground
    splatter.rotation.x = -Math.PI / 2; // Flat on ground
    
    // Add some random rotation for variety
    splatter.rotation.z = Math.random() * Math.PI * 2;
    
    this.scene.add(splatter);
    this.bloodSplatters.push({
      mesh: splatter,
      age: 0,
      maxAge: 5
    });
    
    // Additional smaller splatters
    for (let i = 0; i < 5; i++) {
      const smallSplatterGeo = new THREE.CircleGeometry(Math.random() * 0.5 + 0.2, 8);
      const smallSplatter = new THREE.Mesh(smallSplatterGeo, splatterMat);
      
      smallSplatter.position.set(
        position.x + (Math.random() - 0.5) * 4,
        0.01,
        position.z + (Math.random() - 0.5) * 4
      );
      smallSplatter.rotation.x = -Math.PI / 2;
      
      this.scene.add(smallSplatter);
      this.bloodSplatters.push({
        mesh: smallSplatter,
        age: 0,
        maxAge: 5
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
      
      velocities.push(new THREE.Vector3(
        direction.x * particleSpeed + Math.sin(theta) * Math.cos(phi) * particleSpeed * 0.5,
        Math.abs(direction.y) * particleSpeed + Math.random() * 10,
        direction.z * particleSpeed + Math.sin(theta) * Math.sin(phi) * particleSpeed * 0.5
      ));
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const particles = new THREE.Points(geometry, this.particleMaterial);
    this.scene.add(particles);
    
    this.particles.push({
      mesh: particles,
      velocities: velocities,
      geometry: geometry,
      positions: positions,
      age: 0,
      maxAge: 2
    });
  }
  
  createFlyingBones(position, direction, velocity) {
    const boneTypes = [
      { name: 'skull', size: [0.35, 0.4, 0.35] },     // Bigger skull
      { name: 'ribcage', size: [0.6, 0.5, 0.3] },    // Bigger ribcage
      { name: 'femur', size: [0.1, 0.6, 0.1] },      // Thicker, longer femur
      { name: 'arm', size: [0.08, 0.5, 0.08] },      // Bigger arm bones
      { name: 'spine', size: [0.15, 0.7, 0.15] }     // Bigger spine
    ];
    
    const speed = Math.min(velocity.length(), 50);
    
    // Create 8-12 bones
    const boneCount = 8 + Math.floor(Math.random() * 5);
    
    for (let i = 0; i < boneCount; i++) {
      const boneType = boneTypes[Math.floor(Math.random() * boneTypes.length)];
      
      let boneGeo;
      if (boneType.name === 'skull') {
        boneGeo = new THREE.SphereGeometry(boneType.size[0], 8, 6);
      } else if (boneType.name === 'ribcage') {
        boneGeo = new THREE.BoxGeometry(...boneType.size);
      } else {
        boneGeo = new THREE.CylinderGeometry(
          boneType.size[0], 
          boneType.size[0], 
          boneType.size[1], 
          6
        );
      }
      
      const bone = new THREE.Mesh(boneGeo, this.boneMaterial);
      bone.position.copy(position);
      bone.position.y += 0.5;
      
      // Random initial rotation
      bone.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      
      // Calculate ejection velocity with forward momentum from crash
      const angle = (Math.random() - 0.5) * Math.PI / 3; // Spread to sides but not as wide
      const elevation = Math.random() * Math.PI / 8 + Math.PI / 6; // Lower arc (30-52 degrees)
      
      // Forward momentum based on crash velocity, with some spread
      const forwardSpeed = velocity.length() * (0.8 + Math.random() * 0.4); // 80-120% of crash speed
      const boneVelocity = new THREE.Vector3(
        velocity.x * 0.6 + Math.sin(angle) * 8,  // Forward momentum plus sideways spread
        Math.sin(elevation) * 15 + 8,            // Upward trajectory 
        velocity.z * 0.6 + Math.cos(angle) * 8   // Forward momentum plus depth spread
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
        maxAge: 6,  // Last longer (was 4)
        hasLanded: false
      });
    }
  }
  
  createBloodPool(position) {
    // Growing blood pool on ground
    const poolGeo = new THREE.CircleGeometry(0.1, 16);
    const poolMat = new THREE.MeshBasicMaterial({
      color: 0x660000,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const pool = new THREE.Mesh(poolGeo, poolMat);
    
    pool.position.copy(position);
    pool.position.y = 0.005; // Just above ground
    pool.rotation.x = -Math.PI / 2;
    
    this.scene.add(pool);
    this.bloodSplatters.push({
      mesh: pool,
      age: 0,
      maxAge: 5,
      isPool: true,
      targetScale: 3
    });
  }
  
  update(deltaTime) {
    if (!this.isAnimating) return false;
    
    this.animationTime += deltaTime;
    
    // Update blood particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.age += deltaTime;
      
      if (particle.age > particle.maxAge) {
        this.scene.remove(particle.mesh);
        particle.geometry.dispose();
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
      particle.mesh.material.opacity = 0.9 * (1 - particle.age / particle.maxAge);
    }
    
    // Update flying bones
    for (let i = this.bones.length - 1; i >= 0; i--) {
      const bone = this.bones[i];
      bone.age += deltaTime;
      
      if (bone.age > bone.maxAge) {
        this.scene.remove(bone.mesh);
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
      
      // Fade out near end (last 2 seconds)
      if (bone.age > bone.maxAge - 2) {
        const fadeProgress = (bone.age - (bone.maxAge - 2)) / 2;
        bone.mesh.material.opacity = 1 - fadeProgress;
        bone.mesh.material.transparent = true;
      }
    }
    
    // Update blood splatters
    for (let i = this.bloodSplatters.length - 1; i >= 0; i--) {
      const splatter = this.bloodSplatters[i];
      splatter.age += deltaTime;
      
      if (splatter.age > splatter.maxAge) {
        this.scene.remove(splatter.mesh);
        this.bloodSplatters.splice(i, 1);
        continue;
      }
      
      // Grow blood pool
      if (splatter.isPool && splatter.mesh.scale.x < splatter.targetScale) {
        const growSpeed = 2;
        splatter.mesh.scale.x = Math.min(splatter.targetScale, splatter.mesh.scale.x + growSpeed * deltaTime);
        splatter.mesh.scale.y = splatter.mesh.scale.x;
      }
      
      // Fade out near end
      if (splatter.age > splatter.maxAge - 1) {
        splatter.mesh.material.opacity *= 0.9;
      }
    }
    
    // Check if animation is complete and ready for respawn
    const readyForRespawn = this.animationTime >= this.respawnDelay;
    const animationComplete = this.animationTime >= this.totalAnimationDuration;
    
    if (animationComplete) {
      this.cleanup();
      this.isAnimating = false;
      return true; // Signal that respawn can happen
    }
    
    return readyForRespawn; // Return true when respawn delay is over
  }
  
  cleanup() {
    // Clean up all particles
    for (const particle of this.particles) {
      this.scene.remove(particle.mesh);
      particle.geometry.dispose();
    }
    this.particles = [];
    
    // Clean up bones
    for (const bone of this.bones) {
      this.scene.remove(bone.mesh);
    }
    this.bones = [];
    
    // Clean up blood splatters
    for (const splatter of this.bloodSplatters) {
      this.scene.remove(splatter.mesh);
    }
    this.bloodSplatters = [];
  }
  
  dispose() {
    this.cleanup();
    this.bloodMaterial.dispose();
    this.boneMaterial.dispose();
    this.particleMaterial.dispose();
  }
}