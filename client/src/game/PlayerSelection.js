import * as THREE from 'three';

export class PlayerSelection {
    constructor(scene, camera, audioManager = null) {
        this.scene = scene;
        this.camera = camera;
        this.audioManager = audioManager;
        this.selectedBike = null;
        this.availableBikes = [];
        this.unlockedBikes = ['default'];
        this.bikeModels = new Map();
        this.selectionUI = null;
        this.onSelectionComplete = null;

        this.initializeBikes();
    }

    initializeBikes() {
        // Define all available bikes with their unlock requirements
        this.availableBikes = [
            {
                id: 'default',
                name: 'Street Rider',
                emoji: '🏍️',
                color: 0xff0000,
                speed: 100,
                acceleration: 1.0,
                handling: 1.0,
                unlocked: true,
                unlockRequirement: null
            },
            {
                id: 'dragon',
                name: 'Dragon Fury',
                emoji: '🐉',
                color: 0x00ff00,
                speed: 120,
                acceleration: 1.2,
                handling: 0.9,
                unlocked: false,
                unlockRequirement: { powerup: 'dragon', count: 2 }  // Reduced from 5
            },
            {
                id: 'rocket',
                name: 'Rocket Blast',
                emoji: '🚀',
                color: 0x0099ff,
                speed: 150,
                acceleration: 1.5,
                handling: 0.8,
                unlocked: false,
                unlockRequirement: { powerup: 'rocket', count: 3 }  // Reduced from 10
            },
            {
                id: 'star',
                name: 'Star Cruiser',
                emoji: '⭐',
                color: 0xffff00,
                speed: 110,
                acceleration: 1.1,
                handling: 1.2,
                unlocked: false,
                unlockRequirement: { powerup: 'star', count: 2 }  // Reduced from 7
            },
            {
                id: 'fire',
                name: 'Inferno',
                emoji: '🔥',
                color: 0xff6600,
                speed: 130,
                acceleration: 1.3,
                handling: 1.0,
                unlocked: false,
                unlockRequirement: { powerup: 'fire', count: 3 }  // Reduced from 8
            },
            {
                id: 'lightning',
                name: 'Thunder Strike',
                emoji: '⚡',
                color: 0x9900ff,
                speed: 140,
                acceleration: 1.4,
                handling: 1.1,
                unlocked: false,
                unlockRequirement: { powerup: 'lightning', count: 4 }  // Reduced from 12
            },
            {
                id: 'skull',
                name: 'Death Rider',
                emoji: '💀',
                color: 0x333333,
                speed: 125,
                acceleration: 1.2,
                handling: 1.3,
                unlocked: false,
                unlockRequirement: { powerup: 'skull', count: 5 }  // Reduced from 15
            },
            {
                id: 'rainbow',
                name: 'Rainbow Dash',
                emoji: '🌈',
                color: 0xff00ff,
                speed: 135,
                acceleration: 1.3,
                handling: 1.4,
                unlocked: false,
                unlockRequirement: { powerup: 'rainbow', count: 7 }  // Reduced from 20
            }
        ];

        // Load unlocked bikes from localStorage
        this.loadUnlockedBikes();
    }

    loadUnlockedBikes() {
        const saved = localStorage.getItem('motosai_unlocked_bikes');
        if (saved) {
            this.unlockedBikes = JSON.parse(saved);
        }

        // Update bike unlock status
        this.availableBikes.forEach(bike => {
            if (this.unlockedBikes.includes(bike.id)) {
                bike.unlocked = true;
            }
        });
    }

    saveUnlockedBikes() {
        localStorage.setItem('motosai_unlocked_bikes', JSON.stringify(this.unlockedBikes));
    }

    unlockBike(bikeId) {
        if (!this.unlockedBikes.includes(bikeId)) {
            this.unlockedBikes.push(bikeId);
            const bike = this.availableBikes.find(b => b.id === bikeId);
            if (bike) {
                bike.unlocked = true;
            }
            this.saveUnlockedBikes();
            return true;
        }
        return false;
    }

    createBikeModel(bikeConfig) {
        const group = new THREE.Group();

        // Main body
        const bodyGeometry = new THREE.BoxGeometry(2, 0.8, 0.6);
        const bodyMaterial = new THREE.MeshPhongMaterial({ color: bikeConfig.color });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.5;
        group.add(body);

        // Wheels
        const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 32);
        const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });

        const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        frontWheel.rotation.z = Math.PI / 2;
        frontWheel.position.set(0.8, 0, 0);
        group.add(frontWheel);

        const rearWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        rearWheel.rotation.z = Math.PI / 2;
        rearWheel.position.set(-0.8, 0, 0);
        group.add(rearWheel);

        // Handlebars
        const handlebarGeometry = new THREE.CylinderGeometry(0.02, 0.02, 1, 8);
        const handlebarMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const handlebar = new THREE.Mesh(handlebarGeometry, handlebarMaterial);
        handlebar.rotation.z = Math.PI / 2;
        handlebar.position.set(0.6, 0.9, 0);
        group.add(handlebar);

        // Add emoji indicator on top
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 100px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bikeConfig.emoji, 64, 64);

        const emojiTexture = new THREE.CanvasTexture(canvas);
        const emojiGeometry = new THREE.PlaneGeometry(1, 1);
        const emojiMaterial = new THREE.MeshBasicMaterial({
            map: emojiTexture,
            transparent: true,
            side: THREE.DoubleSide
        });
        const emojiMesh = new THREE.Mesh(emojiGeometry, emojiMaterial);
        emojiMesh.position.y = 2;
        group.add(emojiMesh);

        return group;
    }

    createSelectionUI() {
        const uiContainer = document.createElement('div');
        uiContainer.id = 'bike-selection-ui';
        uiContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #fff;
            border-radius: 20px;
            padding: 30px;
            z-index: 1000;
            color: white;
            font-family: Arial, sans-serif;
            max-width: 800px;
            max-height: 600px;
            overflow-y: auto;
        `;

        const title = document.createElement('h2');
        title.textContent = 'Choose Your Ride';
        title.style.cssText = 'text-align: center; margin-bottom: 20px; font-size: 32px;';
        uiContainer.appendChild(title);

        const bikeGrid = document.createElement('div');
        bikeGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        `;

        this.availableBikes.forEach(bike => {
            const bikeCard = document.createElement('div');
            bikeCard.style.cssText = `
                background: ${bike.unlocked ? 'rgba(50, 50, 50, 0.8)' : 'rgba(20, 20, 20, 0.8)'};
                border: 2px solid ${bike.unlocked ? '#4CAF50' : '#666'};
                border-radius: 10px;
                padding: 15px;
                cursor: ${bike.unlocked ? 'pointer' : 'not-allowed'};
                transition: all 0.3s;
                text-align: center;
                opacity: ${bike.unlocked ? '1' : '0.5'};
            `;

            if (bike.unlocked) {
                bikeCard.addEventListener('mouseenter', () => {
                    bikeCard.style.transform = 'scale(1.05)';
                    bikeCard.style.borderColor = '#fff';
                    // Play hover sound
                    if (this.audioManager) {
                        this.audioManager.playUIHover();
                    }
                });

                bikeCard.addEventListener('mouseleave', () => {
                    bikeCard.style.transform = 'scale(1)';
                    bikeCard.style.borderColor = '#4CAF50';
                });

                bikeCard.addEventListener('click', () => {
                    // Play selection sound
                    if (this.audioManager) {
                        this.audioManager.playUISelect();
                    }
                    this.selectBike(bike);
                });
            }

            const emoji = document.createElement('div');
            emoji.textContent = bike.emoji;
            emoji.style.cssText = 'font-size: 48px; margin-bottom: 10px;';
            bikeCard.appendChild(emoji);

            const name = document.createElement('div');
            name.textContent = bike.name;
            name.style.cssText = 'font-weight: bold; margin-bottom: 5px;';
            bikeCard.appendChild(name);

            const stats = document.createElement('div');
            stats.style.cssText = 'font-size: 12px; color: #aaa;';
            stats.innerHTML = `
                Speed: ${bike.speed}<br>
                Accel: ${bike.acceleration}x<br>
                Handle: ${bike.handling}x
            `;
            bikeCard.appendChild(stats);

            if (!bike.unlocked && bike.unlockRequirement) {
                const lockInfo = document.createElement('div');
                lockInfo.style.cssText = 'font-size: 10px; color: #f44336; margin-top: 10px;';
                lockInfo.textContent = `Collect ${bike.unlockRequirement.count} ${bike.unlockRequirement.powerup} powerups`;
                bikeCard.appendChild(lockInfo);
            }

            bikeGrid.appendChild(bikeCard);
        });

        uiContainer.appendChild(bikeGrid);

        const startButton = document.createElement('button');
        startButton.textContent = 'START GAME';
        startButton.disabled = true;
        startButton.style.cssText = `
            display: block;
            margin: 0 auto;
            padding: 15px 30px;
            font-size: 20px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s;
            opacity: 0.5;
        `;

        startButton.addEventListener('click', () => {
            if (this.selectedBike && this.onSelectionComplete) {
                // Play start game sound
                if (this.audioManager) {
                    this.audioManager.playUISelect();
                }
                this.onSelectionComplete(this.selectedBike);
                this.hideSelectionUI();
            }
        });

        uiContainer.appendChild(startButton);
        this.selectionUI = uiContainer;
        this.startButton = startButton;

        return uiContainer;
    }

    selectBike(bike) {
        this.selectedBike = bike;

        // Update start button
        if (this.startButton) {
            this.startButton.disabled = false;
            this.startButton.style.opacity = '1';
            this.startButton.style.cursor = 'pointer';
        }

        // Update 3D preview if needed
        this.updateBikePreview(bike);
    }

    updateBikePreview(bike) {
        // Remove existing preview and dispose textures properly
        this.bikeModels.forEach(model => {
            // Dispose of textures and materials to prevent memory leak
            model.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
            this.scene.remove(model);
        });
        this.bikeModels.clear();

        // Add new bike model
        const model = this.createBikeModel(bike);
        model.position.set(0, 1, -5);
        this.scene.add(model);
        this.bikeModels.set(bike.id, model);

        // Animate the preview
        const animate = () => {
            if (this.bikeModels.has(bike.id)) {
                model.rotation.y += 0.01;
                requestAnimationFrame(animate);
            }
        };
        animate();
    }

    showSelectionUI() {
        const ui = this.createSelectionUI();
        document.body.appendChild(ui);
    }

    hideSelectionUI() {
        if (this.selectionUI && this.selectionUI.parentElement) {
            this.selectionUI.parentElement.removeChild(this.selectionUI);
        }

        // Clean up 3D models and dispose resources properly
        this.bikeModels.forEach(model => {
            // Dispose of all textures, materials, and geometry
            model.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
            this.scene.remove(model);
        });
        this.bikeModels.clear();
    }

    getSelectedBikeConfig() {
        return this.selectedBike;
    }
}