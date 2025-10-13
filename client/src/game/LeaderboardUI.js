export class LeaderboardUI {
  constructor(game) {
    this.game = game;
    this.serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';

    // Separate data storage for each leaderboard type
    this.leaderboardData = {
      carsPassed: [],
      speed: []
    };
    this.dailyLeaderboardData = {
      carsPassed: [],
      speed: []
    };

    this.showDaily = false;
    this.leaderboardType = 'carsPassed'; // 'carsPassed', 'distance', or 'speed'
    this.updateInterval = 30000; // Update every 30 seconds
    this.lastUpdate = 0;
    this.isVisible = true;
    this.isMinimized = true; // Start collapsed

    // Player's current rank
    this.playerRank = null;
    this.playerBest = null;

    // Check if mobile - skip initialization on mobile to save memory
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (this.isMobile) {
      // Don't initialize on mobile - saves memory and CPU
      return;
    }

    this.createUI();
    this.fetchLeaderboard();
    this.setupKeyboardControls();

    // Auto-update leaderboard
    this.updateTimer = setInterval(() => {
      this.fetchLeaderboard();
    }, this.updateInterval);
  }

  // Called by game when player connects to multiplayer
  onPlayerConnected() {
    console.log('🎮 Player connected - refreshing leaderboard');
    this.fetchLeaderboard();
  }

  createUI() {
    // Main container
    const container = document.createElement('div');
    container.id = 'leaderboard-container';
    container.style.cssText = `
      position: fixed;
      right: 20px;
      top: 140px;
      width: 220px;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.9) 0%, rgba(20, 20, 40, 0.9) 100%);
      border: 2px solid rgba(100, 200, 255, 0.3);
      border-radius: 10px;
      padding: 10px;
      font-family: 'Orbitron', monospace;
      color: white;
      z-index: 999;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
      max-height: 300px;
      overflow: hidden;
      display: block;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      flex-direction: column;
      margin-bottom: 8px;
      border-bottom: 2px solid rgba(100, 200, 255, 0.3);
      padding-bottom: 6px;
      gap: 5px;
    `;

    // Title row with minimize button
    const titleRow = document.createElement('div');
    titleRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;

    // Title with icon
    const title = document.createElement('div');
    title.style.cssText = `
      font-size: 14px;
      font-weight: bold;
      color: #ffa500;
      text-shadow: 0 0 10px rgba(255, 165, 0, 0.5);
      display: flex;
      align-items: center;
      gap: 5px;
    `;
    title.innerHTML = `
      <span style="font-size: 16px;">🏆</span>
      <span id="leaderboard-title">LEADERBOARDS</span>
    `;

    // Minimize button
    const minimizeBtn = document.createElement('button');
    minimizeBtn.id = 'minimize-btn';
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

    titleRow.appendChild(title);
    titleRow.appendChild(minimizeBtn);

    // Controls row 1 - Type selector only
    const controlsRow1 = document.createElement('div');
    controlsRow1.id = 'controls-row-1';
    controlsRow1.style.cssText = `
      display: flex;
      gap: 5px;
      align-items: center;
      justify-content: space-between;
    `;

    // Leaderboard type selector (dropdown)
    const typeSelector = document.createElement('select');
    typeSelector.id = 'leaderboard-type-selector';
    typeSelector.style.cssText = `
      background: rgba(100, 200, 255, 0.3);
      border: 1px solid rgba(100, 200, 255, 0.5);
      color: white;
      padding: 5px 8px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 11px;
      font-family: 'Orbitron', monospace;
      transition: all 0.2s;
      flex: 1;
    `;
    typeSelector.innerHTML = `
      <option value="carsPassed" style="background: #1a1a2e; color: white;">Cars Passed</option>
      <option value="speed" style="background: #1a1a2e; color: white;">Speed</option>
    `;
    typeSelector.onchange = (e) => this.changeLeaderboardType(e.target.value);

    controlsRow1.appendChild(typeSelector);

    // Controls row 2 - Daily/All-Time tabs
    const controlsRow2 = document.createElement('div');
    controlsRow2.id = 'controls-row-2';
    controlsRow2.style.cssText = `
      display: flex;
      gap: 3px;
      align-items: center;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 5px;
      padding: 3px;
    `;

    // All-Time tab
    const allTimeTab = document.createElement('button');
    allTimeTab.id = 'all-time-tab';
    allTimeTab.style.cssText = `
      background: rgba(100, 200, 255, 0.5);
      border: none;
      color: white;
      padding: 5px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
      font-family: 'Orbitron', monospace;
      transition: all 0.2s;
      flex: 1;
      font-weight: bold;
    `;
    allTimeTab.textContent = 'ALL-TIME';
    allTimeTab.onclick = () => this.switchToAllTime();

    // Daily tab
    const dailyTab = document.createElement('button');
    dailyTab.id = 'daily-tab';
    dailyTab.style.cssText = `
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      padding: 5px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
      font-family: 'Orbitron', monospace;
      transition: all 0.2s;
      flex: 1;
    `;
    dailyTab.textContent = 'DAILY';
    dailyTab.onclick = () => this.switchToDaily();

    controlsRow2.appendChild(allTimeTab);
    controlsRow2.appendChild(dailyTab);

    header.appendChild(titleRow);
    header.appendChild(controlsRow1);
    header.appendChild(controlsRow2);

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
      max-height: 120px;
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
        padding: 5px;
        margin-bottom: 3px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 5px;
        border-left: 2px solid transparent;
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
        border: 2px solid #00ff00;
        background: rgba(0, 255, 0, 0.1);
        font-weight: bold;
      }

      .rank-medal {
        font-size: 14px;
        margin-right: 3px;
      }
    `;
    document.head.appendChild(scrollbarStyle);

    // Store reference for cleanup
    this.styleElement = scrollbarStyle;

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
    this.allTimeTab = allTimeTab;
    this.dailyTab = dailyTab;
    this.titleElement = document.getElementById('leaderboard-title');
    this.minimizeBtn = minimizeBtn;
    this.controlsRow1 = controlsRow1;
    this.controlsRow2 = controlsRow2;

    // Start in minimized state
    this.applyMinimizedState();
  }

  async fetchLeaderboard() {
    try {
      // Show loading
      this.loadingElement.style.display = 'block';
      this.listElement.style.display = 'none';
      this.noDataElement.style.display = 'none';

      // Try multiple ways to get player ID
      const playerId = this.game.multiplayerManager?.playerId ||
                       this.game.multiplayer?.playerId;

      if (playerId) {
        // Fetch context-based leaderboards (3 entries around player)
        const [
          carsResponse, speedResponse,
          dailyCarsResponse, dailySpeedResponse,
          playerResponse
        ] = await Promise.all([
          fetch(`${this.serverUrl}/api/leaderboard/context/${playerId}`),
          fetch(`${this.serverUrl}/api/leaderboard/context-speed/${playerId}`),
          fetch(`${this.serverUrl}/api/leaderboard/context/${playerId}?daily=true`),
          fetch(`${this.serverUrl}/api/leaderboard/context-speed/${playerId}?daily=true`),
          fetch(`${this.serverUrl}/api/leaderboard/player/${playerId}`)
        ]);

        // Parse all responses
        const carsData = await carsResponse.json();
        const speedData = await speedResponse.json();
        const dailyCarsData = await dailyCarsResponse.json();
        const dailySpeedData = await dailySpeedResponse.json();
        const playerData = await playerResponse.json();

        // Store data for each type (context returns 'entries' not 'leaderboard')
        if (carsData.success) {
          this.leaderboardData.carsPassed = carsData.entries || [];
        }
        if (speedData.success) {
          this.leaderboardData.speed = speedData.entries || [];
        }
        if (dailyCarsData.success) {
          this.dailyLeaderboardData.carsPassed = dailyCarsData.entries || [];
        }
        if (dailySpeedData.success) {
          this.dailyLeaderboardData.speed = dailySpeedData.entries || [];
        }

        if (playerData.success) {
          this.playerBest = playerData.bestScore;
          this.updatePlayerStats();
        }
      } else {
        // No player ID - fetch top 3
        const [
          carsResponse, speedResponse,
          dailyCarsResponse, dailySpeedResponse
        ] = await Promise.all([
          fetch(`${this.serverUrl}/api/leaderboard/top?limit=3`),
          fetch(`${this.serverUrl}/api/leaderboard/top-speed?limit=3`),
          fetch(`${this.serverUrl}/api/leaderboard/daily?limit=3`),
          fetch(`${this.serverUrl}/api/leaderboard/daily-speed?limit=3`)
        ]);

        // Parse all responses
        const carsData = await carsResponse.json();
        const speedData = await speedResponse.json();
        const dailyCarsData = await dailyCarsResponse.json();
        const dailySpeedData = await dailySpeedResponse.json();

        // Store data for each type
        if (carsData.success) {
          this.leaderboardData.carsPassed = carsData.leaderboard || [];
        }
        if (speedData.success) {
          this.leaderboardData.speed = speedData.leaderboard || [];
        }
        if (dailyCarsData.success) {
          this.dailyLeaderboardData.carsPassed = dailyCarsData.leaderboard || [];
        }
        if (dailySpeedData.success) {
          this.dailyLeaderboardData.speed = dailySpeedData.leaderboard || [];
        }
      }

      this.updateDisplay();
      this.lastUpdate = Date.now();

    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      console.error('Error details:', error.message, error.stack);
      this.loadingElement.style.display = 'none';
      this.noDataElement.style.display = 'block';
      this.noDataElement.textContent = `Failed to load: ${error.message}`;
    }
  }

  updateDisplay() {
    const dataSource = this.showDaily ? this.dailyLeaderboardData : this.leaderboardData;
    const data = dataSource[this.leaderboardType];

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

    const playerId = this.game.multiplayerManager?.playerId || this.game.multiplayer?.playerId;

    // Display entries
    data.forEach((entry, index) => {
      const entryDiv = document.createElement('div');
      entryDiv.className = 'leaderboard-entry';

      let rank = entry.rank || index + 1;

      // Add special classes for top 3
      if (rank === 1) entryDiv.classList.add('gold');
      else if (rank === 2) entryDiv.classList.add('silver');
      else if (rank === 3) entryDiv.classList.add('bronze');

      // Check if this is the current player
      const isCurrentPlayer = playerId === entry.player_id;
      if (isCurrentPlayer) {
        entryDiv.classList.add('current-player');
      }

      // Rank section
      const rankSection = document.createElement('div');
      rankSection.style.cssText = `
        display: flex;
        align-items: center;
        gap: 3px;
        min-width: 35px;
      `;

      // Medal for top 3
      let medal = '';
      if (rank === 1) medal = '🥇';
      else if (rank === 2) medal = '🥈';
      else if (rank === 3) medal = '🥉';

      rankSection.innerHTML = `
        ${medal ? `<span class="rank-medal">${medal}</span>` : ''}
        <span style="color: ${isCurrentPlayer ? 'white' : 'rgba(255, 255, 255, 0.6)'}; font-size: 10px; ${isCurrentPlayer ? 'font-weight: bold !important;' : ''}">#${rank}</span>
      `;

      // Player name
      const nameSection = document.createElement('div');
      nameSection.style.cssText = `
        flex: 1;
        font-size: ${isCurrentPlayer ? '12px' : '11px'};
        color: white;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        ${isCurrentPlayer ? 'font-weight: bold !important; cursor: pointer; text-decoration: underline;' : ''}
      `;
      nameSection.textContent = entry.username || 'Anonymous';

      // Make current player's name clickable
      if (isCurrentPlayer) {
        nameSection.title = 'Click to manage your account';
        nameSection.onclick = () => {
          if (this.game.accountModal) {
            this.game.accountModal.show();
          }
        };
        nameSection.onmouseover = () => {
          nameSection.style.color = '#aaaaaa';
        };
        nameSection.onmouseout = () => {
          nameSection.style.color = 'white';
        };
      }

      // Score section - display different metric based on type
      const scoreSection = document.createElement('div');
      scoreSection.style.cssText = `
        font-size: ${isCurrentPlayer ? '14px' : '12px'};
        font-weight: bold;
        color: white;
        ${isCurrentPlayer ? 'font-weight: 900 !important;' : ''}
      `;

      // Format the score based on leaderboard type
      let scoreValue;
      if (this.leaderboardType === 'carsPassed') {
        scoreValue = entry.vehicles_passed || 0;
      } else if (this.leaderboardType === 'speed') {
        const mph = Math.round((entry.max_speed || 0) * 2.237);
        scoreValue = `${mph}mph`;
      }

      scoreSection.textContent = scoreValue;

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
    const speedMph = Math.round((this.playerBest.max_speed || 0) * 2.237);

    this.playerStatsElement.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 11px;">
        <span>Cars Passed:</span>
        <span style="color: white; font-weight: bold;">${this.playerBest.vehicles_passed || 0}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 11px;">
        <span>Max Speed:</span>
        <span style="color: white; font-weight: bold;">${speedMph} mph</span>
      </div>
    `;
  }

  changeLeaderboardType(type) {
    this.leaderboardType = type;
    this.updateDisplay();
  }

  switchToAllTime() {
    if (!this.showDaily) return; // Already on all-time
    this.showDaily = false;

    // Update tab styling
    this.allTimeTab.style.background = 'rgba(100, 200, 255, 0.5)';
    this.allTimeTab.style.color = 'white';
    this.allTimeTab.style.fontWeight = 'bold';
    this.dailyTab.style.background = 'transparent';
    this.dailyTab.style.color = 'rgba(255, 255, 255, 0.6)';
    this.dailyTab.style.fontWeight = 'normal';

    this.updateDisplay();
  }

  switchToDaily() {
    if (this.showDaily) return; // Already on daily
    this.showDaily = true;

    // Update tab styling
    this.dailyTab.style.background = 'rgba(100, 200, 255, 0.5)';
    this.dailyTab.style.color = 'white';
    this.dailyTab.style.fontWeight = 'bold';
    this.allTimeTab.style.background = 'transparent';
    this.allTimeTab.style.color = 'rgba(255, 255, 255, 0.6)';
    this.allTimeTab.style.fontWeight = 'normal';

    this.updateDisplay();
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    this.applyMinimizedState();
  }

  applyMinimizedState() {
    if (this.isMinimized) {
      this.container.style.height = '45px';
      this.container.style.overflow = 'hidden';
      this.controlsRow1.style.display = 'none';
      this.controlsRow2.style.display = 'none';
      document.getElementById('leaderboard-list-container').style.display = 'none';
      this.playerStatsElement.style.display = 'none';
      this.minimizeBtn.innerHTML = '+';
    } else {
      this.container.style.height = 'auto';
      this.controlsRow1.style.display = 'flex';
      this.controlsRow2.style.display = 'flex';
      document.getElementById('leaderboard-list-container').style.display = 'block';
      if (this.playerBest) {
        this.playerStatsElement.style.display = 'block';
      }
      this.minimizeBtn.innerHTML = '⎯';
    }
  }

  toggleVisibility() {
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? 'block' : 'none';
  }

  setupKeyboardControls() {
    // Store handler reference for proper cleanup
    this.keydownHandler = (e) => {
      // Press L to toggle leaderboard visibility
      if (e.key === 'l' || e.key === 'L') {
        this.toggleVisibility();
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
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
    // Find or create entry for live updates (only for carsPassed leaderboard)
    const dataSource = this.showDaily ? this.dailyLeaderboardData : this.leaderboardData;
    const currentData = dataSource.carsPassed;
    const existingIndex = currentData.findIndex(e => e.player_id === playerId);

    if (existingIndex >= 0) {
      currentData[existingIndex].vehicles_passed = vehiclesPassed;
    }

    // Re-sort and update display
    currentData.sort((a, b) => b.vehicles_passed - a.vehicles_passed);

    // Only refresh display if we're currently showing carsPassed leaderboard
    if (this.leaderboardType === 'carsPassed') {
      this.updateDisplay();
    }
  }

  dispose() {
    // Clear interval timer
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    // Remove event listener
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }

    // Remove style element from DOM
    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
      this.styleElement = null;
    }

    // Remove container from DOM
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }

    // Clear references to help garbage collection
    this.listElement = null;
    this.loadingElement = null;
    this.noDataElement = null;
    this.playerStatsElement = null;
    this.allTimeTab = null;
    this.dailyTab = null;
    this.titleElement = null;
    this.minimizeBtn = null;
    this.controlsRow1 = null;
    this.controlsRow2 = null;
    this.game = null;
  }
}