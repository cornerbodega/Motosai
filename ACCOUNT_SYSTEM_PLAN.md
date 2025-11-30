# Motosai Account System - Implementation Plan

## ✅ Phase 1: Core Account System (COMPLETED)

### 1.1 localStorage Persistence
- [x] Store player ID in localStorage
- [x] Store username in localStorage
- [x] Reuse player ID across sessions
- [x] Server accepts existing player IDs

### 1.2 Account Modal UI
- [x] Click player name in leaderboard to open modal
- [x] Login/Signup tabs
- [x] Email + password authentication
- [x] Rename form (authenticated users only)
- [x] Logout functionality
- [x] Error/success messaging

### 1.3 API Endpoints
- [x] `/api/account/link` - Link player ID to Supabase user
- [x] `/api/account/rename` - Rename account (requires auth)
  - Username validation (3-20 chars, alphanumeric + underscore)
  - Duplicate username check
  - Updates all leaderboard entries
  - JWT authentication with Supabase

### 1.4 Integration
- [x] Supabase Auth integration
- [x] Auto-link player ID on login/signup
- [x] Update localStorage on rename
- [x] Refresh leaderboard after rename
- [x] Green highlight + click handler on your name

---

## 🚧 Phase 2: Enhanced Features (FUTURE)

### 2.1 Email Verification
- [ ] Require email confirmation on signup
- [ ] Resend verification email button
- [ ] Show verification status in modal
- [ ] Prevent rename until verified (optional)

**Why:** Prevents spam accounts and ensures valid email addresses

**Implementation:**
```javascript
// In Supabase Dashboard
// Auth > Email Templates > Confirm signup
// Configure custom email template

// In AccountModal.js
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: window.location.origin
  }
});
```

---

### 2.2 Password Reset Flow
- [ ] "Forgot Password?" link on login form
- [ ] Send reset email via Supabase
- [ ] Password reset landing page
- [ ] Update password form

**Why:** Users need to recover locked accounts

**Implementation:**
```javascript
// Send reset email
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/reset-password`
});

// Reset password page
await supabase.auth.updateUser({
  password: newPassword
});
```

---

### 2.3 Profile Stats View
- [ ] View all-time stats
- [ ] View session history
- [ ] Best scores per vehicle type
- [ ] Achievement badges
- [ ] Total playtime

**Why:** Players want to see detailed progress

**UI Mock:**
```
┌─────────────────────────────────┐
│ 🏍️ Your Profile                 │
├─────────────────────────────────┤
│ Username: SpeedDemon            │
│ Member Since: Jan 2025          │
│                                 │
│ 📊 Stats                        │
│ • Best Score: 116 vehicles      │
│ • Total Games: 45               │
│ • Total Distance: 125.3 km      │
│ • Top Speed: 312 mph            │
│ • Total Crashes: 132            │
│                                 │
│ 🏆 Achievements                 │
│ ⭐ Speed Demon (300+ mph)       │
│ ⭐ Century Club (100+ vehicles) │
│ ⭐ Survivor (1000m no crash)    │
└─────────────────────────────────┘
```

---

### 2.4 Social Login
- [ ] Google OAuth
- [ ] Discord OAuth
- [ ] GitHub OAuth
- [ ] Link multiple providers

**Why:** Faster signup, better user experience

**Implementation:**
```javascript
// Google login
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: window.location.origin
  }
});
```

---

### 2.5 Account Deletion
- [ ] Delete account button in modal
- [ ] Confirmation dialog
- [ ] Option to keep scores or delete all data
- [ ] Unlink player ID (returns to anonymous)

**Why:** GDPR compliance, user control

**API Endpoint:**
```javascript
app.post('/api/account/delete', async (req, res) => {
  const user = await verifySupabaseToken(req.headers.authorization);
  const { playerId, deleteScores } = req.body;

  // Verify player belongs to user
  if (playerUserMappings.get(playerId) !== user.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // Optionally delete all scores
  if (deleteScores) {
    await supabase
      .from('mo_leaderboard')
      .delete()
      .eq('player_id', playerId);
  }

  // Delete user account
  await supabase.auth.admin.deleteUser(user.id);

  // Unlink in memory
  playerUserMappings.delete(playerId);
  localStorage.removeItem('motosai_player_id');
  localStorage.removeItem('motosai_username');
});
```

---

### 2.6 Multi-Device Account Sync
- [ ] Login on new device → prompt to link or create new profile
- [ ] Merge scores from anonymous to authenticated
- [ ] Resolve conflicts (keep best scores)
- [ ] Device management (list linked devices)

**Why:** Players switch between desktop/mobile

**Flow:**
1. Player plays anonymously on Device A (localStorage ID: `abc123`)
2. Player creates account on Device A → links `abc123` to account
3. Player opens game on Device B (new localStorage ID: `def456`)
4. Player logs in on Device B
5. **Prompt:** "We found scores on this device. Merge with your account?"
6. If yes: Merge scores, update player ID to `abc123`
7. If no: Keep separate (for shared devices)

---

### 2.7 Username History & Change Limits
- [ ] Track username change history
- [ ] Limit renames (e.g., once per 30 days)
- [ ] Show previous usernames on profile
- [ ] Prevent impersonation

**Why:** Prevent abuse, maintain identity

**Database Schema:**
```sql
CREATE TABLE username_history (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL,
  old_username TEXT NOT NULL,
  new_username TEXT NOT NULL,
  changed_at TIMESTAMP NOT NULL,
  changed_by_user_id UUID NOT NULL
);
```

---

### 2.8 Account Recovery
- [ ] Security questions
- [ ] Recovery codes (download on signup)
- [ ] Email-based recovery
- [ ] Support ticket system

**Why:** Help users who lose access

---

### 2.9 Profile Customization
- [ ] Upload avatar/profile picture
- [ ] Custom bike colors (linked to account)
- [ ] Profile bio/status
- [ ] Country/region flag
- [ ] Profile page URL (e.g., `/profile/SpeedDemon`)

**Why:** Personalization increases engagement

---

### 2.10 Privacy Settings
- [ ] Show/hide profile in leaderboards
- [ ] Anonymous mode (play without submitting scores)
- [ ] Private profile (only you can see stats)
- [ ] Block other players

**Why:** User privacy preferences

---

## 📊 Phase 3: Social Features (FUTURE)

### 3.1 Friends System
- [ ] Add friends by username
- [ ] Friend requests + acceptance
- [ ] View friends' best scores
- [ ] Compare stats with friends
- [ ] Private leaderboard (friends only)

### 3.2 Clans/Teams
- [ ] Create/join clans
- [ ] Clan leaderboards
- [ ] Clan chat
- [ ] Clan challenges

### 3.3 Spectator Mode
- [ ] Watch friends play live
- [ ] Spectator chat
- [ ] Share replay links

---

## 🔐 Phase 4: Security Enhancements (FUTURE)

### 4.1 Rate Limiting
- [ ] Limit login attempts (prevent brute force)
- [ ] Limit rename attempts (prevent spam)
- [ ] Limit account creation per IP

### 4.2 Two-Factor Authentication (2FA)
- [ ] TOTP (Google Authenticator)
- [ ] SMS verification (optional)
- [ ] Backup codes

### 4.3 Session Management
- [ ] View active sessions
- [ ] Logout from all devices
- [ ] Session expiry (e.g., 30 days)

### 4.4 Fraud Detection
- [ ] Detect suspicious score patterns
- [ ] Flag impossible scores (physics validation)
- [ ] Ban/suspend accounts
- [ ] Appeal system

---

## 🛠️ Technical Improvements (FUTURE)

### 5.1 Database Optimizations
- [ ] Index on `player_id` for faster lookups
- [ ] Index on `username` (lowercase) for case-insensitive search
- [ ] Partition leaderboard by date (monthly archives)
- [ ] Cache username mappings in Redis

### 5.2 Persistent Storage for Mappings
Currently `playerUserMappings` is in-memory (lost on server restart):
- [ ] Store in Supabase table: `player_accounts`
- [ ] Schema:
  ```sql
  CREATE TABLE player_accounts (
    player_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    linked_at TIMESTAMP DEFAULT NOW()
  );
  ```

### 5.3 WebSocket Enhancements
- [ ] Emit events when friends come online
- [ ] Real-time notifications (new high score, friend request, etc.)
- [ ] Typing indicators in chat

---

## 📝 Testing Checklist (FUTURE)

- [ ] Test signup flow (email confirmation)
- [ ] Test login with correct/incorrect credentials
- [ ] Test password reset flow
- [ ] Test rename with duplicate username
- [ ] Test rename with invalid characters
- [ ] Test logout (clears session)
- [ ] Test localStorage persistence across tabs
- [ ] Test account link after playing anonymously
- [ ] Test security: Can user A rename user B's account? (should fail)
- [ ] Test server restart: Do mappings persist? (currently no, needs DB)

---

## 🚀 Deployment Checklist (FUTURE)

### Supabase Setup
- [ ] Create `player_accounts` table
- [ ] Create `username_history` table
- [ ] Set up RLS policies
- [ ] Configure email templates
- [ ] Set up OAuth providers

### Environment Variables
```bash
# Already configured
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# New (for OAuth)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Monitoring
- [ ] Track signup conversion rate
- [ ] Track login success/failure rate
- [ ] Track rename frequency
- [ ] Alert on suspicious activity (mass signups, etc.)

---

## 🎯 Priority Recommendations

**Must Have (P0):**
1. ✅ localStorage persistence (done)
2. ✅ Login/signup (done)
3. ✅ Rename (done)
4. 🚧 Persistent storage for player-user mappings (currently lost on restart)

**Should Have (P1):**
5. Email verification (prevent spam)
6. Password reset (user recovery)
7. Profile stats view (engagement)

**Nice to Have (P2):**
8. Social login (convenience)
9. Friends system (social engagement)
10. Account deletion (compliance)

**Future (P3):**
11. 2FA (security)
12. Clans/Teams (community building)
13. Profile customization (personalization)

---

## 📌 Current Status

✅ **Working:**
- Anonymous play with localStorage
- Click name → open modal
- Login/signup with email
- Rename account
- All scores preserved
- Green highlight on your name

🚧 **Known Issues:**
- `playerUserMappings` lost on server restart (needs database)
- No email verification yet
- No password reset
- No account deletion

🎉 **Ready for Testing!**
