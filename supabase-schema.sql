create table if not exists public.app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_states enable row level security;

drop policy if exists "Users can read own app state" on public.app_states;
create policy "Users can read own app state"
  on public.app_states for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own app state" on public.app_states;
create policy "Users can insert own app state"
  on public.app_states for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own app state" on public.app_states;
create policy "Users can update own app state"
  on public.app_states for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('user-files', 'user-files', false, 10485760)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760;

drop policy if exists "Users can read own files" on storage.objects;
create policy "Users can read own files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can upload own files" on storage.objects;
create policy "Users can upload own files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own files" on storage.objects;
create policy "Users can update own files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own files" on storage.objects;
create policy "Users can delete own files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  device_label text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
create policy "Users can read own push subscriptions"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
create policy "Users can delete own push subscriptions"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  assignments boolean not null default true,
  flashcards boolean not null default true,
  habits boolean not null default false,
  coach boolean not null default true,
  quiet_start text not null default '21:30',
  quiet_end text not null default '07:00',
  timezone text not null default 'local',
  coach_brief_time text not null default '07:00',
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "Users can read own notification preferences" on public.notification_preferences;
create policy "Users can read own notification preferences"
  on public.notification_preferences for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can write own notification preferences" on public.notification_preferences;
create policy "Users can write own notification preferences"
  on public.notification_preferences for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  entity_id text,
  delivery_key text not null unique,
  sent_at timestamptz not null default now()
);

create index if not exists notification_deliveries_user_kind_idx
  on public.notification_deliveries(user_id, kind, sent_at desc);

alter table public.notification_deliveries enable row level security;

drop policy if exists "Users can read own notification deliveries" on public.notification_deliveries;
create policy "Users can read own notification deliveries"
  on public.notification_deliveries for select
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.api_rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

create index if not exists api_rate_limits_reset_at_idx
  on public.api_rate_limits(reset_at);
