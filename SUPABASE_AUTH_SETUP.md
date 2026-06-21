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
insert into storage.buckets (id, name, public)
values ('vedic-reports', 'vedic-reports', false)
on conflict (id) do nothing;

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

## How isolation works

- Every request from a signed-in user carries their JWT. PostgREST evaluates the
  RLS policies with `auth.uid()` = that user's id, so queries can only ever match
  their own `astro_sync` row and their own `vedic-reports/<user_id>/...` files.
- The browser cache (localStorage) is wiped on **Sign Out**, so nothing leaks to
  the next person on a shared computer. The database policies are the re