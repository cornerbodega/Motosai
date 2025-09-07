-- Motosai Multiplayer Database Schema
-- All tables prefixed with mo_

-- Game sessions table
CREATE TABLE IF NOT EXISTS mo_game_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_name TEXT NOT NULL,
    max_players INTEGER DEFAULT 8,
    current_players INTEGER DEFAULT 0,
    status TEXT DEFAULT 'waiting', -- waiting, racing, finished
    highway_section TEXT DEFAULT 'sf_to_monterey', -- section of highway
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    host_player_id UUID
);

-- Players table
CREATE TABLE IF NOT EXISTS mo_players (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT UNIQUE,
    avatar_url TEXT,
    bike_color TEXT DEFAULT '#FF0000',
    bike_model TEXT DEFAULT 'sport',
    total_distance REAL DEFAULT 0,
    best_speed REAL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Player states for realtime sync
CREATE TABLE IF NOT EXISTS mo_player_states (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    player_id UUID REFERENCES mo_players(id) ON DELETE CASCADE,
    session_id UUID REFERENCES mo_game_sessions(id) ON DELETE CASCADE,
    position_x REAL DEFAULT 0,
    position_y REAL DEFAULT 0,
    position_z REAL DEFAULT 0,
    rotation_x REAL DEFAULT 0,
    rotation_y REAL DEFAULT 0,
    rotation_z REAL DEFAULT 0,
    speed REAL DEFAULT 0,
    lean_angle REAL DEFAULT 0,
    gear INTEGER DEFAULT 1,
    is_wheelie BOOLEAN DEFAULT false,
    is_stoppie BOOLEAN DEFAULT false,
    is_crashed BOOLEAN DEFAULT false,
    lap_time REAL DEFAULT 0,
    checkpoint INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    last_update TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(player_id, session_id)
);

-- Race results
CREATE TABLE IF NOT EXISTS mo_race_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES mo_game_sessions(id) ON DELETE CASCADE,
    player_id UUID REFERENCES mo_players(id) ON DELETE CASCADE,
    finish_position INTEGER,
    finish_time REAL,
    top_speed REAL,
    distance_covered REAL,
    crashes INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Chat messages
CREATE TABLE IF NOT EXISTS mo_chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES mo_game_sessions(id) ON DELETE CASCADE,
    player_id UUID REFERENCES mo_players(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_mo_player_states_session ON mo_player_states(session_id);
CREATE INDEX IF NOT EXISTS idx_mo_player_states_player ON mo_player_states(player_id);
CREATE INDEX IF NOT EXISTS idx_mo_player_states_active ON mo_player_states(is_active);
CREATE INDEX IF NOT EXISTS idx_mo_chat_messages_session ON mo_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_mo_race_results_session ON mo_race_results(session_id);

-- Enable Row Level Security
ALTER TABLE mo_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mo_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE mo_player_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE mo_race_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE mo_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for public access (adjust based on auth requirements)
CREATE POLICY "Public read access" ON mo_game_sessions FOR SELECT USING (true);
CREATE POLICY "Public insert access" ON mo_game_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update access" ON mo_game_sessions FOR UPDATE USING (true);

CREATE POLICY "Public read access" ON mo_players FOR SELECT USING (true);
CREATE POLICY "Public insert access" ON mo_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update access" ON mo_players FOR UPDATE USING (true);

CREATE POLICY "Public read access" ON mo_player_states FOR SELECT USING (true);
CREATE POLICY "Public insert access" ON mo_player_states FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update access" ON mo_player_states FOR UPDATE USING (true);

CREATE POLICY "Public read access" ON mo_race_results FOR SELECT USING (true);
CREATE POLICY "Public insert access" ON mo_race_results FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read access" ON mo_chat_messages FOR SELECT USING (true);
CREATE POLICY "Public insert access" ON mo_chat_messages FOR INSERT WITH CHECK (true);