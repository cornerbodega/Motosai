import * as THREE from 'three';

export class IntroAnimation {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.animationPhase = 'emoji';
        this.emojiMesh = null;
        this.motorcycleMesh = null;
        this.morphProgress = 0;
        this.onComplete = null;
    }

    createEmojiTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 512, 512);

        ctx.font = 'bold 400px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🏍️', 256, 256);

        return new THREE.CanvasTexture(canvas);
    }

    start() {
        const emojiTexture = this.createEmojiTexture();
        const geometry = new THREE.PlaneGeometry(5, 5);
        const material = new THREE.MeshBasicMaterial({
            map: emojiTexture,
            transparent: true,
            side: THREE.DoubleSide
        });

        this.emojiMesh = new THREE.Mesh(geometry, material);
        this.emojiMesh.position.set(0, 2, -10);
        this.scene.add(this.emojiMesh);

        this.animateIntro();
    }

    createMotorcycle3D() {
        const group = new THREE.Group();

        // Body
        const bodyGeometry = new THREE.BoxGeometry(2, 0.8, 0.6);
        const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.5;
        group.add(body);

        // Front wheel
        const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 32);
        const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });
        const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        frontWheel.rotation.z = Math.PI / 2;
        frontWheel.position.set(0.8, 0, 0);
        group.add(frontWheel);

        // Rear wheel
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

        group.position.set(0, 1, -10);
        group.visible = false;

        return group;
    }

    animateIntro() {
        const duration = 3000; // 3 seconds
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            if (this.animationPhase === 'emoji') {
                // Rotate and pulse the emoji
                this.emojiMesh.rotation.y = progress * Math.PI * 2;
                const scale = 1 + Math.sin(progress * Math.PI * 4) * 0.2;
                this.emojiMesh.scale.set(scale, scale, scale);

                if (progress >= 1) {
                    this.animationPhase = 'morph';
                    this.motorcycleMesh = this.createMotorcycle3D();
                    this.scene.add(this.motorcycleMesh);
                    this.morphProgress = 0;
                }
            } else if (this.animationPhase === 'morph') {
                // Morph from emoji to 3D
                this.morphProgress += 0.02;

                if (this.morphProgress <= 1) {
                    // Fade out emoji
                    this.emojiMesh.material.opacity = 1 - this.morphProgress;

                    // Fade in and rotate 3D motorcycle
                    this.motorcycleMesh.visible = true;
                    this.motorcycleMesh.rotation.y = this.morphProgress * Math.PI;

                    // Scale up 3D motorcycle
                    const scale = this.morphProgress;
                    this.motorcycleMesh.scale.set(scale, scale, scale);
                } else {
                    // Animation complete
                    this.scene.remove(this.emojiMesh);
                    this.animationPhase = 'complete';

                    if (this.onComplete) {
                        this.onComplete();
                    }
                    return;
                }
            }

            if (this.animationPhase !== 'complete') {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }

    cleanup() {
        if (this.emojiMesh) {
            this.scene.remove(this.emojiMesh);
            this.emojiMesh.geometry.dispose();
            // Dispose texture too!
            if (this.emojiMesh.material.map) {
                this.emojiMesh.material.map.dispose();
            }
            this.emojiMesh.material.dispose();
        }

        if (this.motorcycleMesh) {
            // Properly dispose of the 3D motorcycle
            this.motorcycleMesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.scene.remove(this.motorcycleMesh);
        }
    }
}