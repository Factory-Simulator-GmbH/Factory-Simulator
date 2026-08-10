-- Local Postgres migration for layouts
-- Supabase-specific RLS/auth statements are removed here.

create table public.layouts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null,
  name        text        not null,
  data        jsonb       not null,
  is_public   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Row-level security and auth policies are omitted for local Postgres.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger layouts_updated_at
  before update on public.layouts
  for each row execute procedure public.set_updated_at();
