export class AudioManager {
  constructor() {
    this.sounds = {};
    this.currentEngineSound = null;
    this.isEnabled = false; // Muted by default
    this.volume = 1.0;
    this.lastCollisionTime = 0;
    this.collisionCooldown = 500; // ms between collision sounds
    
    this.soundPaths = {
      buttonOver: '/audio-v2/Motosai Button Over.wav',
      buttonSelect: '/audio-v2/Motosai Button Select.wav',
      gearSwitch: '/audio-v2/Motosai Gear Switch.wav',
      idle: '/audio-v2/Motosai Idle.wav',
      idle50: '/audio-v2/Motosai Idle at 50mph.wav',
      idle100: '/audio-v2/Motosai Idle at 100mph.wav',
      idle250: '/audio-v2/Motosai Idle at 250mph.wav',
      revEngine: '/audio-v2/Motosai Rev Engine.wav',
      shiftDown50: '/audio-v2/Motosai Shift Down from 50mph.wav',
      shiftDown100: '/audio-v2/Motosai Shift Down from 100mph.wav',
      shiftDown250: '/audio-v2/Motosai Shift Down from 250mph.wav',
      shiftTo50: '/audio-v2/Motosai Shift to 50mph.wav',
      shiftTo100: '/audio-v2/Motosai Shift to 100mph.wav',
      shiftTo250: '/audio-v2/Motosai Shift to 250mph.wav',
      soundBarrier: '/audio-v2/Motosai Sound Barrier.wav',
      explosionBloody: '/audio-v2/Motosai Splosion Bloody.wav',
      explosion: '/audio-v2/Motosai Splosion.wav',
      tireScreechLong: '/audio-v2/Motosai Tire Screach Long.wav',
      tireScreechMedium: '/audio-v2/Motosai Tire Screach Medium.wav',
      tireScreechShort: '/audio-v2/Motosai Tire Screach Short.wav',
      theme: '/audio-v2/motosai OVER WORLD THEME.wav',
      // New game feature sounds - using better choices from expanded library
      powerupCollect: '/audio-v2/Motosai Button Select.wav', // Satisfying click for powerup collection
      bikeUnlock: '/audio-v2/Motosai Victory.wav', // Exciting unlock sound
      introMorph: '/audio-v2/Motosai Whoosh 2.wav', // Transformation whoosh
      gameOver: '/audio-v2/Motosai Game Over.wav',
      gameOverVO: '/audio-v2/Motosai Game Over VO.wav'
    };
    
    this.loadSounds();
  }
  
  loadSounds() {
    Object.entries(this.soundPaths).forEach(([key, path]) => {
      const audio = new Audio(path);
      audio.volume = this.volume;
      this.sounds[key] = audio;
    });
    
    console.log('[AudioManager] All sounds loaded:', Object.keys(this.sounds));
  }
  
  play(soundName, options = {}) {
    if (!this.isEnabled) return;
    
    const sound = this.sounds[soundName];
    if (!sound) {
      console.warn(`[AudioManager] Sound not found: ${soundName}`);
      return;
    }
    
    const volume = options.volume !== undefined ? options.volume : this.volume;
    const loop = options.loop || false;
    
    sound.volume = volume;
    sound.loop = loop;
    
    if (options.clone) {
      // Create a new Audio instance instead of cloning to avoid memory leaks
      const clonedSound = new Audio(sound.src);
      clonedSound.volume = volume;
      clonedSound.play().catch(err => {
        console.error(`[AudioManager] Error playing cloned sound ${soundName}:`, err);
      });
      // Clean up after sound finishes
      clonedSound.addEventListener('ended', () => {
        // Properly clean up audio element
        clonedSound.pause();
        clonedSound.src = '';
        clonedSound.load();
      }, { once: true }); // Use once: true to auto-remove listener
      // console.log(`[AudioManager] Playing sound (cloned): ${soundName} | Volume: ${volume} | Loop: ${loop}`);
    } else {
      sound.currentTime = 0;
      sound.play().catch(err => {
        console.error(`[AudioManager] Error playing sound ${soundName}:`, err);
      });
      // console.log(`[AudioManager] Playing sound: ${soundName} | Volume: ${volume} | Loop: ${loop}`);
    }
    
    return sound;
  }
  
  stop(soundName) {
    const sound = this.sounds[soundName];
    if (sound) {
      sound.pause();
      sound.currentTime = 0;
      // console.log(`[AudioManager] Stopped sound: ${soundName}`);
    }
  }
  
  stopAll() {
    Object.entries(this.sounds).forEach(([key, sound]) => {
      sound.pause();
      sound.currentTime = 0;
    });
    console.log('[AudioManager] All sounds stopped');
  }
  
  updateEngineSound(speedMPH) {
    if (!this.isEnabled) return;

    // Speed is already in MPH from the physics state
    let targetSound = null;
    
    if (speedMPH < 30) {
      targetSound = 'idle';
    } else if (speedMPH < 75) {
      targetSound = 'idle50';
    } else if (speedMPH < 175) {
      targetSound = 'idle100';
    } else {
      targetSound = 'idle250';
    }
    
    if (this.currentEngineSound !== targetSound) {
      if (this.currentEngineSound) {
        this.stop(this.currentEngineSound);
      }
      
      this.currentEngineSound = targetSound;
      this.play(targetSound, { loop: true, volume: 0.3 });
      // console.log(`[AudioManager] Engine sound changed to: ${targetSound} at ${speedMPH.toFixed(1)} MPH`);
    }
  }
  
  playCollisionSound(severity = 'medium') {
    // Prevent collision sound spam
    const now = Date.now();
    if (now - this.lastCollisionTime < this.collisionCooldown) {
      return;
    }
    this.lastCollisionTime = now;
    
    let soundName;
    
    switch(severity) {
      case 'light':
        soundName = 'tireScreechShort';
        break;
      case 'medium':
        soundName = 'tireScreechMedium';
        break;
      case 'heavy':
        soundName = 'tireScreechLong';
        break;
      case 'crash':
        soundName = 'explosionBloody';
        break;
      default:
        soundName = 'tireScreechMedium';
    }
    
    this.play(soundName, { clone: true, volume: 0.5 });
  }
  
  playShiftSound(fromSpeed, toSpeed) {
    const fromMPH = Math.abs(fromSpeed * 2.237);
    const toMPH = Math.abs(toSpeed * 2.237);
    
    if (toMPH > fromMPH) {
      if (toMPH > 200) {
        this.play('shiftTo250', { clone: true, volume: 0.4 });
      } else if (toMPH > 90) {
        this.play('shiftTo100', { clone: true, volume: 0.4 });
      } else {
        this.play('shiftTo50', { clone: true, volume: 0.4 });
      }
    } else {
      if (fromMPH > 200) {
        this.play('shiftDown250', { clone: true, volume: 0.4 });
      } else if (fromMPH > 90) {
        this.play('shiftDown100', { clone: true, volume: 0.4 });
      } else {
        this.play('shiftDown50', { clone: true, volume: 0.4 });
      }
    }
  }
  
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    Object.values(this.sounds).forEach(sound => {
      sound.volume = this.volume;
    });
    console.log(`[AudioManager] Master volume set to: ${this.volume}`);
  }
  
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
    console.log(`[AudioManager] Audio ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  playTheme() {
    this.play('theme', { loop: true, volume: 0.2 });
  }
  
  stopTheme() {
    this.stop('theme');
  }

  // New game feature sound methods
  playPowerupCollect(powerupType) {
    // Play a satisfying collection sound
    this.play('powerupCollect', { clone: true, volume: 0.7 });
  }

  playBikeUnlock() {
    // Play an exciting unlock sound
    this.play('bikeUnlock', { clone: true, volume: 0.8 });
  }

  playIntroMorph() {
    // Play transformation sound for emoji to 3D morph
    this.play('introMorph', { clone: true, volume: 0.6 });
  }

  playUIHover() {
    // Play hover sound for UI elements
    this.play('buttonOver', { clone: true, volume: 0.4 });
  }

  playUISelect() {
    // Play selection sound for UI elements
    this.play('buttonSelect', { clone: true, volume: 0.6 });
  }

  dispose() {
    // Stop all sounds and clean up audio elements
    this.stopAll();

    // Clean up all audio elements to prevent memory leaks
    Object.values(this.sounds).forEach(sound => {
      sound.pause();
      sound.src = '';
      sound.load();
    });

    this.sounds = {};
    this.currentEngineSound = null;
    console.log('[AudioManager] Disposed of all audio resources');
  }
}