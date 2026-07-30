-- Hide costPrice from public inventory reads.
-- Prefer running supabase-inventory-costs-split.sql (moves cost to inventory_costs + SECURITY INVOKER view).
-- This file remains as a lighter fallback if you only need the view recreate.

-- View runs as the querying user (security_invoker). Inventory SELECT is public;
-- costPrice must not live in inventory.data (use inventory_costs for staff).
create or replace view public.inventory_public
with (security_invoker = true)
as
select
  plant_id,
  (data - 'costPrice') as data,
  updated_at
from public.inventory;

grant select on public.inventory_public to anon, authenticated;

comment on view public.inventory_public is
  'Public inventory projection (security_invoker). Staff costs are in inventory_costs.';

-- Public can read inventory rows (safe when costPrice is not in data).
drop policy if exists "Public read inventory" on public.inventory;
create policy "Public read inventory" on public.inventory
  for select using (true);

-- Staff write policies
drop policy if exists "Staff write inventory" on public.inventory;
drop policy if exists "Staff read inventory" on public.inventory;
drop policy if exists "Staff insert inventory" on public.inventory;
drop policy if exists "Staff update inventory" on public.inventory;
drop policy if exists "Staff delete inventory" on public.inventory;

create policy "Staff insert inventory" on public.inventory
  for insert with check (public.is_staff());

create policy "Staff update inventory" on public.inventory
  for update using (public.is_staff()) with check (public.is_staff());

create policy "Staff delete inventory" on public.inventory
  for delete using (public.is_staff());
