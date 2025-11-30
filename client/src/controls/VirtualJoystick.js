// Virtual Joystick Component
// Provides touch-based directional input for mobile devices

export class VirtualJoystick {
  constructor(options = {}) {
    this.options = {
      container: options.container || document.body,
      x: options.x || 100,
      y: options.y || window.innerHeight - 100,
      radius: options.radius || 60,
      innerRadius: options.innerRadius || 25,
      color: options.color || 'rgba(255, 255, 255, 0.3)',
      innerColor: options.innerColor || 'rgba(255, 255, 255, 0.6)',
      strokeColor: options.strokeColor || 'rgba(255, 255, 255, 0.8)',
      onChange: options.onChange || (() => {}),
      onStart: options.onStart || (() => {}),
      onEnd: options.onEnd || (() => {})
    };

    this.active = false;
    this.touchId = null;
    this.baseX = this.options.x;
    this.baseY = this.options.y;
    this.currentX = this.baseX;
    this.currentY = this.baseY;
    this.deltaX = 0;
    this.deltaY = 0;

    // Store bound event handlers for proper cleanup
    this.boundOnTouchStart = this.onTouchStart.bind(this);
    this.boundOnTouchMove = this.onTouchMove.bind(this);
    this.boundOnTouchEnd = this.onTouchEnd.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnResize = this.onResize.bind(this);

    this.createElements();
    this.attachEventListeners();
    this.render(); // Show joystick immediately
  }

  createElements() {
    // Create canvas for rendering
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.left = '0';
    this.canvas.style.top = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '1000';
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    this.ctx = this.canvas.getContext('2d');
    this.options.container.appendChild(this.canvas);

    // Create touch zone (larger than visible joystick for easier activation)
    this.touchZone = document.createElement('div');
    this.touchZone.style.position = 'absolute';
    this.touchZone.style.left = (this.baseX - this.options.radius * 2) + 'px';
    this.touchZone.style.top = (this.baseY - this.options.radius * 2) + 'px';
    this.touchZone.style.width = (this.options.radius * 4) + 'px';
    this.touchZone.style.height = (this.options.radius * 4) + 'px';
    this.touchZone.style.zIndex = '999';
    this.touchZone.style.touchAction = 'none';
    this.options.container.appendChild(this.touchZone);
  }

  attachEventListeners() {
    // Touch events
    this.touchZone.addEventListener('touchstart', this.boundOnTouchStart, { passive: false });
    this.options.container.addEventListener('touchmove', this.boundOnTouchMove, { passive: false });
    this.options.container.addEventListener('touchend', this.boundOnTouchEnd, { passive: false });
    this.options.container.addEventListener('touchcancel', this.boundOnTouchEnd, { passive: false });

    // Mouse events for testing on desktop
    this.touchZone.addEventListener('mousedown', this.boundOnMouseDown);
    this.options.container.addEventListener('mousemove', this.boundOnMouseMove);
    this.options.container.addEventListener('mouseup', this.boundOnMouseUp);

    // Handle resize
    window.addEventListener('resize', this.boundOnResize);
  }

  onTouchStart(event) {
    event.preventDefault();

    if (this.active) return; // Already active

    const touch = event.touches[0];
    this.touchId = touch.identifier;
    this.active = true;

    this.updatePosition(touch.clientX, touch.clientY);
    this.options.onStart();
    this.render();
  }

  onTouchMove(event) {
    if (!this.active) return;

    event.preventDefault();

    // Find our touch
    for (let i = 0; i < event.touches.length; i++) {
      if (event.touches[i].identifier === this.touchId) {
        this.updatePosition(event.touches[i].clientX, event.touches[i].clientY);
        this.render();
        break;
      }
    }
  }

  onTouchEnd(event) {
    if (!this.active) return;

    // Check if our touch ended
    let touchEnded = true;
    for (let i = 0; i < event.touches.length; i++) {
      if (event.touches[i].identifier === this.touchId) {
        touchEnded = false;
        break;
      }
    }

    if (touchEnded) {
      this.reset();
    }
  }

  onMouseDown(event) {
    event.preventDefault();
    this.active = true;
    this.updatePosition(event.clientX, event.clientY);
    this.options.onStart();
    this.render();
  }

  onMouseMove(event) {
    if (!this.active) return;
    this.updatePosition(event.clientX, event.clientY);
    this.render();
  }

  onMouseUp(event) {
    if (this.active) {
      this.reset();
    }
  }

  updatePosition(x, y) {
    // Calculate delta from base position
    const dx = x - this.baseX;
    const dy = y - this.baseY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Constrain to radius
    if (distance > this.options.radius) {
      const angle = Math.atan2(dy, dx);
      this.currentX = this.baseX + Math.cos(angle) * this.options.radius;
      this.currentY = this.baseY + Math.sin(angle) * this.options.radius;
    } else {
      this.currentX = x;
      this.currentY = y;
    }

    // Calculate normalized deltas (-1 to 1)
    this.deltaX = (this.currentX - this.baseX) / this.options.radius;
    this.deltaY = (this.currentY - this.baseY) / this.options.radius;

    // Call change callback
    this.options.onChange({
      x: this.deltaX,
      y: this.deltaY,
      angle: Math.atan2(this.deltaY, this.deltaX),
      distance: Math.sqrt(this.deltaX * this.deltaX + this.deltaY * this.deltaY)
    });
  }

  reset() {
    this.active = false;
    this.touchId = null;
    this.currentX = this.baseX;
    this.currentY = this.baseY;
    this.deltaX = 0;
    this.deltaY = 0;

    this.options.onChange({ x: 0, y: 0, angle: 0, distance: 0 });
    this.options.onEnd();
    this.render();
  }

  render() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Always draw base circle
    this.ctx.beginPath();
    this.ctx.arc(this.baseX, this.baseY, this.options.radius, 0, Math.PI * 2);
    this.ctx.fillStyle = this.options.color;
    this.ctx.fill();
    this.ctx.strokeStyle = this.options.strokeColor;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Always draw directional indicators
    this.ctx.font = '12px Arial';
    this.ctx.fillStyle = this.options.strokeColor;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('L', this.baseX - this.options.radius - 15, this.baseY);
    this.ctx.fillText('R', this.baseX + this.options.radius + 15, this.baseY);

    // Only draw connection line and thumb when active
    if (this.active) {
      // Draw connection line
      this.ctx.beginPath();
      this.ctx.moveTo(this.baseX, this.baseY);
      this.ctx.lineTo(this.currentX, this.currentY);
      this.ctx.strokeStyle = this.options.strokeColor;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      // Draw inner circle (thumb)
      this.ctx.beginPath();
      this.ctx.arc(this.currentX, this.currentY, this.options.innerRadius, 0, Math.PI * 2);
      this.ctx.fillStyle = this.options.innerColor;
      this.ctx.fill();
      this.ctx.strokeStyle = this.options.strokeColor;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }
  }

  onResize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Reposition to bottom left
    this.baseX = this.options.x;
    this.baseY = window.innerHeight - (window.innerHeight - this.options.y);

    this.touchZone.style.left = (this.baseX - this.options.radius * 2) + 'px';
    this.touchZone.style.top = (this.baseY - this.options.radius * 2) + 'px';

    if (!this.active) {
      this.currentX = this.baseX;
      this.currentY = this.baseY;
    }

    this.render();
  }

  setPosition(x, y) {
    this.baseX = x;
    this.baseY = y;
    if (!this.active) {
      this.currentX = x;
      this.currentY = y;
    }
    this.touchZone.style.left = (x - this.options.radius * 2) + 'px';
    this.touchZone.style.top = (y - this.options.radius * 2) + 'px';
    this.render();
  }

  getValue() {
    return {
      x: this.deltaX,
      y: this.deltaY,
      active: this.active
    };
  }

  destroy() {
    // Remove all event listeners
    if (this.touchZone) {
      this.touchZone.removeEventListener('touchstart', this.boundOnTouchStart);
      this.touchZone.removeEventListener('mousedown', this.boundOnMouseDown);
    }

    if (this.options.container) {
      this.options.container.removeEventListener('touchmove', this.boundOnTouchMove);
      this.options.container.removeEventListener('touchend', this.boundOnTouchEnd);
      this.options.container.removeEventListener('touchcancel', this.boundOnTouchEnd);
      this.options.container.removeEventListener('mousemove', this.boundOnMouseMove);
      this.options.container.removeEventListener('mouseup', this.boundOnMouseUp);
    }

    window.removeEventListener('resize', this.boundOnResize);

    // Null out canvas context
    this.ctx = null;

    // Remove DOM elements
    if (this.canvas) this.canvas.remove();
    if (this.touchZone) this.touchZone.remove();

    // Null out bound handlers
    this.boundOnTouchStart = null;
    this.boundOnTouchMove = null;
    this.boundOnTouchEnd = null;
    this.boundOnMouseDown = null;
    this.boundOnMouseMove = null;
    this.boundOnMouseUp = null;
    this.boundOnResize = null;
  }
}
