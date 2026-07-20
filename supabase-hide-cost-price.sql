-- Hide costPrice from public inventory reads.
-- Run in Supabase SQL Editor after supabase-security-hardening.sql.
-- Public shop uses inventory_public (no cost). Staff still use inventory (full data).

-- View runs as owner so it can read inventory despite RLS, then strips costPrice.
create or replace view public.inventory_public
with (security_invoker = false)
as
select
  plant_id,
  (data - 'costPrice') as data,
  updated_at
from public.inventory;

grant select on public.inventory_public to anon, authenticated;

-- Remove open SELECT / old FOR ALL staff policy; recreate staff-only policies.
drop policy if exists "Public read inventory" on public.inventory;
drop policy if exists "Staff write inventory" on public.inventory;
drop policy if exists "Staff read inventory" on public.inventory;
drop policy if exists "Staff insert inventory" on public.inventory;
drop policy if exists "Staff update inventory" on public.inventory;
drop policy if exists "Staff delete inventory" on public.inventory;

create policy "Staff read inventory" on public.inventory
  for select using (public.is_staff());

create policy "Staff insert inventory" on public.inventory
  for insert with check (public.is_staff());

create policy "Staff update inventory" on public.inventory
  for update using (public.is_staff()) with check (public.is_staff());

create policy "Staff delete inventory" on public.inventory
  for delete using (public.is_staff());
