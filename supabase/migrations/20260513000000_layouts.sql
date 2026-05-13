create table public.layouts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users not null,
  name        text        not null,
  data        jsonb       not null,
  is_public   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.layouts enable row level security;

-- Users can read, create, update, and delete their own layouts
create policy "users manage own layouts"
  on public.layouts
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Public layouts are readable by everyone (future admin demo feature)
create policy "public layouts readable"
  on public.layouts
  for select
  using (is_public = true);

-- Automatically update updated_at on row changes
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
