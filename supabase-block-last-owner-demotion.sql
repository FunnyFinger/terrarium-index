-- Block demoting the last remaining owner (run once in Supabase SQL Editor).
-- Safe to re-run.

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
