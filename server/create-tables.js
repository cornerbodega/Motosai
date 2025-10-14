import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, ".env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTables() {
  // SQL statements to create tables
  const sqlStatements = [
    // Game sessions table
    `CREATE TABLE IF NOT EXISTS mo_game_sessions (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      session_name TEXT NOT NULL,
      max_players INTEGER DEFAULT 8,
      current_players INTEGER DEFAULT 0,
      status TEXT DEFAULT 'waiting',
      highway_section TEXT DEFAULT 'sf_to_monterey',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
      host_player_id UUID
    )`,

    // Players table
    `CREATE TABLE IF NOT EXISTS mo_players (
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
    )`,

    // Player states table
    `CREATE TABLE IF NOT EXISTS mo_player_states (
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
    )`,

    // Race results table
    `CREATE TABLE IF NOT EXISTS mo_race_results (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      session_id UUID REFERENCES mo_game_sessions(id) ON DELETE CASCADE,
      player_id UUID REFERENCES mo_players(id) ON DELETE CASCADE,
      finish_position INTEGER,
      finish_time REAL,
      top_speed REAL,
      distance_covered REAL,
      crashes INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
    )`,

    // Chat messages table
    `CREATE TABLE IF NOT EXISTS mo_chat_messages (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      session_id UUID REFERENCES mo_game_sessions(id) ON DELETE CASCADE,
      player_id UUID REFERENCES mo_players(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
    )`,

    // Create indexes
    `CREATE INDEX IF NOT EXISTS idx_mo_player_states_session ON mo_player_states(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_mo_player_states_player ON mo_player_states(player_id)`,
    `CREATE INDEX IF NOT EXISTS idx_mo_player_states_active ON mo_player_states(is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_mo_chat_messages_session ON mo_chat_messages(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_mo_race_results_session ON mo_race_results(session_id)`,
  ];

  // Note: RLS policies need to be created via Supabase dashboard or with service role key

  // Test if we can query the database
  try {
    // Try to create tables using RPC (if you have a function set up)
    // Otherwise, you'll need to use Supabase dashboard

    // Check if tables exist
    const tables = [
      "mo_game_sessions",
      "mo_players",
      "mo_player_states",
      "mo_chat_messages",
      "mo_race_results",
    ];

    for (const table of tables) {
      const { data, error } = await supabase.from(table).select("*").limit(1);

      if (error && error.message.includes("does not exist")) {
      } else if (error) {
      } else {
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

createTables().catch(console.error);
