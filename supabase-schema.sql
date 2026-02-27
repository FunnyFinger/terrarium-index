-- Run this in Supabase SQL Editor (Dashboard → SQL Editor) to create tables for global data.
-- Then set SUPABASE_URL and SUPABASE_ANON_KEY in js/config.js (see docs/SUPABASE_SETUP.md).

-- Inventory: one row per product (plant/supply/vivarium) – stock, price, visibility.
-- plant_id matches your plantId/supplyId (e.g. 50001+ for equipment).
create table if not exists public.inventory (
  plant_id bigint primary key,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Custom equipment (supplies) added via the site – visible to all visitors.
create table if not exists public.custom_equipment (
  id bigint primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Custom vivariums (builds) – visible to all visitors.
create table if not exists public.custom_vivariums (
  id bigint primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Allow anonymous read/write for the demo (restrict with RLS later if you add auth).
alter table public.inventory enable row level security;
alter table public.custom_equipment enable row level security;
alter table public.custom_vivariums enable row level security;

drop policy if exists "Allow all for inventory" on public.inventory;
drop policy if exists "Allow all for custom_equipment" on public.custom_equipment;
drop policy if exists "Allow all for custom_vivariums" on public.custom_vivariums;

create policy "Allow all for inventory" on public.inventory for all using (true) with check (true);
create policy "Allow all for custom_equipment" on public.custom_equipment for all using (true) with check (true);
create policy "Allow all for custom_vivariums" on public.custom_vivariums for all using (true) with check (true);
