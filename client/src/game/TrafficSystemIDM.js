// Extension of TrafficSystem with IDM and realistic traffic behavior
import { ROAD_CONSTANTS } from './RoadConstants.js';

export class TrafficIDM {
  // Generate driver personality with IDM parameters
  static generateBehavior(lane = 1) {
    // Generate driver personality - MORE VARIETY for realistic traffic
    const personalityRoll = Math.random();
    let personality;
    
    if (personalityRoll < 0.08) {
      // LEFT LANE HOG / BLOCKER (8%) - The worst!
      personality = {
        type: 'leftLaneHog',
        desiredSpeed: 60 + Math.random() * 10, // 60-70 mph IN THE FAST LANE!
        desiredTimeGap: 2.0 + Math.random() * 1.0, // Big gaps
        maxAcceleration: 1.0, // Slow acceleration
        comfortableDeceleration: 2.0, // Gentle braking
        politeness: 0.0, // Zero politeness - won't move over
        laneChangeThreshold: 5.0, // Almost never changes lanes
        preferredLane: 0, // Loves the left lane
        stubbornness: 0.95, // Won't move for anyone
      };
    } else if (personalityRoll < 0.20) {
      // AGGRESSIVE RACER (12%)
      personality = {
        type: 'racer',
        desiredSpeed: 90 + Math.random() * 20, // 90-110 mph!
        desiredTimeGap: 0.5 + Math.random() * 0.3, // 0.5-0.8 seconds (tailgating)
        maxAcceleration: 4.0, // Very fast acceleration
        comfortableDeceleration: 5.0, // Hard braking
        politeness: 0.0, // No politeness
        laneChangeThreshold: 0.2, // Changes lanes for tiny advantages
        preferredLane: -1, // No preference, just wants to go fast
        stubbornness: 0.1, // Will move if blocked
      };
    } else if (personalityRoll < 0.30) {
      // MIDDLE LANE CAMPER (10%) - Never leaves middle lane
      personality = {
        type: 'middleLaneCamper',
        desiredSpeed: 65 + Math.random() * 10, // 65-75 mph
        desiredTimeGap: 1.8 + Math.random() * 0.5,
        maxAcceleration: 1.5,
        comfortableDeceleration: 2.5,
        politeness: 0.3,
        laneChangeThreshold: 10.0, // NEVER changes lanes
        preferredLane: 1, // Middle lane only
        stubbornness: 0.9, // Very stubborn about staying in middle
      };
    } else if (personalityRoll < 0.40) {
      // NERVOUS DRIVER (10%) - Unpredictable
      personality = {
        type: 'nervous',
        desiredSpeed: 55 + Math.random() * 15, // 55-70 mph
        desiredTimeGap: 2.5 + Math.random() * 1.5, // 2.5-4 seconds (huge gaps)
        maxAcceleration: 1.2,
        comfortableDeceleration: 4.0, // Sudden braking
        politeness: 0.8,
        laneChangeThreshold: 0.3, // Changes lanes randomly
        preferredLane: 2, // Prefers right lane
        stubbornness: 0.2,
      };
    } else if (personalityRoll < 0.50) {
      // TRUCK/SLOW VEHICLE (10%)
      personality = {
        type: 'truck',
        desiredSpeed: 55 + Math.random() * 5, // 55-60 mph
        desiredTimeGap: 3.0 + Math.random() * 1.0, // Big following distance
        maxAcceleration: 0.8, // Very slow acceleration
        comfortableDeceleration: 2.0,
        politeness: 0.6,
        laneChangeThreshold: 2.0,
        preferredLane: 2, // Right lane
        stubbornness: 0.7,
      };
    } else if (personalityRoll < 0.65) {
      // COMPETITIVE NORMAL (15%) - Tries to pass but reasonable
      personality = {
        type: 'competitive',
        desiredSpeed: 75 + Math.random() * 10, // 75-85 mph
        desiredTimeGap: 1.0 + Math.random() * 0.5, // 1.0-1.5 seconds
        maxAcceleration: 2.5,
        comfortableDeceleration: 3.5,
        politeness: 0.2, // Low politeness - wants to get ahead
        laneChangeThreshold: 0.5, // Will pass for small advantages
        preferredLane: -1, // No preference
        stubbornness: 0.3,
      };
    } else if (personalityRoll < 0.85) {
      // NORMAL DRIVER (20%)
      personality = {
        type: 'normal',
        desiredSpeed: 65 + Math.random() * 15, // 65-80 mph
        desiredTimeGap: 1.5 + Math.random() * 0.5, // 1.5-2.0 seconds
        maxAcceleration: 2.0,
        comfortableDeceleration: 3.0,
        politeness: 0.5,
        laneChangeThreshold: 1.0,
        preferredLane: -1, // No strong preference
        stubbornness: 0.5,
      };
    } else {
      // CAUTIOUS/ELDERLY (15%)
      personality = {
        type: 'cautious',
        desiredSpeed: 55 + Math.random() * 10, // 55-65 mph
        desiredTimeGap: 2.0 + Math.random() * 1.0, // 2.0-3.0 seconds
        maxAcceleration: 1.5,
        comfortableDeceleration: 2.5,
        politeness: 0.7,
        laneChangeThreshold: 2.0,
        preferredLane: 2, // Right lane preference
        stubbornness: 0.6,
      };
    }
    
    // Lane-based speed adjustments (except for stubborn types)
    if (personality.type !== 'leftLaneHog' && personality.type !== 'middleLaneCamper') {
      if (lane === 0) {
        personality.desiredSpeed *= 1.15; // Left lane +15% speed
      } else if (lane === 2) {
        personality.desiredSpeed *= 0.85; // Right lane -15% speed
      }
    }
    
    // Add common fields
    return {
      ...personality,
      aggressiveness: personality.type === 'racer' ? 1.0 : 
                      personality.type === 'competitive' ? 0.7 :
                      personality.type === 'leftLaneHog' ? 0.1 :
                      personality.type === 'cautious' ? 0.2 : 0.5,
      laneChangeFrequency: personality.type === 'racer' ? 0.1 : 
                          personality.type === 'competitive' ? 0.05 :
                          personality.type === 'leftLaneHog' ? 0.001 :
                          personality.type === 'middleLaneCamper' ? 0.001 :
                          personality.type === 'nervous' ? 0.08 : 0.03,
      followDistance: personality.desiredTimeGap,
      reactionTime: personality.type === 'racer' ? 0.2 : 
                     personality.type === 'nervous' ? 1.0 : 0.5,
      lastLaneChange: 0,
      minLaneChangeInterval: personality.type === 'racer' ? 0.5 : 
                             personality.type === 'nervous' ? 0.8 :
                             personality.type === 'leftLaneHog' ? 10.0 : 2.0,
      lanePositionOffset: 0,
      positionChangeTimer: 0,
      positionChangeInterval: 3 + Math.random() * 4,
      // IDM parameters
      minimumGap: personality.type === 'racer' ? 1.0 : 2.0, // Racers get closer
      accelerationExponent: 4,
      // Passing behavior
      isCurrentlyPassing: false,
      passTarget: null,
      frustration: 0, // Builds up when stuck behind slow traffic
      maxFrustration: personality.type === 'racer' ? 2.0 : 5.0, // Racers get frustrated faster
    };
  }

  // IDM-based AI update with competitive passing behavior
  static updateAI(trafficSystem, vehicle, playerPosition, deltaTime = 0.016) {
    // IDM (Intelligent Driver Model) implementation
    const v = vehicle.speed / 2.237; // Current speed in m/s
    const v0 = vehicle.behavior.desiredSpeed / 2.237; // Desired speed in m/s
    const T = vehicle.behavior.desiredTimeGap; // Desired time headway
    const a = vehicle.behavior.maxAcceleration; // Max acceleration
    const b = vehicle.behavior.comfortableDeceleration; // Comfortable braking
    const s0 = vehicle.behavior.minimumGap; // Minimum gap
    const delta = vehicle.behavior.accelerationExponent; // Acceleration exponent
    
    let acceleration = 0;
    
    // Build frustration when going slower than desired
    const speedDeficit = (vehicle.behavior.desiredSpeed - vehicle.speed) / vehicle.behavior.desiredSpeed;
    if (speedDeficit > 0.1) {
      vehicle.behavior.frustration += deltaTime * speedDeficit;
    } else {
      vehicle.behavior.frustration = Math.max(0, vehicle.behavior.frustration - deltaTime);
    }
    
    if (vehicle.frontVehicle) {
      // Calculate gap to front vehicle
      const gap = vehicle.frontVehicle.position.z - vehicle.position.z - vehicle.frontVehicle.length;
      
      // Relative velocity (positive = approaching)
      const deltaV = v - (vehicle.frontVehicle.speed / 2.237);
      
      // IDM desired gap (reduced when frustrated)
      const frustrationFactor = Math.max(0.5, 1 - vehicle.behavior.frustration / 10);
      const adjustedT = T * frustrationFactor;
      const s_star = s0 + Math.max(0, v * adjustedT + (v * deltaV) / (2 * Math.sqrt(a * b)));
      
      // IDM acceleration
      acceleration = a * (1 - Math.pow(v / v0, delta) - Math.pow(s_star / Math.max(gap, 0.1), 2));
      
      // Check if braking
      vehicle.isBraking = acceleration < -0.5;
      
      // AGGRESSIVE PASSING LOGIC
      const speedDifference = vehicle.behavior.desiredSpeed - vehicle.frontVehicle.speed;
      const shouldConsiderPassing = speedDifference > vehicle.behavior.laneChangeThreshold * 5 || 
                                    vehicle.behavior.frustration > vehicle.behavior.maxFrustration;
      
      if (shouldConsiderPassing) {
        vehicle.behavior.lastLaneChange += deltaTime;
        
        // Try to pass if interval has passed
        if (vehicle.behavior.lastLaneChange > vehicle.behavior.minLaneChangeInterval && 
            vehicle.targetLane === vehicle.lane) {
          
          // STRATEGIC PASSING: Look for best lane
          const currentLane = vehicle.lane;
          const possibleLanes = [];
          
          // Check left lane for passing (if not already there)
          if (currentLane > 0) {
            const leftLaneClear = trafficSystem.isLaneClearAhead(vehicle, currentLane - 1, 50);
            if (leftLaneClear) possibleLanes.push(currentLane - 1);
          }
          
          // Check right lane (less preferred unless desperate)
          if (currentLane < 2 && (vehicle.behavior.frustration > vehicle.behavior.maxFrustration * 0.7)) {
            const rightLaneClear = trafficSystem.isLaneClearAhead(vehicle, currentLane + 1, 30);
            if (rightLaneClear) possibleLanes.push(currentLane + 1);
          }
          
          // COMPETITIVE: Cut in front of slower traffic
          if (possibleLanes.length > 0) {
            // Prefer left lane for passing
            const targetLane = possibleLanes.includes(currentLane - 1) ? currentLane - 1 : possibleLanes[0];
            
            // Racers and competitive drivers will squeeze into smaller gaps
            const requiredGap = vehicle.behavior.type === 'racer' ? 5 : 
                               vehicle.behavior.type === 'competitive' ? 8 : 12;
            
            if (trafficSystem.attemptLaneChange(vehicle, targetLane, requiredGap)) {
              vehicle.behavior.lastLaneChange = 0;
              vehicle.behavior.isCurrentlyPassing = true;
              vehicle.behavior.passTarget = vehicle.frontVehicle;
            }
          }
        }
      }
      
      // Complete pass and move back right (except lane hogs)
      if (vehicle.behavior.isCurrentlyPassing && vehicle.behavior.passTarget) {
        const passDistance = vehicle.position.z - vehicle.behavior.passTarget.position.z;
        if (passDistance > 20 && vehicle.behavior.type !== 'leftLaneHog') {
          // Move back to right if safe
          if (vehicle.lane > 0 && vehicle.behavior.politeness > 0.2) {
            if (trafficSystem.isLaneClearBehind(vehicle, vehicle.lane + 1, 15)) {
              vehicle.targetLane = vehicle.lane + 1;
              vehicle.behavior.isCurrentlyPassing = false;
              vehicle.behavior.passTarget = null;
            }
          }
        }
      }
    } else {
      // Free road acceleration
      acceleration = a * (1 - Math.pow(v / v0, delta));
      vehicle.isBraking = false;
      vehicle.behavior.frustration = 0;
      
      // Move to preferred lane when free
      if (vehicle.behavior.preferredLane >= 0 && vehicle.lane !== vehicle.behavior.preferredLane) {
        vehicle.behavior.lastLaneChange += deltaTime;
        if (vehicle.behavior.lastLaneChange > vehicle.behavior.minLaneChangeInterval && 
            vehicle.targetLane === vehicle.lane) {
          const targetLane = vehicle.behavior.preferredLane;
          if (trafficSystem.isLaneChangeSafe(vehicle, targetLane, vehicle.subLane)) {
            vehicle.targetLane = targetLane;
            vehicle.behavior.lastLaneChange = 0;
          }
        }
      } else {
        // Random lane changes for variety
        vehicle.behavior.lastLaneChange += deltaTime;
        if (vehicle.behavior.lastLaneChange > vehicle.behavior.minLaneChangeInterval && 
            vehicle.targetLane === vehicle.lane) {
          if (Math.random() < vehicle.behavior.laneChangeFrequency) {
            trafficSystem.attemptLaneChange(vehicle);
            if (vehicle.targetLane !== vehicle.lane) {
              vehicle.behavior.lastLaneChange = 0;
            }
          }
        }
      }
    }
    
    // BLOCKING BEHAVIOR for left lane hogs
    if (vehicle.behavior.type === 'leftLaneHog' && vehicle.lane === 0) {
      // Stubbornly maintain speed regardless of traffic behind
      acceleration = Math.min(acceleration, a * 0.3); // Limit acceleration
      
      // Match speed with any car to the right to form a rolling blockade
      const rightLaneCar = trafficSystem.getAdjacentCar(vehicle, 1);
      if (rightLaneCar && Math.abs(rightLaneCar.position.z - vehicle.position.z) < 20) {
        const targetSpeed = rightLaneCar.speed / 2.237;
        acceleration = (targetSpeed - v) * 2; // Gradually match speed
      }
    }
    
    // Check distance to player for awareness
    const playerDistance = Math.abs(vehicle.position.z - playerPosition.z);
    const playerLateralDistance = Math.abs(vehicle.position.x - playerPosition.x);
    
    // Different reactions based on personality
    if (playerDistance < 20 && playerLateralDistance < 3) {
      if (vehicle.behavior.politeness > 0.5) {
        // Polite drivers move over slightly
        const playerPos = ROAD_CONSTANTS.getPositionInfo(playerPosition.x);
        if (vehicle.lane === playerPos.lane) {
          const possibleSubLanes = [0, 1, 2].filter(sl => Math.abs(sl - playerPos.subLane) > 0);
          if (possibleSubLanes.length > 0 && vehicle.targetSubLane === vehicle.subLane) {
            vehicle.targetSubLane = possibleSubLanes[Math.floor(Math.random() * possibleSubLanes.length)];
            vehicle.laneChangeSpeed = 0.5;
          }
        }
      } else if (vehicle.behavior.type === 'leftLaneHog' || vehicle.behavior.type === 'middleLaneCamper') {
        // Blockers don't move for anyone!
        // Maybe even move to block the player more
        if (Math.random() < 0.3) {
          const playerPos = ROAD_CONSTANTS.getPositionInfo(playerPosition.x);
          if (vehicle.lane === playerPos.lane && vehicle.targetSubLane === vehicle.subLane) {
            vehicle.targetSubLane = playerPos.subLane; // Move INTO player's path!
            vehicle.laneChangeSpeed = 1.5; // Slowly drift over
          }
        }
      }
    }
    
    // Apply acceleration with limits
    acceleration = Math.max(-b * 1.5, Math.min(a, acceleration));
    
    // Update speed
    const newSpeed = Math.max(0, v + acceleration * deltaTime);
    vehicle.speed = newSpeed * 2.237; // Convert back to mph
    vehicle.baseSpeed = vehicle.behavior.desiredSpeed;
    
    // Update velocity
    vehicle.velocity.z = newSpeed;
  }
}