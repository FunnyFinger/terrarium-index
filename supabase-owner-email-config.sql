-- Owner email driven by Netlify env (SUPABASE_OWNER_EMAIL / STORE_OWNER_EMAIL).
-- Run once in Supabase → SQL Editor, then redeploy (or load the site) so public-config syncs the value.
--
-- Flow:
-- 1. Netlify env sets SUPABASE_OWNER_EMAIL (or STORE_OWNER_EMAIL)
-- 2. public-config function upserts that address into app_settings.owner_email
-- 3. profiles_enforce_role trigger grants owner on INSERT when email matches

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  owner_email text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- No anon/authenticated policies — only service role / security definer can read/write.
-- Seed with current store owner so promotion works before the first sync.
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
