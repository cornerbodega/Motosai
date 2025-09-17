/**
 * AudioManager - Centralized audio handling with proper cleanup
 * Manages all game sounds and prevents audio memory leaks
 */
export class AudioManager {
  constructor() {
    // Audio context for Web Audio API
    this.audioContext = null;

    // Track all audio elements
    this.audioElements = new Map();

    // Track all audio sources (Web Audio API)
    this.audioSources = new Map();

    // Audio pools for frequently used sounds
    this.soundPools = new Map();

    // Global settings
    this.masterVolume = 1.0;
    this.isMuted = false;

    // Categories for volume control
    this.categoryVolumes = new Map([
      ['sfx', 1.0],
      ['music', 0.8],
      ['ambient', 0.6],
      ['ui', 1.0]
    ]);

    // Initialize audio context on first user interaction
    this.initialized = false;

    // Track active sounds for cleanup
    this.activeSounds = new Set();

    // Fade tracking
    this.activeFades = new Map();
  }

  /**
   * Initialize audio context (must be called after user interaction)
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Create audio context
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();

      // Resume if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.initialized = true;
      console.log('[AudioManager] Initialized with sample rate:', this.audioContext.sampleRate);
    } catch (error) {
      console.error('[AudioManager] Failed to initialize:', error);
    }
  }

  /**
   * Create a sound pool for frequently used sounds
   * @param {string} key - Unique identifier for the sound
   * @param {string} url - URL to the audio file
   * @param {number} poolSize - Number of instances to pool
   * @param {string} category - Sound category
   */
  async createSoundPool(key, url, poolSize = 3, category = 'sfx') {
    if (this.soundPools.has(key)) {
      return this.soundPools.get(key);
    }

    const pool = {
      instances: [],
      currentIndex: 0,
      category,
      url
    };

    // Create multiple audio elements for pooling
    for (let i = 0; i < poolSize; i++) {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = this.getEffectiveVolume(category);

      // Track for cleanup
      this.audioElements.set(`${key}_${i}`, audio);
      pool.instances.push(audio);
    }

    this.soundPools.set(key, pool);

    // Preload all instances
    await Promise.all(pool.instances.map(audio =>
      new Promise(resolve => {
        audio.addEventListener('canplaythrough', resolve, { once: true });
        audio.load();
      })
    ));

    return pool;
  }

  /**
   * Play a pooled sound
   * @param {string} key - Sound pool key
   * @param {Object} options - Playback options
   */
  playPooledSound(key, options = {}) {
    const pool = this.soundPools.get(key);
    if (!pool) {
      console.warn(`[AudioManager] Sound pool '${key}' not found`);
      return null;
    }

    // Get next available instance from pool
    const audio = pool.instances[pool.currentIndex];
    pool.currentIndex = (pool.currentIndex + 1) % pool.instances.length;

    // Apply options
    audio.volume = this.getEffectiveVolume(pool.category) * (options.volume || 1.0);
    audio.playbackRate = options.playbackRate || 1.0;

    if (options.loop !== undefined) {
      audio.loop = options.loop;
    }

    // Reset and play
    audio.currentTime = 0;

    if (!this.isMuted) {
      audio.play().catch(error => {
        console.error(`[AudioManager] Error playing sound '${key}':`, error);
      });
    }

    // Track active sound
    this.activeSounds.add(audio);

    // Auto-cleanup when done
    if (!audio.loop) {
      audio.addEventListener('ended', () => {
        this.activeSounds.delete(audio);
      }, { once: true });
    }

    return audio;
  }

  /**
   * Play a one-shot sound (not pooled)
   * @param {string} url - URL to the audio file
   * @param {string} category - Sound category
   * @param {Object} options - Playback options
   */
  async playOneShot(url, category = 'sfx', options = {}) {
    if (this.isMuted) return null;

    const audio = new Audio(url);
    audio.volume = this.getEffectiveVolume(category) * (options.volume || 1.0);
    audio.playbackRate = options.playbackRate || 1.0;

    // Track for cleanup
    const id = `oneshot_${Date.now()}_${Math.random()}`;
    this.audioElements.set(id, audio);
    this.activeSounds.add(audio);

    // Auto-cleanup when done
    audio.addEventListener('ended', () => {
      this.activeSounds.delete(audio);
      this.audioElements.delete(id);
    }, { once: true });

    try {
      await audio.play();
      return audio;
    } catch (error) {
      console.error('[AudioManager] Error playing one-shot sound:', error);
      this.activeSounds.delete(audio);
      this.audioElements.delete(id);
      return null;
    }
  }

  /**
   * Play background music with crossfade support
   * @param {string} url - URL to the music file
   * @param {number} fadeInDuration - Fade in duration in ms
   */
  async playMusic(url, fadeInDuration = 2000) {
    // Stop current music with fadeout
    if (this.currentMusic) {
      await this.fadeOut(this.currentMusic, fadeInDuration / 2);
      this.stopSound(this.currentMusic);
    }

    // Create new music element
    const music = new Audio(url);
    music.loop = true;
    music.volume = 0;

    const id = 'background_music';
    this.audioElements.set(id, music);
    this.currentMusic = music;

    if (!this.isMuted) {
      try {
        await music.play();
        await this.fadeIn(music, fadeInDuration, this.getEffectiveVolume('music'));
      } catch (error) {
        console.error('[AudioManager] Error playing music:', error);
      }
    }

    return music;
  }

  /**
   * Fade in audio element
   * @param {HTMLAudioElement} audio - Audio element to fade
   * @param {number} duration - Fade duration in ms
   * @param {number} targetVolume - Target volume
   */
  async fadeIn(audio, duration = 1000, targetVolume = 1.0) {
    return new Promise(resolve => {
      const startVolume = audio.volume;
      const startTime = Date.now();

      // Cancel any existing fade for this audio
      this.cancelFade(audio);

      const fade = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        audio.volume = startVolume + (targetVolume - startVolume) * progress;

        if (progress < 1) {
          const frameId = requestAnimationFrame(fade);
          this.activeFades.set(audio, frameId);
        } else {
          this.activeFades.delete(audio);
          resolve();
        }
      };

      const frameId = requestAnimationFrame(fade);
      this.activeFades.set(audio, frameId);
    });
  }

  /**
   * Fade out audio element
   * @param {HTMLAudioElement} audio - Audio element to fade
   * @param {number} duration - Fade duration in ms
   */
  async fadeOut(audio, duration = 1000) {
    return new Promise(resolve => {
      const startVolume = audio.volume;
      const startTime = Date.now();

      // Cancel any existing fade for this audio
      this.cancelFade(audio);

      const fade = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        audio.volume = startVolume * (1 - progress);

        if (progress < 1) {
          const frameId = requestAnimationFrame(fade);
          this.activeFades.set(audio, frameId);
        } else {
          this.activeFades.delete(audio);
          audio.pause();
          resolve();
        }
      };

      const frameId = requestAnimationFrame(fade);
      this.activeFades.set(audio, frameId);
    });
  }

  /**
   * Cancel an active fade
   * @param {HTMLAudioElement} audio - Audio element with active fade
   */
  cancelFade(audio) {
    if (this.activeFades.has(audio)) {
      cancelAnimationFrame(this.activeFades.get(audio));
      this.activeFades.delete(audio);
    }
  }

  /**
   * Stop a specific sound
   * @param {HTMLAudioElement} audio - Audio element to stop
   */
  stopSound(audio) {
    if (!audio) return;

    this.cancelFade(audio);
    audio.pause();
    audio.currentTime = 0;
    this.activeSounds.delete(audio);
  }

  /**
   * Stop all sounds in a category
   * @param {string} category - Category to stop
   */
  stopCategory(category) {
    // Stop pooled sounds
    for (const [key, pool] of this.soundPools.entries()) {
      if (pool.category === category) {
        pool.instances.forEach(audio => this.stopSound(audio));
      }
    }

    // Note: One-shot sounds would need category tracking for this to work fully
  }

  /**
   * Stop all sounds
   */
  stopAll() {
    // Cancel all fades
    for (const frameId of this.activeFades.values()) {
      cancelAnimationFrame(frameId);
    }
    this.activeFades.clear();

    // Stop all active sounds
    for (const audio of this.activeSounds) {
      audio.pause();
      audio.currentTime = 0;
    }
    this.activeSounds.clear();

    // Stop all pooled sounds
    for (const pool of this.soundPools.values()) {
      pool.instances.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
    }
  }

  /**
   * Set master volume
   * @param {number} volume - Volume level (0-1)
   */
  setMasterVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.updateAllVolumes();
  }

  /**
   * Set category volume
   * @param {string} category - Category name
   * @param {number} volume - Volume level (0-1)
   */
  setCategoryVolume(category, volume) {
    this.categoryVolumes.set(category, Math.max(0, Math.min(1, volume)));
    this.updateAllVolumes();
  }

  /**
   * Toggle mute
   */
  toggleMute() {
    this.isMuted = !this.isMuted;

    if (this.isMuted) {
      this.stopAll();
    }

    return this.isMuted;
  }

  /**
   * Set mute state
   * @param {boolean} muted - Whether to mute
   */
  setMuted(muted) {
    this.isMuted = muted;

    if (this.isMuted) {
      this.stopAll();
    }
  }

  /**
   * Get effective volume for a category
   * @param {string} category - Category name
   */
  getEffectiveVolume(category) {
    const categoryVolume = this.categoryVolumes.get(category) || 1.0;
    return this.masterVolume * categoryVolume;
  }

  /**
   * Update all active audio volumes
   */
  updateAllVolumes() {
    // Update pooled sounds
    for (const pool of this.soundPools.values()) {
      const volume = this.getEffectiveVolume(pool.category);
      pool.instances.forEach(audio => {
        audio.volume = volume;
      });
    }

    // Update current music
    if (this.currentMusic) {
      this.currentMusic.volume = this.getEffectiveVolume('music');
    }
  }

  /**
   * Get audio manager statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      isMuted: this.isMuted,
      masterVolume: this.masterVolume,
      activeSounds: this.activeSounds.size,
      pooledSounds: this.soundPools.size,
      totalAudioElements: this.audioElements.size,
      activeFades: this.activeFades.size,
      categoryVolumes: Object.fromEntries(this.categoryVolumes)
    };
  }

  /**
   * Dispose of audio manager and clean up all resources
   */
  dispose() {
    // Cancel all active fades
    for (const frameId of this.activeFades.values()) {
      cancelAnimationFrame(frameId);
    }
    this.activeFades.clear();

    // Stop and dispose all audio elements
    for (const audio of this.audioElements.values()) {
      audio.pause();
      audio.src = '';
      audio.load();
    }
    this.audioElements.clear();

    // Clear sound pools
    this.soundPools.clear();

    // Clear active sounds
    this.activeSounds.clear();

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Clear references
    this.currentMusic = null;
    this.initialized = false;
  }
}

// Singleton instance
let globalInstance = null;

/**
 * Get or create the global AudioManager instance
 * @returns {AudioManager} The global instance
 */
export function getGlobalAudioManager() {
  if (!globalInstance) {
    globalInstance = new AudioManager();
  }
  return globalInstance;
}