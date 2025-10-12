# 📱 Motosai Mobile Controls Guide

Complete guide for mobile support and touch controls in Motosai motorcycle simulator.

## Overview

Motosai now includes full mobile support with optimized touch controls, performance settings, and responsive UI designed for smartphones and tablets.

## Features

### Mobile Touch Controls
- ✅ **Virtual Joystick** - Intuitive steering/leaning control
- ✅ **Touch Buttons** - Dedicated throttle and brake controls
- ✅ **Haptic Feedback** - Vibration on touch (when available)
- ✅ **Multi-touch Support** - Simultaneous throttle and steering
- ✅ **Responsive UI** - Adapts to all screen sizes and orientations

### Device Detection
- ✅ Automatic mobile device detection
- ✅ Performance tier classification (low/medium/high)
- ✅ iOS and Android support
- ✅ Tablet optimization
- ✅ Gyroscope/haptics detection

### Performance Optimizations
- ✅ Reduced polygon counts on mobile
- ✅ Lower resolution shadows (256-1024 vs 512-2048)
- ✅ Disabled antialiasing on mobile
- ✅ Fewer traffic vehicles (5-12 vs 10-20)
- ✅ Optimized particle effects
- ✅ Adaptive frame rate targeting (30 FPS mobile, 60 FPS desktop)
- ✅ Dynamic quality adjustment based on performance

## Architecture

### Core Components

#### 1. DeviceDetection (`utils/DeviceDetection.js`)
Utility for detecting mobile devices and capabilities:
```javascript
import { DeviceDetection } from './utils/DeviceDetection.js';

// Check if mobile
if (DeviceDetection.isMobile()) {
  // Initialize mobile controls
}

// Get device info
const info = DeviceDetection.getDeviceInfo();
// Returns: { isMobile, isTablet, isIOS, isAndroid, hasGyroscope, hasHaptics, ... }

// Get performance tier
const tier = DeviceDetection.getPerformanceTier();
// Returns: 'low' | 'medium' | 'high'
```

#### 2. VirtualJoystick (`controls/VirtualJoystick.js`)
Canvas-based joystick component:
```javascript
import { VirtualJoystick } from './controls/VirtualJoystick.js';

const joystick = new VirtualJoystick({
  container: document.body,
  x: 100,  // Position X
  y: window.innerHeight - 100,  // Position Y
  radius: 70,  // Outer radius
  innerRadius: 30,  // Thumb radius
  onChange: (data) => {
    // data.x, data.y = normalized (-1 to 1)
    // data.angle, data.distance
  }
});
```

#### 3. MobileTouchController (`controls/MobileTouchController.js`)
Main mobile control system with two layout modes:

**Joystick Layout** (default):
- Virtual joystick on left for steering
- Throttle/brake buttons on right

**Zone Layout** (alternative):
- Left half = lean left
- Right half = lean right
- Top portions = throttle
- Bottom portions = brake

```javascript
import { MobileTouchController } from './controls/MobileTouchController.js';

const mobileController = new MobileTouchController(container, {
  enabled: true,
  hapticFeedback: true,
  controlLayout: 'joystick', // or 'zones'
  sensitivity: {
    lean: 1.0,
    throttle: 1.0,
    brake: 1.0
  },
  onInputChange: (inputs) => {
    // Handle input changes
    // inputs: { lean, throttle, brake, frontBrake, rearBrake }
  }
});
```

#### 4. InputController (`physics/InputController.js`)
Enhanced with mobile support:
```javascript
const inputController = new InputController({ isMobile: true });

// Update from mobile inputs
inputController.updateFromMobile({
  lean: 0.5,
  throttle: 1.0,
  brake: 0.0
});

// Automatically adjusts smoothing and rate limits for mobile
```

### Integration in MotosaiGame.js

```javascript
// Device detection
this.deviceInfo = DeviceDetection.getDeviceInfo();
this.isMobile = this.deviceInfo.isMobile;
this.performanceTier = DeviceDetection.getPerformanceTier();

// Initialize mobile controls
if (this.isMobile) {
  this.mobileController = new MobileTouchController(this.container, {
    enabled: true,
    hapticFeedback: true,
    onInputChange: (inputs) => {
      if (this.inputController) {
        this.inputController.updateFromMobile(inputs);
      }
    }
  });
}

// Initialize input controller with mobile support
this.inputController = new InputController({ isMobile: this.isMobile });
```

## Mobile-Specific Optimizations

### Performance Settings

Performance configuration automatically adjusts based on device:

| Setting | Desktop Low | Mobile Low | Desktop Medium | Mobile Medium | Desktop High | Mobile High |
|---------|-------------|------------|----------------|---------------|--------------|-------------|
| Shadow Map | 512px | 256px | 1024px | 512px | 2048px | 1024px |
| Antialiasing | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| Max Vehicles | 10 | 5 | 15 | 8 | 20 | 12 |
| Target FPS | 45 | 30 | 60 | 30 | 60 | 30 |
| Pixel Ratio | 1.0 | 1.0 | 1.25 | 1.0 | 1.5 | 1.0 |

### Input Parameters

Mobile inputs use optimized smoothing for better responsiveness:

```javascript
// Mobile vs Desktop differences
const smoothing = {
  lean: isMobile ? 0.12 : 0.08,  // Less smoothing for mobile
};

const rateLimits = {
  lean: isMobile ? 1.8 : 1.2,  // Faster response on mobile
};

const deadZones = {
  lean: isMobile ? 0.02 : 0.05,  // Smaller dead zone on mobile
};

const historySize = isMobile ? 3 : 5;  // Shorter history = less latency
```

## HTML/CSS Setup

### Viewport Configuration

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="theme-color" content="#000000" />
```

### CSS Mobile Optimizations

```css
body {
  /* Prevent pull-to-refresh */
  overscroll-behavior: none;

  /* Prevent text selection */
  user-select: none;
  -webkit-user-select: none;

  /* Prevent tap highlight */
  -webkit-tap-highlight-color: transparent;

  /* Support notch devices */
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
           env(safe-area-inset-bottom) env(safe-area-inset-left);
}

/* Dynamic viewport height for mobile */
#gameContainer {
  height: 100dvh;
}
```

## Testing

### Desktop Testing
1. Open Chrome DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select a mobile device preset
4. Reload the page
5. Touch controls should appear

### Mobile Testing
1. Deploy to a test server with HTTPS
2. Access from mobile device
3. Test touch controls
4. Check performance (aim for 30+ FPS)
5. Test landscape/portrait orientations

### Test Checklist
- [ ] Virtual joystick responds smoothly
- [ ] Throttle/brake buttons work
- [ ] Haptic feedback triggers (if supported)
- [ ] No page scrolling/zooming on touch
- [ ] Keyboard controls hidden on mobile
- [ ] Performance acceptable (30+ FPS)
- [ ] Works on both iOS and Android
- [ ] Works in landscape and portrait
- [ ] Notch/cutout areas handled correctly
- [ ] Multiplayer works on mobile

## Control Customization

### Changing Control Layout

```javascript
// Switch to zone-based controls
mobileController.options.controlLayout = 'zones';

// Or initialize with zones
new MobileTouchController(container, {
  controlLayout: 'zones'
});
```

### Adjusting Sensitivity

```javascript
// Increase lean sensitivity
mobileController.setSensitivity('lean', 1.5);

// Decrease throttle sensitivity
mobileController.setSensitivity('throttle', 0.8);
```

### Customizing Joystick Appearance

```javascript
const joystick = new VirtualJoystick({
  // ... other options
  color: 'rgba(255, 100, 100, 0.3)',  // Base circle color
  innerColor: 'rgba(255, 100, 100, 0.6)',  // Thumb color
  strokeColor: 'rgba(255, 255, 255, 0.8)'  // Outline color
});
```

## Advanced Features

### Fullscreen API

```javascript
// Request fullscreen (useful for mobile immersion)
DeviceDetection.requestFullscreen(document.documentElement)
  .then(() => console.log('Entered fullscreen'))
  .catch(err => console.log('Fullscreen failed:', err));

// Exit fullscreen
DeviceDetection.exitFullscreen();
```

### Vibration/Haptics

```javascript
// Single vibration (50ms)
DeviceDetection.vibrate(50);

// Pattern: vibrate 100ms, pause 50ms, vibrate 100ms
DeviceDetection.vibrate([100, 50, 100]);
```

### Performance Monitoring

```javascript
// Get current FPS
const fps = performanceManager.getAverageFPS();

// Get device performance tier
const tier = DeviceDetection.getPerformanceTier();
// Returns: 'low', 'medium', or 'high'

// Check if specific features are supported
if (DeviceDetection.hasGyroscope()) {
  // Enable tilt controls
}
```

## Troubleshooting

### Controls Not Appearing
- Check browser console for errors
- Verify `DeviceDetection.isMobile()` returns true
- Ensure viewport meta tags are set
- Try forcing mobile mode: `?mobile=true` in URL

### Poor Performance
- Check performance tier: `DeviceDetection.getPerformanceTier()`
- Monitor FPS: `performanceManager.getAverageFPS()`
- Reduce traffic: Lower `maxVehicles` in performance config
- Disable shadows: Set `shadowMapSize: 0`

### Touch Not Working
- Ensure HTTPS (required for some mobile features)
- Check `touch-action: none` is set on controls
- Verify no other touch handlers are interfering
- Test in incognito mode (disable extensions)

### Joystick Positioning Issues
- Check screen resize handling
- Verify safe area insets on notched devices
- Test both portrait and landscape
- Adjust joystick position: `joystick.setPosition(x, y)`

## Performance Tips

1. **Start Conservative**: Begin with 'low' or 'medium' settings
2. **Monitor FPS**: Use performance manager to track frame rate
3. **Reduce Vehicles**: Biggest performance impact
4. **Lower Shadows**: Significant GPU savings
5. **Disable Post-Processing**: Bloom/SSAO very expensive
6. **Reduce Draw Distance**: Lower fog and LOD distances
7. **Test on Real Devices**: Emulators don't reflect real performance

## Future Enhancements

Potential additions for mobile support:

- [ ] Gyroscope tilt controls
- [ ] Touch gesture controls (swipe for camera, pinch for brake)
- [ ] Settings menu for control customization
- [ ] Tutorial overlay for first-time mobile users
- [ ] Alternative control schemes (racing wheel, etc.)
- [ ] Landscape orientation lock option
- [ ] Battery usage optimization
- [ ] Offline mode support
- [ ] Progressive Web App (PWA) features

## API Reference

### DeviceDetection

**Methods:**
- `isMobile()` → boolean
- `isTablet()` → boolean
- `isIOS()` → boolean
- `isAndroid()` → boolean
- `hasGyroscope()` → boolean
- `hasHaptics()` → boolean
- `getScreenSize()` → {width, height, pixelRatio}
- `getDeviceInfo()` → object
- `getPerformanceTier()` → 'low' | 'medium' | 'high'
- `requestFullscreen(element)` → Promise
- `exitFullscreen()` → Promise
- `vibrate(pattern)` → boolean
- `preventZoom()` → void
- `preventScroll()` → void

### MobileTouchController

**Constructor Options:**
```typescript
{
  enabled: boolean,
  hapticFeedback: boolean,
  controlLayout: 'joystick' | 'zones',
  sensitivity: {
    lean: number,    // 0.1 to 2.0
    throttle: number,
    brake: number
  },
  onInputChange: (inputs) => void
}
```

**Methods:**
- `getInputs()` → {lean, throttle, brake, frontBrake, rearBrake}
- `setEnabled(enabled: boolean)` → void
- `setSensitivity(type: string, value: number)` → void
- `destroy()` → void

### VirtualJoystick

**Constructor Options:**
```typescript
{
  container: HTMLElement,
  x: number,           // Base position X
  y: number,           // Base position Y
  radius: number,      // Outer radius (default: 60)
  innerRadius: number, // Thumb radius (default: 25)
  color: string,       // Base color
  innerColor: string,  // Thumb color
  strokeColor: string, // Outline color
  onChange: (data) => void,
  onStart: () => void,
  onEnd: () => void
}
```

**Methods:**
- `getValue()` → {x, y, active}
- `setPosition(x: number, y: number)` → void
- `reset()` → void
- `destroy()` → void

## Support

For issues or questions:
- Open an issue on GitHub
- Check browser console for errors
- Include device/browser info when reporting bugs

---

**Built with ❤️ for mobile motorcycle enthusiasts**
