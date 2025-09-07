import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env file');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl);
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseKey ? 'Set' : 'Not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupDatabase() {
  console.log('Setting up Motosai database tables...');
  
  // Note: These queries need to be run with proper permissions
  // You may need to run them directly in Supabase SQL editor
  
  const tables = [
    {
      name: 'mo_game_sessions',
      check: `SELECT * FROM mo_game_sessions LIMIT 1`,
      error: 'Table mo_game_sessions does not exist'
    },
    {
      name: 'mo_players', 
      check: `SELECT * FROM mo_players LIMIT 1`,
      error: 'Table mo_players does not exist'
    },
    {
      name: 'mo_player_states',
      check: `SELECT * FROM mo_player_states LIMIT 1`, 
      error: 'Table mo_player_states does not exist'
    },
    {
      name: 'mo_chat_messages',
      check: `SELECT * FROM mo_chat_messages LIMIT 1`,
      error: 'Table mo_chat_messages does not exist'
    }
  ];

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table.name)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`❌ ${table.error}`);
        console.log(`   Error: ${error.message}`);
        console.log(`   Please create the table using the schema.sql file in Supabase SQL editor`);
      } else {
        console.log(`✅ Table ${table.name} exists`);
      }
    } catch (err) {
      console.log(`❌ Error checking ${table.name}:`, err.message);
    }
  }

  console.log('\n📝 To create the tables:');
  console.log('1. Go to your Supabase dashboard: https://app.supabase.com');
  console.log('2. Select your project');
  console.log('3. Go to SQL Editor');
  console.log('4. Copy and paste the contents of database/schema.sql');
  console.log('5. Run the SQL');
}

setupDatabase().catch(console.error);