# Cloud Sync — One-Time Setup (≈5 minutes)

Your profiles, predictions, birth details and life events now auto-save to a free
Supabase cloud database and load automatically every time the app starts — from any
browser or device. No more re-entering your date of birth.

## Step 1 — Create a free Supabase project

1. Go to https://supabase.com and sign up (free, no credit card).
2. Click **New project**, give it any name (e.g. `astrology`), set a database
   password (you won't need it again), pick the region closest to you, and create.
3. Wait ~1 minute for the project to provision.

## Step 2 — Create the sync table

1. In your Supabase project, open **SQL Editor** (left sidebar).
2. Paste and **Run** this:

```sql
create table astro_sync (
  id text primary key,
  data jsonb,
  updated_at timestamptz default now()
);

alter table astro_sync enable row level security;

create policy "open access" on astro_sync
  for all using (true) with check (true);
```

## Step 3 — Get your keys

1. Go to **Project Settings → API** (gear icon in sidebar).
2. Copy two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon / public key** — long string starting with `eyJ...`

## Step 4 — Connect the app

1. Run the app (`npm run dev`) and click the **☁ Sync** button in the header.
2. Paste the Project URL and anon key, click **Connect & Sync**.
3. The dot turns green — done. Everything now syncs automatically.

On any other browser or device, open the app, click **☁ Sync**, paste the same
two values once, and all your profiles appear.

### Optional: skip Step 4 on your own machine

Create a file named `.env.local` in the project root (it's git-ignored):

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

The app then connects automatically with no clicking at all.

## How it works

- **On startup:** the app pulls the cloud copy (cloud wins) and applies it.
- **On every change:** profiles/predictions/birth details/life events are pushed
  to the cloud after a 1.5 s debounce. The header dot shows status:
  green = synced, amber pulse = saving/loading, red = error (click it for details).
- **Conflict policy:** last write wins — fine for personal use across devices.

## Security note

The anon key is a *public* client key, but the open RLS policy above means anyone
who has your key + URL could read/write this table. For a personal astrology app
that's a reasonable trade-off for zero-login sync. Don't reuse this Supabase
project for anything sensitive.
