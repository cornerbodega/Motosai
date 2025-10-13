// Input Controller for smooth motorcycle control
// Prevents jerky movements and spin-outs from quick inputs

export class InputController {
  constructor(options = {}) {
    // Current raw inputs
    this.rawInputs = {
      throttle: 0,
      frontBrake: 0,
      rearBrake: 0,
      lean: 0,
      steer: 0
    };

    // Smoothed outputs
    this.smoothedInputs = {
      throttle: 0,
      frontBrake: 0,
      rearBrake: 0,
      lean: 0,
      steer: 0
    };

    // Previous inputs for rate limiting
    this.previousInputs = {
      lean: 0,
      steer: 0
    };

    // Input source tracking
    this.inputSource = 'keyboard'; // 'keyboard', 'mobile', 'gamepad'
    this.isMobileInput = options.isMobile || false;

    // Smoothing parameters
    this.smoothing = {
      throttle: 0.15,     // Moderate smoothing
      brake: 0.2,         // Quick brake response
      lean: this.isMobileInput ? 0.35 : 0.08,  // Much higher for mobile = faster response
      steer: this.isMobileInput ? 0.30 : 0.06,  // Much higher for mobile steering
      speedFactor: 1.0    // Adjusted by speed
    };

    // Rate limits (max change per second)
    this.rateLimits = {
      lean: this.isMobileInput ? 5.0 : 1.2,    // Much faster for mobile - almost instant
      steer: this.isMobileInput ? 4.5 : 1.5,   // Much faster steering rate for mobile
      leanReturn: this.isMobileInput ? 6.0 : 2.0,    // Very fast return to center for mobile
      steerReturn: this.isMobileInput ? 6.0 : 2.5   // Very fast return to center for mobile
    };

    // Dead zones
    this.deadZones = {
      lean: this.isMobileInput ? 0.02 : 0.05,  // Smaller dead zone for mobile
      steer: this.isMobileInput ? 0.02 : 0.05,  // Smaller dead zone for mobile steering
      throttle: 0.02
    };

    // Input history for filtering
    this.inputHistory = {
      lean: [],
      steer: []
    };
    this.historySize = this.isMobileInput ? 3 : 5; // Shorter history for mobile (less latency)
  }
  
  update(deltaTime, speed) {
    // Adjust smoothing based on speed
    const speedMPH = speed * 2.237;
    this.smoothing.speedFactor = Math.min(1.5, 1.0 + speedMPH / 100);
    
    // Process each input
    this.processThrottle(deltaTime);
    this.processBrakes(deltaTime);
    this.processLean(deltaTime, speedMPH);
    this.processSteer(deltaTime, speedMPH);
    
    return this.smoothedInputs;
  }
  
  processThrottle(deltaTime) {
    // Apply dead zone
    let target = Math.abs(this.rawInputs.throttle) < this.deadZones.throttle ? 
                 0 : this.rawInputs.throttle;
    
    // Smooth throttle input
    const smoothing = this.smoothing.throttle;
    this.smoothedInputs.throttle = this.lerp(
      this.smoothedInputs.throttle,
      target,
      smoothing
    );
  }
  
  processBrakes(deltaTime) {
    // Brakes need less smoothing for safety
    const smoothing = this.smoothing.brake;
    
    this.smoothedInputs.frontBrake = this.lerp(
      this.smoothedInputs.frontBrake,
      this.rawInputs.frontBrake,
      smoothing
    );
    
    this.smoothedInputs.rearBrake = this.lerp(
      this.smoothedInputs.rearBrake,
      this.rawInputs.rearBrake,
      smoothing
    );
  }
  
  processLean(deltaTime, speedMPH) {
    // Apply dead zone
    let target = Math.abs(this.rawInputs.lean) < this.deadZones.lean ?
                 0 : this.rawInputs.lean;

    // Mobile: NO SMOOTHING - direct input!
    if (this.isMobileInput) {
      this.smoothedInputs.lean = target;

      // Stability check - reduce lean at very low speeds
      if (speedMPH < 10) {
        const reductionFactor = Math.max(0.5, speedMPH / 10); // Mobile: minimum 50% lean at low speeds
        this.smoothedInputs.lean *= reductionFactor;
      }
      return; // Exit early - no smoothing needed
    }

    // Keyboard: Apply full smoothing
    // Add to history for filtering
    this.updateHistory('lean', target);

    // Apply median filter to remove spikes
    target = this.medianFilter(this.inputHistory.lean);

    // Rate limiting
    const maxChange = this.calculateMaxChange('lean', target, deltaTime, speedMPH);
    const currentLean = this.smoothedInputs.lean;

    if (Math.abs(target - currentLean) > maxChange) {
      target = currentLean + Math.sign(target - currentLean) * maxChange;
    }

    // Speed-dependent smoothing
    const speedSmoothing = this.smoothing.lean * (1 + (100 - speedMPH) / 100);
    const finalSmoothing = Math.min(0.15, speedSmoothing);

    // Apply smoothing
    this.smoothedInputs.lean = this.lerp(
      this.smoothedInputs.lean,
      target,
      finalSmoothing
    );

    // Stability check - reduce lean at very low speeds
    if (speedMPH < 10) {
      const reductionFactor = speedMPH / 10; // Keyboard: full reduction
      this.smoothedInputs.lean *= reductionFactor;
    }
  }
  
  processSteer(deltaTime, speedMPH) {
    // Apply dead zone
    let target = Math.abs(this.rawInputs.steer) < this.deadZones.steer ?
                 0 : this.rawInputs.steer;

    // Mobile: NO SMOOTHING - direct input!
    if (this.isMobileInput) {
      this.smoothedInputs.steer = target;
      return; // Exit early - no smoothing needed
    }

    // Keyboard: Apply full smoothing
    // Add to history for filtering
    this.updateHistory('steer', target);

    // Apply median filter to remove spikes
    target = this.medianFilter(this.inputHistory.steer);

    // Rate limiting
    const maxChange = this.calculateMaxChange('steer', target, deltaTime, speedMPH);
    const currentSteer = this.smoothedInputs.steer;

    if (Math.abs(target - currentSteer) > maxChange) {
      target = currentSteer + Math.sign(target - currentSteer) * maxChange;
    }

    // Very heavy smoothing for steering to prevent spin-outs
    const steerSmoothing = this.smoothing.steer * this.smoothing.speedFactor;

    this.smoothedInputs.steer = this.lerp(
      this.smoothedInputs.steer,
      target,
      steerSmoothing
    );
  }
  
  calculateMaxChange(input, target, deltaTime, speedMPH) {
    // Determine if returning to center (should be faster)
    const isReturning = Math.abs(target) < Math.abs(this.smoothedInputs[input]);
    
    // Base rate limit
    let rateLimit = isReturning ? 
      this.rateLimits[input + 'Return'] : 
      this.rateLimits[input];
    
    // Adjust rate limit based on speed
    if (speedMPH > 30) {
      // Slower changes at high speed for stability
      rateLimit *= 0.5 + 0.5 * (30 / speedMPH);
    }
    
    return rateLimit * deltaTime;
  }
  
  updateHistory(input, value) {
    if (!this.inputHistory[input]) {
      this.inputHistory[input] = [];
    }
    
    this.inputHistory[input].push(value);
    
    // Keep only recent history
    if (this.inputHistory[input].length > this.historySize) {
      this.inputHistory[input].shift();
    }
  }
  
  medianFilter(values) {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];
    
    // Sort and return median
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    
    return sorted[mid];
  }
  
  lerp(current, target, factor) {
    return current + (target - current) * factor;
  }
  
  setRawInput(input, value) {
    if (this.rawInputs.hasOwnProperty(input)) {
      this.rawInputs[input] = Math.max(-1, Math.min(1, value));
    }
  }
  
  setRawInputs(inputs) {
    Object.keys(inputs).forEach(key => {
      if (this.rawInputs.hasOwnProperty(key)) {
        this.rawInputs[key] = Math.max(-1, Math.min(1, inputs[key]));
      }
    });
  }
  
  reset() {
    // Reset all inputs
    Object.keys(this.rawInputs).forEach(key => {
      this.rawInputs[key] = 0;
      this.smoothedInputs[key] = 0;
    });
    
    // Clear history
    this.inputHistory.lean = [];
    this.inputHistory.steer = [];
  }
  
  // Get current state for debugging
  getState() {
    return {
      raw: { ...this.rawInputs },
      smoothed: { ...this.smoothedInputs },
      smoothingFactor: this.smoothing.speedFactor,
      inputSource: this.inputSource
    };
  }

  // Set input source (keyboard, mobile, gamepad)
  setInputSource(source) {
    this.inputSource = source;

    // Adjust parameters based on input source
    if (source === 'mobile') {
      this.isMobileInput = true;
      this.smoothing.lean = 0.35;
      this.smoothing.steer = 0.30;
      this.rateLimits.lean = 5.0;
      this.rateLimits.steer = 4.5;
      this.rateLimits.leanReturn = 6.0;
      this.rateLimits.steerReturn = 6.0;
      this.deadZones.lean = 0.02;
      this.deadZones.steer = 0.02;
      this.historySize = 3;
    } else {
      this.isMobileInput = false;
      this.smoothing.lean = 0.08;
      this.smoothing.steer = 0.06;
      this.rateLimits.lean = 1.2;
      this.rateLimits.steer = 1.5;
      this.rateLimits.leanReturn = 2.0;
      this.rateLimits.steerReturn = 2.5;
      this.deadZones.lean = 0.05;
      this.deadZones.steer = 0.05;
      this.historySize = 5;
    }
  }

  // Update inputs from mobile controller
  updateFromMobile(mobileInputs) {
    this.setInputSource('mobile');

    // Map mobile inputs to raw inputs
    if (mobileInputs.lean !== undefined) {
      this.rawInputs.lean = mobileInputs.lean;
      this.rawInputs.steer = mobileInputs.lean; // Use lean for steering too

      // Debug: Log mobile input mapping occasionally
      if (Math.abs(mobileInputs.lean) > 0.1 && Math.random() < 0.05) {
        console.log('📥 InputController.updateFromMobile - lean:', mobileInputs.lean.toFixed(2),
                    'rawInputs.steer:', this.rawInputs.steer.toFixed(2),
                    'smoothed.steer:', this.smoothedInputs.steer.toFixed(2));
      }
    }

    if (mobileInputs.throttle !== undefined) {
      this.rawInputs.throttle = mobileInputs.throttle;
    }

    // Use frontBrake/rearBrake if provided, otherwise fall back to combined brake value
    if (mobileInputs.frontBrake !== undefined) {
      this.rawInputs.frontBrake = mobileInputs.frontBrake;
    } else if (mobileInputs.brake !== undefined) {
      this.rawInputs.frontBrake = mobileInputs.brake;
    }

    if (mobileInputs.rearBrake !== undefined) {
      this.rawInputs.rearBrake = mobileInputs.rearBrake;
    } else if (mobileInputs.brake !== undefined) {
      this.rawInputs.rearBrake = mobileInputs.brake;
    }
  }
}