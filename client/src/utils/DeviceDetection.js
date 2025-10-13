// Device Detection Utility
// Detects mobile devices and provides device-specific information

export class DeviceDetection {
  static isMobile() {
    // Check for URL parameter to force mobile mode for testing
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('forceMobile') === 'true') {
      console.log('🧪 FORCE MOBILE MODE - Testing mobile controls on desktop');
      return true;
    }

    // Check for mobile user agents first (most reliable)
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;

    // Check for mobile patterns in user agent - be very strict
    const mobilePattern = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    const isMobileUA = mobilePattern.test(userAgent.toLowerCase());

    // Check if device has a mouse/trackpad (fine pointer)
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches;

    // Check for coarse pointer (finger/stylus) as primary input
    const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;

    // Screen size check
    const isSmallScreen = window.innerWidth <= 768;

    // If user agent says mobile, return true
    if (isMobileUA) return true;

    // If has fine pointer (mouse/trackpad), it's a desktop - period
    // This catches touchscreen laptops, Macs with Touch Bar, etc.
    if (hasFinePointer) return false;

    // Only if primary pointer is coarse (touch) AND small screen = mobile
    return (hasCoarsePointer && isSmallScreen);
  }

  static isTablet() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;

    // iPad or Android tablet
    const isIPad = /ipad/i.test(userAgent.toLowerCase());
    const isAndroidTablet = /android/i.test(userAgent.toLowerCase()) && !/mobile/i.test(userAgent.toLowerCase());

    const isLargeTouch = (
      ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
      window.innerWidth >= 768 &&
      window.innerWidth <= 1024
    );

    return isIPad || isAndroidTablet || isLargeTouch;
  }

  static isIOS() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /iphone|ipad|ipod/i.test(userAgent.toLowerCase());
  }

  static isAndroid() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android/i.test(userAgent.toLowerCase());
  }

  static hasGyroscope() {
    return 'DeviceOrientationEvent' in window;
  }

  static hasHaptics() {
    return 'vibrate' in navigator;
  }

  static getScreenSize() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1
    };
  }

  static getDeviceInfo() {
    return {
      isMobile: this.isMobile(),
      isTablet: this.isTablet(),
      isIOS: this.isIOS(),
      isAndroid: this.isAndroid(),
      hasGyroscope: this.hasGyroscope(),
      hasHaptics: this.hasHaptics(),
      hasTouch: 'ontouchstart' in window,
      screen: this.getScreenSize(),
      userAgent: navigator.userAgent
    };
  }

  static getPerformanceTier() {
    const info = this.getDeviceInfo();

    // Estimate performance tier based on device characteristics
    if (!info.isMobile) return 'high'; // Desktop

    const memory = navigator.deviceMemory || 4; // GB
    const cores = navigator.hardwareConcurrency || 4;
    const pixelRatio = info.screen.pixelRatio;

    // High-end mobile
    if (memory >= 6 && cores >= 6 && pixelRatio >= 2) {
      return 'high';
    }

    // Mid-range mobile
    if (memory >= 3 && cores >= 4) {
      return 'medium';
    }

    // Low-end mobile
    return 'low';
  }

  static supportsFullscreen() {
    return !!(
      document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      document.mozFullScreenEnabled ||
      document.msFullscreenEnabled
    );
  }

  static requestFullscreen(element) {
    if (element.requestFullscreen) {
      return element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      return element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
      return element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
      return element.msRequestFullscreen();
    }
    return Promise.reject(new Error('Fullscreen not supported'));
  }

  static exitFullscreen() {
    if (document.exitFullscreen) {
      return document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      return document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      return document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      return document.msExitFullscreen();
    }
    return Promise.reject(new Error('Exit fullscreen not supported'));
  }

  static vibrate(pattern) {
    if (this.hasHaptics()) {
      return navigator.vibrate(pattern);
    }
    return false;
  }

  static preventZoom() {
    // Prevent pinch zoom on mobile
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    document.addEventListener('gestureend', (e) => e.preventDefault());
  }

  static preventScroll() {
    // Prevent pull-to-refresh and overscroll
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';

    // Prevent default touch behaviors
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1) {
        e.preventDefault(); // Prevent pinch zoom
      }
    }, { passive: false });
  }
}
