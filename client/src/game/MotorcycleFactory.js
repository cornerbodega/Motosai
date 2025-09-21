import * as THREE from 'three';
import { getMaterialManager } from '../utils/MaterialManager.js';

export class MotorcycleFactory {
  static createMotorcycle(options = {}) {
    const {
      bikeColor = 0xff0000,
      riderColor = 0x2a2a2a,
      username = null,
      includeRider = true
    } = options;

    const motorcycle = new THREE.Group();
    const materialManager = getMaterialManager();

    // Body (simplified sportbike shape - reduced complexity)
    const bodyGeo = new THREE.BoxGeometry(0.3, 0.4, 1.4, 1, 1, 2);
    const bodyMat = materialManager.getMaterial('standard', {
      color: bikeColor,
      metalness: 0.6,
      roughness: 0.3,
      envMapIntensity: 1.2
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    body.position.z = 0.05;
    body.castShadow = true;
    motorcycle.add(body);
    
    // Tank
    const tankGeo = new THREE.BoxGeometry(0.35, 0.3, 0.6);
    const tank = new THREE.Mesh(tankGeo, bodyMat);
    tank.position.set(0, 0.55, 0.2);
    motorcycle.add(tank);
    
    // Seat
    const seatGeo = new THREE.BoxGeometry(0.25, 0.1, 0.4, 1, 1, 1);
    const seatMat = materialManager.getMaterial('standard', {
      color: 0x1a1a1a,
      roughness: 0.8,
      metalness: 0
    });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(0, 0.65, -0.25);
    motorcycle.add(seat);
    
    // Wheels (reduced segments for performance)
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 12);
    const wheelMat = materialManager.getMaterial('standard', {
      color: 0x2a2a2a,
      roughness: 0.9,
      metalness: 0
    });
    
    const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
    frontWheel.rotation.z = Math.PI / 2;
    frontWheel.position.set(0, 0.3, 0.7);
    frontWheel.castShadow = true;
    frontWheel.receiveShadow = true;
    motorcycle.add(frontWheel);
    
    const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
    rearWheel.rotation.z = Math.PI / 2;
    rearWheel.position.set(0, 0.32, -0.7);
    rearWheel.castShadow = true;
    rearWheel.receiveShadow = true;
    motorcycle.add(rearWheel);
    
    // Fork - brushed metal (reduced segments)
    const forkGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6);
    const forkMat = materialManager.getMaterial('standard', {
      color: 0x888888,
      metalness: 0.9,
      roughness: 0.4
    });
    const fork1 = new THREE.Mesh(forkGeo, forkMat);
    fork1.position.set(0.08, 0.3, 0.7);
    fork1.rotation.z = 0.1;
    motorcycle.add(fork1);
    
    const fork2 = new THREE.Mesh(forkGeo, forkMat);
    fork2.position.set(-0.08, 0.3, 0.7);
    fork2.rotation.z = -0.1;
    motorcycle.add(fork2);
    
    // Handlebars - rubber grips
    const barGeo = new THREE.BoxGeometry(0.5, 0.02, 0.02);
    const barMat = materialManager.getMaterial('standard', {
      color: 0x1a1a1a,
      roughness: 0.9,
      metalness: 0
    });
    const bars = new THREE.Mesh(barGeo, barMat);
    bars.position.set(0, 0.7, 0.6);
    motorcycle.add(bars);
    
    // Add rider if requested
    if (includeRider) {
      const riderGroup = this.createRider(riderColor);
      motorcycle.add(riderGroup);
      
      // Store rider reference
      motorcycle.userData.rider = riderGroup;
    }
    
    // Add username label if provided
    if (username) {
      const nameSprite = this.createNameSprite(username);
      nameSprite.position.y = 3;
      motorcycle.add(nameSprite);
      motorcycle.userData.nameSprite = nameSprite;
    }
    
    // Store references for animation
    motorcycle.userData.frontWheel = frontWheel;
    motorcycle.userData.rearWheel = rearWheel;
    motorcycle.userData.body = body;
    motorcycle.userData.originalColor = bodyMat.color.clone();
    
    return motorcycle;
  }
  
  static createRider(riderColor = 0x2a2a2a) {
    const riderGroup = new THREE.Group();
    const materialManager = getMaterialManager();

    // Helmet (reduced segments for performance)
    const helmetGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const helmetMat = materialManager.getMaterial('standard', {
      color: riderColor,
      metalness: 0.4,
      roughness: 0.15
    });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.set(0, 0.9, -0.1);
    helmet.scale.set(1, 0.9, 1.1);
    riderGroup.add(helmet);
    
    // Visor
    const visorGeo = new THREE.BoxGeometry(0.18, 0.09, 0.11);
    const visorMat = materialManager.getMaterial('standard', {
      color: 0x000033,
      metalness: 0.1,
      roughness: 0,
      opacity: 0.7,
      transparent: true
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.9, 0);
    riderGroup.add(visor);
    
    // Body
    const riderBodyGeo = new THREE.BoxGeometry(0.24, 0.3, 0.25, 1, 1, 1);
    const riderBodyMat = materialManager.getMaterial('standard', {
      color: riderColor,
      roughness: 0.7,
      metalness: 0
    });
    const riderBody = new THREE.Mesh(riderBodyGeo, riderBodyMat);
    riderBody.position.set(0, 0.7, -0.2);
    riderGroup.add(riderBody);
    
    // Shoulders
    const shoulderGeo = new THREE.BoxGeometry(0.3, 0.1, 0.2);
    const shoulders = new THREE.Mesh(shoulderGeo, riderBodyMat);
    shoulders.position.set(0, 0.78, -0.18);
    riderGroup.add(shoulders);
    
    // Arms
    const armGeo = new THREE.BoxGeometry(0.06, 0.25, 0.06);
    
    const leftArm = new THREE.Mesh(armGeo, riderBodyMat);
    leftArm.position.set(0.14, 0.65, 0.05);
    leftArm.rotation.x = -0.6;
    riderGroup.add(leftArm);
    
    const rightArm = new THREE.Mesh(armGeo, riderBodyMat);
    rightArm.position.set(-0.14, 0.65, 0.05);
    rightArm.rotation.x = -0.6;
    riderGroup.add(rightArm);
    
    return riderGroup;
  }
  
  static createNameSprite(username) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = 'rgba(0,0,0,0.8)';
    context.fillRect(0, 0, 256, 64);
    
    context.font = '32px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.fillText(username, 128, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(4, 1, 1);
    
    return sprite;
  }
  
  // Generate consistent color from username
  static getUsernameColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = (hash % 360) / 360;
    return new THREE.Color().setHSL(hue, 0.8, 0.5);
  }
}