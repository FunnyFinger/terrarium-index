-- Split costPrice out of inventory.data into staff-only inventory_costs.
-- Clears Supabase "Security Definer View" lint on inventory_public.
-- Run in Supabase SQL Editor (after supabase-security-hardening.sql / supabase-hide-cost-price.sql).

-- 1) Staff-only costs table
create table if not exists public.inventory_costs (
  plant_id bigint primary key references public.inventory (plant_id) on delete cascade,
  cost_price numeric,
  updated_at timestamptz not null default now()
);

alter table public.inventory_costs enable row level security;

drop policy if exists "Staff read inventory_costs" on public.inventory_costs;
drop policy if exists "Staff insert inventory_costs" on public.inventory_costs;
drop policy if exists "Staff update inventory_costs" on public.inventory_costs;
drop policy if exists "Staff delete inventory_costs" on public.inventory_costs;

create policy "Staff read inventory_costs" on public.inventory_costs
  for select using (public.is_staff());
create policy "Staff insert inventory_costs" on public.inventory_costs
  for insert with check (public.is_staff());
create policy "Staff update inventory_costs" on public.inventory_costs
  for update using (public.is_staff()) with check (public.is_staff());
create policy "Staff delete inventory_costs" on public.inventory_costs
  for delete using (public.is_staff());

grant select, insert, update, delete on public.inventory_costs to authenticated;

-- 2) Migrate existing costPrice values out of inventory.data
insert into public.inventory_costs (plant_id, cost_price, updated_at)
select
  plant_id,
  nullif(data->>'costPrice', '')::numeric,
  coalesce(updated_at, now())
from public.inventory
where data ? 'costPrice'
  and nullif(data->>'costPrice', '') is not null
on conflict (plant_id) do update
  set cost_price = excluded.cost_price,
      updated_at = excluded.updated_at;

-- 3) Strip costPrice from inventory JSON (safe for public reads)
update public.inventory
set data = data - 'costPrice'
where data ? 'costPrice';

-- 4) Allow public SELECT on inventory (cost no longer in data)
drop policy if exists "Public read inventory" on public.inventory;
drop policy if exists "Public read inventory rows" on public.inventory;
drop policy if exists "Staff read inventory" on public.inventory;
create policy "Public read inventory" on public.inventory
  for select using (true);

-- Keep staff write policies
drop policy if exists "Staff insert inventory" on public.inventory;
drop policy if exists "Staff update inventory" on public.inventory;
drop policy if exists "Staff delete inventory" on public.inventory;

create policy "Staff insert inventory" on public.inventory
  for insert with check (public.is_staff());
create policy "Staff update inventory" on public.inventory
  for update using (public.is_staff()) with check (public.is_staff());
create policy "Staff delete inventory" on public.inventory
  for delete using (public.is_staff());

-- 5) Recreate inventory_public as SECURITY INVOKER (caller RLS)
-- Still strips costPrice as a safety net if any row ever gets it again.
drop view if exists public.inventory_public;
create view public.inventory_public
with (security_invoker = true)
as
select
  plant_id,
  (data - 'costPrice') as data,
  updated_at
from public.inventory;

grant select on public.inventory_public to anon, authenticated;

comment on view public.inventory_public is
  'Public inventory projection. Uses security_invoker; costPrice lives in inventory_costs (staff-only).';

comment on table public.inventory_costs is
  'Staff-only product cost. Not exposed to anon.';
