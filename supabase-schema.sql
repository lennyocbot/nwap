create table if not exists public.app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_states enable row level security;

create policy "Users can read own app state"
  on public.app_states for select
  using (auth.uid() = user_id);

create policy "Users can insert own app state"
  on public.app_states for insert
  with check (auth.uid() = user_id);

create policy "Users can update own app state"
  on public.app_states for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
