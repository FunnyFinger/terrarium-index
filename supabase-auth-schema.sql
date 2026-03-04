-- Run this in Supabase SQL Editor AFTER the main supabase-schema.sql.
-- Creates tables for global auth profiles and product reviews (used when Supabase Auth is enabled).

-- App profiles: one row per Supabase Auth user. Stores role and profile data.
-- id matches auth.users(id) (uuid). Create profile from app on first signup/login.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('owner', 'admin', 'stock', 'user')),
  saved_addresses jsonb not null default '[]',
  billing_address jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read and update their own profile only.
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (
    auth.uid() = id
    or (select (role = 'owner') from public.profiles where id = auth.uid() limit 1)
  );

-- Allow anon to read profiles for listing (e.g. access control page needs to show users). Optional: restrict to owner role only via app.
-- For simplicity we allow authenticated read of any profile (so owner can list users). Anon cannot read profiles.
drop policy if exists "Authenticated can read all profiles for admin" on public.profiles;
create policy "Authenticated can read all profiles for admin" on public.profiles
  for select using (auth.role() = 'authenticated');

-- Product reviews: global reviews for plants/supplies/vivariums.
create table if not exists public.product_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_display_name text,
  product_type text not null,
  product_id bigint not null,
  product_name text,
  rating int not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_reviews_product on public.product_reviews (product_type, product_id);
create index if not exists idx_product_reviews_user on public.product_reviews (user_id);

alter table public.product_reviews enable row level security;

-- Anyone can read reviews.
drop policy if exists "Anyone can read reviews" on public.product_reviews;
create policy "Anyone can read reviews" on public.product_reviews
  for select using (true);

-- Authenticated users can insert their own review.
drop policy if exists "Authenticated can insert review" on public.product_reviews;
create policy "Authenticated can insert review" on public.product_reviews
  for insert with check (auth.uid() = user_id);

-- Users can update/delete only their own reviews.
drop policy if exists "Users can update own review" on public.product_reviews;
create policy "Users can update own review" on public.product_reviews
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own review" on public.product_reviews;
create policy "Users can delete own review" on public.product_reviews
  for delete using (auth.uid() = user_id);
