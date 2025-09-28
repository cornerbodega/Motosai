import * as THREE from 'three';

export class PowerupSystem {
    constructor(scene, playerSelection) {
        this.scene = scene;
        this.playerSelection = playerSelection;
        this.powerups = [];
        this.powerupCounters = new Map();
        this.powerupTypes = [
            { type: 'dragon', emoji: '🐉', color: 0x00ff00, effect: 'speed_boost' },
            { type: 'rocket', emoji: '🚀', color: 0x0099ff, effect: 'super_speed' },
            { type: 'star', emoji: '⭐', color: 0xffff00, effect: 'invincibility' },
            { type: 'fire', emoji: '🔥', color: 0xff6600, effect: 'burn_trail' },
            { type: 'lightning', emoji: '⚡', color: 0x9900ff, effect: 'teleport' },
            { type: 'skull', emoji: '💀', color: 0x333333, effect: 'ghost_mode' },
            { type: 'rainbow', emoji: '🌈', color: 0xff00ff, effect: 'multi_boost' },
            { type: 'heart', emoji: '❤️', color: 0xff0066, effect: 'health' },
            { type: 'gem', emoji: '💎', color: 0x00ffff, effect: 'points' },
            { type: 'coin', emoji: '🪙', color: 0xffd700, effect: 'money' }
        ];

        this.initializeCounters();
        this.spawnTimer = 0;
        this.spawnInterval = 3000; // Spawn every 3 seconds (less frequent)
        this.lastSpawnTime = Date.now();
        this.maxPowerups = 3; // Maximum 3 powerups at once (much fewer)

        this.createUI();
    }

    initializeCounters() {
        // Load saved counters from localStorage
        const saved = localStorage.getItem('motosai_powerup_counters');
        if (saved) {
            const data = JSON.parse(saved);
            this.powerupCounters = new Map(Object.entries(data));
        } else {
            // Initialize all counters to 0
            this.powerupTypes.forEach(type => {
                this.powerupCounters.set(type.type, 0);
            });
        }
    }

    saveCounters() {
        const data = Object.fromEntries(this.powerupCounters);
        localStorage.setItem('motosai_powerup_counters', JSON.stringify(data));
    }

    createPowerupMesh(powerupType) {
        const group = new THREE.Group();

        // Create larger base sphere for better visibility
        const geometry = new THREE.SphereGeometry(1.0, 16, 16); // Doubled size
        const material = new THREE.MeshPhongMaterial({
            color: powerupType.color,
            emissive: powerupType.color,
            emissiveIntensity: 0.5 // More glow
        });
        const sphere = new THREE.Mesh(geometry, material);
        group.add(sphere);

        // Create emoji texture
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'transparent';
        ctx.fillRect(0, 0, 256, 256);

        ctx.font = 'bold 180px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(powerupType.emoji, 128, 128);

        const emojiTexture = new THREE.CanvasTexture(canvas);
        const emojiGeometry = new THREE.PlaneGeometry(2.5, 2.5); // Larger emoji
        const emojiMaterial = new THREE.MeshBasicMaterial({
            map: emojiTexture,
            transparent: true,
            side: THREE.DoubleSide
        });

        const emojiMesh = new THREE.Mesh(emojiGeometry, emojiMaterial);
        emojiMesh.position.z = 1.2;
        group.add(emojiMesh);

        // Add bigger glow effect
        const glowGeometry = new THREE.SphereGeometry(1.5, 8, 8); // Larger glow
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: powerupType.color,
            transparent: true,
            opacity: 0.4
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        group.add(glow);

        return group;
    }

    spawnPowerup(position) {
        const powerupType = this.powerupTypes[Math.floor(Math.random() * this.powerupTypes.length)];
        const mesh = this.createPowerupMesh(powerupType);

        mesh.position.copy(position);
        mesh.position.y = 1.5; // Float higher for better visibility

        const powerup = {
            mesh: mesh,
            type: powerupType.type,
            emoji: powerupType.emoji,
            effect: powerupType.effect,
            collected: false,
            rotation: Math.random() * Math.PI * 2,
            floatOffset: Math.random() * Math.PI * 2,
            spawnTime: Date.now()
        };

        this.powerups.push(powerup);
        this.scene.add(mesh);

        return powerup;
    }

    collectPowerup(powerup) {
        if (powerup.collected) return false;

        powerup.collected = true;

        // Update counter
        const currentCount = this.powerupCounters.get(powerup.type) || 0;
        this.powerupCounters.set(powerup.type, currentCount + 1);
        this.saveCounters();

        // Update UI
        this.updateUI();

        // Check for bike unlocks
        this.checkBikeUnlocks(powerup.type);

        // Create collection effect
        this.createCollectionEffect(powerup.mesh.position, powerup.emoji);

        // Clean up the powerup mesh properly to prevent memory leaks
        powerup.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });

        // Remove powerup from scene
        this.scene.remove(powerup.mesh);

        // Remove from array
        const index = this.powerups.indexOf(powerup);
        if (index > -1) {
            this.powerups.splice(index, 1);
        }

        return true;
    }

    checkBikeUnlocks(powerupType) {
        const count = this.powerupCounters.get(powerupType);

        this.playerSelection.availableBikes.forEach(bike => {
            if (!bike.unlocked && bike.unlockRequirement) {
                if (bike.unlockRequirement.powerup === powerupType &&
                    count >= bike.unlockRequirement.count) {

                    if (this.playerSelection.unlockBike(bike.id)) {
                        this.showUnlockNotification(bike);
                    }
                }
            }
        });
    }

    showUnlockNotification(bike) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
            padding: 20px 40px;
            border-radius: 15px;
            font-size: 24px;
            font-weight: bold;
            z-index: 10000;
            animation: slideDown 0.5s ease, fadeOut 0.5s ease 2.5s forwards;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        `;

        notification.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 48px; margin-bottom: 10px;">${bike.emoji}</div>
                <div>NEW BIKE UNLOCKED!</div>
                <div style="font-size: 18px; margin-top: 5px;">${bike.name}</div>
            </div>
        `;

        document.body.appendChild(notification);

        // Use a timer reference to ensure cleanup
        const removeTimer = setTimeout(() => {
            if (notification && notification.parentElement) {
                notification.parentElement.removeChild(notification);
            }
        }, 3000);

        // Store timer for cleanup if needed
        if (!this.activeTimers) this.activeTimers = new Set();
        this.activeTimers.add(removeTimer);
    }

    createCollectionEffect(position, emoji) {
        const effect = document.createElement('div');
        effect.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            font-size: 100px;
            z-index: 9999;
            pointer-events: none;
            animation: collectPowerup 1s ease forwards;
        `;
        effect.textContent = emoji;

        // Add CSS animation
        if (!document.querySelector('#powerup-animations')) {
            const style = document.createElement('style');
            style.id = 'powerup-animations';
            style.textContent = `
                @keyframes collectPowerup {
                    0% {
                        transform: translate(-50%, -50%) scale(0.5);
                        opacity: 0;
                    }
                    50% {
                        transform: translate(-50%, -50%) scale(1.5);
                        opacity: 1;
                    }
                    100% {
                        transform: translate(-50%, -50%) scale(2) translateY(-100px);
                        opacity: 0;
                    }
                }

                @keyframes slideDown {
                    from {
                        transform: translate(-50%, -150%);
                        opacity: 0;
                    }
                    to {
                        transform: translate(-50%, -50%);
                        opacity: 1;
                    }
                }

                @keyframes fadeOut {
                    to {
                        opacity: 0;
                        transform: translate(-50%, -50%) scale(0.9);
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(effect);

        setTimeout(() => {
            if (effect.parentElement) {
                effect.parentElement.removeChild(effect);
            }
        }, 1000);
    }

    createUI() {
        const uiContainer = document.createElement('div');
        uiContainer.id = 'powerup-ui';
        uiContainer.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            border: 2px solid #fff;
            border-radius: 10px;
            padding: 15px;
            color: white;
            font-family: Arial, sans-serif;
            z-index: 100;
            min-width: 200px;
        `;

        const title = document.createElement('div');
        title.textContent = 'Powerups Collected';
        title.style.cssText = 'font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #666; padding-bottom: 5px;';
        uiContainer.appendChild(title);

        const countersDiv = document.createElement('div');
        countersDiv.id = 'powerup-counters';
        uiContainer.appendChild(countersDiv);

        document.body.appendChild(uiContainer);
        this.updateUI();
    }

    updateUI() {
        const countersDiv = document.getElementById('powerup-counters');
        if (!countersDiv) return;

        countersDiv.innerHTML = '';

        // Show only powerups with count > 0
        this.powerupTypes.forEach(type => {
            const count = this.powerupCounters.get(type.type) || 0;
            if (count > 0) {
                const counterDiv = document.createElement('div');
                counterDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin: 5px 0;';

                const emojiSpan = document.createElement('span');
                emojiSpan.textContent = type.emoji;
                emojiSpan.style.cssText = 'font-size: 20px; margin-right: 10px;';

                const countSpan = document.createElement('span');
                countSpan.textContent = `× ${count}`;
                countSpan.style.cssText = 'font-size: 16px; font-weight: bold;';

                counterDiv.appendChild(emojiSpan);
                counterDiv.appendChild(countSpan);
                countersDiv.appendChild(counterDiv);
            }
        });

        if (countersDiv.children.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No powerups yet!';
            emptyMessage.style.cssText = 'color: #666; font-style: italic;';
            countersDiv.appendChild(emptyMessage);
        }
    }

    update(deltaTime, playerPosition) {
        const now = Date.now();

        // Spawn new powerups periodically (if we don't have too many)
        if (now - this.lastSpawnTime > this.spawnInterval && this.powerups.length < this.maxPowerups) {
            // Spawn powerup FAR ahead of player (z increases as player moves forward)
            const spawnDistance = 100 + Math.random() * 100; // 100-200 units ahead (much farther)

            // Random lane position (road width is about 13.5 units)
            const lanePositions = [-4.5, -1.5, 1.5, 4.5]; // 4 lane positions
            const randomLane = lanePositions[Math.floor(Math.random() * lanePositions.length)];

            const spawnPos = new THREE.Vector3(
                randomLane, // Random lane
                1.5, // Start at float height
                playerPosition.z + spawnDistance // FAR AHEAD of player
            );

            this.spawnPowerup(spawnPos);
            this.lastSpawnTime = now;
        }

        // Update existing powerups
        this.powerups.forEach(powerup => {
            if (!powerup.collected) {
                // Rotate powerup
                powerup.mesh.rotation.y += deltaTime * 2;

                // Float up and down
                const floatY = Math.sin(Date.now() * 0.001 + powerup.floatOffset) * 0.5;
                powerup.mesh.position.y = 1.5 + floatY;

                // Check distance to player for collection (larger radius)
                const distance = powerup.mesh.position.distanceTo(playerPosition);
                if (distance < 4) { // Doubled collection radius
                    this.collectPowerup(powerup);
                }
            }
        });

        // Remove old uncollected powerups or ones that are too far behind
        this.powerups = this.powerups.filter(powerup => {
            if (!powerup.collected) {
                // Remove if too old or too far behind player
                const isBehindPlayer = powerup.mesh.position.z < playerPosition.z - 50;
                const isTooOld = now - powerup.spawnTime > 30000;

                if (isBehindPlayer || isTooOld) {
                    this.scene.remove(powerup.mesh);
                    // Dispose of geometry and materials to prevent memory leak
                    powerup.mesh.traverse(child => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if (child.material.map) child.material.map.dispose();
                            child.material.dispose();
                        }
                    });
                    return false;
                }
            }
            return !powerup.collected;
        });
    }

    cleanup() {
        // Remove all powerups and clean up their resources
        this.powerups.forEach(powerup => {
            // Dispose of geometry and materials
            powerup.mesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
            this.scene.remove(powerup.mesh);
        });
        this.powerups = [];

        // Clear all active timers
        if (this.activeTimers) {
            this.activeTimers.forEach(timer => clearTimeout(timer));
            this.activeTimers.clear();
        }

        // Remove UI
        const ui = document.getElementById('powerup-ui');
        if (ui && ui.parentElement) {
            ui.parentElement.removeChild(ui);
        }

        // Remove any lingering notification elements
        const notifications = document.querySelectorAll('[style*="NEW BIKE UNLOCKED"]');
        notifications.forEach(n => {
            if (n.parentElement) n.parentElement.removeChild(n);
        });

        // Remove any lingering effect elements
        const effects = document.querySelectorAll('[style*="collectPowerup"]');
        effects.forEach(e => {
            if (e.parentElement) e.parentElement.removeChild(e);
        });
    }
}