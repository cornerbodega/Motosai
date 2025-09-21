export class AudioManager {
  constructor() {
    this.sounds = {};
    this.currentEngineSound = null;
    this.isEnabled = false; // Muted by default
    this.volume = 1.0;
    this.lastCollisionTime = 0;
    this.collisionCooldown = 500; // ms between collision sounds
    
    this.soundPaths = {
      buttonOver: '/audio/Motosai Button Over.wav',
      buttonSelect: '/audio/Motosai Button Select.wav',
      gearSwitch: '/audio/Motosai Gear Switch.wav',
      idle: '/audio/Motosai Idle.wav',
      idle50: '/audio/Motosai Idle at 50mph.wav',
      idle100: '/audio/Motosai Idle at 100mph.wav',
      idle250: '/audio/Motosai Idle at 250mph.wav',
      revEngine: '/audio/Motosai Rev Engine.wav',
      shiftDown50: '/audio/Motosai Shift Down from 50mph.wav',
      shiftDown100: '/audio/Motosai Shift Down from 100mph.wav',
      shiftDown250: '/audio/Motosai Shift Down from 250mph.wav',
      shiftTo50: '/audio/Motosai Shift to 50mph.wav',
      shiftTo100: '/audio/Motosai Shift to 100mph.wav',
      shiftTo250: '/audio/Motosai Shift to 250mph.wav',
      soundBarrier: '/audio/Motosai Sound Barrier.wav',
      explosionBloody: '/audio/Motosai Splosion Bloody.wav',
      explosion: '/audio/Motosai Splosion.wav',
      tireScreechLong: '/audio/Motosai Tire Screach Long.wav',
      tireScreechMedium: '/audio/Motosai Tire Screach Medium.wav',
      tireScreechShort: '/audio/Motosai Tire Screach Short.wav',
      theme: '/audio/motosai OVER WORLD THEME.wav'
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
        clonedSound.remove();
      });
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
  
  updateEngineSound(speed) {
    if (!this.isEnabled) return;
    
    const speedMPH = Math.abs(speed * 2.237);
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
}