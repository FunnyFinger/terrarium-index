-- Run this in Supabase SQL Editor AFTER the main supabase-schema.sql.
-- Then run supabase-security-hardening.sql for production RLS + role lock.

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

-- Baseline policies (replaced/extended by supabase-security-hardening.sql)
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

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

drop policy if exists "Anyone can read reviews" on public.product_reviews;
create policy "Anyone can read reviews" on public.product_reviews
  for select using (true);

drop policy if exists "Authenticated can insert review" on public.product_reviews;
create policy "Authenticated can insert review" on public.product_reviews
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own review" on public.product_reviews;
create policy "Users can update own review" on public.product_reviews
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own review" on public.product_reviews;
create policy "Users can delete own review" on public.product_reviews
  for delete using (auth.uid() = user_id);
