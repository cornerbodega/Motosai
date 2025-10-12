import { supabase } from './utils/supabase.js';

class LeaderboardManager {
  constructor() {
    this.sessionStats = new Map(); // Track active sessions in memory
    this.leaderboardCache = null;
    this.cacheExpiry = 0;
    this.cacheTimeout = 30000; // Cache for 30 seconds
  }

  // Update player stats during session (in memory)
  updateSessionStats(playerId, stats) {
    const current = this.sessionStats.get(playerId) || {
      playerId,
      username: stats.username || `Player_${playerId.substring(0, 6)}`,
      vehiclesPassed: 0,
      maxSpeed: 0,
      distanceTraveled: 0,
      sessionStart: Date.now(),
      sessionId: stats.sessionId
    };

    if (stats.vehiclesPassed !== undefined) {
      current.vehiclesPassed = stats.vehiclesPassed;
    }
    if (stats.maxSpeed !== undefined && stats.maxSpeed > current.maxSpeed) {
      current.maxSpeed = stats.maxSpeed;
    }
    if (stats.distanceTraveled !== undefined) {
      current.distanceTraveled = stats.distanceTraveled;
    }

    this.sessionStats.set(playerId, current);
    return current;
  }

  // Submit final score to Supabase
  async submitScore(playerId, username, stats) {
    try {
      // Get player's previous best before submitting new score
      const previousBest = await this.getPlayerBest(playerId);
      const previousBestScore = previousBest?.vehicles_passed || 0;

      const entry = {
        player_id: playerId,
        username: username || `Player_${playerId.substring(0, 6)}`,
        vehicles_passed: stats.vehiclesPassed || 0,
        max_speed: stats.maxSpeed || 0,
        distance_traveled: stats.distanceTraveled || 0,
        session_id: stats.sessionId || null,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('mo_leaderboard')
        .insert(entry)
        .select();

      if (error) {
        console.error('Error submitting score to Supabase:', error);
        return { success: false, error: error.message };
      }

      // Clear cache to force refresh
      this.leaderboardCache = null;

      // Get player's rank
      const rank = await this.getPlayerRank(playerId, stats.vehiclesPassed);

      // Determine if this is a new personal best
      const isNewBest = stats.vehiclesPassed > previousBestScore;

      // Clear session data
      this.sessionStats.delete(playerId);

      return {
        success: true,
        data: data[0],
        rank,
        isNewBest,
        previousBest: previousBestScore
      };
    } catch (error) {
      console.error('Error in submitScore:', error);
      return { success: false, error: error.message };
    }
  }

  // Get player's rank
  async getPlayerRank(playerId, vehiclesPassed) {
    try {
      const { count, error } = await supabase
        .from('mo_leaderboard')
        .select('*', { count: 'exact', head: true })
        .gt('vehicles_passed', vehiclesPassed);

      if (error) {
        console.error('Error getting player rank:', error);
        return null;
      }

      return (count || 0) + 1;
    } catch (error) {
      console.error('Error in getPlayerRank:', error);
      return null;
    }
  }

  // Get top scores (cached) - Only best score per player
  async getTopScores(limit = 10) {
    try {
      // Check cache
      if (this.leaderboardCache && Date.now() < this.cacheExpiry) {
        return this.leaderboardCache.slice(0, limit);
      }

      // Use a raw SQL query to get each player's best score
      const { data, error } = await supabase.rpc('get_top_players', {
        score_limit: 50
      });

      if (error) {
        // Fallback: fetch all and deduplicate in memory
        console.warn('RPC not available, using fallback deduplication');
        const { data: allData, error: fetchError } = await supabase
          .from('mo_leaderboard')
          .select('*')
          .order('vehicles_passed', { ascending: false })
          .limit(200);

        if (fetchError) {
          console.error('Error fetching leaderboard:', fetchError);
          return [];
        }

        // Deduplicate: keep only best score per player
        const playerBestMap = new Map();
        (allData || []).forEach(entry => {
          const existing = playerBestMap.get(entry.player_id);
          if (!existing || entry.vehicles_passed > existing.vehicles_passed) {
            playerBestMap.set(entry.player_id, entry);
          }
        });

        const uniqueData = Array.from(playerBestMap.values())
          .sort((a, b) => b.vehicles_passed - a.vehicles_passed)
          .slice(0, 50);

        this.leaderboardCache = uniqueData;
        this.cacheExpiry = Date.now() + this.cacheTimeout;
        return this.leaderboardCache.slice(0, limit);
      }

      // Update cache
      this.leaderboardCache = data || [];
      this.cacheExpiry = Date.now() + this.cacheTimeout;

      return this.leaderboardCache.slice(0, limit);
    } catch (error) {
      console.error('Error in getTopScores:', error);
      return [];
    }
  }

  // Get daily top scores - Only best score per player today
  async getDailyTopScores(limit = 10) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch all daily scores
      const { data, error } = await supabase
        .from('mo_leaderboard')
        .select('*')
        .gte('created_at', today.toISOString())
        .order('vehicles_passed', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error fetching daily leaderboard:', error);
        return [];
      }

      // Deduplicate: keep only best score per player for today
      const playerBestMap = new Map();
      (data || []).forEach(entry => {
        const existing = playerBestMap.get(entry.player_id);
        if (!existing || entry.vehicles_passed > existing.vehicles_passed) {
          playerBestMap.set(entry.player_id, entry);
        }
      });

      return Array.from(playerBestMap.values())
        .sort((a, b) => b.vehicles_passed - a.vehicles_passed)
        .slice(0, limit);
    } catch (error) {
      console.error('Error in getDailyTopScores:', error);
      return [];
    }
  }

  // Get player's best score
  async getPlayerBest(playerId) {
    try {
      const { data, error } = await supabase
        .from('mo_leaderboard')
        .select('*')
        .eq('player_id', playerId)
        .order('vehicles_passed', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error fetching player best:', error);
        return null;
      }

      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Error in getPlayerBest:', error);
      return null;
    }
  }

  // Get current session stats
  getCurrentSession(playerId) {
    return this.sessionStats.get(playerId);
  }

  // Clear session data
  clearSession(playerId) {
    this.sessionStats.delete(playerId);
  }
}

// Create singleton instance
const leaderboardManager = new LeaderboardManager();
export { leaderboardManager };