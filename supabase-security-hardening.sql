-- =============================================================================
-- SECURITY HARDENING — run once in Supabase Dashboard → SQL Editor
-- After this: public can READ catalog/inventory/images; only staff can WRITE.
-- Profiles: users cannot self-promote to owner/admin.
-- =============================================================================

-- ---- Role helpers (SECURITY DEFINER so RLS can check role without recursion) ----
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('owner', 'admin', 'stock'), false);
$$;

create or replace function public.is_catalog_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('owner', 'admin'), false);
$$;

create or replace function public.is_owner_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'owner', false);
$$;

grant execute on function public.current_profile_role() to authenticated, anon;
grant execute on function public.is_staff() to authenticated, anon;
grant execute on function public.is_catalog_editor() to authenticated, anon;
grant execute on function public.is_owner_user() to authenticated, anon;

-- ---- App settings: owner email (synced from Netlify SUPABASE_OWNER_EMAIL) ----
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  owner_email text,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
insert into public.app_settings (id, owner_email)
values (1, 'the_fantasy_maker@hotmail.com')
on conflict (id) do nothing;

create or replace function public.store_owner_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(lower(trim(coalesce((select owner_email from public.app_settings where id = 1), ''))), '');
$$;
revoke all on function public.store_owner_email() from public;
grant execute on function public.store_owner_email() to postgres;

-- ---- Profiles: lock role on insert/update ----
create or replace function public.profiles_enforce_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_addr text;
begin
  if tg_op = 'INSERT' then
    -- Match app_settings.owner_email (Netlify SUPABASE_OWNER_EMAIL / STORE_OWNER_EMAIL)
    owner_addr := public.store_owner_email();
    if owner_addr is not null and lower(coalesce(new.email, '')) = owner_addr then
      new.role := 'owner';
    else
      new.role := 'user';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not public.is_owner_user() then
      new.role := old.role;
    end if;
    -- Never allow demoting the last remaining owner
    if old.role = 'owner' and new.role is distinct from 'owner' then
      if (select count(*)::int from public.profiles
          where role = 'owner' and id is distinct from old.id) < 1 then
        raise exception 'Cannot demote the last owner. Promote another owner first.';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_role_trg on public.profiles;
create trigger profiles_enforce_role_trg
  before insert or update on public.profiles
  for each row execute function public.profiles_enforce_role();

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Authenticated can read all profiles for admin" on public.profiles;

create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Owners can read all profiles" on public.profiles
  for select using (public.is_owner_user());

create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Owners can update any profile" on public.profiles
  for update using (public.is_owner_user()) with check (public.is_owner_user());

-- ---- Catalog / inventory: public read, staff write ----
drop policy if exists "Allow all for inventory" on public.inventory;
drop policy if exists "Allow all for custom_equipment" on public.custom_equipment;
drop policy if exists "Allow all for custom_vivariums" on public.custom_vivariums;
drop policy if exists "Allow all for plants_catalog" on public.plants_catalog;
drop policy if exists "Allow all for equipment_catalog" on public.equipment_catalog;
drop policy if exists "Allow all for vivariums_catalog" on public.vivariums_catalog;

drop policy if exists "Public read inventory" on public.inventory;
drop policy if exists "Staff write inventory" on public.inventory;
drop policy if exists "Staff read inventory" on public.inventory;
drop policy if exists "Staff insert inventory" on public.inventory;
drop policy if exists "Staff update inventory" on public.inventory;
drop policy if exists "Staff delete inventory" on public.inventory;
drop policy if exists "Public read plants_catalog" on public.plants_catalog;
drop policy if exists "Editors write plants_catalog" on public.plants_catalog;
drop policy if exists "Public read equipment_catalog" on public.equipment_catalog;
drop policy if exists "Editors write equipment_catalog" on public.equipment_catalog;
drop policy if exists "Public read vivariums_catalog" on public.vivariums_catalog;
drop policy if exists "Editors write vivariums_catalog" on public.vivariums_catalog;
drop policy if exists "Public read custom_equipment" on public.custom_equipment;
drop policy if exists "Editors write custom_equipment" on public.custom_equipment;
drop policy if exists "Public read custom_vivariums" on public.custom_vivariums;
drop policy if exists "Editors write custom_vivariums" on public.custom_vivariums;

-- Full inventory row data is publicly readable (costPrice lives in inventory_costs).
-- Public shop uses view inventory_public (security_invoker; strips costPrice safety net).
-- See also supabase-inventory-costs-split.sql.
create policy "Public read inventory" on public.inventory
  for select using (true);
create policy "Staff insert inventory" on public.inventory
  for insert with check (public.is_staff());
create policy "Staff update inventory" on public.inventory
  for update using (public.is_staff()) with check (public.is_staff());
create policy "Staff delete inventory" on public.inventory
  for delete using (public.is_staff());

create policy "Public read plants_catalog" on public.plants_catalog
  for select using (true);
create policy "Editors write plants_catalog" on public.plants_catalog
  for all using (public.is_catalog_editor()) with check (public.is_catalog_editor());

create policy "Public read equipment_catalog" on public.equipment_catalog
  for select using (true);
create policy "Editors write equipment_catalog" on public.equipment_catalog
  for all using (public.is_catalog_editor()) with check (public.is_catalog_editor());

create policy "Public read vivariums_catalog" on public.vivariums_catalog
  for select using (true);
create policy "Editors write vivariums_catalog" on public.vivariums_catalog
  for all using (public.is_catalog_editor()) with check (public.is_catalog_editor());

create policy "Public read custom_equipment" on public.custom_equipment
  for select using (true);
create policy "Editors write custom_equipment" on public.custom_equipment
  for all using (public.is_catalog_editor()) with check (public.is_catalog_editor());

create policy "Public read custom_vivariums" on public.custom_vivariums
  for select using (true);
create policy "Editors write custom_vivariums" on public.custom_vivariums
  for all using (public.is_catalog_editor()) with check (public.is_catalog_editor());

-- ---- Storage: public read; staff insert/update/delete ----
drop policy if exists "public read vivarium-assets" on storage.objects;
drop policy if exists "public write vivarium-assets" on storage.objects;
drop policy if exists "public delete vivarium-assets" on storage.objects;
drop policy if exists "Public read vivarium-assets" on storage.objects;
drop policy if exists "Staff insert vivarium-assets" on storage.objects;
drop policy if exists "Staff update vivarium-assets" on storage.objects;
drop policy if exists "Staff delete vivarium-assets" on storage.objects;

create policy "Public read vivarium-assets"
  on storage.objects for select
  using (bucket_id = 'vivarium-assets');

create policy "Staff insert vivarium-assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'vivarium-assets' and public.is_staff());

create policy "Staff update vivarium-assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'vivarium-assets' and public.is_staff())
  with check (bucket_id = 'vivarium-assets' and public.is_staff());

create policy "Staff delete vivarium-assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'vivarium-assets' and public.is_staff());

-- Public inventory read without costPrice (SECURITY INVOKER — uses caller RLS)
create or replace view public.inventory_public
with (security_invoker = true)
as
select
  plant_id,
  (data - 'costPrice') as data,
  updated_at
from public.inventory;

grant select on public.inventory_public to anon, authenticated;

-- Staff-only costs (run supabase-inventory-costs-split.sql on existing projects to migrate data)
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
