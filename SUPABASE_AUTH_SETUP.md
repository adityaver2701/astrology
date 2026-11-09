# Accounts & Per-User Data — Supabase Setup (one-time)

The app now requires users to **register / sign in**. Each account gets its own
private profiles, predictions, life events, and uploaded PDF reports. Row Level
Security (RLS) guarantees **no user can ever read or write another user's data**.

Run the SQL below **once** in your Supabase project, then enable email auth.

> ⚠️ This migration **drops the old shared `astro_sync` table** (the single
> `id = 'main'` row everyone shared). That is intentional — accounts start
> fresh. If you want to keep the old data, export it from the Supabase table
> editor first.

## Step 1 — Run the SQL

Supabase Dashboard → **SQL Editor** → New query → paste and **Run**:

```sql
-- ─────────────────────────────────────────────────────────────
-- 1. Per-user data table (one row per account, keyed by auth.uid())
-- ─────────────────────────────────────────────────────────────
drop table if exists public.astro_sync;

create table public.astro_sync (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb,
  updated_at timestamptz default now()
);

alter table public.astro_sync enable row level security;

-- A user may only touch their own row.
create policy "astro_sync own select" on public.astro_sync
  for select using (auth.uid() = user_id);
create policy "astro_sync own insert" on public.astro_sync
  for insert with check (auth.uid() = user_id);
create policy "astro_sync own update" on public.astro_sync
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "astro_sync own delete" on public.astro_sync
  for delete using (auth.uid() = user_id);

-- Admin read-all: lets the admin account SELECT every user's row (for the
-- in-app Admin dashboard). Normal users are unaffected — multiple SELECT
-- policies are OR'd. Change/extend the email list to match your admins
-- (must match VITE_ADMIN_EMAILS in the app).
create policy "astro_sync admin read" on public.astro_sync
  for select using ( (auth.jwt() ->> 'email') in ('penetacle@gmail.com') );

-- ─────────────────────────────────────────────────────────────
-- 2. Private Storage bucket for the original PDF reports
--    Files live under  <user_id>/<filename>  so the folder name
--    is the owner's id — that's what the policies check.
-- ─────────────────────────────────────────────────────────────
-- file_size_limit + allowed_mime_types are the SERVER-SIDE enforcement: they
-- apply even if someone scripts uploads with the anon key directly, bypassing
-- the app's client-side checks. Keep file_size_limit in sync with
-- MAX_REPORT_BYTES in src/cloudSync.js.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vedic-reports', 'vedic-reports', false, 15728640, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "reports own read" on storage.objects
  for select using (
    bucket_id = 'vedic-reports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "reports own upload" on storage.objects
  for insert with check (
    bucket_id = 'vedic-reports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "reports own delete" on storage.objects
  for delete using (
    bucket_id = 'vedic-reports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
```

## Step 2 — Enable email auth

Supabase Dashboard → **Authentication → Providers → Email**: make sure it's
**enabled** (it is by default).

- **Confirm email = ON** (recommended for production): new users must click a
  link in their inbox before their first sign-in. Configure your sender under
  **Authentication → Emails**.
- **Confirm email = OFF** (handy for quick testing): users can sign in
  immediately after registering. Toggle under
  **Authentication → Providers → Email → "Confirm email"**.

That's it. The app already ships with the project URL + anon key baked in
(build env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`), so visitors
just **Create Account → Sign In**. No keys to paste.

## Step 3 — Sign in with Google

The sign-in screen shows **Continue with Google** automatically once the
Google provider is enabled in Supabase — the app reads the project's public
`/auth/v1/settings` and hides the button until then. No code or redeploy is
needed after this setup.

### 3a. Google Cloud Console — create the OAuth client

1. <https://console.cloud.google.com/> → pick (or create) a project.
2. **APIs & Services → OAuth consent screen**: User type **External**; app
   name *Astro-Transit*; your support email; under *Authorized domains* add
   `supabase.co` and `penetacle.workers.dev`. Scopes: the defaults
   (`email`, `profile`, `openid`) are all the app needs. While the app is in
   *Testing* status only the test users you list can sign in — press
   **Publish app** to open it to everyone.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://astrology.penetacle.workers.dev`
     (and `http://localhost:5173` for local testing)
   - Authorized redirect URIs: **only** Supabase's callback —
     `https://chpexdmbwbtdyqzfvmow.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret**.

### 3b. Supabase Dashboard — enable the provider

1. **Authentication → Sign In / Providers → Google** → enable, paste the
   Client ID and Client secret → Save.
2. **Authentication → URL Configuration**:
   - Site URL: `https://astrology.penetacle.workers.dev`
   - Redirect URLs — add all of:
     - `https://astrology.penetacle.workers.dev`
     - `http://localhost:5173`
     - `dev.penetacle.astrology://login-callback` (Android app)

### How it behaves

- **Web**: full-page redirect to Google's account chooser and back; supabase-js
  reads the session from the returned URL. A cancelled sign-in comes back with
  a friendly "Google sign-in was cancelled." message.
- **Android**: Google blocks sign-in inside WebViews, so the app opens the
  system browser and returns through the `dev.penetacle.astrology://login-callback`
  deep link. This needs an APK built from `versionCode 2` or later (the intent
  filter lives in `AndroidManifest.xml`); older installed APKs simply don't show
  the Google button. See ANDROID_SETUP.md → "Google sign-in".
- **Existing email accounts**: signing in with Google using the *same, already
  confirmed* email address links to the existing Supabase user, so the same
  profiles and charts appear. A different Google address creates a new,
  empty account.

## How isolation works

- Every request from a signed-in user carries their JWT. PostgREST evaluates the
  RLS policies with `auth.uid()` = that user's id, so queries can only ever match
  their own `astro_sync` row and their own `vedic-reports/<user_id>/...` files.
- The browser cache (localStorage) is wiped on **Sign Out**, so nothing leaks to
  the next person on a shared computer. The database policies are the real
  guarantee; the cache wipe is belt-and-suspenders.

## Deleting a user's data

Users can erase everything the app collected about them from the account menu
(**Delete my data**): it removes their private PDF files and their `astro_sync`
row (birth details, profiles, life events, notes, email). This runs with the
anon key under the owner `delete` RLS policies, so a user can only delete their
own data.

Removing the login record itself (`auth.users` — email + bcrypt password hash)
requires the **service-role** key and cannot be done from the browser. To honour
a full account-deletion request, run this once in the SQL editor (or via the
Admin API) after the user has cleared their data:

```sql
-- Service role only. Cascade drops the astro_sync row too (FK on delete cascade).
delete from auth.users where email = 'user@example.com';
```

## Saving your `VedicReport...pdf`

1. Sign in.
2. Open **⊙ Profiles**, create a profile (e.g. your name + birth details).
3. In that profile's card, drop or click-to-upload the PDF. The app parses it
   **and** uploads the original to your private bucket. A **⬇ PDF** button then
   lets you re-download the original any time, from any device.
