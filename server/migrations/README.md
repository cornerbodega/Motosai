# Motosai Database Migrations

## For New Installations

### Option 1: Using Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `create_mo_visitors_table.sql`
4. Paste and run the SQL in the editor

## For Existing Installations (Upgrading)

If you already have the old `mo_visitors` table with just a `count` column:

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `upgrade_mo_visitors_table.sql`
4. Paste and run the SQL in the editor

This will:
- Add new `visitors` and `visits` columns
- Migrate your existing data
- Preserve your existing visitor count

## What's Tracked

- **Visitors** (👥): Unique visitors (first time only, based on localStorage)
- **Visits** (🔄): Total visits including returning players

## Verifying the Migration

After running the migration, verify the table structure:

```sql
-- Check table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'mo_visitors';

-- View recent records
SELECT * FROM mo_visitors ORDER BY timestamp DESC LIMIT 10;
```

## Troubleshooting

- **Counts still showing 0**: Restart your server after running the migration
- **Database connection issues**: Check your `.env` file has correct `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- **Testing new visitors**: Close all browser windows completely, then open a fresh incognito window
- **Manual localStorage clear**:
  ```javascript
  localStorage.removeItem('motosai_player_id');
  localStorage.removeItem('motosai_username');
  location.reload();
  ```
