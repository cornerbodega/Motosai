-- Create mo_visitors table to track visitor and visit counts
CREATE TABLE IF NOT EXISTS mo_visitors (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visitors INTEGER NOT NULL DEFAULT 0,  -- Unique visitors (first time only)
  visits INTEGER NOT NULL DEFAULT 0,     -- Total visits (including returning)
  player_id TEXT,
  event_type TEXT  -- 'new_visitor' or 'returning_visit'
);

-- Create an index on timestamp for faster queries
CREATE INDEX IF NOT EXISTS idx_mo_visitors_timestamp ON mo_visitors(timestamp DESC);

-- Insert initial counters record
INSERT INTO mo_visitors (timestamp, visitors, visits, player_id, event_type)
VALUES (NOW(), 0, 0, NULL, 'init')
ON CONFLICT DO NOTHING;
