# Migration Guide: Firebase to Vercel + Supabase

## Overview
This guide covers migrating from Firebase (Auth + Firestore) to Vercel (hosting) + Supabase (Auth + Database).

## Current Architecture
- **Hosting**: Firebase Hosting (or already on Vercel)
- **Authentication**: Firebase Auth
- **Database**: Firestore
- **Frontend**: React + Vite

## Target Architecture
- **Hosting**: Vercel
- **Authentication**: Supabase Auth
- **Database**: Supabase (PostgreSQL)
- **Frontend**: React + Vite (no changes needed)

---

## Step 1: Set Up Supabase

1. **Create Supabase Project**
   - Go to https://supabase.com
   - Create a new project
   - Note your project URL and anon key

2. **Set Up Database Schema**
   - Create tables in Supabase SQL Editor to match your Firestore collections:
     - `players`
     - `leaderboard_entries`
     - `categories`
     - `platforms`
     - `download_entries`

3. **Enable Authentication**
   - In Supabase Dashboard → Authentication → Settings
   - Enable Email authentication
   - Configure email templates

---

## Step 2: Install Dependencies

```bash
npm install @supabase/supabase-js
npm uninstall firebase
```

---

## Step 3: Code Migration

### 3.1 Replace Firebase Config (`src/lib/firebase.ts` → `src/lib/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### 3.2 Authentication Migration

**Before (Firebase Auth):**
```typescript
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'

await signInWithEmailAndPassword(auth, email, password)
```

**After (Supabase Auth):**
```typescript
import { supabase } from '@/lib/supabase'

const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password
})
```

### 3.3 Database Migration

**Before (Firestore):**
```typescript
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const querySnapshot = await getDocs(collection(db, 'leaderboardEntries'))
const entries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
```

**After (Supabase):**
```typescript
import { supabase } from '@/lib/supabase'

const { data: entries, error } = await supabase
  .from('leaderboard_entries')
  .select('*')
```

---

## Step 4: Database Schema Migration

### Firestore Collections → PostgreSQL Tables

**Players Collection:**
```sql
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid UUID UNIQUE NOT NULL,
  display_name TEXT,
  email TEXT,
  join_date DATE,
  total_runs INTEGER DEFAULT 0,
  best_rank INTEGER,
  favorite_category TEXT,
  favorite_platform TEXT,
  name_color TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  total_points INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Leaderboard Entries:**
```sql
CREATE TABLE leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID REFERENCES players(uid),
  player_name TEXT NOT NULL,
  player2_name TEXT,
  category TEXT NOT NULL,
  platform TEXT NOT NULL,
  run_type TEXT CHECK (run_type IN ('solo', 'co-op')),
  time TEXT NOT NULL,
  date DATE NOT NULL,
  video_url TEXT,
  comment TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verified_by UUID,
  is_obsolete BOOLEAN DEFAULT FALSE,
  points INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_leaderboard_verified ON leaderboard_entries(verified);
CREATE INDEX idx_leaderboard_category ON leaderboard_entries(category);
CREATE INDEX idx_leaderboard_platform ON leaderboard_entries(platform);
CREATE INDEX idx_leaderboard_run_type ON leaderboard_entries(run_type);
```

**Categories & Platforms:**
```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE platforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE download_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  category TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Step 5: Row Level Security (RLS) Policies

Supabase uses Row Level Security instead of Firestore Rules:

```sql
-- Enable RLS
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_entries ENABLE ROW LEVEL SECURITY;

-- Players: Anyone can read, users can update their own
CREATE POLICY "Players are viewable by everyone"
  ON players FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON players FOR UPDATE
  USING (auth.uid() = uid);

-- Leaderboard entries: Anyone can read verified entries
CREATE POLICY "Verified entries are viewable"
  ON leaderboard_entries FOR SELECT
  USING (verified = true);

-- Admins can update verification status
CREATE POLICY "Admins can update verification"
  ON leaderboard_entries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.uid = auth.uid()
      AND players.is_admin = true
    )
  );
```

---

## Step 6: Data Migration Script

You'll need to export data from Firestore and import to Supabase:

```typescript
// migration-script.ts
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'
import { createClient } from '@supabase/supabase-js'

// Initialize both
const firebaseApp = initializeApp(firebaseConfig)
const firestore = getFirestore(firebaseApp)
const supabase = createClient(supabaseUrl, supabaseKey)

// Migrate players
const playersSnapshot = await getDocs(collection(firestore, 'players'))
for (const doc of playersSnapshot.docs) {
  const data = doc.data()
  await supabase.from('players').insert({
    uid: doc.id,
    display_name: data.displayName,
    email: data.email,
    // ... map other fields
  })
}

// Repeat for other collections
```

---

## Step 7: Update Environment Variables

Create `.env.local`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Remove Firebase env vars:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- etc.

---

## Step 8: Update Vercel Configuration

Your `vercel.json` is already set up correctly for SPA routing.

---

## Step 9: File-by-File Migration Checklist

### Files to Update:
- [ ] `src/lib/firebase.ts` → Replace with `src/lib/supabase.ts`
- [ ] `src/components/LoginModal.tsx` → Update auth methods
- [ ] `src/components/AuthProvider.tsx` → Use Supabase auth state
- [ ] `src/lib/data/firestore.ts` → Rewrite as `src/lib/data/supabase.ts`
- [ ] `src/pages/UserSettings.tsx` → Update profile update methods
- [ ] `src/lib/db.ts` → Update all database functions
- [ ] Remove `firestore.rules` (replaced by RLS policies)
- [ ] Remove `firestore.indexes.json` (create indexes in Supabase SQL)

---

## Step 10: Testing

1. Test authentication flow
2. Test CRUD operations for all collections
3. Test admin functionality
4. Test point calculations
5. Verify data integrity

---

## Alternative Options

### Option 2: Vercel + Separate Services
- **Auth**: Clerk, Auth0, or NextAuth
- **Database**: PlanetScale, Neon, or Vercel Postgres
- More setup but more flexibility

### Option 3: Keep Firebase, Use Vercel Hosting
- You can keep Firebase Auth + Firestore
- Just deploy to Vercel instead of Firebase Hosting
- Minimal changes needed (just deployment config)

---

## Estimated Migration Time

- **Small app**: 2-3 days
- **Medium app**: 1-2 weeks
- **Large app**: 2-4 weeks

Your app appears medium-sized, so estimate **1-2 weeks** for full migration.

---

## Benefits of Migration

✅ Better performance (PostgreSQL)
✅ More flexible queries (SQL)
✅ Better developer experience
✅ Unified hosting (Vercel)
✅ Lower costs potentially
✅ Better TypeScript support

## Drawbacks

❌ Requires significant code changes
❌ Data migration can be complex
❌ Testing required for all features
❌ Potential downtime during migration

---

## Recommendation

If you're happy with Firebase, consider **Option 3**: Keep Firebase services, just deploy to Vercel. This gives you Vercel's hosting benefits without the migration complexity.

