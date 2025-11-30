-- Create mo_sessions table to track individual sessions (page loads)
-- This allows accurate counting of unique visitors and total visits using queries
CREATE TABLE IF NOT EXISTS mo_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,           -- Unique session identifier
  player_id TEXT NOT NULL,             -- Player ID (stored in localStorage)
  visitor_id TEXT,                     -- Optional: could be used for IP or fingerprint based tracking
  session_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When the session started
  session_end TIMESTAMPTZ,            -- When the session ended (null if still active)
  is_new_visitor BOOLEAN NOT NULL,    -- True if this is the player's first visit
  page_url TEXT,                      -- Optional: track which page they visited
  referrer TEXT,                      -- Optional: track where they came from
  user_agent TEXT,                    -- Optional: browser user agent
  ip_address TEXT,                    -- Optional: IP address for geographic analytics
  country TEXT,                       -- Optional: country based on IP
  city TEXT,                          -- Optional: city based on IP
  device_type TEXT,                   -- Optional: mobile, desktop, tablet
  browser TEXT,                       -- Optional: Chrome, Firefox, Safari, etc.
  os TEXT,                           -- Optional: Windows, Mac, Linux, iOS, Android
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_mo_sessions_player_id ON mo_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_mo_sessions_session_start ON mo_sessions(session_start DESC);
CREATE INDEX IF NOT EXISTS idx_mo_sessions_is_new_visitor ON mo_sessions(is_new_visitor);
CREATE INDEX IF NOT EXISTS idx_mo_sessions_session_id ON mo_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_mo_sessions_active ON mo_sessions(session_end) WHERE session_end IS NULL;

-- Useful views for analytics

-- View to get visitor and visit counts
CREATE OR REPLACE VIEW mo_visitor_stats AS
SELECT
  COUNT(DISTINCT player_id) as unique_visitors,
  COUNT(*) as total_visits,
  COUNT(DISTINCT CASE WHEN is_new_visitor = true THEN player_id END) as new_visitors,
  COUNT(CASE WHEN is_new_visitor = false THEN 1 END) as returning_visits,
  COUNT(DISTINCT CASE WHEN session_end IS NULL THEN session_id END) as active_sessions
FROM mo_sessions;

-- View to get daily statistics
CREATE OR REPLACE VIEW mo_daily_stats AS
SELECT
  DATE(session_start) as date,
  COUNT(DISTINCT player_id) as unique_visitors,
  COUNT(*) as total_visits,
  COUNT(DISTINCT CASE WHEN is_new_visitor = true THEN player_id END) as new_visitors,
  COUNT(CASE WHEN is_new_visitor = false THEN 1 END) as returning_visits
FROM mo_sessions
GROUP BY DATE(session_start)
ORDER BY date DESC;

-- View to get hourly statistics for today
CREATE OR REPLACE VIEW mo_hourly_stats AS
SELECT
  DATE_TRUNC('hour', session_start) as hour,
  COUNT(DISTINCT player_id) as unique_visitors,
  COUNT(*) as total_visits
FROM mo_sessions
WHERE DATE(session_start) = CURRENT_DATE
GROUP BY DATE_TRUNC('hour', session_start)
ORDER BY hour DESC;

-- View to get visitor retention (how many visitors return)
CREATE OR REPLACE VIEW mo_visitor_retention AS
SELECT
  player_id,
  MIN(session_start) as first_visit,
  MAX(session_start) as last_visit,
  COUNT(*) as total_visits,
  COUNT(DISTINCT DATE(session_start)) as days_visited
FROM mo_sessions
GROUP BY player_id
HAVING COUNT(*) > 1
ORDER BY total_visits DESC;