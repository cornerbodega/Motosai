// PlacementToast - Displays rank notification when player finishes a game

export class PlacementToast {
  constructor() {
    this.container = null;
    this.styleElement = null;
    this.createContainer();
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.id = 'placement-toast';
    this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.8);
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(20, 20, 40, 0.95) 100%);
      border: 3px solid #ffa500;
      border-radius: 20px;
      padding: 30px 40px;
      z-index: 10000;
      font-family: 'Orbitron', monospace;
      text-align: center;
      opacity: 0;
      pointer-events: none;
      box-shadow: 0 10px 40px rgba(255, 165, 0, 0.4);
      min-width: 300px;
    `;
    document.body.appendChild(this.container);
  }

  show({ rank, vehiclesPassed, isNewBest, totalPlayers }) {
    // Build toast content
    let rankText = '';
    let rankColor = '#ffa500';

    if (rank === 1) {
      rankText = '1st Place!';
      rankColor = '#FFD700'; // Gold
    } else if (rank === 2) {
      rankText = '2nd Place!';
      rankColor = '#C0C0C0'; // Silver
    } else if (rank === 3) {
      rankText = '3rd Place!';
      rankColor = '#CD7F32'; // Bronze
    } else if (rank) {
      rankText = `${rank}${this.getOrdinalSuffix(rank)} Place`;
      rankColor = '#FFFFFF'; // White
    }

    const newBestBadge = isNewBest ?
      '<div style="margin-top: 10px; color: #00ff00; font-size: 16px; animation: pulse 1s infinite;">✨ NEW PERSONAL BEST! ✨</div>' :
      '';

    this.container.innerHTML = `
      <div style="font-size: 48px; font-weight: bold; color: ${rankColor}; text-shadow: 0 0 20px ${rankColor};">
        ${rankText}
      </div>
      <div style="font-size: 24px; color: white; margin-top: 15px;">
        ${vehiclesPassed} vehicles passed
      </div>
      ${newBestBadge}
      ${totalPlayers ? `<div style="font-size: 14px; color: white; margin-top: 10px;">out of ${totalPlayers} players</div>` : ''}
    `;

    // Add pulse animation for "new best"
    if (!this.styleElement && !document.getElementById('pulse-animation-style')) {
      const style = document.createElement('style');
      style.id = 'pulse-animation-style';
      style.innerHTML = `
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
      `;
      document.head.appendChild(style);
      this.styleElement = style; // Track for cleanup
    }

    // Animate in
    this.container.style.pointerEvents = 'auto';
    this.container.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    this.container.style.opacity = '1';
    this.container.style.transform = 'translate(-50%, -50%) scale(1)';

    // Auto-hide after 5 seconds
    setTimeout(() => {
      this.hide();
    }, 5000);
  }

  hide() {
    if (this.container) {
      this.container.style.opacity = '0';
      this.container.style.transform = 'translate(-50%, -50%) scale(0.8)';
      setTimeout(() => {
        this.container.style.pointerEvents = 'none';
      }, 300);
    }
  }

  getOrdinalSuffix(num) {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  }

  dispose() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    // Remove style element from DOM
    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
      this.styleElement = null;
    }
  }
}
