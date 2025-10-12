export class LeaderboardUI {
  constructor(game) {
    this.game = game;
    this.serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';
    this.leaderboardData = [];
    this.dailyLeaderboardData = [];
    this.showDaily = false;
    this.updateInterval = 30000; // Update every 30 seconds
    this.lastUpdate = 0;
    this.isVisible = true;
    this.isMinimized = false;

    // Player's current rank
    this.playerRank = null;
    this.playerBest = null;

    this.createUI();
    this.fetchLeaderboard();
    this.setupKeyboardControls();

    // Auto-update leaderboard
    this.updateTimer = setInterval(() => {
      this.fetchLeaderboard();
    }, this.updateInterval);
  }

  createUI() {
    // Main container
    const container = document.createElement('div');
    container.id = 'leaderboard-container';
    container.style.cssText = `
      position: fixed;
      right: 20px;
      top: 140px;
      width: 280px;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.9) 0%, rgba(20, 20, 40, 0.9) 100%);
      border: 2px solid rgba(100, 200, 255, 0.3);
      border-radius: 15px;
      padding: 15px;
      font-family: 'Orbitron', monospace;
      color: white;
      z-index: 999;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
      max-height: 500px;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      border-bottom: 2px solid rgba(100, 200, 255, 0.3);
      padding-bottom: 10px;
    `;

    // Title with icon
    const title = document.createElement('div');
    title.style.cssText = `
      font-size: 18px;
      font-weight: bold;
      color: #ffa500;
      text-shadow: 0 0 10px rgba(255, 165, 0, 0.5);
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    title.innerHTML = `
      <span style="font-size: 24px;">🏆</span>
      <span id="leaderboard-title">LEADERBOARD</span>
    `;

    // Controls
    const controls = document.createElement('div');
    controls.style.cssText = `
      display: flex;
      gap: 10px;
      align-items: center;
    `;

    // Toggle button (Daily/All-Time)
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggle-leaderboard';
    toggleBtn.style.cssText = `
      background: rgba(100, 200, 255, 0.2);
      border: 1px solid rgba(100, 200, 255, 0.5);
      color: white;
      padding: 4px 8px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 11px;
      font-family: 'Orbitron', monospace;
      transition: all 0.2s;
    `;
    toggleBtn.textContent = 'DAILY';
    toggleBtn.onclick = () => this.toggleLeaderboardType();

    // Minimize button
    const minimizeBtn = document.createElement('button');
    minimizeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
      font-size: 18px;
      transition: color 0.2s;
    `;
    minimizeBtn.innerHTML = '⎯';
    minimizeBtn.onclick = () => this.toggleMinimize();

    controls.appendChild(toggleBtn);
    controls.appendChild(minimizeBtn);
    header.appendChild(title);
    header.appendChild(controls);

    // Player stats section
    const playerStats = document.createElement('div');
    playerStats.id = 'player-stats';
    playerStats.style.cssText = `
      background: rgba(50, 100, 150, 0.2);
      border-radius: 8px;
      padding: 8px;
      margin-bottom: 10px;
      font-size: 12px;
      display: none;
    `;

    // Leaderboard list
    const listContainer = document.createElement('div');
    listContainer.id = 'leaderboard-list-container';
    listContainer.style.cssText = `
      max-height: 350px;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 5px;
    `;

    // Custom scrollbar
    const scrollbarStyle = document.createElement('style');
    scrollbarStyle.textContent = `
      #leaderboard-list-container::-webkit-scrollbar {
        width: 6px;
      }
      #leaderboard-list-container::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
      }
      #leaderboard-list-container::-webkit-scrollbar-thumb {
        background: rgba(100, 200, 255, 0.5);
        border-radius: 3px;
      }
      #leaderboard-list-container::-webkit-scrollbar-thumb:hover {
        background: rgba(100, 200, 255, 0.7);
      }

      @keyframes newHighScore {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); background: rgba(255, 215, 0, 0.3); }
        100% { transform: scale(1); }
      }

      .leaderboard-entry {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px;
        margin-bottom: 5px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        border-left: 3px solid transparent;
        transition: all 0.3s ease;
      }

      .leaderboard-entry:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: translateX(-3px);
      }

      .leaderboard-entry.gold {
        border-left-color: #ffd700;
        background: linear-gradient(90deg, rgba(255, 215, 0, 0.1) 0%, transparent 100%);
      }

      .leaderboard-entry.silver {
        border-left-color: #c0c0c0;
        background: linear-gradient(90deg, rgba(192, 192, 192, 0.1) 0%, transparent 100%);
      }

      .leaderboard-entry.bronze {
        border-left-color: #cd7f32;
        background: linear-gradient(90deg, rgba(205, 127, 50, 0.1) 0%, transparent 100%);
      }

      .leaderboard-entry.current-player {
        border-left-color: #00ff00;
        background: rgba(0, 255, 0, 0.1);
      }

      .rank-medal {
        font-size: 18px;
        margin-right: 5px;
      }
    `;
    document.head.appendChild(scrollbarStyle);

    const list = document.createElement('div');
    list.id = 'leaderboard-list';

    listContainer.appendChild(list);

    // Loading indicator
    const loading = document.createElement('div');
    loading.id = 'leaderboard-loading';
    loading.style.cssText = `
      text-align: center;
      padding: 20px;
      color: rgba(255, 255, 255, 0.5);
      display: none;
    `;
    loading.textContent = 'Loading...';

    // No data message
    const noData = document.createElement('div');
    noData.id = 'leaderboard-no-data';
    noData.style.cssText = `
      text-align: center;
      padding: 20px;
      color: rgba(255, 255, 255, 0.5);
      display: none;
    `;
    noData.textContent = 'No scores yet. Be the first!';

    // Assemble container
    container.appendChild(header);
    container.appendChild(playerStats);
    container.appendChild(listContainer);
    container.appendChild(loading);
    container.appendChild(noData);

    document.body.appendChild(container);

    // Store references
    this.container = container;
    this.listElement = list;
    this.loadingElement = loading;
    this.noDataElement = noData;
    this.playerStatsElement = playerStats;
    this.toggleButton = toggleBtn;
    this.titleElement = document.getElementById('leaderboard-title');
  }

  async fetchLeaderboard() {
    try {
      // Show loading
      this.loadingElement.style.display = 'block';
      this.listElement.style.display = 'none';
      this.noDataElement.style.display = 'none';

      // Fetch both leaderboards
      const [allTimeResponse, dailyResponse] = await Promise.all([
        fetch(`${this.serverUrl}/api/leaderboard/top?limit=10`),
        fetch(`${this.serverUrl}/api/leaderboard/daily?limit=10`)
      ]);

      const allTimeData = await allTimeResponse.json();
      const dailyData = await dailyResponse.json();

      if (allTimeData.success) {
        this.leaderboardData = allTimeData.leaderboard || [];
      }

      if (dailyData.success) {
        this.dailyLeaderboardData = dailyData.leaderboard || [];
      }

      // Fetch player's best score if logged in
      if (this.game.multiplayerManager?.playerId) {
        const playerResponse = await fetch(
          `${this.serverUrl}/api/leaderboard/player/${this.game.multiplayerManager.playerId}`
        );
        const playerData = await playerResponse.json();

        if (playerData.success) {
          this.playerBest = playerData.bestScore;
          this.updatePlayerStats();
        }
      }

      this.updateDisplay();
      this.lastUpdate = Date.now();

    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      this.loadingElement.style.display = 'none';
      this.noDataElement.style.display = 'block';
      this.noDataElement.textContent = 'Failed to load leaderboard';
    }
  }

  updateDisplay() {
    const data = this.showDaily ? this.dailyLeaderboardData : this.leaderboardData;

    // Hide loading
    this.loadingElement.style.display = 'none';

    if (!data || data.length === 0) {
      this.listElement.style.display = 'none';
      this.noDataElement.style.display = 'block';
      return;
    }

    this.listElement.style.display = 'block';
    this.noDataElement.style.display = 'none';

    // Clear current list
    this.listElement.innerHTML = '';

    // Add entries
    data.forEach((entry, index) => {
      const rank = index + 1;
      const entryDiv = document.createElement('div');
      entryDiv.className = 'leaderboard-entry';

      // Add special classes for top 3
      if (rank === 1) entryDiv.classList.add('gold');
      else if (rank === 2) entryDiv.classList.add('silver');
      else if (rank === 3) entryDiv.classList.add('bronze');

      // Check if this is the current player
      if (this.game.multiplayerManager?.playerId === entry.player_id) {
        entryDiv.classList.add('current-player');
      }

      // Rank section
      const rankSection = document.createElement('div');
      rankSection.style.cssText = `
        display: flex;
        align-items: center;
        gap: 5px;
        min-width: 50px;
      `;

      // Medal for top 3
      let medal = '';
      if (rank === 1) medal = '🥇';
      else if (rank === 2) medal = '🥈';
      else if (rank === 3) medal = '🥉';

      rankSection.innerHTML = `
        ${medal ? `<span class="rank-medal">${medal}</span>` : ''}
        <span style="color: rgba(255, 255, 255, 0.6); font-size: 12px;">#${rank}</span>
      `;

      // Player name
      const nameSection = document.createElement('div');
      nameSection.style.cssText = `
        flex: 1;
        font-size: 13px;
        color: white;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;
      nameSection.textContent = entry.username || 'Anonymous';

      // Score
      const scoreSection = document.createElement('div');
      scoreSection.style.cssText = `
        font-size: 14px;
        font-weight: bold;
        color: white;
      `;
      scoreSection.textContent = entry.vehicles_passed || 0;

      entryDiv.appendChild(rankSection);
      entryDiv.appendChild(nameSection);
      entryDiv.appendChild(scoreSection);

      this.listElement.appendChild(entryDiv);
    });
  }

  updatePlayerStats() {
    if (!this.playerBest) {
      this.playerStatsElement.style.display = 'none';
      return;
    }

    this.playerStatsElement.style.display = 'block';
    this.playerStatsElement.innerHTML = `
      <div style="color: #ffa500; font-weight: bold; margin-bottom: 5px;">Your Best Score</div>
      <div style="display: flex; justify-content: space-between;">
        <span>Vehicles Passed:</span>
        <span style="color: #00ff00; font-weight: bold;">${this.playerBest.vehicles_passed}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>Max Speed:</span>
        <span style="color: #ffff00;">${Math.round(this.playerBest.max_speed * 2.237)} mph</span>
      </div>
    `;
  }

  toggleLeaderboardType() {
    this.showDaily = !this.showDaily;
    this.toggleButton.textContent = this.showDaily ? 'ALL-TIME' : 'DAILY';
    this.titleElement.textContent = this.showDaily ? 'DAILY LEADERS' : 'LEADERBOARD';
    this.updateDisplay();
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;

    if (this.isMinimized) {
      this.container.style.height = '50px';
      this.container.style.overflow = 'hidden';
      document.getElementById('leaderboard-list-container').style.display = 'none';
      this.playerStatsElement.style.display = 'none';
    } else {
      this.container.style.height = 'auto';
      document.getElementById('leaderboard-list-container').style.display = 'block';
      if (this.playerBest) {
        this.playerStatsElement.style.display = 'block';
      }
    }
  }

  toggleVisibility() {
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? 'block' : 'none';
  }

  setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
      // Press L to toggle leaderboard visibility
      if (e.key === 'l' || e.key === 'L') {
        this.toggleVisibility();
      }
    });
  }

  // Called when player achieves a new high score
  onNewHighScore(data) {
    // Animate the leaderboard
    this.container.style.animation = 'newHighScore 1s ease';
    setTimeout(() => {
      this.container.style.animation = '';
    }, 1000);

    // Refresh leaderboard
    this.fetchLeaderboard();

    // Show notification
    this.showNotification(`New High Score! Rank #${data.rank}`);
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
      color: #000;
      padding: 20px 40px;
      border-radius: 10px;
      font-size: 24px;
      font-weight: bold;
      font-family: 'Orbitron', monospace;
      box-shadow: 0 0 30px rgba(255, 215, 0, 0.8);
      z-index: 10000;
      animation: pulse 0.5s ease-in-out;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.transition = 'opacity 0.5s';
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 500);
    }, 3000);
  }

  // Update leaderboard with live data
  updateLiveEntry(playerId, username, vehiclesPassed) {
    // Find or create entry for live updates
    const currentData = this.showDaily ? this.dailyLeaderboardData : this.leaderboardData;
    const existingIndex = currentData.findIndex(e => e.player_id === playerId);

    if (existingIndex >= 0) {
      currentData[existingIndex].vehicles_passed = vehiclesPassed;
    }

    // Re-sort and update display
    currentData.sort((a, b) => b.vehicles_passed - a.vehicles_passed);
    this.updateDisplay();
  }

  dispose() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    if (this.container) {
      this.container.remove();
    }
  }
}