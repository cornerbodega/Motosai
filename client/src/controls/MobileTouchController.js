// Mobile Touch Controller
// Handles all touch input and converts to game controls

import { VirtualJoystick } from './VirtualJoystick.js';
import { DeviceDetection } from '../utils/DeviceDetection.js';

export class MobileTouchController {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      enabled: options.enabled !== false,
      hapticFeedback: options.hapticFeedback !== false,
      controlLayout: options.controlLayout || 'joystick', // 'joystick' or 'zones'
      sensitivity: {
        lean: options.sensitivity?.lean || 1.0,
        throttle: options.sensitivity?.throttle || 1.0,
        brake: options.sensitivity?.brake || 1.0
      }
    };

    // Input state
    this.inputs = {
      lean: 0,
      throttle: 0,
      brake: 0,
      frontBrake: 0,
      rearBrake: 0
    };

    // Touch tracking
    this.activeTouches = new Map();

    // UI Elements
    this.joystick = null;
    this.throttleZone = null;
    this.brakeZone = null;

    // Callbacks
    this.onInputChange = options.onInputChange || (() => {});

    if (this.options.enabled) {
      this.initialize();
    }
  }

  initialize() {
    if (this.options.controlLayout === 'joystick') {
      this.initializeJoystickLayout();
    } else {
      this.initializeZoneLayout();
    }

    // Prevent default touch behaviors
    DeviceDetection.preventZoom();
    DeviceDetection.preventScroll();
  }

  initializeJoystickLayout() {
    const screenHeight = window.innerHeight;
    const screenWidth = window.innerWidth;

    // Left side: Steering joystick
    this.joystick = new VirtualJoystick({
      container: this.container,
      x: 100,
      y: screenHeight - 100,
      radius: 70,
      innerRadius: 30,
      color: 'rgba(100, 100, 255, 0.3)',
      innerColor: 'rgba(100, 100, 255, 0.6)',
      strokeColor: 'rgba(200, 200, 255, 0.8)',
      onChange: (data) => {
        this.inputs.lean = -data.x * this.options.sensitivity.lean; // Invert X for lean
        this.notifyInputChange();
      },
      onStart: () => {
        this.hapticFeedback(10);
      },
      onEnd: () => {
        this.inputs.lean = 0;
        this.notifyInputChange();
      }
    });

    // Right side: Throttle and brake controls
    this.createThrottleBrakeControls();
  }

  createThrottleBrakeControls() {
    const screenHeight = window.innerHeight;
    const screenWidth = window.innerWidth;

    // Create container for throttle/brake
    const controlsContainer = document.createElement('div');
    controlsContainer.style.position = 'absolute';
    controlsContainer.style.right = '30px';
    controlsContainer.style.bottom = '30px';
    controlsContainer.style.width = '120px';
    controlsContainer.style.height = '250px';
    controlsContainer.style.display = 'flex';
    controlsContainer.style.flexDirection = 'column';
    controlsContainer.style.gap = '20px';
    controlsContainer.style.zIndex = '1000';
    this.container.appendChild(controlsContainer);

    // Throttle button
    const throttleBtn = document.createElement('div');
    throttleBtn.style.flex = '1';
    throttleBtn.style.background = 'linear-gradient(135deg, rgba(0, 255, 0, 0.3), rgba(0, 200, 0, 0.3))';
    throttleBtn.style.border = '2px solid rgba(0, 255, 0, 0.6)';
    throttleBtn.style.borderRadius = '15px';
    throttleBtn.style.display = 'flex';
    throttleBtn.style.alignItems = 'center';
    throttleBtn.style.justifyContent = 'center';
    throttleBtn.style.color = 'white';
    throttleBtn.style.fontSize = '18px';
    throttleBtn.style.fontWeight = 'bold';
    throttleBtn.style.userSelect = 'none';
    throttleBtn.style.touchAction = 'none';
    throttleBtn.textContent = '↑ GAS';
    controlsContainer.appendChild(throttleBtn);

    // Brake button
    const brakeBtn = document.createElement('div');
    brakeBtn.style.flex = '1';
    brakeBtn.style.background = 'linear-gradient(135deg, rgba(255, 0, 0, 0.3), rgba(200, 0, 0, 0.3))';
    brakeBtn.style.border = '2px solid rgba(255, 0, 0, 0.6)';
    brakeBtn.style.borderRadius = '15px';
    brakeBtn.style.display = 'flex';
    brakeBtn.style.alignItems = 'center';
    brakeBtn.style.justifyContent = 'center';
    brakeBtn.style.color = 'white';
    brakeBtn.style.fontSize = '18px';
    brakeBtn.style.fontWeight = 'bold';
    brakeBtn.style.userSelect = 'none';
    brakeBtn.style.touchAction = 'none';
    brakeBtn.textContent = '↓ BRAKE';
    controlsContainer.appendChild(brakeBtn);

    // Touch event handlers for throttle
    throttleBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.activeTouches.set('throttle', touch.identifier);
      this.inputs.throttle = 1.0 * this.options.sensitivity.throttle;
      throttleBtn.style.background = 'linear-gradient(135deg, rgba(0, 255, 0, 0.6), rgba(0, 200, 0, 0.6))';
      this.hapticFeedback(20);
      this.notifyInputChange();
    }, { passive: false });

    throttleBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.activeTouches.delete('throttle');
      this.inputs.throttle = 0;
      throttleBtn.style.background = 'linear-gradient(135deg, rgba(0, 255, 0, 0.3), rgba(0, 200, 0, 0.3))';
      this.notifyInputChange();
    }, { passive: false });

    // Touch event handlers for brake
    brakeBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.activeTouches.set('brake', touch.identifier);
      this.inputs.brake = 1.0 * this.options.sensitivity.brake;
      this.inputs.frontBrake = 0.6; // Front brake gets 60%
      this.inputs.rearBrake = 0.8; // Rear brake gets 80%
      brakeBtn.style.background = 'linear-gradient(135deg, rgba(255, 0, 0, 0.6), rgba(200, 0, 0, 0.6))';
      this.hapticFeedback(30);
      this.notifyInputChange();
    }, { passive: false });

    brakeBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.activeTouches.delete('brake');
      this.inputs.brake = 0;
      this.inputs.frontBrake = 0;
      this.inputs.rearBrake = 0;
      brakeBtn.style.background = 'linear-gradient(135deg, rgba(255, 0, 0, 0.3), rgba(200, 0, 0, 0.3))';
      this.notifyInputChange();
    }, { passive: false });

    // Mouse events for testing
    throttleBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.inputs.throttle = 1.0 * this.options.sensitivity.throttle;
      throttleBtn.style.background = 'linear-gradient(135deg, rgba(0, 255, 0, 0.6), rgba(0, 200, 0, 0.6))';
      this.notifyInputChange();
    });

    throttleBtn.addEventListener('mouseup', (e) => {
      e.preventDefault();
      this.inputs.throttle = 0;
      throttleBtn.style.background = 'linear-gradient(135deg, rgba(0, 255, 0, 0.3), rgba(0, 200, 0, 0.3))';
      this.notifyInputChange();
    });

    brakeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.inputs.brake = 1.0 * this.options.sensitivity.brake;
      this.inputs.frontBrake = 0.6;
      this.inputs.rearBrake = 0.8;
      brakeBtn.style.background = 'linear-gradient(135deg, rgba(255, 0, 0, 0.6), rgba(200, 0, 0, 0.6))';
      this.notifyInputChange();
    });

    brakeBtn.addEventListener('mouseup', (e) => {
      e.preventDefault();
      this.inputs.brake = 0;
      this.inputs.frontBrake = 0;
      this.inputs.rearBrake = 0;
      brakeBtn.style.background = 'linear-gradient(135deg, rgba(255, 0, 0, 0.3), rgba(200, 0, 0, 0.3))';
      this.notifyInputChange();
    });

    this.throttleBtn = throttleBtn;
    this.brakeBtn = brakeBtn;
    this.controlsContainer = controlsContainer;
  }

  initializeZoneLayout() {
    // Alternative layout: split screen into zones
    // Left half = lean left, Right half = lean right
    // Top portions = throttle, Bottom portions = brake

    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.zIndex = '999';
    overlay.style.pointerEvents = 'none';
    this.container.appendChild(overlay);

    // Create zones
    const zones = [
      { name: 'leftThrottle', x: 0, y: 0, width: 0.5, height: 0.5 },
      { name: 'leftBrake', x: 0, y: 0.5, width: 0.5, height: 0.5 },
      { name: 'rightThrottle', x: 0.5, y: 0, width: 0.5, height: 0.5 },
      { name: 'rightBrake', x: 0.5, y: 0.5, width: 0.5, height: 0.5 }
    ];

    zones.forEach(zone => {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.left = (zone.x * 100) + '%';
      el.style.top = (zone.y * 100) + '%';
      el.style.width = (zone.width * 100) + '%';
      el.style.height = (zone.height * 100) + '%';
      el.style.pointerEvents = 'auto';
      el.style.touchAction = 'none';

      // Visual feedback (for testing, can be removed)
      el.style.border = '1px solid rgba(255, 255, 255, 0.2)';

      overlay.appendChild(el);

      // Touch handlers
      el.addEventListener('touchstart', (e) => this.handleZoneTouch(e, zone.name, true), { passive: false });
      el.addEventListener('touchend', (e) => this.handleZoneTouch(e, zone.name, false), { passive: false });
    });
  }

  handleZoneTouch(event, zone, isStart) {
    event.preventDefault();

    if (isStart) {
      if (zone.includes('left')) {
        this.inputs.lean = -0.7;
      } else {
        this.inputs.lean = 0.7;
      }

      if (zone.includes('Throttle')) {
        this.inputs.throttle = 1.0;
      } else {
        this.inputs.brake = 1.0;
        this.inputs.frontBrake = 0.6;
        this.inputs.rearBrake = 0.8;
      }

      this.hapticFeedback(15);
    } else {
      // Release
      this.inputs.lean = 0;
      this.inputs.throttle = 0;
      this.inputs.brake = 0;
      this.inputs.frontBrake = 0;
      this.inputs.rearBrake = 0;
    }

    this.notifyInputChange();
  }

  notifyInputChange() {
    this.onInputChange({ ...this.inputs });
  }

  hapticFeedback(duration = 10) {
    if (this.options.hapticFeedback && DeviceDetection.hasHaptics()) {
      DeviceDetection.vibrate(duration);
    }
  }

  getInputs() {
    return { ...this.inputs };
  }

  setEnabled(enabled) {
    this.options.enabled = enabled;

    if (this.joystick) {
      this.joystick.canvas.style.display = enabled ? 'block' : 'none';
      this.joystick.touchZone.style.display = enabled ? 'block' : 'none';
    }

    if (this.controlsContainer) {
      this.controlsContainer.style.display = enabled ? 'flex' : 'none';
    }
  }

  setSensitivity(type, value) {
    if (this.options.sensitivity.hasOwnProperty(type)) {
      this.options.sensitivity[type] = Math.max(0.1, Math.min(2.0, value));
    }
  }

  destroy() {
    if (this.joystick) {
      this.joystick.destroy();
    }

    if (this.controlsContainer) {
      this.controlsContainer.remove();
    }

    this.activeTouches.clear();
  }
}
