-- Rate-limit storage for checkout (service role only).
-- Run in Supabase SQL Editor.

create table if not exists public.checkout_rate_limits (
  bucket_key text primary key,
  hit_count int not null default 0,
  window_start timestamptz not null default now()
);

alter table public.checkout_rate_limits enable row level security;

-- No policies: anon/authenticated cannot read or write.
-- Netlify complete-order uses the service role key (bypasses RLS).

comment on table public.checkout_rate_limits is
  'Tracks checkout attempts by IP/email for rate limiting. Service role only.';
