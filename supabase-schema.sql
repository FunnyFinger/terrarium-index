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

create table if not exists public.custom_vivariums (
  id bigint primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Full catalog tables – single source of truth for all items.
-- Plants (base catalog)
create table if not exists public.plants_catalog (
  id bigint primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Supplies (equipment) – base catalog
create table if not exists public.equipment_catalog (
  id bigint primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Ready-made vivariums – base catalog
create table if not exists public.vivariums_catalog (
  id bigint primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Allow anonymous read/write for the demo (restrict with RLS later if you add auth).
alter table public.inventory enable row level security;
alter table public.custom_equipment enable row level security;
alter table public.custom_vivariums enable row level security;
alter table public.plants_catalog enable row level security;
alter table public.equipment_catalog enable row level security;
alter table public.vivariums_catalog enable row level security;

drop policy if exists "Allow all for inventory" on public.inventory;
drop policy if exists "Allow all for custom_equipment" on public.custom_equipment;
drop policy if exists "Allow all for custom_vivariums" on public.custom_vivariums;
drop policy if exists "Allow all for plants_catalog" on public.plants_catalog;
drop policy if exists "Allow all for equipment_catalog" on public.equipment_catalog;
drop policy if exists "Allow all for vivariums_catalog" on public.vivariums_catalog;

create policy "Allow all for inventory" on public.inventory for all using (true) with check (true);
create policy "Allow all for custom_equipment" on public.custom_equipment for all using (true) with check (true);
create policy "Allow all for custom_vivariums" on public.custom_vivariums for all using (true) with check (true);
create policy "Allow all for plants_catalog" on public.plants_catalog for all using (true) with check (true);
create policy "Allow all for equipment_catalog" on public.equipment_catalog for all using (true) with check (true);
create policy "Allow all for vivariums_catalog" on public.vivariums_catalog for all using (true) with check (true);

drop policy if exists "public read vivarium-assets" on storage.objects;
drop policy if exists "public write vivarium-assets" on storage.objects;

create policy "public read vivarium-assets"
  on storage.objects
  for select
  to anon
  using (bucket_id = 'vivarium-assets');

create policy "public write vivarium-assets"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'vivarium-assets');
