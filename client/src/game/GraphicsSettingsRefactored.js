import { EventManager } from '../../refactoring/src/core/EventManager.js';

/**
 * Refactored GraphicsSettings with proper event management
 * Fixes memory leaks from event listeners not being removed
 */
export class GraphicsSettings {
  constructor(performanceManager) {
    this.performanceManager = performanceManager;
    this.settingsPanel = null;
    this.isOpen = false;

    // Event manager for proper cleanup
    this.eventManager = new EventManager();

    // Custom settings that override auto-adjust
    this.customSettings = {
      preset: 'auto',
      shadows: true,
      shadowQuality: 'medium',
      antialias: true,
      pixelRatio: 1.0,
      vehicleDensity: 'medium',
      particleEffects: true,
      backgroundQuality: 'high',
      fogDistance: 'medium',
      postProcessing: false,
      autoAdjust: true
    };

    // Preset configurations (same as before)
    this.presets = {
      low: {
        shadows: false,
        shadowQuality: 'low',
        antialias: false,
        pixelRatio: 0.75,
        vehicleDensity: 'low',
        particleEffects: false,
        backgroundQuality: 'low',
        fogDistance: 'near',
        postProcessing: false,
        autoAdjust: false
      },
      medium: {
        shadows: true,
        shadowQuality: 'low',
        antialias: false,
        pixelRatio: 1.0,
        vehicleDensity: 'medium',
        particleEffects: true,
        backgroundQuality: 'medium',
        fogDistance: 'medium',
        postProcessing: false,
        autoAdjust: false
      },
      high: {
        shadows: true,
        shadowQuality: 'medium',
        antialias: true,
        pixelRatio: 1.25,
        vehicleDensity: 'high',
        particleEffects: true,
        backgroundQuality: 'high',
        fogDistance: 'far',
        postProcessing: false,
        autoAdjust: false
      },
      ultra: {
        shadows: true,
        shadowQuality: 'high',
        antialias: true,
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        vehicleDensity: 'high',
        particleEffects: true,
        backgroundQuality: 'high',
        fogDistance: 'far',
        postProcessing: true,
        autoAdjust: false
      }
    };

    this.loadSettings();
    this.createUI();
    this.setupKeyboardShortcuts();
  }

  loadSettings() {
    const savedSettings = localStorage.getItem('motosaiGraphicsSettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        this.customSettings = { ...this.customSettings, ...parsed };
      } catch (e) {
        console.error('Failed to load graphics settings:', e);
      }
    }
  }

  saveSettings() {
    localStorage.setItem('motosaiGraphicsSettings', JSON.stringify(this.customSettings));
  }

  createUI() {
    // Create settings button
    const settingsButton = document.createElement('button');
    settingsButton.id = 'graphics-settings-button';
    settingsButton.innerHTML = '⚙️';
    settingsButton.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 40px;
      height: 40px;
      background: rgba(0, 0, 0, 0.7);
      border: 2px solid #444;
      border-radius: 8px;
      color: white;
      font-size: 20px;
      cursor: pointer;
      z-index: 1000;
      transition: all 0.3s;
    `;

    // Use EventManager for hover effects
    this.eventManager.add(settingsButton, 'mouseover', () => {
      settingsButton.style.background = 'rgba(0, 0, 0, 0.9)';
      settingsButton.style.borderColor = '#666';
    }, {}, 'ui');

    this.eventManager.add(settingsButton, 'mouseout', () => {
      settingsButton.style.background = 'rgba(0, 0, 0, 0.7)';
      settingsButton.style.borderColor = '#444';
    }, {}, 'ui');

    // Create settings panel
    this.settingsPanel = document.createElement('div');
    this.settingsPanel.id = 'graphics-settings-panel';
    this.settingsPanel.style.cssText = `
      position: fixed;
      top: 60px;
      right: 10px;
      width: 320px;
      max-height: 80vh;
      background: rgba(20, 20, 20, 0.95);
      border: 2px solid #444;
      border-radius: 12px;
      color: white;
      padding: 20px;
      z-index: 999;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;

    this.updatePanelContent();

    // Add to DOM
    document.body.appendChild(settingsButton);
    document.body.appendChild(this.settingsPanel);

    // Toggle panel on button click - using EventManager
    this.eventManager.add(settingsButton, 'click', () => this.togglePanel(), {}, 'ui');

    // Close on escape - using EventManager
    this.eventManager.add(document, 'keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.togglePanel();
      }
    }, {}, 'ui');
  }

  updatePanelContent() {
    const currentFPS = this.performanceManager.getAverageFPS();

    // Same HTML content as before
    this.settingsPanel.innerHTML = `
      <h2 style="margin: 0 0 20px 0; font-size: 20px; border-bottom: 2px solid #444; padding-bottom: 10px;">
        Graphics Settings
      </h2>

      <div style="margin-bottom: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <span>Current FPS:</span>
          <span style="color: ${currentFPS < 30 ? '#ff6666' : currentFPS < 50 ? '#ffcc66' : '#66ff66'}">
            ${currentFPS.toFixed(0)}
          </span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Performance:</span>
          <span>${this.performanceManager.performanceLevel}</span>
        </div>
      </div>

      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500;">Quality Preset</label>
        <select id="preset-select" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; border-radius: 4px; color: white; font-size: 14px;">
          <option value="auto" ${this.customSettings.preset === 'auto' ? 'selected' : ''}>Auto-Adjust</option>
          <option value="low" ${this.customSettings.preset === 'low' ? 'selected' : ''}>Low (Potato)</option>
          <option value="medium" ${this.customSettings.preset === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="high" ${this.customSettings.preset === 'high' ? 'selected' : ''}>High</option>
          <option value="ultra" ${this.customSettings.preset === 'ultra' ? 'selected' : ''}>Ultra</option>
          <option value="custom" ${this.customSettings.preset === 'custom' ? 'selected' : ''}>Custom</option>
        </select>
      </div>

      <div id="custom-settings" style="display: ${this.customSettings.preset === 'custom' ? 'block' : 'none'};">
        <h3 style="font-size: 16px; margin: 20px 0 15px 0; color: #aaa;">Advanced Settings</h3>

        <div style="margin-bottom: 15px;">
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" id="shadows-toggle" ${this.customSettings.shadows ? 'checked' : ''}
                   style="margin-right: 8px;">
            Enable Shadows
          </label>
        </div>

        <div style="margin-bottom: 15px; ${!this.customSettings.shadows ? 'opacity: 0.5; pointer-events: none;' : ''}">
          <label style="display: block; margin-bottom: 8px;">Shadow Quality</label>
          <select id="shadow-quality" style="width: 100%; padding: 6px; background: #333; border: 1px solid #555; border-radius: 4px; color: white;">
            <option value="low" ${this.customSettings.shadowQuality === 'low' ? 'selected' : ''}>Low</option>
            <option value="medium" ${this.customSettings.shadowQuality === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${this.customSettings.shadowQuality === 'high' ? 'selected' : ''}>High</option>
          </select>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" id="antialias-toggle" ${this.customSettings.antialias ? 'checked' : ''}
                   style="margin-right: 8px;">
            Anti-Aliasing (Smoother edges)
          </label>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 8px;">
            Render Scale: <span id="pixel-ratio-value">${(this.customSettings.pixelRatio * 100).toFixed(0)}%</span>
          </label>
          <input type="range" id="pixel-ratio" min="50" max="200" step="25"
                 value="${this.customSettings.pixelRatio * 100}"
                 style="width: 100%;">
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 8px;">Traffic Density</label>
          <select id="vehicle-density" style="width: 100%; padding: 6px; background: #333; border: 1px solid #555; border-radius: 4px; color: white;">
            <option value="low" ${this.customSettings.vehicleDensity === 'low' ? 'selected' : ''}>Low (15 cars)</option>
            <option value="medium" ${this.customSettings.vehicleDensity === 'medium' ? 'selected' : ''}>Medium (25 cars)</option>
            <option value="high" ${this.customSettings.vehicleDensity === 'high' ? 'selected' : ''}>High (40 cars)</option>
          </select>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" id="particles-toggle" ${this.customSettings.particleEffects ? 'checked' : ''}
                   style="margin-right: 8px;">
            Particle Effects (Blood, debris)
          </label>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 8px;">Background Quality</label>
          <select id="background-quality" style="width: 100%; padding: 6px; background: #333; border: 1px solid #555; border-radius: 4px; color: white;">
            <option value="low" ${this.customSettings.backgroundQuality === 'low' ? 'selected' : ''}>Low (Static)</option>
            <option value="medium" ${this.customSettings.backgroundQuality === 'medium' ? 'selected' : ''}>Medium (Cached)</option>
            <option value="high" ${this.customSettings.backgroundQuality === 'high' ? 'selected' : ''}>High (Dynamic)</option>
          </select>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 8px;">View Distance</label>
          <select id="fog-distance" style="width: 100%; padding: 6px; background: #333; border: 1px solid #555; border-radius: 4px; color: white;">
            <option value="near" ${this.customSettings.fogDistance === 'near' ? 'selected' : ''}>Near (500m)</option>
            <option value="medium" ${this.customSettings.fogDistance === 'medium' ? 'selected' : ''}>Medium (1000m)</option>
            <option value="far" ${this.customSettings.fogDistance === 'far' ? 'selected' : ''}>Far (2000m)</option>
          </select>
        </div>
      </div>

      <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #444;">
        <button id="apply-settings" style="width: 100%; padding: 10px; background: #4CAF50; border: none; border-radius: 6px; color: white; font-weight: 500; cursor: pointer; font-size: 14px;">
          Apply Settings
        </button>
        <button id="reset-settings" style="width: 100%; padding: 10px; margin-top: 8px; background: #666; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 14px;">
          Reset to Default
        </button>
      </div>

      <div style="margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 6px; font-size: 12px; color: #888;">
        💡 Tip: Press <kbd>G</kbd> to toggle this menu
      </div>
    `;

    // Clear old panel listeners before attaching new ones
    this.eventManager.removeContext('panel');
    this.attachEventListeners();
  }

  attachEventListeners() {
    // All event listeners use EventManager with 'panel' context for easy cleanup

    // Preset selector
    const presetSelect = document.getElementById('preset-select');
    if (presetSelect) {
      this.eventManager.add(presetSelect, 'change', (e) => {
        this.customSettings.preset = e.target.value;
        if (e.target.value !== 'custom' && e.target.value !== 'auto') {
          this.applyPreset(e.target.value);
        } else if (e.target.value === 'auto') {
          this.customSettings.autoAdjust = true;
          this.performanceManager.enableAutoAdjust(true);
        }
        this.updatePanelContent();
      }, {}, 'panel');
    }

    // Custom settings listeners
    const shadowsToggle = document.getElementById('shadows-toggle');
    if (shadowsToggle) {
      this.eventManager.add(shadowsToggle, 'change', (e) => {
        this.customSettings.shadows = e.target.checked;
        this.customSettings.preset = 'custom';
        this.updatePanelContent();
      }, {}, 'panel');
    }

    const shadowQuality = document.getElementById('shadow-quality');
    if (shadowQuality) {
      this.eventManager.add(shadowQuality, 'change', (e) => {
        this.customSettings.shadowQuality = e.target.value;
        this.customSettings.preset = 'custom';
      }, {}, 'panel');
    }

    const antialiasToggle = document.getElementById('antialias-toggle');
    if (antialiasToggle) {
      this.eventManager.add(antialiasToggle, 'change', (e) => {
        this.customSettings.antialias = e.target.checked;
        this.customSettings.preset = 'custom';
      }, {}, 'panel');
    }

    const pixelRatio = document.getElementById('pixel-ratio');
    const pixelRatioValue = document.getElementById('pixel-ratio-value');
    if (pixelRatio) {
      this.eventManager.add(pixelRatio, 'input', (e) => {
        const value = e.target.value / 100;
        this.customSettings.pixelRatio = value;
        if (pixelRatioValue) {
          pixelRatioValue.textContent = `${e.target.value}%`;
        }
        this.customSettings.preset = 'custom';
      }, {}, 'panel');
    }

    const vehicleDensity = document.getElementById('vehicle-density');
    if (vehicleDensity) {
      this.eventManager.add(vehicleDensity, 'change', (e) => {
        this.customSettings.vehicleDensity = e.target.value;
        this.customSettings.preset = 'custom';
      }, {}, 'panel');
    }

    const particlesToggle = document.getElementById('particles-toggle');
    if (particlesToggle) {
      this.eventManager.add(particlesToggle, 'change', (e) => {
        this.customSettings.particleEffects = e.target.checked;
        this.customSettings.preset = 'custom';
      }, {}, 'panel');
    }

    const backgroundQuality = document.getElementById('background-quality');
    if (backgroundQuality) {
      this.eventManager.add(backgroundQuality, 'change', (e) => {
        this.customSettings.backgroundQuality = e.target.value;
        this.customSettings.preset = 'custom';
      }, {}, 'panel');
    }

    const fogDistance = document.getElementById('fog-distance');
    if (fogDistance) {
      this.eventManager.add(fogDistance, 'change', (e) => {
        this.customSettings.fogDistance = e.target.value;
        this.customSettings.preset = 'custom';
      }, {}, 'panel');
    }

    // Apply and Reset buttons
    const applyButton = document.getElementById('apply-settings');
    if (applyButton) {
      this.eventManager.add(applyButton, 'click', () => {
        this.applySettings();
        this.saveSettings();
        this.showNotification('Settings applied!');
      }, {}, 'panel');
    }

    const resetButton = document.getElementById('reset-settings');
    if (resetButton) {
      this.eventManager.add(resetButton, 'click', () => {
        this.resetToDefault();
        this.updatePanelContent();
        this.applySettings();
        this.showNotification('Settings reset to default');
      }, {}, 'panel');
    }
  }

  applyPreset(presetName) {
    if (this.presets[presetName]) {
      this.customSettings = {
        ...this.customSettings,
        ...this.presets[presetName],
        preset: presetName
      };
      this.performanceManager.enableAutoAdjust(false);
      this.performanceManager.setPerformanceLevel(presetName === 'ultra' ? 'high' : presetName);
    }
  }

  applySettings() {
    // Dispatch event with all settings
    const event = new CustomEvent('graphicsSettingsChanged', {
      detail: this.customSettings
    });
    window.dispatchEvent(event);

    // If custom preset, disable auto-adjust
    if (this.customSettings.preset === 'custom') {
      this.performanceManager.enableAutoAdjust(false);
    }
  }

  resetToDefault() {
    this.customSettings = {
      preset: 'auto',
      shadows: true,
      shadowQuality: 'medium',
      antialias: true,
      pixelRatio: 1.0,
      vehicleDensity: 'medium',
      particleEffects: true,
      backgroundQuality: 'high',
      fogDistance: 'medium',
      postProcessing: false,
      autoAdjust: true
    };
    this.performanceManager.enableAutoAdjust(true);
    this.saveSettings();
  }

  togglePanel() {
    this.isOpen = !this.isOpen;
    this.settingsPanel.style.display = this.isOpen ? 'block' : 'none';
    if (this.isOpen) {
      this.updatePanelContent();
    }
  }

  setupKeyboardShortcuts() {
    // Use EventManager for keyboard shortcuts
    this.eventManager.add(document, 'keydown', (e) => {
      // G key to toggle graphics settings
      if (e.key === 'g' || e.key === 'G') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          this.togglePanel();
        }
      }

      // Number keys for quick presets
      if (!this.isOpen && !e.ctrlKey && !e.metaKey && !e.altKey) {
        switch(e.key) {
          case '1':
            this.applyPreset('low');
            this.applySettings();
            this.showNotification('Low quality preset applied');
            break;
          case '2':
            this.applyPreset('medium');
            this.applySettings();
            this.showNotification('Medium quality preset applied');
            break;
          case '3':
            this.applyPreset('high');
            this.applySettings();
            this.showNotification('High quality preset applied');
            break;
          case '4':
            this.applyPreset('ultra');
            this.applySettings();
            this.showNotification('Ultra quality preset applied');
            break;
        }
      }
    }, {}, 'shortcuts');
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(40, 40, 40, 0.95);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Auto-remove notification
    const timeout = setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        notification.remove();
        style.remove();
      }, 300);
    }, 2000);

    // Track timeout for cleanup
    if (!this.notificationTimeouts) {
      this.notificationTimeouts = new Set();
    }
    this.notificationTimeouts.add(timeout);
  }

  getSettings() {
    return this.customSettings;
  }

  /**
   * Properly dispose all resources and event listeners
   */
  dispose() {
    // Remove all event listeners
    this.eventManager.dispose();

    // Clear notification timeouts
    if (this.notificationTimeouts) {
      this.notificationTimeouts.forEach(timeout => clearTimeout(timeout));
      this.notificationTimeouts.clear();
    }

    // Remove UI elements
    const button = document.getElementById('graphics-settings-button');
    if (button) {
      button.remove();
    }

    if (this.settingsPanel) {
      this.settingsPanel.remove();
      this.settingsPanel = null;
    }

    console.log('GraphicsSettings disposed - all event listeners removed');
  }
}